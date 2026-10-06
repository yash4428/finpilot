package com.finpilot.service;

import com.finpilot.config.Money;
import com.finpilot.model.Card;
import com.finpilot.model.Due;
import com.finpilot.repo.CardRepo;
import com.finpilot.repo.DueRepo;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * Simulated credit-score helper (no bureau). A transparent, utilisation-led estimate on
 * the 300–900 scale with rule-based tips. Clearly labelled as an estimate in the UI.
 */
@Service
public class CreditScoreService {
    private final CardRepo cards;
    private final DueRepo dues;
    private final DuesService duesService;

    public CreditScoreService(CardRepo cards, DueRepo dues, DuesService duesService) {
        this.cards = cards;
        this.dues = dues;
        this.duesService = duesService;
    }

    public Map<String, Object> estimate(Long userId) {
        List<Card> list = cards.findByUserIdOrderByIdAsc(userId);
        BigDecimal limit = list.stream().map(c -> Money.nz(c.creditLimit)).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal used = list.stream().map(c -> Money.nz(c.outstanding)).reduce(BigDecimal.ZERO, BigDecimal::add);
        double util = limit.signum() == 0 ? 0 : used.divide(limit, 4, RoundingMode.HALF_UP).doubleValue() * 100;

        LocalDate today = LocalDate.now();
        List<Due> all = dues.findByUserIdOrderByDueDateAsc(userId);
        long overdue = all.stream().filter(d -> "overdue".equals(duesService.statusFor(d, today))).count();
        long paidOnTime = all.stream().filter(d -> "paid".equals(d.status) && d.paidAt != null
                && !d.paidAt.toLocalDate().isAfter(d.dueDate)).count();

        List<Map<String, Object>> factors = new ArrayList<>();
        int score = 720;
        int utilPts = util < 10 ? 60 : util < 30 ? 35 : util < 50 ? -10 : util < 75 ? -45 : -80;
        score += utilPts;
        factors.add(factor("Credit utilisation", String.format("%.0f%% of limits used", util), utilPts));
        int overduePts = (int) (-70 * overdue);
        score += overduePts;
        factors.add(factor("Payment history", overdue == 0 ? "No overdue payments" : overdue + " overdue", overdue == 0 ? 25 : overduePts));
        if (overdue == 0) score += 25;
        int paidPts = (int) Math.min(30, paidOnTime * 6);
        score += paidPts;
        factors.add(factor("On-time payments via FinPilot", paidOnTime + " recorded", paidPts));
        int mixPts = list.size() >= 2 ? 10 : 0;
        score += mixPts;
        factors.add(factor("Credit mix", list.size() + " active cards", mixPts));
        score = Math.max(300, Math.min(900, score));

        List<String> tips = new ArrayList<>();
        if (util >= 30) {
            BigDecimal target = limit.multiply(new BigDecimal("0.30"));
            tips.add("Bring card balances under " + Money.inr(target) + " (30% of your limits) before the statement date.");
        }
        if (overdue > 0) tips.add("Clear overdue dues first; each late payment weighs on your score for months.");
        tips.add("Pay the full statement balance, not just the minimum due, to avoid ~3.5% monthly interest.");
        if (list.size() >= 2) tips.add("Keep older cards open; closing them shortens your credit history and raises utilisation.");

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("score", score);
        m.put("band", score >= 780 ? "Excellent" : score >= 720 ? "Good" : score >= 650 ? "Fair" : "Needs work");
        m.put("utilization", BigDecimal.valueOf(util).setScale(1, RoundingMode.HALF_UP));
        m.put("totalLimit", Money.r(limit));
        m.put("totalUsed", Money.r(used));
        m.put("factors", factors);
        m.put("tips", tips);
        m.put("simulated", true);
        return m;
    }

    private static Map<String, Object> factor(String name, String detail, int impact) {
        return Map.of("name", name, "detail", detail, "impact", impact);
    }
}
