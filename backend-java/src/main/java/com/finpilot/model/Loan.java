package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "loans")
public class Loan {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    /** personal / education / emi */
    @Column(nullable = false)
    public String type = "personal";
    /** Lender or product label, e.g. "Bajaj Finserv". */
    public String lender;
    @Column(precision = 14, scale = 2, nullable = false)
    public BigDecimal principal = BigDecimal.ZERO;
    @Column(name = "interest_rate", precision = 5, scale = 2, nullable = false)
    public BigDecimal interestRate = BigDecimal.ZERO;
    @Column(name = "tenure_months", nullable = false)
    public Integer tenureMonths = 12;
    @Column(name = "installment_amount", precision = 14, scale = 2, nullable = false)
    public BigDecimal installmentAmount = BigDecimal.ZERO;
    @Column(name = "next_due_date")
    public LocalDate nextDueDate;
    @Column(name = "remaining_installments", nullable = false)
    public Integer remainingInstallments = 12;
}
