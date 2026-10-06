package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.OffsetDateTime;

/** Proactive alerts: due reminders, budget warnings, anomaly flags. */
@Entity
@Table(name = "notifications")
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    /** due / budget / anomaly / info */
    @Column(nullable = false)
    public String kind;
    @Column(nullable = false)
    public String title;
    @Column(columnDefinition = "text")
    public String body;
    /** Dedupe key so the scheduler never sends the same reminder twice. */
    @JsonIgnore
    @Column(name = "dedupe_key", unique = true)
    public String dedupeKey;
    @Column(name = "is_read", nullable = false)
    public boolean read = false;
    @Column(name = "created_at", nullable = false)
    public OffsetDateTime createdAt = OffsetDateTime.now();
}
