package com.finpilot.service;

import com.finpilot.model.ChatHistory;
import com.finpilot.repo.ChatHistoryRepo;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

/**
 * Relays a question to the Python agent (§8) and persists the auditable record
 * (query, response, tools_used, sources) to chat_history.
 * The user's own JWT is forwarded so every tool call the agent makes back into this
 * API is scoped to the same user by the same security filter.
 */
@Service
public class AgentService {
    private final MlClient ml;
    private final ChatHistoryRepo history;

    public AgentService(MlClient ml, ChatHistoryRepo history) {
        this.ml = ml;
        this.history = history;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> chat(Long userId, String question, String bearerToken) {
        // Short conversational context: last 3 exchanges, text only.
        List<ChatHistory> prev = new ArrayList<>(history.findTop30ByUserIdOrderByCreatedAtDesc(userId).stream().limit(3).toList());
        Collections.reverse(prev);
        List<Map<String, String>> ctx = new ArrayList<>();
        for (ChatHistory h : prev) {
            ctx.add(Map.of("role", "user", "content", h.query));
            ctx.add(Map.of("role", "assistant", "content", h.response == null ? "" : h.response));
        }

        Map<String, Object> res = ml.agentQuery(Map.of(
                "question", question,
                "user_token", bearerToken,
                "today", LocalDate.now().toString(),
                "history", ctx));

        ChatHistory h = new ChatHistory();
        h.userId = userId;
        h.query = question;
        if (res == null) {
            h.response = "Pilot can't reach the analysis service right now, so I won't guess at numbers. "
                    + "Your dashboard figures are still live. Try again in a minute.";
            h.toolsUsed = List.of();
            h.sources = List.of();
            h.meta = Map.of("mode", "offline-error");
        } else {
            h.response = String.valueOf(res.getOrDefault("answer", ""));
            h.toolsUsed = (List<Map<String, Object>>) res.getOrDefault("tools_used", List.of());
            h.sources = (List<Map<String, Object>>) res.getOrDefault("sources", List.of());
            Map<String, Object> meta = new HashMap<>();
            for (String k : List.of("mode", "intent", "lang", "speech", "verdict", "facts", "trace", "grounding")) {
                if (res.get(k) != null) meta.put(k, res.get(k));
            }
            h.meta = meta;
        }
        history.save(h);
        return view(h);
    }

    public List<Map<String, Object>> recent(Long userId) {
        List<ChatHistory> list = new ArrayList<>(history.findTop30ByUserIdOrderByCreatedAtDesc(userId));
        Collections.reverse(list);
        return list.stream().map(AgentService::view).toList();
    }

    static Map<String, Object> view(ChatHistory h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", h.id);
        m.put("query", h.query);
        m.put("answer", h.response);
        m.put("toolsUsed", h.toolsUsed);
        m.put("sources", h.sources);
        m.put("meta", h.meta);
        m.put("createdAt", h.createdAt.toString());
        return m;
    }
}
