package com.finpilot.web;

import com.finpilot.config.CurrentUser;
import com.finpilot.service.CreditScoreService;
import com.finpilot.service.DashboardService;
import com.finpilot.service.ForecastService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class DashboardController {
    private final DashboardService dashboard;
    private final ForecastService forecast;
    private final CreditScoreService credit;

    public DashboardController(DashboardService dashboard, ForecastService forecast, CreditScoreService credit) {
        this.dashboard = dashboard;
        this.forecast = forecast;
        this.credit = credit;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return dashboard.build(CurrentUser.id());
    }

    /** Both safe-to-spend numbers + breakdown. Backs the agent's forecast_balance tool. */
    @GetMapping("/forecast")
    public Map<String, Object> forecast() {
        return forecast.safeToSpend(CurrentUser.id());
    }

    @GetMapping("/credit-score")
    public Map<String, Object> creditScore() {
        return credit.estimate(CurrentUser.id());
    }
}
