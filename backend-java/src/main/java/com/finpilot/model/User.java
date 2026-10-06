package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "users")
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(nullable = false)
    public String name;
    @Column(nullable = false, unique = true)
    public String email;
    @JsonIgnore
    @Column(name = "password_hash", nullable = false)
    public String passwordHash;
    @Column(name = "annual_income", precision = 14, scale = 2)
    public BigDecimal annualIncome = BigDecimal.ZERO;
    /** "new" or "old" */
    @Column(name = "tax_regime")
    public String taxRegime = "new";
}
