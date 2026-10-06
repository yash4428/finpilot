package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Entity
@Table(name = "tax_profile")
public class TaxProfile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    /** Financial year label, e.g. "2026-27". */
    @Column(nullable = false)
    public String fy;
    @Column(name = "gross_income", precision = 14, scale = 2, nullable = false)
    public BigDecimal grossIncome = BigDecimal.ZERO;
    /** Keys: sec80C, sec80D, sec80CCD1B, hraExemption, homeLoanInterest, sec80TTA. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "deductions_json", columnDefinition = "jsonb")
    public Map<String, BigDecimal> deductions = new HashMap<>();
    @Column(nullable = false)
    public String regime = "new";
    @Column(name = "estimated_tax", precision = 14, scale = 2)
    public BigDecimal estimatedTax;
}
