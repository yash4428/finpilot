package com.finpilot.web;

import com.finpilot.config.ApiException;
import com.finpilot.config.CurrentUser;
import com.finpilot.config.Money;
import com.finpilot.model.Loan;
import com.finpilot.repo.LoanRepo;
import com.finpilot.service.DuesService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/loans")
public class LoanController {
    private final LoanRepo loans;
    private final DuesService dues;

    public LoanController(LoanRepo loans, DuesService dues) {
        this.loans = loans;
        this.dues = dues;
    }

    public record LoanReq(String type, String lender, @NotNull @Positive BigDecimal principal,
                          @NotNull BigDecimal interestRate, @NotNull @Positive Integer tenureMonths,
                          BigDecimal installmentAmount, @NotNull LocalDate nextDueDate, Integer remainingInstallments) {}

    @GetMapping
    public List<Loan> list() {
        return loans.findByUserIdOrderByIdAsc(CurrentUser.id());
    }

    @PostMapping
    @Transactional
    public Loan create(@Valid @RequestBody LoanReq req) {
        Loan l = new Loan();
        l.userId = CurrentUser.id();
        apply(l, req);
        loans.save(l);
        dues.syncLoan(l);
        return l;
    }

    @PutMapping("/{id}")
    @Transactional
    public Loan update(@PathVariable Long id, @Valid @RequestBody LoanReq req) {
        Loan l = loans.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Loan"));
        apply(l, req);
        loans.save(l);
        dues.syncLoan(l);
        return l;
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable Long id) {
        Loan l = loans.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Loan"));
        dues.removeFor("loan", l.id);
        loans.delete(l);
        return Map.of("deleted", id);
    }

    private static void apply(Loan l, LoanReq r) {
        l.type = r.type() == null ? "personal" : r.type();
        l.lender = r.lender();
        l.principal = Money.r(r.principal());
        l.interestRate = r.interestRate();
        l.tenureMonths = r.tenureMonths();
        l.installmentAmount = r.installmentAmount() != null ? Money.r(r.installmentAmount())
                : emi(r.principal(), r.interestRate(), r.tenureMonths());
        l.nextDueDate = r.nextDueDate();
        l.remainingInstallments = r.remainingInstallments() != null ? r.remainingInstallments() : r.tenureMonths();
    }

    /** Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1). */
    static BigDecimal emi(BigDecimal p, BigDecimal annualRate, int n) {
        if (annualRate.signum() == 0) return p.divide(BigDecimal.valueOf(n), 2, RoundingMode.HALF_UP);
        MathContext mc = MathContext.DECIMAL64;
        BigDecimal r = annualRate.divide(BigDecimal.valueOf(1200), mc);
        BigDecimal pow = BigDecimal.ONE.add(r).pow(n, mc);
        return p.multiply(r).multiply(pow).divide(pow.subtract(BigDecimal.ONE), 2, RoundingMode.HALF_UP);
    }
}
