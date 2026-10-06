package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Negative amount = money out (debit), positive = money in (credit). */
@Entity
@Table(name = "transactions", indexes = @Index(columnList = "user_id,date"))
public class Transaction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    @Column(name = "account_id")
    public Long accountId;
    @Column(name = "card_id")
    public Long cardId;
    @Column(precision = 14, scale = 2, nullable = false)
    public BigDecimal amount;
    @Column(nullable = false)
    public LocalDate date;
    public String merchant;
    public String description;
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id")
    public Category category;
    @Column(name = "is_recurring", nullable = false)
    public boolean isRecurring = false;
    @Column(name = "is_anomaly", nullable = false)
    public boolean isAnomaly = false;
    /** Why the anomaly detector flagged it (shown in UI). */
    @Column(name = "anomaly_reason")
    public String anomalyReason;
    /** True when the user picked the category by hand; used as training signal. */
    @Column(name = "category_confirmed", nullable = false)
    public boolean categoryConfirmed = false;
}
