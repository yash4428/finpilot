package com.finpilot.web;

import com.finpilot.config.ApiException;
import com.finpilot.config.CurrentUser;
import com.finpilot.service.AgentService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/agent")
public class AgentController {
    private final AgentService agent;

    public AgentController(AgentService agent) {
        this.agent = agent;
    }

    public record ChatReq(String message) {}

    @PostMapping("/chat")
    public Map<String, Object> chat(@RequestBody ChatReq req, HttpServletRequest http) {
        if (req.message() == null || req.message().isBlank()) throw ApiException.bad("Ask a question first");
        if (req.message().length() > 600) throw ApiException.bad("Keep questions under 600 characters");
        String token = http.getHeader("Authorization").substring(7);
        return agent.chat(CurrentUser.id(), req.message().trim(), token);
    }

    @GetMapping("/history")
    public List<Map<String, Object>> history() {
        return agent.recent(CurrentUser.id());
    }
}
