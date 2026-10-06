package com.finpilot.service;

import com.finpilot.config.Money;
import com.finpilot.model.TaxProfile;
import com.finpilot.model.User;
import com.finpilot.repo.TaxProfileRepo;
import com.finpilot.repo.UserRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * Rule-based, deterministic Indian income-tax estimate for a salaried individual (below 60).
 * Slabs follow the Budget 2025 structure, which carries into FY 2026-27.
 * TODO: surcharge above ₹50L, capital gains, senior-citizen slabs.
 */
@Service
public class TaxService {
    public static final String FY = "2026-27";
    private static final BigDecimal CESS = new BigDecimal("0.04");

    record Slab(long upTo, int ratePct) {}

    private static final List<Slab> NEW_SLABS = List.of(
            new Slab(400_000, 0), new Slab(800_000, 5), new Slab(1_200_000, 10), new Slab(1_600_000, 15),
            new Slab(2_000_000, 20), new Slab(2_400_000, 25), new Slab(Long.MAX_VALUE, 30));
    private static final List<Slab> OLD_SLABS = List.of(
            new Slab(250_000, 0), new Slab(500_000, 5), new Slab(1_000_000, 20), new Slab(Long.MAX_VALUE, 30));

    /** Deduction key -> [label, cap or -1 for uncapped-by-us]. Only the old regime allows these. */
    static final LinkedHashMap<String, Object[]> DEDUCTIONS = new LinkedHashMap<>();
    static {
        DEDUCTIONS.put("sec80C", new Object[]{"80C (EPF, PPF, ELSS, LIC, tuition)", 150_000L});
        DEDUCTIONS.put("sec80D", new Object[]{"80D (health insurance)", 25_000L});
        DEDUCTIONS.put("sec80CCD1B", new Object[]{"80CCD(1B) (NPS, extra)", 50_000L});
        DEDUCTIONS.put("hraExemption", new Object[]{"HRA exemption", -1L});
        DEDUCTIONS.put("homeLoanInterest", new Object[]{"24(b) home-loan interest", 200_000L});
        DEDUCTIONS.put("sec80TTA", new Object[]{"80TTA (savings interest)", 10_000L});
    }

    private final TaxProfileRepo profiles;
    private final UserRepo users;

    public TaxService(TaxProfileRepo profiles, UserRepo users) {
        this.profiles = profiles;
        this.users = users;
    }

    public TaxProfile profile(Long userId) {
        return profiles.findFirstByUserIdOrderByIdDesc(userId).orElseGet(() -> {
            User u = users.findById(userId).orElseThrow();
            TaxProfile p = new TaxProfile();
            p.userId = userId;
            p.fy = FY;
            p.grossIncome = Money.nz(u.annualIncome);
            p.regime = u.taxRegime == null ? "new" : u.taxRegime;
            return p;
        });
    }

    @Transactional
    public Map<String, Object> estimateAndMaybeSave(Long userId, BigDecimal gross, Map<String, BigDecimal> deductions,
                                                     String regime, boolean save) {
        TaxProfile p = profile(userId);
        if (gross != null) p.grossIncome = gross;
        if (deductions != null) p.deductions = new HashMap<>(deductions);
        if (regime != null) p.regime = regime.equals("old") ? "old" : "new";
        Map<String, Object> result = estimate(p);
        if (save) {
            p.estimatedTax = (BigDecimal) ((Map<?, ?>) result.get(p.regime)).get("totalTax");
            profiles.save(p);
            users.findById(userId).ifPresent(u -> {
                u.taxRegime = p.regime;
                u.annualIncome = p.grossIncome;
                users.save(u);
            });
        }
        return result;
    }

    public Map<String, Object> estimate(TaxProfile p) {
        BigDecimal gross = Money.nz(p.grossIncome);
        Map<String, BigDecimal> d = p.deductions == null ? Map.of() : p.deductions;

        Map<String, Object> oldR = computeOld(gross, d);
        Map<String, Object> newR = computeNew(gross);
        BigDecimal oldTax = (BigDecimal) oldR.get("totalTax");
        BigDecimal newTax = (BigDecimal) newR.get("totalTax");
        String recommended = newTax.compareTo(oldTax) <= 0 ? "new" : "old";

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("fy", p.fy == null ? FY : p.fy);
        out.put("grossIncome", Money.r(gross));
        out.put("selectedRegime", p.regime);
        out.put("deductions", d);
        out.put("old", oldR);
        out.put("new", newR);
        out.put("recommended", recommended);
        out.put("savingWithRecommended", Money.r(oldTax.subtract(newTax).abs()));
        out.put("suggestions", suggestions(gross, d, oldR, newTax));
        out.put("returnPrep", returnPrep(p, recommended, oldR, newR));
        out.put("disclaimer", "Estimate only, for a salaried resident under 60. Consult a tax professional before filing.");
        return out;
    }

    Map<String, Object> computeNew(BigDecimal gross) {
        BigDecimal std = new BigDecimal("75000");
        BigDecimal taxable = gross.subtract(std).max(BigDecimal.ZERO);
        List<Map<String, Object>> slabRows = new ArrayList<>();
        BigDecimal slabTax = slabTax(taxable, NEW_SLABS, slabRows);
        BigDecimal rebate = BigDecimal.ZERO;
        BigDecimal limit = new BigDecimal("1200000");
        if (taxable.compareTo(limit) <= 0) {
            rebate = slabTax; // Sec 87A: full rebate up to ₹12L taxable.
        } else {
            // Marginal relief: tax can't exceed the income above ₹12L.
            BigDecimal excess = taxable.subtract(limit);
            if (slabTax.compareTo(excess) > 0) rebate = slabTax.subtract(excess);
        }
        return finish("new", gross, std, List.of(), taxable, slabRows, slabTax, rebate);
    }

    Map<String, Object> computeOld(BigDecimal gross, Map<String, BigDecimal> d) {
        BigDecimal std = new BigDecimal("50000");
        List<Map<String, Object>> applied = new ArrayList<>();
        BigDecimal totalDed = BigDecimal.ZERO;
        for (var e : DEDUCTIONS.entrySet()) {
            BigDecimal claimed = Money.nz(d.get(e.getKey()));
            long cap = (Long) e.getValue()[1];
            BigDecimal allowed = cap < 0 ? claimed : claimed.min(BigDecimal.valueOf(cap));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", e.getKey());
            row.put("label", e.getValue()[0]);
            row.put("claimed", Money.r(claimed));
            row.put("allowed", Money.r(allowed));
            row.put("cap", cap < 0 ? null : cap);
            applied.add(row);
            totalDed = totalDed.add(allowed);
        }
        BigDecimal taxable = gross.subtract(std).subtract(totalDed).max(BigDecimal.ZERO);
        List<Map<String, Object>> slabRows = new ArrayList<>();
        BigDecimal slabTax = slabTax(taxable, OLD_SLABS, slabRows);
        BigDecimal rebate = taxable.compareTo(new BigDecimal("500000")) <= 0 ? slabTax.min(new BigDecimal("12500")) : BigDecimal.ZERO;
        return finish("old", gross, std, applied, taxable, slabRows, slabTax, rebate);
    }

    private Map<String, Object> finish(String regime, BigDecimal gross, BigDecimal std, List<Map<String, Object>> deds,
                                       BigDecimal taxable, List<Map<String, Object>> slabs, BigDecimal slabTax,
                                       BigDecimal rebate) {
        BigDecimal afterRebate = slabTax.subtract(rebate).max(BigDecimal.ZERO);
        BigDecimal cess = afterRebate.multiply(CESS).setScale(0, RoundingMode.HALF_UP);
        BigDecimal total = afterRebate.add(cess).setScale(0, RoundingMode.HALF_UP);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("regime", regime);
        m.put("standardDeduction", std);
        m.put("deductions", deds);
        m.put("taxableIncome", Money.r(taxable));
        m.put("slabs", slabs);
        m.put("slabTax", Money.r(slabTax));
        m.put("rebate87A", Money.r(rebate));
        m.put("cess", Money.r(cess));
        m.put("totalTax", Money.r(total));
        m.put("monthly", Money.r(total.divide(BigDecimal.valueOf(12), 0, RoundingMode.HALF_UP)));
        m.put("effectiveRate", gross.signum() == 0 ? BigDecimal.ZERO
                : total.multiply(BigDecimal.valueOf(100)).divide(gross, 2, RoundingMode.HALF_UP));
        m.put("marginalRate", marginal(taxable, "new".equals(regime) ? NEW_SLABS : OLD_SLABS));
        return m;
    }

    private static BigDecimal slabTax(BigDecimal taxable, List<Slab> slabs, List<Map<String, Object>> rows) {
        BigDecimal tax = BigDecimal.ZERO;
        long lower = 0;
        for (Slab s : slabs) {
            if (taxable.compareTo(BigDecimal.valueOf(lower)) <= 0) break;
            BigDecimal upper = s.upTo == Long.MAX_VALUE ? taxable : taxable.min(BigDecimal.valueOf(s.upTo));
            BigDecimal portion = upper.subtract(BigDecimal.valueOf(lower));
            BigDecimal t = portion.multiply(BigDecimal.valueOf(s.ratePct)).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("from", lower);
            row.put("to", s.upTo == Long.MAX_VALUE ? null : s.upTo);
            row.put("rate", s.ratePct);
            row.put("amount", Money.r(portion));
            row.put("tax", Money.r(t));
            rows.add(row);
            tax = tax.add(t);
            lower = s.upTo == Long.MAX_VALUE ? lower : s.upTo;
        }
        return tax;
    }

    private static int marginal(BigDecimal taxable, List<Slab> slabs) {
        for (Slab s : slabs) if (taxable.compareTo(BigDecimal.valueOf(s.upTo)) <= 0) return s.ratePct;
        return 30;
    }

    /** Save-tax suggestions: unused deduction room and what it is worth under the old regime. */
    private List<Map<String, Object>> suggestions(BigDecimal gross, Map<String, BigDecimal> d,
                                                  Map<String, Object> oldR, BigDecimal newTax) {
        List<Map<String, Object>> out = new ArrayList<>();
        int rate = (Integer) oldR.get("marginalRate");
        String[][] items = {
                {"sec80C", "Top up 80C", "ELSS, PPF or extra EPF (VPF) contributions count toward the ₹1.5L limit."},
                {"sec80CCD1B", "Open or top up NPS Tier-1", "Up to ₹50,000 in NPS is deductible over and above 80C."},
                {"sec80D", "Health insurance premium", "A self/family health policy premium is deductible up to ₹25,000."},
        };
        Map<String, BigDecimal> maxed = new HashMap<>(d);
        for (String[] it : items) {
            long cap = (Long) DEDUCTIONS.get(it[0])[1];
            BigDecimal gap = BigDecimal.valueOf(cap).subtract(Money.nz(d.get(it[0]))).max(BigDecimal.ZERO);
            if (gap.signum() == 0) continue;
            maxed.put(it[0], BigDecimal.valueOf(cap));
            BigDecimal saving = gap.multiply(BigDecimal.valueOf(rate)).multiply(new BigDecimal("1.04"))
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("section", it[0]);
            m.put("title", it[1]);
            m.put("note", it[2]);
            m.put("gap", Money.r(gap));
            m.put("potentialSaving", Money.r(saving));
            m.put("appliesTo", "old");
            out.add(m);
        }
        if (!out.isEmpty()) {
            BigDecimal oldMaxed = (BigDecimal) computeOld(gross, maxed).get("totalTax");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("section", "regime");
            boolean oldWins = oldMaxed.compareTo(newTax) < 0;
            m.put("title", oldWins ? "Maxing these makes the old regime cheaper" : "The new regime still wins");
            m.put("note", oldWins
                    ? "With every gap above filled, the old regime comes to " + Money.inr(oldMaxed) + " vs " + Money.inr(newTax) + " under the new regime."
                    : "Even with every gap filled, the old regime comes to " + Money.inr(oldMaxed) + " vs " + Money.inr(newTax) + " under the new regime. Invest for the goal, not the deduction.");
            m.put("gap", BigDecimal.ZERO);
            m.put("potentialSaving", Money.r(newTax.subtract(oldMaxed).max(BigDecimal.ZERO)));
            m.put("appliesTo", "both");
            out.add(m);
        }
        return out;
    }

    private Map<String, Object> returnPrep(TaxProfile p, String recommended, Map<String, Object> oldR, Map<String, Object> newR) {
        Map<String, Object> chosen = "old".equals(recommended) ? oldR : newR;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("form", "ITR-1 (Sahaj), if income is only salary, one house property and interest");
        m.put("regimeToFile", recommended);
        m.put("taxableIncome", chosen.get("taxableIncome"));
        m.put("taxPayable", chosen.get("totalTax"));
        m.put("checklist", List.of(
                "Form 16 from your employer (Part A and B)",
                "Form 26AS and the Annual Information Statement (AIS) from the income-tax portal",
                "Bank interest certificates for savings and FDs",
                "Proofs for 80C / 80D / NPS if filing under the old regime",
                "Rent receipts and landlord PAN if claiming HRA (old regime)",
                "Verify the return within 30 days of filing (Aadhaar OTP or net banking)"));
        return m;
    }
}
