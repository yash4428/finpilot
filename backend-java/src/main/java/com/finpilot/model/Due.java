package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "dues")
public class Due {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    /** card / loan */
    @Column(name = "source_type", nullable = false)
    public String sourceType;
    @Column(name = "source_id", nullable = false)
    public Long sourceId;
    /** Denormalised display label, e.g. "HDFC Regalia bill". */
    public String label;
    @Column(precision = 14, scale = 2, nullable = false)
    public BigDecimal amount;
    @Column(name = "min_amount", precision = 14, scale = 2)
    public BigDecimal minAmount;
    @Column(name = "due_date", nullable = false)
    public LocalDate dueDate;
    /** upcoming / due_soon / overdue / paid */
    @Column(nullable = false)
    public String status = "upcoming";
    @Column(name = "paid_at")
    public OffsetDateTime paidAt;
    @JsonIgnore
    @Column(name = "reminded_on")
    public LocalDate remindedOn;
}
