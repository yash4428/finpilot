package com.finpilot.repo;

import com.finpilot.model.Budget;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BudgetRepo extends JpaRepository<Budget, Long> {
    List<Budget> findByUserIdOrderByIdAsc(Long userId);
    Optional<Budget> findByIdAndUserId(Long id, Long userId);
    Optional<Budget> findByUserIdAndCategoryId(Long userId, Long categoryId);
}
