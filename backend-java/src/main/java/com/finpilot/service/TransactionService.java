package com.finpilot.service;

import com.finpilot.config.ApiException;
import com.finpilot.config.Money;
import com.finpilot.model.Account;
import com.finpilot.model.Card;
import com.finpilot.model.Transaction;
import com.finpilot.repo.AccountRepo;
import com.finpilot.repo.CardRepo;
import com.finpilot.repo.TransactionRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;

@Service
public class TransactionService {
    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"));

    private final TransactionRepo txns;
    private final AccountRepo accounts;
    private final CardRepo cards;
    private final CategoryService categories;
    private final DuesService dues;
    private final MlClient ml;
    private final NotificationService notifications;

    public TransactionService(TransactionRepo txns, AccountRepo accounts, CardRepo cards, CategoryService categories,
                              DuesService dues, MlClient ml, NotificationService notifications) {
        this.txns = txns;
        this.accounts = accounts;
        this.cards = cards;
        this.categories = categories;
        this.dues = dues;
        this.ml = ml;
        this.notifications = notifications;
    }

    public record TxnInput(BigDecimal amount, LocalDate date, String merchant, String description,
                           String category, Long accountId, Long cardId) {}

    public List<Transaction> list(Long userId, LocalDate from, LocalDate to, String category, String q) {
        List<Transaction> base = (from != null || to != null)
                ? txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId,
                    from == null ? LocalDate.of(2000, 1, 1) : from, to == null ? LocalDate.now().plusYears(1) : to)
                : txns.findByUserIdOrderByDateDescIdDesc(userId);
        return base.stream()
                .filter(t -> category == null || category.isBlank() || category.equalsIgnoreCase(AnalyticsService.cat(t)))
                .filter(t -> q == null || q.isBlank() || matches(t, q.toLowerCase(Locale.ROOT)))
                .toList();
    }

    private static boolean matches(Transaction t, String q) {
        return (t.merchant != null && t.merchant.toLowerCase(Locale.ROOT).contains(q))
                || (t.description != null && t.description.toLowerCase(Locale.ROOT).contains(q));
    }

    @Transactional
    public Transaction create(Long userId, TxnInput in) {
        Transaction t = build(userId, in);
        txns.save(t);
        applyToBalances(userId, t);
        if (t.category == null) categorize(userId, List.of(t));
        detectAnomalies(userId, Set.of(t.id));
        return t;
    }

    @Transactional
    public Transaction update(Long userId, Long id, TxnInput in) {
        Transaction t = txns.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Transaction"));
        if (in.category() != null && !in.category().isBlank()) {
            t.category = categories.byName(in.category());
            // A manual pick is a training label for the categorizer.
            t.categoryConfirmed = true;
        }
        if (in.merchant() != null) t.merchant = in.merchant();
        if (in.description() != null) t.description = in.description();
        if (in.date() != null) t.date = in.date();
        return txns.save(t);
    }

    @Transactional
    public Transaction dismissAnomaly(Long userId, Long id) {
        Transaction t = txns.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Transaction"));
        t.isAnomaly = false;
        t.anomalyReason = "Reviewed by you";
        return txns.save(t);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        Transaction t = txns.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Transaction"));
        txns.delete(t);
    }

    private Transaction build(Long userId, TxnInput in) {
        if (in.amount() == null || in.amount().signum() == 0) throw ApiException.bad("Amount can't be zero");
        if (in.date() == null) throw ApiException.bad("Date is required");
        Transaction t = new Transaction();
        t.userId = userId;
        t.amount = Money.r(in.amount());
        t.date = in.date();
        t.merchant = in.merchant() == null ? null : in.merchant().trim();
        t.description = in.description();
        if (in.accountId() != null) {
            accounts.findByIdAndUserId(in.accountId(), userId).orElseThrow(() -> ApiException.notFound("Account"));
            t.accountId = in.accountId();
        }
        if (in.cardId() != null) {
            cards.findByIdAndUserId(in.cardId(), userId).orElseThrow(() -> ApiException.notFound("Card"));
            t.cardId = in.cardId();
        }
        if (in.category() != null && !in.category().isBlank()) {
            t.category = categories.byName(in.category());
            t.categoryConfirmed = true;
        }
        return t;
    }

    /** Bank/wallet spends move the balance; card spends add to the card's outstanding. */
    private void applyToBalances(Long userId, Transaction t) {
        if (t.cardId != null) {
            Card c = cards.findByIdAndUserId(t.cardId, userId).orElseThrow();
            c.outstanding = Money.nz(c.outstanding).subtract(t.amount);
            cards.save(c);
            dues.syncCard(c);
        } else if (t.accountId != null) {
            Account a = accounts.findByIdAndUserId(t.accountId, userId).orElseThrow();
            a.balance = a.balance.add(t.amount);
            accounts.save(a);
        }
    }

    /**
     * CSV import (§12). Documented format, header required:
     *   date,merchant,description,amount
     * Dates as YYYY-MM-DD or DD/MM/YYYY. Negative amount = money out.
     */
    @Transactional
    public Map<String, Object> importCsv(Long userId, InputStream in, Long accountId) throws IOException {
        if (accountId != null) accounts.findByIdAndUserId(accountId, userId).orElseThrow(() -> ApiException.notFound("Account"));
        List<Transaction> created = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String header = r.readLine();
            if (header == null) throw ApiException.bad("The file is empty");
            List<String> cols = parseCsvLine(header.replace("﻿", "").toLowerCase(Locale.ROOT));
            int iDate = cols.indexOf("date"), iMer = cols.indexOf("merchant"),
                iDesc = cols.indexOf("description"), iAmt = cols.indexOf("amount");
            if (iDate < 0 || iMer < 0 || iAmt < 0) {
                throw ApiException.bad("Expected columns: date,merchant,description,amount");
            }
            String line;
            int row = 1;
            while ((line = r.readLine()) != null) {
                row++;
                if (line.isBlank()) continue;
                List<String> f = parseCsvLine(line);
                try {
                    Transaction t = build(userId, new TxnInput(
                            new BigDecimal(f.get(iAmt).replace(",", "").replace("₹", "").trim()),
                            parseDate(f.get(iDate).trim()),
                            f.get(iMer),
                            iDesc >= 0 && iDesc < f.size() ? f.get(iDesc) : null,
                            null, accountId, null));
                    created.add(txns.save(t));
                    applyToBalances(userId, t);
                } catch (ApiException | NumberFormatException | IndexOutOfBoundsException | DateTimeParseException e) {
                    errors.add("Row " + row + ": " + (e instanceof ApiException ? e.getMessage() : "couldn't read this row"));
                }
            }
        }
        Map<Long, String> cats = categorize(userId, created);
        Set<Long> ids = new HashSet<>();
        created.forEach(t -> ids.add(t.id));
        List<Transaction> flagged = detectAnomalies(userId, ids);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("imported", created.size());
        out.put("categorized", cats.size());
        out.put("anomalies", flagged.size());
        out.put("errors", errors);
        return out;
    }

    private static LocalDate parseDate(String s) {
        for (DateTimeFormatter f : DATE_FORMATS) {
            try {
                return LocalDate.parse(s, f);
            } catch (DateTimeParseException ignored) {
            }
        }
        throw new DateTimeParseException("Unrecognised date", s, 0);
    }

    static List<String> parseCsvLine(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (c == ',' && !quoted) {
                out.add(cur.toString().trim());
                cur.setLength(0);
            } else {
                cur.append(c);
            }
        }
        out.add(cur.toString().trim());
        return out;
    }

    /** Sends uncategorized transactions to /ml/categorize along with the user's confirmed labels. */
    @Transactional
    public Map<Long, String> categorize(Long userId, List<Transaction> batch) {
        List<Transaction> todo = batch.stream().filter(t -> t.category == null).toList();
        Map<Long, String> result = new HashMap<>();
        if (todo.isEmpty()) return result;

        List<Map<String, Object>> items = todo.stream().map(t -> Map.<String, Object>of(
                "id", t.id, "merchant", nz(t.merchant), "description", nz(t.description), "amount", t.amount)).toList();
        List<Map<String, Object>> examples = txns.findByUserIdAndCategoryConfirmedTrue(userId).stream()
                .filter(t -> t.category != null)
                .map(t -> Map.<String, Object>of("text", nz(t.merchant) + " " + nz(t.description), "category", t.category.name))
                .toList();

        Map<String, Object> res = ml.categorize(Map.of("transactions", items, "examples", examples));
        Map<Long, String> predicted = new HashMap<>();
        if (res != null && res.get("results") instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m && m.get("id") != null) {
                    predicted.put(((Number) m.get("id")).longValue(), String.valueOf(m.get("category")));
                }
            }
        }
        for (Transaction t : todo) {
            String name = predicted.getOrDefault(t.id, t.amount.signum() > 0 ? "Income" : "Other");
            t.category = categories.byName(name);
            txns.save(t);
            result.put(t.id, name);
        }
        return result;
    }

    /**
     * Scores the user's recent history with /ml/anomaly and flags the given ids
     * (or all recent ones when ids is null). Returns the newly flagged transactions.
     */
    @Transactional
    public List<Transaction> detectAnomalies(Long userId, Set<Long> onlyIds) {
        LocalDate today = LocalDate.now();
        List<Transaction> history = txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId, today.minusDays(180), today.plusDays(1));
        if (history.size() < 10) return List.of();
        List<Map<String, Object>> items = history.stream().map(t -> Map.<String, Object>of(
                "id", t.id, "date", t.date.toString(), "merchant", nz(t.merchant),
                "amount", t.amount, "category", AnalyticsService.cat(t))).toList();
        Map<String, Object> res = ml.anomaly(Map.of("transactions", items));
        if (res == null || !(res.get("results") instanceof List<?> list)) return List.of();

        Map<Long, Transaction> byId = new HashMap<>();
        history.forEach(t -> byId.put(t.id, t));
        List<Transaction> flagged = new ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Transaction t = byId.get(((Number) m.get("id")).longValue());
            if (t == null || (onlyIds != null && !onlyIds.contains(t.id))) continue;
            if ("Reviewed by you".equals(t.anomalyReason)) continue;
            boolean flag = Boolean.TRUE.equals(m.get("is_anomaly"));
            if (flag && !t.isAnomaly) {
                t.isAnomaly = true;
                t.anomalyReason = String.valueOf(m.get("reason"));
                txns.save(t);
                flagged.add(t);
                notifications.notifyOnce(userId, "anomaly", "Unusual charge: " + nz(t.merchant),
                        Money.inr(t.amount.abs()) + " on " + t.date + ". " + t.anomalyReason, "anomaly-" + t.id);
            } else if (!flag && t.isAnomaly) {
                t.isAnomaly = false;
                t.anomalyReason = null;
                txns.save(t);
            }
        }
        return flagged;
    }

    /** Re-runs categorization + anomaly detection across the user's history (used after seeding). */
    @Transactional
    public Map<String, Object> analyze(Long userId) {
        List<Transaction> all = txns.findByUserIdOrderByDateDescIdDesc(userId);
        Map<Long, String> cats = categorize(userId, all);
        List<Transaction> flagged = detectAnomalies(userId, null);
        return Map.of("categorized", cats.size(), "anomaliesFlagged", flagged.size());
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
