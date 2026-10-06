package com.finpilot.repo;

import com.finpilot.model.Loan;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface LoanRepo extends JpaRepository<Loan, Long> {
    List<Loan> findByUserIdOrderByIdAsc(Long userId);
    Optional<Loan> findByIdAndUserId(Long id, Long userId);
}
