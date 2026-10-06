package com.finpilot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Internal REST client for the Python ML/agent service (§6.1).
 * Every call degrades gracefully: on failure it returns null and the caller
 * falls back to a simpler Java computation, so Phase 1 works on its own.
 */
@Component
public class MlClient {
    private static final Logger log = LoggerFactory.getLogger(MlClient.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};

    private final RestClient fast;
    private final RestClient slow;

    public MlClient(@Value("${finpilot.ml-service-url}") String baseUrl,
                    @Value("${finpilot.internal-api-key}") String internalKey) {
        this.fast = build(baseUrl, internalKey, 8_000);
        // The agent loop may make several LLM round-trips.
        this.slow = build(baseUrl, internalKey, 120_000);
    }

    private static RestClient build(String baseUrl, String key, int timeoutMs) {
        var rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(2_000);
        rf.setReadTimeout(timeoutMs);
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(rf)
                .defaultHeader("X-Internal-Key", key)
                .build();
    }

    public Map<String, Object> categorize(Map<String, Object> body) { return post(fast, "/ml/categorize", body); }
    public Map<String, Object> forecast(Map<String, Object> body) { return post(fast, "/ml/forecast", body); }
    public Map<String, Object> anomaly(Map<String, Object> body) { return post(fast, "/ml/anomaly", body); }
    public Map<String, Object> agentQuery(Map<String, Object> body) { return post(slow, "/agent/query", body); }

    private Map<String, Object> post(RestClient client, String path, Map<String, Object> body) {
        try {
            return client.post().uri(path).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(MAP);
        } catch (Exception e) {
            log.warn("ML service call {} failed: {}", path, e.getMessage());
            return null;
        }
    }
}
