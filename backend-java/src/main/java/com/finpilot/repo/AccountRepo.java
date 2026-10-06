package com.finpilot.repo;

import com.finpilot.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface AccountRepo extends JpaRepository<Account, Long> {
    List<Account> findByUserIdOrderByIdAsc(Long userId);
    Optional<Account> findByIdAndUserId(Long id, Long userId);
}
