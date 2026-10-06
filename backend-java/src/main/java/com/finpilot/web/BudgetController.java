package com.finpilot.web;

import com.finpilot.config.ApiException;
import com.finpilot.config.CurrentUser;
import com.finpilot.config.Money;
import com.finpilot.model.Budget;
import com.finpilot.repo.BudgetRepo;
import com.finpilot.service.BudgetService;
import com.finpilot.service.CategoryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/budgets")
public class BudgetController {
    private final BudgetRepo budgets;
    private final BudgetService service;
    private final CategoryService categories;

    public BudgetController(BudgetRepo budgets, BudgetService service, CategoryService categories) {
        this.budgets = budgets;
        this.service = service;
        this.categories = categories;
    }

    public record BudgetReq(@NotBlank String category, @NotNull @Positive BigDecimal limitAmount) {}

    /** Budgets with this month's consumption. Optional ?category= filter (used by the agent). */
    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) String category) {
        return service.status(CurrentUser.id()).stream()
                .filter(b -> category == null || category.isBlank() || category.equalsIgnoreCase((String) b.get("category")))
                .toList();
    }

    /** Creates a budget, or updates the limit if this category already has one. */
    @PostMapping
    public Map<String, Object> upsert(@Valid @RequestBody BudgetReq req) {
        Long userId = CurrentUser.id();
        var cat = categories.byName(req.category());
        Budget b = budgets.findByUserIdAndCategoryId(userId, cat.id).orElseGet(Budget::new);
        b.userId = userId;
        b.category = cat;
        b.limitAmount = Money.r(req.limitAmount());
        budgets.save(b);
        service.checkBudgets(userId);
        return Map.of("id", b.id, "category", cat.name, "limit", b.limitAmount);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        Budget b = budgets.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Budget"));
        budgets.delete(b);
        return Map.of("deleted", id);
    }
}
