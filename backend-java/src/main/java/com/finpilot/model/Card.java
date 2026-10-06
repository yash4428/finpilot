package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "cards")
public class Card {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    @Column(nullable = false)
    public String issuer;
    /** Friendly product name, e.g. "Regalia Gold". */
    public String nickname;
    /** Last four digits only, for display. Never stored in full. */
    public String last4;
    @Column(name = "credit_limit", precision = 14, scale = 2, nullable = false)
    public BigDecimal creditLimit = BigDecimal.ZERO;
    @Column(precision = 14, scale = 2, nullable = false)
    public BigDecimal outstanding = BigDecimal.ZERO;
    @Column(name = "statement_date")
    public LocalDate statementDate;
    @Column(name = "due_date")
    public LocalDate dueDate;
    @Column(name = "min_due", precision = 14, scale = 2)
    public BigDecimal minDue = BigDecimal.ZERO;
    /** Annual percentage rate on revolving balance; used for payoff ordering. */
    @Column(precision = 5, scale = 2)
    public BigDecimal apr = new BigDecimal("42.00");
}
