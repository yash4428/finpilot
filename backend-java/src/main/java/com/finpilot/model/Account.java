package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "accounts")
public class Account {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    /** "bank" or "wallet" */
    @Column(nullable = false)
    public String type = "bank";
    /** Display label, e.g. "HDFC Savings". Never an account number. */
    public String name;
    @Column(precision = 14, scale = 2, nullable = false)
    public BigDecimal balance = BigDecimal.ZERO;
}
