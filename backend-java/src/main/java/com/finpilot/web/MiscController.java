package com.finpilot.web;

import com.finpilot.config.ApiException;
import com.finpilot.config.CurrentUser;
import com.finpilot.config.Money;
import com.finpilot.model.Account;
import com.finpilot.model.Category;
import com.finpilot.model.Goal;
import com.finpilot.model.Notification;
import com.finpilot.repo.AccountRepo;
import com.finpilot.repo.GoalRepo;
import com.finpilot.repo.NotificationRepo;
import com.finpilot.service.CategoryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Supporting resources: accounts, goals, categories, notifications. */
@RestController
public class MiscController {
    private final AccountRepo accounts;
    private final GoalRepo goals;
    private final NotificationRepo notifications;
    private final CategoryService categories;

    public MiscController(AccountRepo accounts, GoalRepo goals, NotificationRepo notifications, CategoryService categories) {
        this.accounts = accounts;
        this.goals = goals;
        this.notifications = notifications;
        this.categories = categories;
    }

    public record AccountReq(@NotBlank String name, String type, @NotNull BigDecimal balance) {}

    @GetMapping("/accounts")
    public List<Account> accounts() {
        return accounts.findByUserIdOrderByIdAsc(CurrentUser.id());
    }

    @PostMapping("/accounts")
    public Account addAccount(@Valid @RequestBody AccountReq req) {
        Account a = new Account();
        a.userId = CurrentUser.id();
        a.name = req.name();
        a.type = "wallet".equals(req.type()) ? "wallet" : "bank";
        a.balance = Money.r(req.balance());
        return accounts.save(a);
    }

    @PutMapping("/accounts/{id}")
    public Account updateAccount(@PathVariable Long id, @Valid @RequestBody AccountReq req) {
        Account a = accounts.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Account"));
        a.name = req.name();
        a.balance = Money.r(req.balance());
        return accounts.save(a);
    }

    public record GoalReq(@NotBlank String name, @NotNull BigDecimal targetAmount, LocalDate deadline, BigDecimal savedAmount) {}

    @GetMapping("/goals")
    public List<Goal> goals() {
        return goals.findByUserIdOrderByIdAsc(CurrentUser.id());
    }

    @PostMapping("/goals")
    public Goal addGoal(@Valid @RequestBody GoalReq req) {
        Goal g = new Goal();
        g.userId = CurrentUser.id();
        applyGoal(g, req);
        return goals.save(g);
    }

    @PutMapping("/goals/{id}")
    public Goal updateGoal(@PathVariable Long id, @Valid @RequestBody GoalReq req) {
        Goal g = goals.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Goal"));
        applyGoal(g, req);
        return goals.save(g);
    }

    private static void applyGoal(Goal g, GoalReq req) {
        g.name = req.name();
        g.targetAmount = Money.r(req.targetAmount());
        g.deadline = req.deadline();
        g.savedAmount = Money.r(Money.nz(req.savedAmount()));
    }

    @GetMapping("/categories")
    public List<Category> categories() {
        return categories.all();
    }

    @GetMapping("/notifications")
    public Map<String, Object> notifications() {
        Long userId = CurrentUser.id();
        return Map.of("items", notifications.findTop40ByUserIdOrderByCreatedAtDesc(userId),
                "unread", notifications.countByUserIdAndReadFalse(userId));
    }

    @PostMapping("/notifications/read-all")
    public Map<String, Object> readAll() {
        List<Notification> list = notifications.findByUserIdAndReadFalse(CurrentUser.id());
        list.forEach(n -> n.read = true);
        notifications.saveAll(list);
        return Map.of("updated", list.size());
    }
}
