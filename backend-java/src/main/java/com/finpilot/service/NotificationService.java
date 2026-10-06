package com.finpilot.service;

import com.finpilot.model.Notification;
import com.finpilot.repo.NotificationRepo;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    private final NotificationRepo repo;

    public NotificationService(NotificationRepo repo) {
        this.repo = repo;
    }

    /** Creates a notification unless one with the same dedupe key already exists. */
    public void notifyOnce(Long userId, String kind, String title, String body, String dedupeKey) {
        if (dedupeKey != null && repo.existsByDedupeKey(dedupeKey)) return;
        Notification n = new Notification();
        n.userId = userId;
        n.kind = kind;
        n.title = title;
        n.body = body;
        n.dedupeKey = dedupeKey;
        repo.save(n);
    }
}
