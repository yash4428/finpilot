package com.finpilot.repo;

import com.finpilot.model.Due;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface DueRepo extends JpaRepository<Due, Long> {
    List<Due> findByUserIdOrderByDueDateAsc(Long userId);
    List<Due> findByStatusNot(String status);
    Optional<Due> findByIdAndUserId(Long id, Long userId);
    List<Due> findBySourceTypeAndSourceIdAndStatusNot(String sourceType, Long sourceId, String status);
    void deleteBySourceTypeAndSourceId(String sourceType, Long sourceId);
}
