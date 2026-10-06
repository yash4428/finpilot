package com.finpilot.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "chat_history")
public class ChatHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    public Long userId;
    @Column(nullable = false, columnDefinition = "text")
    public String query;
    @Column(columnDefinition = "text")
    public String response;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tools_used", columnDefinition = "jsonb")
    public List<Map<String, Object>> toolsUsed;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    public List<Map<String, Object>> sources;
    /** Extra structured payload for the UI (verdict, facts, trace, mode). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    public Map<String, Object> meta;
    @Column(name = "created_at", nullable = false)
    public OffsetDateTime createdAt = OffsetDateTime.now();
}
