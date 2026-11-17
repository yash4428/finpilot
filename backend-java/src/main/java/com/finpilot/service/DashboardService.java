package com.finpilot.service;

import com.finpilot.config.Money;
import com.finpilot.model.*;
import com.finpilot.repo.*;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

@Service
public class DashboardService {
    private final UserRepo users;
    private final CardRepo cards;
    private final LoanRepo loans;
    private final GoalRepo goals;
    private final TransactionRepo txns;
    private final NotificationRepo notifications;
    private final ForecastService forecast;
    private final AnalyticsService analytics;
    private final BudgetService budgets;
    private final DuesService dues;
    private final CreditScoreService credit;
    private final HealthScoreService health;

    public DashboardService(UserRepo users, CardRepo cards, LoanRepo loans, GoalRepo goals, TransactionRepo txns,
                            NotificationRepo notifications, ForecastService forecast, AnalyticsService analytics,
                            BudgetService budgets, DuesService dues, CreditScoreService credit,
                            HealthScoreService health) {
        this.users = users;
        this.cards = cards;
        this.loans = loans;
        this.goals = goals;
        this.txns = txns;
        this.notifications = notifications;
        this.forecast = forecast;
        this.analytics = analytics;
        this.budgets = budgets;
        this.dues = dues;
        this.credit = credit;
        this.health = health;
    }

    public Map<String, Object> build(Long userId) {
        LocalDate today = LocalDate.now();
        YearMonth ym = YearMonth.from(today);
        User u = users.findById(userId).orElseThrow();

        var thisMonth = analytics.between(userId, ym.atDay(1), today);
        var lastMonthSameDay = analytics.between(userId, ym.minusMonths(1).atDay(1),
                ym.minusMonths(1).atDay(Math.min(today.getDayOfMonth(), ym.minusMonths(1).lengthOfMonth())));

        BigDecimal cardOutstanding = cards.findByUserIdOrderByIdAsc(userId).stream()
                .map(c -> Money.nz(c.outstanding)).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal loanOutstanding = loans.findByUserIdOrderByIdAsc(userId).stream()
                .map(l -> Money.nz(l.installmentAmount).multiply(BigDecimal.valueOf(l.remainingInstallments)))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal liquid = forecast.liquidBalance(userId);
        BigDecimal goalSaved = goals.findByUserIdOrderByIdAsc(userId).stream()
                .map(g -> g.savedAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("liquid", Money.r(liquid));
        totals.put("cardOutstanding", Money.r(cardOutstanding));
        totals.put("loanOutstanding", Money.r(loanOutstanding));
        totals.put("goalSavings", Money.r(goalSaved));
        totals.put("netWorth", Money.r(liquid.add(goalSaved).subtract(cardOutstanding).subtract(loanOutstanding)));

        BigDecimal spendNow = analytics.spend(thisMonth);
        BigDecimal spendPrev = analytics.spend(lastMonthSameDay);

        List<Map<String, Object>> anomalies = txns.findByUserIdOrderByDateDescIdDesc(userId).stream()
                .filter(t -> t.isAnomaly).limit(5).map(DashboardService::txnView).toList();
        List<Map<String, Object>> recent = txns.findByUserIdOrderByDateDescIdDesc(userId).stream()
                .limit(7).map(DashboardService::txnView).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("user", Map.of("name", u.name, "firstName", u.name.split(" ")[0]));
        out.put("today", today.toString());
        out.put("totals", totals);
        out.put("safeToSpend", forecast.safeToSpend(userId));
        out.put("spend", Map.of(
                "thisMonth", Money.r(spendNow),
                "lastMonthToDate", Money.r(spendPrev),
                "changePct", spendPrev.signum() == 0 ? BigDecimal.ZERO
                        : spendNow.subtract(spendPrev).multiply(BigDecimal.valueOf(100)).divide(spendPrev, 1, RoundingMode.HALF_UP),
                "incomeThisMonth", Money.r(analytics.income(thisMonth))));
        out.put("categorySpend", analytics.categoryList(thisMonth));
        out.put("dailySpend", analytics.cumulativeDaily(userId, today));
        out.put("monthlyTrend", analytics.monthlyTrend(userId, today, 6));
        out.put("upcomingDues", dues.open(userId, 30));
        out.put("budgets", budgets.status(userId));
        out.put("anomalies", anomalies);
        out.put("recent", recent);
        out.put("goals", goals.findByUserIdOrderByIdAsc(userId));
        out.put("creditScore", credit.estimate(userId));
        out.put("health", health.score(userId));
        out.put("heatmap", analytics.heatmap(userId, today, 13));
        out.put("unreadNotifications", notifications.countByUserIdAndReadFalse(userId));
        return out;
    }

    public static Map<String, Object> txnView(Transaction t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.id);
        m.put("date", t.date.toString());
        m.put("merchant", t.merchant);
        m.put("description", t.description);
        m.put("amount", t.amount);
        m.put("category", AnalyticsService.cat(t));
        m.put("isRecurring", t.isRecurring);
        m.put("isAnomaly", t.isAnomaly);
        m.put("anomalyReason", t.anomalyReason);
        m.put("accountId", t.accountId);
        m.put("cardId", t.cardId);
        return m;
    }
}
