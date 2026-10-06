package com.finpilot.web;

import com.finpilot.config.ApiException;
import com.finpilot.config.CurrentUser;
import com.finpilot.config.Money;
import com.finpilot.model.Card;
import com.finpilot.repo.CardRepo;
import com.finpilot.service.DuesService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/cards")
public class CardController {
    private final CardRepo cards;
    private final DuesService dues;

    public CardController(CardRepo cards, DuesService dues) {
        this.cards = cards;
        this.dues = dues;
    }

    public record CardReq(@NotBlank String issuer, String nickname,
                          @Pattern(regexp = "^$|^\\d{4}$", message = "must be the last 4 digits only") String last4,
                          @NotNull BigDecimal creditLimit, BigDecimal outstanding,
                          LocalDate statementDate, LocalDate dueDate, BigDecimal minDue, BigDecimal apr) {}

    @GetMapping
    public List<Card> list() {
        return cards.findByUserIdOrderByIdAsc(CurrentUser.id());
    }

    @PostMapping
    @Transactional
    public Card create(@Valid @RequestBody CardReq req) {
        Card c = new Card();
        c.userId = CurrentUser.id();
        apply(c, req);
        cards.save(c);
        dues.syncCard(c);
        return c;
    }

    @PutMapping("/{id}")
    @Transactional
    public Card update(@PathVariable Long id, @Valid @RequestBody CardReq req) {
        Card c = cards.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Card"));
        apply(c, req);
        cards.save(c);
        dues.syncCard(c);
        return c;
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable Long id) {
        Card c = cards.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Card"));
        dues.removeFor("card", c.id);
        cards.delete(c);
        return Map.of("deleted", id);
    }

    private static void apply(Card c, CardReq r) {
        c.issuer = r.issuer().trim();
        c.nickname = r.nickname();
        c.last4 = r.last4() == null || r.last4().isBlank() ? null : r.last4();
        c.creditLimit = Money.r(r.creditLimit());
        c.outstanding = Money.r(Money.nz(r.outstanding()));
        c.statementDate = r.statementDate();
        c.dueDate = r.dueDate();
        // Indian issuers typically set min due at ~5% of the statement balance.
        c.minDue = r.minDue() != null ? Money.r(r.minDue())
                : Money.r(c.outstanding.multiply(new BigDecimal("0.05")));
        if (r.apr() != null) c.apr = r.apr();
    }
}
