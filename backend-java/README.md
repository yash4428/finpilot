# FinPilot core (Java / Spring Boot)

System of record: JWT auth, CRUD for accounts, cards, loans, transactions, budgets and goals, the dues engine,
the daily reminder job, safe-to-spend, rule-based tax, the simulated credit score, and the relay to the agent.

## Run

Needs Java 17+ and a PostgreSQL database (defaults: `jdbc:postgresql://localhost:5432/finpilot`, user/password `finpilot`).

```bash
mvn spring-boot:run
```

Environment variables: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `ML_SERVICE_URL`, `INTERNAL_API_KEY`,
`REMINDER_CRON` (default `0 0 8 * * *`). The schema is created by JPA (`ddl-auto=update`); system categories are
inserted on startup.

Works without the Python service: categorization falls back to "Other", anomaly checks are skipped, and the
month-end forecast uses a simple average (`model: fallback:average`).

## Test

```bash
mvn test
```

Covers the tax engine (slabs, 87A rebate and marginal relief, deduction caps, suggestions), the EMI formula and CSV parsing.

## Smoke test with curl

```bash
TOKEN=$(curl -s -XPOST localhost:8080/auth/login -H 'content-type: application/json' -d '{"email":"demo@finpilot.app","password":"demo1234"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
```

```bash
curl -s localhost:8080/forecast -H "Authorization: Bearer $TOKEN"
```

## Layout

| Package | What's there |
|---|---|
| `config` | Security (stateless JWT filter), `CurrentUser` (the only source of user_id), errors, money helpers |
| `model`, `repo` | JPA entities (money is `BigDecimal` / `NUMERIC(14,2)`) and repositories, all user-scoped |
| `service` | `DuesService` + `ReminderScheduler` (@Scheduled), `ForecastService` (safe-to-spend), `TaxService`, `TransactionService` (CSV import, ML calls), `BudgetService`, `CreditScoreService`, `AgentService`, `MlClient` |
| `web` | REST controllers for the contract in the root `CLAUDE.md` §6 |
