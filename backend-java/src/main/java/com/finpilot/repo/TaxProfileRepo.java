package com.finpilot.repo;

import com.finpilot.model.TaxProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface TaxProfileRepo extends JpaRepository<TaxProfile, Long> {
    Optional<TaxProfile> findFirstByUserIdOrderByIdDesc(Long userId);
}
