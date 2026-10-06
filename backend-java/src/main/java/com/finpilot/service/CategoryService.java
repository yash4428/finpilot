package com.finpilot.service;

import com.finpilot.model.Category;
import com.finpilot.repo.CategoryRepo;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

@Service
@Order(1)
public class CategoryService implements ApplicationRunner {
    public static final List<String> SYSTEM = List.of(
            "Income", "Rent", "Groceries", "Dining", "Transport", "Fuel", "Shopping", "Utilities",
            "Subscriptions", "Entertainment", "Health", "Travel", "Education", "Personal Care",
            "Investments", "Loan EMI", "Card Payment", "Transfers", "Other");

    /** Money movements that are not consumption; excluded from "spend" analytics. */
    public static final Set<String> NON_SPEND = Set.of("Income", "Card Payment", "Transfers", "Investments", "Loan EMI");

    private final CategoryRepo repo;

    public CategoryService(CategoryRepo repo) {
        this.repo = repo;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (String name : SYSTEM) {
            if (repo.findByNameIgnoreCase(name).isEmpty()) {
                Category c = new Category();
                c.name = name;
                c.isSystem = true;
                repo.save(c);
            }
        }
    }

    public Category byName(String name) {
        if (name == null || name.isBlank()) return byName("Other");
        return repo.findByNameIgnoreCase(name.trim()).orElseGet(() -> {
            Category c = new Category();
            c.name = name.trim();
            c.isSystem = false;
            return repo.save(c);
        });
    }

    public List<Category> all() {
        return repo.findAll();
    }

    public static boolean isSpend(Category c) {
        return c == null || !NON_SPEND.contains(c.name);
    }
}
