package com.finpilot.service;

import com.finpilot.config.Money;
import com.finpilot.model.Budget;
import com.finpilot.repo.BudgetRepo;
import com.finpilot.repo.UserRepo;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

@Service
public class BudgetService {
    private final BudgetRepo budgets;
    private final AnalyticsService analytics;
    private final UserRepo users;
    private final NotificationService notifications;

    public BudgetService(BudgetRepo budgets, AnalyticsService analytics, UserRepo users,
                         NotificationService notifications) {
        this.budgets = budgets;
        this.analytics = analytics;
        this.users = users;
        this.notifications = notifications;
    }

    /** Each budget with this month's consumption. */
    public List<Map<String, Object>> status(Long userId) {
        LocalDate today = LocalDate.now();
        YearMonth ym = YearMonth.from(today);
        Map<String, BigDecimal> spent = analytics.byCategory(analytics.between(userId, ym.atDay(1), today));
        double monthProgress = (double) today.getDayOfMonth() / ym.lengthOfMonth();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Budget b : budgets.findByUserIdOrderByIdAsc(userId)) {
            BigDecimal used = spent.getOrDefault(b.category.name, BigDecimal.ZERO);
            BigDecimal pct = b.limitAmount.signum() == 0 ? BigDecimal.ZERO
                    : used.multiply(BigDecimal.valueOf(100)).divide(b.limitAmount, 1, RoundingMode.HALF_UP);
            // Projected = straight-line pace to month end.
            BigDecimal projected = monthProgress == 0 ? used
                    : used.divide(BigDecimal.valueOf(monthProgress), 2, RoundingMode.HALF_UP);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.id);
            m.put("category", b.category.name);
            m.put("categoryId", b.category.id);
            m.put("limit", Money.r(b.limitAmount));
            m.put("consumed", Money.r(used));
            m.put("remaining", Money.r(b.limitAmount.subtract(used)));
            m.put("percent", pct);
            m.put("projected", Money.r(projected));
            m.put("period", b.period);
            m.put("state", pct.doubleValue() >= 100 ? "over" : pct.doubleValue() >= 80 ? "warning"
                    : projected.compareTo(b.limitAmount) > 0 ? "pace" : "ok");
            out.add(m);
        }
        return out;
    }

    /** Proactive budget alerts at 80% and 100%. Returns how many fired. */
    public int checkBudgets(Long userId) {
        String month = YearMonth.now().toString();
        int fired = 0;
        for (Map<String, Object> s : status(userId)) {
            double pct = ((BigDecimal) s.get("percent")).doubleValue();
            String cat = (String) s.get("category");
            int level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
            if (level == 0) continue;
            notifications.notifyOnce(userId, "budget",
                    level == 100 ? cat + " budget exceeded" : cat + " budget at " + Math.round(pct) + "%",
                    Money.inr((BigDecimal) s.get("consumed")) + " of " + Money.inr((BigDecimal) s.get("limit"))
                            + " used this month.",
                    "budget-" + s.get("id") + "-" + month + "-" + level);
            fired++;
        }
        return fired;
    }

    public int checkAllBudgets() {
        int n = 0;
        for (var u : users.findAll()) n += checkBudgets(u.id);
        return n;
    }
}
