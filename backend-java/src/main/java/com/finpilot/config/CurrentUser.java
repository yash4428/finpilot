package com.finpilot.config;

import org.springframework.security.core.context.SecurityContextHolder;

/** The only source of user_id for scoping queries: the verified JWT. */
public final class CurrentUser {
    private CurrentUser() {}

    public static Long id() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Long id)) {
            throw new ApiException(401, "Not signed in");
        }
        return id;
    }
}
