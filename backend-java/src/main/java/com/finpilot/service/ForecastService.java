package com.finpilot.service;

import com.finpilot.config.Money;
import com.finpilot.model.Account;
import com.finpilot.model.Due;
import com.finpilot.model.Transaction;
import com.finpilot.repo.AccountRepo;
import com.finpilot.repo.TransactionRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * Safe-to-spend (§7). Always two numbers, each with its breakdown:
 *  1. True disposable income now = bank balance − dues committed this cycle.
 *  2. Predicted month-end balance = balance − remaining dues − predicted recurring − typical variable spend.
 * The month-end projection comes from the Python forecaster; if it is unreachable we
 * fall back to a simple average so the dashboard never breaks.
 */
@Service
public class ForecastService {
    private final AccountRepo accounts;
    private final TransactionRepo txns;
    private final DuesService dues;
    private final MlClient ml;

    public ForecastService(AccountRepo accounts, TransactionRepo txns, DuesService dues, MlClient ml) {
        this.accounts = accounts;
        this.txns = txns;
        this.dues = dues;
        this.ml = ml;
    }

    public BigDecimal liquidBalance(Long userId) {
        return accounts.findByUserIdOrderByIdAsc(userId).stream()
                .map(a -> a.balance).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    @Transactional
    public Map<String, Object> safeToSpend(Long userId) {
        LocalDate today = LocalDate.now();
        LocalDate monthEnd = YearMonth.from(today).atEndOfMonth();
        List<Account> accs = accounts.findByUserIdOrderByIdAsc(userId);
        BigDecimal balance = liquidBalance(userId);

        // Dues committed this cycle = unpaid, due on or before month end (overdue included).
        int horizon = (int) (monthEnd.toEpochDay() - today.toEpochDay());
        List<Due> cycle = dues.open(userId, horizon);
        BigDecimal cardDues = sum(cycle, "card");
        BigDecimal loanDues = sum(cycle, "loan");

        List<Map<String, Object>> nowBreakdown = new ArrayList<>();
        for (Account a : accs) nowBreakdown.add(line(a.name != null ? a.name : a.type, a.balance, "start", null));
        if (cardDues.signum() > 0) nowBreakdown.add(line("Card bills due", cardDues.negate(), "due", count(cycle, "card")));
        if (loanDues.signum() > 0) nowBreakdown.add(line("EMIs due", loanDues.negate(), "due", count(cycle, "loan")));
        BigDecimal disposableNow = balance.subtract(cardDues).subtract(loanDues);

        Map<String, Object> forecast = mlForecast(userId, today, balance, cycle);
        if (forecast == null) forecast = fallbackForecast(userId, today, balance, cycle);

        BigDecimal monthEndBal = Money.of(forecast.get("predicted_month_end"));
        // Headroom = what can go on a one-off purchase without breaking either number.
        BigDecimal headroom = disposableNow.min(monthEndBal).max(BigDecimal.ZERO);

        // Daily allowance: money not committed to dues/recurring and not reserved as savings,
        // spread evenly over the days left (today included).
        BigDecimal monthlyIncome = monthlyIncome(userId, today, forecast);
        BigDecimal savingsTarget = monthlyIncome.multiply(new BigDecimal("0.10")).setScale(-2, RoundingMode.HALF_UP).max(BigDecimal.ZERO);
        BigDecimal variableLeft = Money.of(forecast.getOrDefault("variable_remaining", BigDecimal.ZERO));
        BigDecimal todaySpent = txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId, today, today).stream()
                .filter(t -> AnalyticsService.isSpend(t) && !t.isAnomaly)
                .map(t -> t.amount.negate()).reduce(BigDecimal.ZERO, BigDecimal::add);
        int daysLeft = ((Number) forecast.get("days_left")).intValue();
        BigDecimal pool = monthEndBal.add(variableLeft).subtract(savingsTarget).add(todaySpent);
        BigDecimal dailyAllowance = pool.divide(BigDecimal.valueOf(daysLeft + 1L), 0, RoundingMode.DOWN).max(BigDecimal.ZERO);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("asOf", today.toString());
        out.put("monthEnd", monthEnd.toString());
        out.put("daysLeft", forecast.get("days_left"));
        out.put("balance", Money.r(balance));
        out.put("disposableNow", Money.r(disposableNow));
        out.put("disposableBreakdown", nowBreakdown);
        out.put("predictedMonthEnd", Money.r(monthEndBal));
        out.put("monthEndBreakdown", forecast.get("breakdown"));
        out.put("recurring", forecast.get("recurring"));
        out.put("variableDaily", forecast.get("variable_daily"));
        out.put("headroom", Money.r(headroom));
        out.put("dailyAllowance", Money.r(dailyAllowance));
        out.put("todaySpent", Money.r(todaySpent));
        out.put("leftToday", Money.r(dailyAllowance.subtract(todaySpent)));
        out.put("savingsTarget", Money.r(savingsTarget));
        out.put("monthlyIncome", Money.r(monthlyIncome));
        out.put("model", forecast.get("model"));
        return out;
    }

    private Map<String, Object> mlForecast(Long userId, LocalDate today, BigDecimal balance, List<Due> cycle) {
        List<Transaction> history = txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId, today.minusDays(120), today);
        List<Map<String, Object>> tx = history.stream().map(t -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", t.id);
            m.put("date", t.date.toString());
            m.put("merchant", t.merchant == null ? "" : t.merchant);
            m.put("amount", t.amount);
            m.put("category", AnalyticsService.cat(t));
            m.put("is_anomaly", t.isAnomaly);
            return m;
        }).toList();
        List<Map<String, Object>> known = cycle.stream().map(d -> Map.<String, Object>of(
                "label", d.label, "amount", d.amount, "due_date", d.dueDate.toString(), "type", d.sourceType)).toList();

        Map<String, Object> res = ml.forecast(Map.of(
                "today", today.toString(), "balance", balance, "transactions", tx, "known_dues", known));
        if (res == null || res.get("predicted_month_end") == null) return null;

        // Persist recurring-cost detection results back onto the transactions.
        Set<Long> recurringIds = new HashSet<>();
        Object rec = res.get("recurring");
        if (rec instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> r && r.get("txn_ids") instanceof List<?> ids) {
                    ids.forEach(id -> recurringIds.add(((Number) id).longValue()));
                }
            }
        }
        for (Transaction t : history) {
            boolean should = recurringIds.contains(t.id);
            if (t.isRecurring != should) {
                t.isRecurring = should;
                txns.save(t);
            }
        }
        return res;
    }

    /** Phase-1 fallback: average daily variable spend × days left, plus flagged recurring. */
    private Map<String, Object> fallbackForecast(Long userId, LocalDate today, BigDecimal balance, List<Due> cycle) {
        LocalDate monthEnd = YearMonth.from(today).atEndOfMonth();
        int daysLeft = (int) (monthEnd.toEpochDay() - today.toEpochDay());
        List<Transaction> last60 = txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId, today.minusDays(60), today.minusDays(1));
        BigDecimal variable = last60.stream()
                .filter(t -> AnalyticsService.isSpend(t) && !t.isRecurring && !t.isAnomaly)
                .map(t -> t.amount.negate()).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal daily = variable.divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
        BigDecimal variableLeft = daily.multiply(BigDecimal.valueOf(daysLeft));

        List<Map<String, Object>> breakdown = new ArrayList<>();
        breakdown.add(line("Current balance", balance, "start", null));
        BigDecimal end = balance;
        for (Due d : cycle) {
            breakdown.add(line(d.label, d.amount.negate(), "due", null));
            end = end.subtract(d.amount);
        }
        breakdown.add(line("Typical variable spend", variableLeft.negate(), "variable", daysLeft + " days left"));
        end = end.subtract(variableLeft);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("predicted_month_end", Money.r(end));
        m.put("breakdown", breakdown);
        m.put("recurring", List.of());
        m.put("variable_daily", daily);
        m.put("variable_remaining", Money.r(variableLeft));
        m.put("days_left", daysLeft);
        m.put("model", "fallback:average");
        return m;
    }

    /** Expected monthly income: detected recurring credits, else last month's income. */
    private BigDecimal monthlyIncome(Long userId, LocalDate today, Map<String, Object> forecast) {
        BigDecimal recurringIn = BigDecimal.ZERO;
        if (forecast.get("recurring") instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> r && "in".equals(r.get("direction"))) recurringIn = recurringIn.add(Money.of(r.get("amount")));
            }
        }
        if (recurringIn.signum() > 0) return recurringIn;
        YearMonth prev = YearMonth.from(today).minusMonths(1);
        return txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId, prev.atDay(1), prev.atEndOfMonth()).stream()
                .filter(t -> t.amount.signum() > 0).map(t -> t.amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static Map<String, Object> line(String label, BigDecimal amount, String kind, String detail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", label);
        m.put("amount", Money.r(amount));
        m.put("kind", kind);
        if (detail != null) m.put("detail", detail);
        return m;
    }

    private static BigDecimal sum(List<Due> list, String type) {
        return list.stream().filter(d -> type.equals(d.sourceType)).map(d -> d.amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static String count(List<Due> list, String type) {
        long n = list.stream().filter(d -> type.equals(d.sourceType)).count();
        return n + (n == 1 ? " payment" : " payments");
    }
}
