package com.finpilot.repo;

import com.finpilot.model.Goal;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface GoalRepo extends JpaRepository<Goal, Long> {
    List<Goal> findByUserIdOrderByIdAsc(Long userId);
    Optional<Goal> findByIdAndUserId(Long id, Long userId);
}
