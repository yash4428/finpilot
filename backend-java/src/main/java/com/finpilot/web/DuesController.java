package com.finpilot.web;

import com.finpilot.config.CurrentUser;
import com.finpilot.model.Due;
import com.finpilot.service.BudgetService;
import com.finpilot.service.DuesService;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/dues")
public class DuesController {
    private final DuesService dues;
    private final BudgetService budgets;

    public DuesController(DuesService dues, BudgetService budgets) {
        this.dues = dues;
        this.budgets = budgets;
    }

    /** Runs the daily reminder pass for the current user now (used after seeding / in demos). */
    @PostMapping("/refresh")
    public Map<String, Object> refresh() {
        Long userId = CurrentUser.id();
        return Map.of("reminders", dues.refreshAndRemind(userId), "budgetAlerts", budgets.checkBudgets(userId));
    }

    /** horizon like "30d" (default) or a plain number of days. */
    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "30d") String horizon,
                                    @RequestParam(defaultValue = "false") boolean includePaid) {
        String digits = horizon.replaceAll("[^0-9]", "");
        int days = digits.isEmpty() ? 30 : Math.min(366, Integer.parseInt(digits));
        Long userId = CurrentUser.id();
        List<Due> open = dues.open(userId, days);
        BigDecimal total = open.stream().map(d -> d.amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("horizonDays", days);
        out.put("total", total);
        out.put("dues", open);
        if (includePaid) out.put("paid", dues.recentlyPaid(userId));
        return out;
    }

    @PostMapping("/{id}/pay")
    public Due pay(@PathVariable Long id) {
        return dues.pay(CurrentUser.id(), id);
    }
}
