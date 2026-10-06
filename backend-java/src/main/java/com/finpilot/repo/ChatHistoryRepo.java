package com.finpilot.repo;

import com.finpilot.model.ChatHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ChatHistoryRepo extends JpaRepository<ChatHistory, Long> {
    List<ChatHistory> findTop30ByUserIdOrderByCreatedAtDesc(Long userId);
}
