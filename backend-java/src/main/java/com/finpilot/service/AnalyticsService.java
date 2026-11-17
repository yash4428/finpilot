package com.finpilot.service;

import com.finpilot.config.Money;
import com.finpilot.model.Transaction;
import com.finpilot.repo.TransactionRepo;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;

/** Deterministic spend aggregations. These are the numbers the agent quotes. */
@Service
public class AnalyticsService {
    private final TransactionRepo txns;

    public AnalyticsService(TransactionRepo txns) {
        this.txns = txns;
    }

    public List<Transaction> between(Long userId, LocalDate from, LocalDate to) {
        return txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId, from, to);
    }

    public static boolean isSpend(Transaction t) {
        return t.amount.signum() < 0 && CategoryService.isSpend(t.category);
    }

    public static String cat(Transaction t) {
        return t.category == null ? "Other" : t.category.name;
    }

    public BigDecimal spend(List<Transaction> list) {
        return list.stream().filter(AnalyticsService::isSpend)
                .map(t -> t.amount.negate()).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public BigDecimal income(List<Transaction> list) {
        return list.stream().filter(t -> t.amount.signum() > 0)
                .map(t -> t.amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public Map<String, BigDecimal> byCategory(List<Transaction> list) {
        Map<String, BigDecimal> m = new HashMap<>();
        list.stream().filter(AnalyticsService::isSpend)
                .forEach(t -> m.merge(cat(t), t.amount.negate(), BigDecimal::add));
        return m.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a, LinkedHashMap::new));
    }

    public List<Map<String, Object>> categoryList(List<Transaction> list) {
        List<Map<String, Object>> out = new ArrayList<>();
        byCategory(list).forEach((k, v) -> out.add(Map.of("category", k, "amount", Money.r(v))));
        return out;
    }

    /** Cumulative spend by day-of-month for this month vs last month. */
    public List<Map<String, Object>> cumulativeDaily(Long userId, LocalDate today) {
        YearMonth cur = YearMonth.from(today);
        YearMonth prev = cur.minusMonths(1);
        var curList = between(userId, cur.atDay(1), today);
        var prevList = between(userId, prev.atDay(1), prev.atEndOfMonth());
        BigDecimal[] curDay = dailyTotals(curList, cur.lengthOfMonth());
        BigDecimal[] prevDay = dailyTotals(prevList, prev.lengthOfMonth());
        List<Map<String, Object>> out = new ArrayList<>();
        BigDecimal c = BigDecimal.ZERO, p = BigDecimal.ZERO;
        int days = Math.max(cur.lengthOfMonth(), prev.lengthOfMonth());
        for (int d = 1; d <= days; d++) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("day", d);
            if (d <= prev.lengthOfMonth()) {
                p = p.add(prevDay[d]);
                row.put("lastMonth", Money.r(p));
            }
            if (d <= today.getDayOfMonth()) {
                c = c.add(curDay[d]);
                row.put("thisMonth", Money.r(c));
            }
            out.add(row);
        }
        return out;
    }

    private BigDecimal[] dailyTotals(List<Transaction> list, int len) {
        BigDecimal[] arr = new BigDecimal[len + 1];
        Arrays.fill(arr, BigDecimal.ZERO);
        list.stream().filter(AnalyticsService::isSpend).filter(t -> !t.isAnomaly)
                .forEach(t -> arr[t.date.getDayOfMonth()] = arr[t.date.getDayOfMonth()].add(t.amount.negate()));
        return arr;
    }

    public List<Map<String, Object>> monthlyTrend(Long userId, LocalDate today, int months) {
        List<Map<String, Object>> out = new ArrayList<>();
        YearMonth cur = YearMonth.from(today);
        for (int i = months - 1; i >= 0; i--) {
            YearMonth ym = cur.minusMonths(i);
            var list = between(userId, ym.atDay(1), ym.atEndOfMonth());
            if (list.isEmpty() && i > 0) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
            row.put("income", Money.r(income(list)));
            row.put("spend", Money.r(spend(list)));
            row.put("partial", i == 0);
            out.add(row);
        }
        return out;
    }

    /** Daily spend for the last `weeks` weeks (Mon-aligned), for the calendar heatmap. Excludes flagged one-offs. */
    public List<Map<String, Object>> heatmap(Long userId, LocalDate today, int weeks) {
        LocalDate start = today.minusDays(today.getDayOfWeek().getValue() - 1L).minusWeeks(weeks - 1L);
        Map<LocalDate, BigDecimal> byDay = new HashMap<>();
        between(userId, start, today).stream().filter(t -> isSpend(t) && !t.isAnomaly && !"Rent".equals(cat(t)))
                .forEach(t -> byDay.merge(t.date, t.amount.negate(), BigDecimal::add));
        List<Map<String, Object>> out = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(today); d = d.plusDays(1)) {
            out.add(Map.of("date", d.toString(), "amount", Money.r(byDay.getOrDefault(d, BigDecimal.ZERO))));
        }
        return out;
    }

    public List<Map<String, Object>> topMerchants(List<Transaction> list, int n) {
        Map<String, BigDecimal> m = new HashMap<>();
        list.stream().filter(AnalyticsService::isSpend)
                .forEach(t -> m.merge(t.merchant == null ? "Unknown" : t.merchant, t.amount.negate(), BigDecimal::add));
        return m.entrySet().stream().sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed()).limit(n)
                .map(e -> Map.<String, Object>of("merchant", e.getKey(), "amount", Money.r(e.getValue())))
                .toList();
    }
}
