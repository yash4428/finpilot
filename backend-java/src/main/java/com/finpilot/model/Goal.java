package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "goals")
public class Goal {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    @Column(nullable = false)
    public String name;
    @Column(name = "target_amount", precision = 14, scale = 2, nullable = false)
    public BigDecimal targetAmount;
    public LocalDate deadline;
    @Column(name = "saved_amount", precision = 14, scale = 2, nullable = false)
    public BigDecimal savedAmount = BigDecimal.ZERO;
}
