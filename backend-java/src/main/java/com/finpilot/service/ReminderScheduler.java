package com.finpilot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The "cron" from §11: a time-triggered method inside Spring. No Redis, no external queue.
 * Recomputes due statuses (upcoming -> due_soon -> overdue), fires reminders, and
 * checks budgets for proactive alerts.
 */
@Component
public class ReminderScheduler {
    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);
    private final DuesService dues;
    private final BudgetService budgets;

    public ReminderScheduler(DuesService dues, BudgetService budgets) {
        this.dues = dues;
        this.budgets = budgets;
    }

    @Scheduled(cron = "${finpilot.reminder-cron}")
    public void daily() {
        int n = dues.refreshAllAndRemind();
        int b = budgets.checkAllBudgets();
        log.info("Daily job: {} due reminders, {} budget alerts", n, b);
    }

    /** Also run once at startup so a fresh demo shows statuses immediately. */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            daily();
        } catch (Exception e) {
            log.warn("Startup reminder pass failed: {}", e.getMessage());
        }
    }
}
