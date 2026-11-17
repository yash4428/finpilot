package com.finpilot.service;

import com.finpilot.config.Money;
import com.finpilot.model.Card;
import com.finpilot.model.Loan;
import com.finpilot.model.Transaction;
import com.finpilot.repo.*;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * FinPilot score (0–100): four equally weighted, explainable parts.
 *   Savings rate      — share of income left after spending and EMIs (last 3 full months)
 *   Debt load         — EMIs as a share of income
 *   Safety net        — months of spending covered by cash and goal savings
 *   Discipline        — card utilisation, overdue dues and budgets kept this month
 */
@Service
public class HealthScoreService {
    private final TransactionRepo txns;
    private final LoanRepo loans;
    private final CardRepo cards;
    private final GoalRepo goals;
    private final AccountRepo accounts;
    private final DuesService dues;
    private final BudgetService budgets;
    private final DueRepo dueRepo;

    public HealthScoreService(TransactionRepo txns, LoanRepo loans, CardRepo cards, GoalRepo goals, AccountRepo accounts,
                              DuesService dues, BudgetService budgets, DueRepo dueRepo) {
        this.txns = txns;
        this.loans = loans;
        this.cards = cards;
        this.goals = goals;
        this.accounts = accounts;
        this.dues = dues;
        this.budgets = budgets;
        this.dueRepo = dueRepo;
    }

    public Map<String, Object> score(Long userId) {
        LocalDate today = LocalDate.now();
        YearMonth cur = YearMonth.from(today);
        BigDecimal income = BigDecimal.ZERO, spend = BigDecimal.ZERO;
        int months = 0;
        for (int i = 1; i <= 3; i++) {
            YearMonth ym = cur.minusMonths(i);
            List<Transaction> list = txns.findByUserIdAndDateBetweenOrderByDateDescIdDesc(userId, ym.atDay(1), ym.atEndOfMonth());
            if (list.isEmpty()) continue;
            months++;
            for (Transaction t : list) {
                if (t.amount.signum() > 0) income = income.add(t.amount);
                else if (AnalyticsService.isSpend(t)) spend = spend.add(t.amount.negate());
            }
        }
        BigDecimal avgIncome = months == 0 ? BigDecimal.ZERO : income.divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);
        BigDecimal avgSpend = months == 0 ? BigDecimal.ZERO : spend.divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);
        BigDecimal emis = loans.findByUserIdOrderByIdAsc(userId).stream().filter(l -> l.remainingInstallments > 0)
                .map(l -> l.installmentAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal surplus = avgIncome.subtract(avgSpend).subtract(emis);

        List<Map<String, Object>> parts = new ArrayList<>();
        // 1. Savings rate: 30%+ of income kept = full marks.
        double savingsRate = avgIncome.signum() == 0 ? 0 : surplus.doubleValue() / avgIncome.doubleValue();
        int p1 = clamp((int) Math.round(savingsRate / 0.30 * 25));
        parts.add(part("Savings rate", pct(savingsRate) + " of income kept each month", p1,
                savingsRate >= 0.30 ? "Strong — keep automating your SIPs."
                        : "Aim to keep 20–30% of income; trim your biggest category first."));
        // 2. Debt load: EMIs under 10% of income = full marks, 50%+ = zero.
        double dti = avgIncome.signum() == 0 ? (emis.signum() > 0 ? 1 : 0) : emis.doubleValue() / avgIncome.doubleValue();
        int p2 = clamp((int) Math.round((0.50 - dti) / 0.40 * 25));
        parts.add(part("Debt load", pct(dti) + " of income goes to EMIs", p2,
                dti <= 0.20 ? "Comfortable EMI load." : "Prepay the highest-interest loan to free up cash flow."));
        // 3. Safety net: 6 months of spending covered = full marks.
        BigDecimal cash = accounts.findByUserIdOrderByIdAsc(userId).stream().map(a -> a.balance).reduce(BigDecimal.ZERO, BigDecimal::add)
                .add(goals.findByUserIdOrderByIdAsc(userId).stream().map(g -> g.savedAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        double cover = avgSpend.signum() == 0 ? 6 : cash.doubleValue() / avgSpend.doubleValue();
        int p3 = clamp((int) Math.round(Math.min(cover, 6) / 6 * 25));
        parts.add(part("Safety net", String.format("%.1f months of spending covered", cover), p3,
                cover >= 6 ? "Your emergency cushion is solid." : "Build towards 6 months of expenses in a liquid fund."));
        // 4. Discipline: utilisation, overdue dues, budgets kept.
        BigDecimal limit = cards.findByUserIdOrderByIdAsc(userId).stream().map(c -> Money.nz(c.creditLimit)).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal used = cards.findByUserIdOrderByIdAsc(userId).stream().map(c -> Money.nz(c.outstanding)).reduce(BigDecimal.ZERO, BigDecimal::add);
        double util = limit.signum() == 0 ? 0 : used.doubleValue() / limit.doubleValue();
        long overdue = dueRepo.findByUserIdOrderByDueDateAsc(userId).stream()
                .filter(d -> "overdue".equals(dues.statusFor(d, today))).count();
        long overBudget = budgets.status(userId).stream().filter(b -> "over".equals(b.get("state"))).count();
        int p4 = 25 - (util > 0.5 ? 12 : util > 0.3 ? 6 : 0) - (int) (8 * overdue) - (int) (3 * overBudget);
        p4 = clamp(p4);
        parts.add(part("Discipline", String.format("%.0f%% card use · %d overdue · %d budget%s over", util * 100, overdue,
                overBudget, overBudget == 1 ? "" : "s"), p4,
                overdue > 0 ? "Clear overdue dues first." : overBudget > 0 ? "Rein in the budget that's over." : "Clean record — nice."));

        int total = parts.stream().mapToInt(p -> (Integer) p.get("points")).sum();
        Map<String, Object> weakest = parts.stream().min(Comparator.comparingInt(p -> (Integer) p.get("points"))).orElseThrow();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("score", total);
        out.put("grade", total >= 80 ? "Excellent" : total >= 65 ? "Good" : total >= 45 ? "Fair" : "Needs attention");
        out.put("parts", parts);
        out.put("focus", weakest.get("name") + ": " + weakest.get("tip"));
        out.put("avgMonthlyIncome", Money.r(avgIncome));
        out.put("avgMonthlySpend", Money.r(avgSpend));
        out.put("monthlyEmis", Money.r(emis));
        out.put("monthlySurplus", Money.r(surplus));
        return out;
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(25, v));
    }

    private static String pct(double v) {
        return Math.round(v * 100) + "%";
    }

    private static Map<String, Object> part(String name, String detail, int points, String tip) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("detail", detail);
        m.put("points", points);
        m.put("max", 25);
        m.put("tip", tip);
        return m;
    }
}
