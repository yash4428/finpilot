package com.finpilot.service;

import com.finpilot.config.ApiException;
import com.finpilot.config.Money;
import com.finpilot.model.*;
import com.finpilot.repo.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Dues engine: keeps one open due per card / loan in sync with its source,
 * computes statuses, and handles (simulated) payment.
 */
@Service
public class DuesService {
    private final DueRepo dues;
    private final CardRepo cards;
    private final LoanRepo loans;
    private final AccountRepo accounts;
    private final TransactionRepo txns;
    private final CategoryService categories;
    private final NotificationService notifications;
    private final int dueSoonDays;

    public DuesService(DueRepo dues, CardRepo cards, LoanRepo loans, AccountRepo accounts, TransactionRepo txns,
                       CategoryService categories, NotificationService notifications,
                       @Value("${finpilot.due-soon-days}") int dueSoonDays) {
        this.dues = dues;
        this.cards = cards;
        this.loans = loans;
        this.accounts = accounts;
        this.txns = txns;
        this.categories = categories;
        this.notifications = notifications;
        this.dueSoonDays = dueSoonDays;
    }

    public String statusFor(Due d, LocalDate today) {
        if ("paid".equals(d.status)) return "paid";
        long days = ChronoUnit.DAYS.between(today, d.dueDate);
        if (days < 0) return "overdue";
        if (days <= dueSoonDays) return "due_soon";
        return "upcoming";
    }

    @Transactional
    public void syncCard(Card c) {
        List<Due> open = dues.findBySourceTypeAndSourceIdAndStatusNot("card", c.id, "paid");
        boolean owes = c.outstanding != null && c.outstanding.signum() > 0 && c.dueDate != null;
        if (!owes) {
            dues.deleteAll(open);
            return;
        }
        Due d = open.isEmpty() ? new Due() : open.get(0);
        d.userId = c.userId;
        d.sourceType = "card";
        d.sourceId = c.id;
        d.label = c.issuer + (c.nickname != null ? " " + c.nickname : "") + " bill";
        d.amount = Money.r(c.outstanding);
        d.minAmount = Money.r(c.minDue);
        if (d.dueDate == null || !d.dueDate.equals(c.dueDate)) d.remindedOn = null;
        d.dueDate = c.dueDate;
        d.status = statusFor(d, LocalDate.now());
        dues.save(d);
    }

    @Transactional
    public void syncLoan(Loan l) {
        List<Due> open = dues.findBySourceTypeAndSourceIdAndStatusNot("loan", l.id, "paid");
        if (l.remainingInstallments == null || l.remainingInstallments <= 0 || l.nextDueDate == null) {
            dues.deleteAll(open);
            return;
        }
        Due d = open.isEmpty() ? new Due() : open.get(0);
        d.userId = l.userId;
        d.sourceType = "loan";
        d.sourceId = l.id;
        d.label = (l.lender != null ? l.lender + " " : "") + labelForLoanType(l.type);
        d.amount = Money.r(l.installmentAmount);
        d.minAmount = Money.r(l.installmentAmount);
        d.dueDate = l.nextDueDate;
        d.status = statusFor(d, LocalDate.now());
        dues.save(d);
    }

    static String labelForLoanType(String type) {
        return switch (type == null ? "" : type) {
            case "education" -> "education loan EMI";
            case "emi" -> "EMI";
            default -> "personal loan EMI";
        };
    }

    @Transactional
    public void removeFor(String sourceType, Long sourceId) {
        dues.deleteBySourceTypeAndSourceId(sourceType, sourceId);
    }

    /** Unpaid dues falling within the horizon (overdue ones are always included). */
    public List<Due> open(Long userId, int horizonDays) {
        LocalDate today = LocalDate.now();
        LocalDate limit = today.plusDays(horizonDays);
        return dues.findByUserIdOrderByDueDateAsc(userId).stream()
                .peek(d -> d.status = statusFor(d, today))
                .filter(d -> !"paid".equals(d.status) && !d.dueDate.isAfter(limit))
                .toList();
    }

    public List<Due> recentlyPaid(Long userId) {
        OffsetDateTime since = OffsetDateTime.now().minusDays(45);
        return dues.findByUserIdOrderByDueDateAsc(userId).stream()
                .filter(d -> "paid".equals(d.status) && d.paidAt != null && d.paidAt.isAfter(since))
                .toList();
    }

    /** Marks a due paid from the user's primary bank account and advances its source. */
    @Transactional
    public Due pay(Long userId, Long dueId) {
        Due d = dues.findByIdAndUserId(dueId, userId).orElseThrow(() -> ApiException.notFound("Due"));
        if ("paid".equals(d.status)) throw ApiException.bad("This due is already paid");

        Account bank = accounts.findByUserIdOrderByIdAsc(userId).stream()
                .filter(a -> "bank".equals(a.type)).findFirst()
                .orElseThrow(() -> ApiException.bad("Add a bank account before paying dues"));
        bank.balance = bank.balance.subtract(d.amount);
        accounts.save(bank);

        Transaction t = new Transaction();
        t.userId = userId;
        t.accountId = bank.id;
        t.amount = d.amount.negate();
        t.date = LocalDate.now();
        t.merchant = d.label;
        t.description = "Paid via FinPilot";
        t.category = categories.byName("card".equals(d.sourceType) ? "Card Payment" : "Loan EMI");
        t.categoryConfirmed = true;
        txns.save(t);

        d.status = "paid";
        d.paidAt = OffsetDateTime.now();
        dues.save(d);

        if ("card".equals(d.sourceType)) {
            cards.findById(d.sourceId).ifPresent(c -> {
                c.outstanding = Money.nz(c.outstanding).subtract(d.amount).max(BigDecimal.ZERO);
                c.minDue = BigDecimal.ZERO;
                if (c.dueDate != null) c.dueDate = c.dueDate.plusMonths(1);
                if (c.statementDate != null) c.statementDate = c.statementDate.plusMonths(1);
                cards.save(c);
                syncCard(c);
            });
        } else {
            loans.findById(d.sourceId).ifPresent(l -> {
                l.remainingInstallments = Math.max(0, l.remainingInstallments - 1);
                if (l.nextDueDate != null) l.nextDueDate = l.nextDueDate.plusMonths(1);
                loans.save(l);
                syncLoan(l);
            });
        }
        notifications.notifyOnce(userId, "info", "Payment recorded",
                d.label + " of " + Money.inr(d.amount) + " marked paid.", null);
        return d;
    }

    /** Daily job body: refresh every open due's status and send reminders. */
    @Transactional
    public int refreshAllAndRemind() {
        return refreshAndRemind(null);
    }

    /** Same as the daily job, limited to one user when userId is non-null. */
    @Transactional
    public int refreshAndRemind(Long userId) {
        LocalDate today = LocalDate.now();
        int reminded = 0;
        for (Due d : dues.findByStatusNot("paid")) {
            if (userId != null && !userId.equals(d.userId)) continue;
            d.status = statusFor(d, today);
            if (("due_soon".equals(d.status) || "overdue".equals(d.status)) && !today.equals(d.remindedOn)) {
                long days = ChronoUnit.DAYS.between(today, d.dueDate);
                String when = days < 0 ? "was due " + (-days) + (days == -1 ? " day ago" : " days ago")
                        : days == 0 ? "is due today" : "is due in " + days + (days == 1 ? " day" : " days");
                notifications.notifyOnce(d.userId, "due",
                        ("overdue".equals(d.status) ? "Overdue: " : "Reminder: ") + d.label,
                        Money.inr(d.amount) + " " + when + " (" + d.dueDate + ").",
                        "due-" + d.id + "-" + d.status + "-" + d.dueDate);
                d.remindedOn = today;
                reminded++;
            }
            dues.save(d);
        }
        return reminded;
    }
}
