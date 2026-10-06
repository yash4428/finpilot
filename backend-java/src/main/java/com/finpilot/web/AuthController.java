package com.finpilot.web;

import com.finpilot.config.ApiException;
import com.finpilot.config.CurrentUser;
import com.finpilot.config.JwtService;
import com.finpilot.model.Account;
import com.finpilot.model.User;
import com.finpilot.repo.AccountRepo;
import com.finpilot.repo.UserRepo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

@RestController
public class AuthController {
    private final UserRepo users;
    private final AccountRepo accounts;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthController(UserRepo users, AccountRepo accounts, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.accounts = accounts;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    public record RegisterReq(@NotBlank String name, @Email @NotBlank String email,
                              @Size(min = 8, message = "must be at least 8 characters") String password,
                              BigDecimal annualIncome, BigDecimal openingBalance) {}

    public record LoginReq(@NotBlank String email, @NotBlank String password) {}

    @PostMapping("/auth/register")
    public Map<String, Object> register(@Valid @RequestBody RegisterReq req) {
        if (users.findByEmailIgnoreCase(req.email()).isPresent()) {
            throw new ApiException(409, "An account with this email already exists");
        }
        User u = new User();
        u.name = req.name().trim();
        u.email = req.email().trim().toLowerCase();
        u.passwordHash = encoder.encode(req.password());
        u.annualIncome = req.annualIncome() == null ? BigDecimal.ZERO : req.annualIncome();
        users.save(u);
        Account a = new Account();
        a.userId = u.id;
        a.type = "bank";
        a.name = "Primary bank";
        a.balance = req.openingBalance() == null ? BigDecimal.ZERO : req.openingBalance();
        accounts.save(a);
        return Map.of("token", jwt.issue(u.id), "user", profile(u));
    }

    @PostMapping("/auth/login")
    public Map<String, Object> login(@Valid @RequestBody LoginReq req) {
        User u = users.findByEmailIgnoreCase(req.email().trim())
                .filter(x -> encoder.matches(req.password(), x.passwordHash))
                .orElseThrow(() -> new ApiException(401, "Email or password is incorrect"));
        return Map.of("token", jwt.issue(u.id), "user", profile(u));
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        return profile(users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("User")));
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok");
    }

    static Map<String, Object> profile(User u) {
        return Map.of("id", u.id, "name", u.name, "email", u.email,
                "annualIncome", u.annualIncome, "taxRegime", u.taxRegime);
    }
}
