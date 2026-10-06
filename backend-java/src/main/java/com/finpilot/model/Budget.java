package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "budgets")
public class Budget {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id", nullable = false)
    public Category category;
    @Column(name = "limit_amount", precision = 14, scale = 2, nullable = false)
    public BigDecimal limitAmount;
    /** Only "monthly" is supported for now. */
    @Column(nullable = false)
    public String period = "monthly";
}
