package com.finpilot.repo;

import com.finpilot.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TransactionRepo extends JpaRepository<Transaction, Long> {
    List<Transaction> findByUserIdOrderByDateDescIdDesc(Long userId);
    List<Transaction> findByUserIdAndDateBetweenOrderByDateDescIdDesc(Long userId, LocalDate from, LocalDate to);
    List<Transaction> findByUserIdAndCardIdOrderByDateDesc(Long userId, Long cardId);
    Optional<Transaction> findByIdAndUserId(Long id, Long userId);
    List<Transaction> findByUserIdAndCategoryConfirmedTrue(Long userId);
}
