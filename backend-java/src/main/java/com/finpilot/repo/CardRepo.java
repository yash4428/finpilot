package com.finpilot.repo;

import com.finpilot.model.Card;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CardRepo extends JpaRepository<Card, Long> {
    List<Card> findByUserIdOrderByIdAsc(Long userId);
    Optional<Card> findByIdAndUserId(Long id, Long userId);
}
