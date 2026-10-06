package com.finpilot.service;

import com.finpilot.model.TaxProfile;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TaxServiceTest {
    private final TaxService tax = new TaxService(null, null);

    private static BigDecimal total(Map<String, Object> regime) {
        return (BigDecimal) regime.get("totalTax");
    }

    @Test
    void newRegimeSlabsWithCess() {
        // 21L gross − 75k std = 20.25L taxable → 2,06,250 + 4% cess = 2,14,500
        assertEquals(0, new BigDecimal("214500").compareTo(total(tax.computeNew(new BigDecimal("2100000")))));
    }

    @Test
    void newRegimeRebateUpTo12LakhTaxable() {
        // 12.75L gross → exactly 12L taxable → zero tax under 87A.
        assertEquals(0, BigDecimal.ZERO.compareTo(total(tax.computeNew(new BigDecimal("1275000")))));
    }

    @Test
    void marginalReliefJustAbove12Lakh() {
        // 12.85L gross → 12.10L taxable; tax capped at the 10k excess, plus cess = 10,400.
        assertEquals(0, new BigDecimal("10400").compareTo(total(tax.computeNew(new BigDecimal("1285000")))));
    }

    @Test
    void oldRegimeCapsDeductions() {
        // 80C claimed 2L is capped at 1.5L. Taxable = 21L − 50k − 1.5L = 19L.
        // 12,500 + 1,00,000 + 30% of 9L (2,70,000) = 3,82,500 → +4% = 3,97,800.
        Map<String, Object> old = tax.computeOld(new BigDecimal("2100000"), Map.of("sec80C", new BigDecimal("200000")));
        assertEquals(0, new BigDecimal("1900000").compareTo((BigDecimal) old.get("taxableIncome")));
        assertEquals(0, new BigDecimal("397800").compareTo(total(old)));
    }

    @Test
    void recommendsCheaperRegimeAndListsGaps() {
        TaxProfile p = new TaxProfile();
        p.fy = "2026-27";
        p.grossIncome = new BigDecimal("2100000");
        p.deductions = Map.of("sec80C", new BigDecimal("102000"), "hraExemption", new BigDecimal("144000"));
        Map<String, Object> r = tax.estimate(p);
        assertEquals("new", r.get("recommended"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> s = (List<Map<String, Object>>) r.get("suggestions");
        assertTrue(s.stream().anyMatch(x -> "sec80C".equals(x.get("section"))
                && new BigDecimal("48000").compareTo((BigDecimal) x.get("gap")) == 0));
    }
}
