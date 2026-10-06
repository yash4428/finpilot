package com.finpilot.web;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LoanControllerTest {
    @Test
    void emiMatchesStandardFormula() {
        // ₹4,00,000 at 11.5% for 36 months ≈ ₹13,190
        assertEquals(0, new BigDecimal("13190.40").compareTo(LoanController.emi(new BigDecimal("400000"), new BigDecimal("11.5"), 36)));
    }

    @Test
    void zeroInterestSplitsEvenly() {
        assertEquals(0, new BigDecimal("5000.00").compareTo(LoanController.emi(new BigDecimal("60000"), BigDecimal.ZERO, 12)));
    }
}
