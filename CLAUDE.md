# CLAUDE.md — FinPilot Build Guide for Claude Code

> This file is the persistent instruction set for building **FinPilot**. Read it fully before writing any code. It is the single source of truth. If anything here conflicts with a chat instruction, ask before deviating. The companion document `FinPilot_PRD_Final.md` contains the full product reasoning; this file is the operational build spec.

---

## 1. What You Are Building

FinPilot is a personal-finance app that unifies a user's cards, loans, EMIs, transactions, budgets, and taxes into one dashboard, and layers an **AI reasoning agent** on top that answers natural-language questions using the user's real data.

This is a **college Software Engineering group project**. It must look technically sophisticated (real ML + agentic AI) but stay realistically buildable and demoable. Prioritize a working end-to-end demo over feature completeness.

### The One Rule You Must Never Break
**The LLM never invents financial numbers.** Every number in an answer must come from the database via a defined tool call. The LLM only plans, interprets, reasons, and writes prose. If you ever find the LLM outputting a figure it did not receive from a tool, that is a bug. Enforce this in code (see §9).

### Privacy Rule
Never send raw PII to the external LLM API — no account numbers, card numbers, password hashes, emails. Only send **aggregated/derived numbers** (e.g. `disposable_income: 14200`). Redact before the prompt is built.

---

## 2. Architecture (LOCKED — do not change)

Two backends are **mandatory** (course requirement). The frontend talks ONLY to the Java backend. The Java backend calls the Python service for ML/agent tasks. The Python agent calls BACK into the Java API as its "tools".

```
React (frontend)
   │  REST + JWT
   ▼
Java Spring Boot  ⇄  PostgreSQL          ← system of record, auth, business logic, scheduler
   │  internal REST
   ▼
Python FastAPI    →  LLM API (reasoning)  ← ML models, agent loop, RAG
   │                 Vector DB (RAG)
   └── tool calls back into Java API for real numbers
```

| Layer | Tech (LOCKED) |
|---|---|
| Frontend | React (web) + a charting lib (Recharts or Chart.js) |
| Core backend | Java 17, Spring Boot, Spring Security (JWT), Spring Data JPA |
| ML/Agent service | Python 3.11+, FastAPI, scikit-learn, LangChain **or** LlamaIndex |
| LLM | Hosted LLM API (used as-is — NO fine-tuning, NO pretraining) |
| Vector store | FAISS (local, default) or Chroma |
| Database | PostgreSQL |
| Scheduling | Spring `@Scheduled` (cron). **NO Redis.** |
| Deployment | Docker Compose (one file, one command) |

**Design decisions already settled — do not revisit:**
- Anomaly detection = **Isolation Forest** (or statistical thresholds). **NOT LSTM.**
- Credit score = **simulated** utilization-based estimate + rule-based tips. No real bureau.
- Bank/UPI = **manual entry + CSV import**. No real bank integration (RBI AA licensing — out of scope).
- Tax = **rule-based deterministic** math (slabs/deductions). Not ML.
- Safe-to-spend = **two numbers**: (a) current true disposable income, (b) predicted month-end balance, with recurring-cost detection bundled inside the forecaster and the breakdown shown in the UI.

---

## 3. Repository Layout (monorepo)

Create exactly this structure:

```
finpilot/
├── CLAUDE.md                  # this file
├── README.md                  # top-level: how to run everything
├── docker-compose.yml         # Postgres + java + python + frontend
├── .env.example               # all env vars documented, no real secrets
├── frontend/                  # React app
├── backend-java/              # Spring Boot (owns the DB)
│   └── README.md
├── backend-python/            # FastAPI (ML + agent + RAG)
│   └── README.md
├── infra/
│   ├── seed/                  # synthetic demo dataset + load script
│   └── sql/                   # schema.sql (reference; JPA is source of truth)
└── knowledge/                 # RAG source documents (tax rules, finance glossary)
```

---

## 4. Build Order (STRICT — do not start a phase until the previous one runs)

Each phase must compile, run, and be testable on its own before moving on. Commit at the end of each phase.

- **Phase 1 — Java core.** JWT auth; CRUD for users, accounts, cards, loans, transactions, budgets, categories; dues engine; `@Scheduled` reminder job; disposable-income + safe-to-spend calculation; `/dashboard`. This alone is a complete, gradable project and the fallback if time runs out.
- **Phase 2 — Python ML.** `/ml/categorize`, `/ml/forecast` (with recurring-cost detection), `/ml/anomaly`. Wire into the dashboard via the internal API.
- **Phase 3 — Tax module.** Estimation, old-vs-new regime comparison, save-tax suggestions, return-prep summary. Rule-based, in Java (tax rules) with the advisory text later grounded by RAG.
- **Phase 4 — Agent.** FastAPI agent loop with the 7 tools (§8), affordability + debt-payoff reasoning, chat box in the UI, `/agent/chat` (Java) → `/agent/query` (Python).
- **Phase 5 — RAG.** Build the knowledge base, embed + index, wire `search_knowledge`, add citations to advice answers.
- **Phase 6 — Polish.** Proactive notifications, dashboard charts, simulated credit-score helper, demo-data seeding, READMEs.

---

## 5. Data Model (PostgreSQL, owned by Java / Spring Data JPA)

JPA entities are the source of truth; keep `infra/sql/schema.sql` in sync as reference. All money columns: use `NUMERIC(14,2)` / `BigDecimal` — never floating point for money.

| Table | Key fields |
|---|---|
| users | id, name, email (unique), password_hash, annual_income, tax_regime |
| accounts | id, user_id FK, type (bank/wallet), balance |
| cards | id, user_id FK, issuer, credit_limit, outstanding, statement_date, due_date, min_due |
| loans | id, user_id FK, type (personal/education/emi), principal, interest_rate, tenure_months, installment_amount, next_due_date, remaining_installments |
| categories | id, name, is_system |
| transactions | id, user_id FK, account_id FK (nullable), card_id FK (nullable), amount, date, merchant, description, category_id FK, is_recurring (bool), is_anomaly (bool) |
| budgets | id, user_id FK, category_id FK, limit_amount, period |
| dues | id, user_id FK, source_type (card/loan), source_id, amount, due_date, status (upcoming/due_soon/overdue/paid) |
| tax_profile | id, user_id FK, fy, gross_income, deductions_json (JSONB), regime, estimated_tax |
| goals | id, user_id FK, name, target_amount, deadline, saved_amount |
| chat_history | id, user_id FK, query, response, tools_used (JSONB), sources (JSONB), meta (JSONB: verdict, facts, trace, grounding), created_at |
| notifications | id, user_id FK, kind (due/budget/anomaly/info), title, body, dedupe_key (unique), is_read, created_at |

Additive display/support columns (no PII): accounts.name; cards.nickname, cards.last4 (last four digits only), cards.apr; loans.lender; transactions.anomaly_reason, transactions.category_confirmed (user-picked label, used as categorizer training signal); dues.label, dues.min_amount, dues.paid_at, dues.reminded_on.

Notes:
- `is_recurring` on transactions supports the forecaster's recurring-cost detection.
- Every user-owned query must be scoped by `user_id` from the JWT — never trust a user_id from the request body.

---

## 6. API Contract — Public (Frontend → Java)

All protected routes require `Authorization: Bearer <JWT>`. Return JSON. Validate ownership on every resource.

| Method & Path | Purpose |
|---|---|
| POST /auth/register | Create account → returns JWT |
| POST /auth/login | Login → returns JWT |
| GET / POST /cards | List / add cards |
| PUT / DELETE /cards/{id} | Edit / remove a card |
| GET / POST /loans | List / add loans & EMIs |
| PUT / DELETE /loans/{id} | Edit / remove a loan |
| GET / POST /transactions | List / record transactions |
| POST /transactions/import | Upload CSV bank statement → parsed into transactions |
| GET / POST /budgets | Manage category budgets |
| GET /dues?horizon=30d | Consolidated upcoming payments |
| POST /dues/{id}/pay | Mark a due paid (simulated); advances recurring EMIs |
| GET / POST /tax/estimate | Estimate tax; compare regimes |
| GET /dashboard | Aggregated summary + both safe-to-spend numbers + breakdown |
| POST /agent/chat | Relay a question to the Python agent, persist to chat_history |

Supporting endpoints (added during the build; all JWT-scoped):

| Method & Path | Purpose |
|---|---|
| GET /me, GET /health | Current user profile; liveness |
| GET / POST /accounts, PUT /accounts/{id} | Bank/wallet accounts |
| GET / POST /goals, PUT /goals/{id} | Savings goals |
| GET /categories | System + user categories |
| PUT / DELETE /transactions/{id} | Edit (a category change = training label) / delete |
| POST /transactions/{id}/dismiss-anomaly | Mark a flagged transaction as expected |
| POST /transactions/analyze | Re-run categorization + anomaly detection over history |
| DELETE /budgets/{id} | Remove a budget |
| POST /dues/refresh | Run the daily reminder pass now for the current user |
| GET /forecast | Both safe-to-spend numbers + breakdown (backs the `forecast_balance` tool) |
| GET /credit-score | Simulated utilisation-based score + tips |
| GET /notifications, POST /notifications/read-all | Proactive alerts |
| GET /agent/history | Recent chat_history for the UI |

## 6.1 API Contract — Internal (Java → Python)

| Endpoint | Purpose |
|---|---|
| POST /ml/categorize | Categorize a batch of transactions |
| POST /ml/forecast | Forecast month-end balance + breakdown (incl. recurring detection) |
| POST /ml/anomaly | Score transactions for anomalies |
| POST /agent/query | Run the agent loop (tools + RAG) and return a grounded answer |

**Freeze these contracts early.** If a signature must change, update this file and the PRD in the same commit.

---

## 7. Safe-to-Spend & Forecasting (headline feature — get this right)

Two distinct outputs, both shown with a breakdown — never a single opaque number.

1. **True Disposable Income (now)** = current bank balance − committed dues already known this cycle (card bills + EMIs due now).
2. **Predicted Month-End Balance** = current balance − remaining known dues for rest of month − predicted recurring costs (rent, subscriptions) − typical variable spend.

**Recurring-cost detection** is an internal heuristic step of the forecaster, NOT a separate model: scan the user's past transactions for same-merchant/similar-amount charges repeating roughly monthly; tag them `is_recurring=true`; include them in the month-end projection. Surface the subtractions in the response, e.g.:
```
predicted_month_end: 7000
breakdown: [ {label: "EMIs", amount: -6000}, {label: "Rent", amount: -15000}, {label: "Typical variable", amount: -4000} ]
```

---

## 8. The Agent (Phase 4 — the wow feature)

A rented pre-trained LLM used via API with **tool-calling**. The loop:
1. **Interpret** intent (spending query / affordability / forecast / tax / debt advice / general knowledge).
2. **Plan** which tools and/or RAG to use.
3. **Act** — call tools (hit Java API) and/or retrieve docs (vector DB).
4. **Compute** — aggregate/project/compare the returned data.
5. **Synthesize** — LLM writes an advisor-style answer, cites sources for advice, appends "estimate only — consult a professional" for tax.

### Tool set (FIXED — do not let this grow uncontrolled)
Each tool is an HTTP call back into the Java API, scoped to the authenticated user.

| Tool | Input | Returns |
|---|---|---|
| get_transactions | user, date range, category | matching transactions |
| get_dues | user, horizon | upcoming card bills, EMIs, installments |
| get_budget | user, category | limit + consumed |
| forecast_balance | user, month | projected month-end balance + breakdown |
| compute_payoff | user | debt-clearing order by interest/balance (avalanche/snowball) |
| estimate_tax | user, regime | projected tax + deduction gaps |
| search_knowledge | question | relevant trusted-doc chunks (RAG) |

### Routing rule
- **Number questions** ("how much did I spend", "can I afford X") → tools, exact math. Never RAG, never LLM-guessed numbers.
- **Knowledge/advice questions** ("how to save tax", "what is 80C") → RAG, cite the source.

### Worked example (implement + test this)
"Can I afford a ₹20,000 phone this month?" → fetch balance + expected income, subtract committed dues + recurring/typical spend for the rest of the month, compare remainder to 20000, return yes/no + reasoning + the safe amount.

---

## 9. RAG (Phase 5)

1. Put trusted docs in `knowledge/` — official tax-rule summaries, deduction guides (80C/80D/HRA), a finance glossary. Plain text/markdown.
2. Chunk → embed with an embedding model → store vectors in FAISS (default) or Chroma.
3. At query time: embed the question, retrieve top-k chunks, pass ONLY those chunks to the LLM, and return the answer WITH the source reference.
4. Advice answers must cite. If no relevant chunk is found, say so rather than guessing.

**Vocabulary (keep terms correct in code comments and the viva):** pretraining ≠ fine-tuning ≠ RAG. We do only RAG + tool-calling. The vector DB is one component inside RAG.

### Enforcing the no-hallucinated-numbers rule in code
- The agent's prompt must instruct the LLM to request numbers via tools only.
- Validate tool outputs are present before composing a numeric answer.
- Log `tools_used` and `sources` into `chat_history` for every answer so it's auditable in the demo.

---

## 10. ML Models (Phase 2 — scikit-learn, small & fast)

Start each as a simple rule-based version, then upgrade if time allows.

| Model | Type | In → Out | Approach |
|---|---|---|---|
| Categorizer | text classification | txn text → category | rules → TF-IDF + Logistic Regression / Naive Bayes; learn from user corrections |
| Forecaster | regression | history + known dues + recurring → month-end balance | recurring detection (heuristic) + linear regression / simple projection |
| Anomaly detector | outlier detection | transactions → flags | Isolation Forest or statistical thresholds. NOT LSTM |

---

## 11. Scheduler (Java, no Redis)

One daily `@Scheduled(cron = ...)` job that: recomputes due statuses (upcoming → due_soon → overdue), triggers reminder notifications for anything due soon, and advances recurring EMIs when marked paid. "Cron" here = a time-triggered method inside Spring, nothing external.

---

## 12. Data Ingestion (three paths — build all three)

1. **Manual entry** — the baseline; forms → POST endpoints. Always works.
2. **CSV import** — `POST /transactions/import`; parse a bank statement CSV into transactions; this is the realistic path (banks let users export statements) and feeds the ML. Support one documented column format: `date,merchant,description,amount`. Keep it simple.
3. **Seeded demo data** — see §13.

No real bank/UPI connection. If asked why: RBI Account Aggregator licensing is out of scope for a student project; CSV import is the correct legitimate alternative.

---

## 13. Seed / Demo Data (Phase 6, but stub early)

Seed one demo user so every feature has data on demo day:
- 2 credit cards, 1 loan/EMI.
- ~3 months of transactions including a **monthly rent** and **2 subscriptions** (so recurring detection finds something), plus varied discretionary spend.
- At least one clearly anomalous transaction (large/duplicate) so anomaly detection visibly fires.
- A filled tax_profile so tax estimation returns real numbers.
Provide `infra/seed/load.(sql|py)` and wire it into docker-compose or a documented one-liner.

---

## 14. Deployment

`docker-compose.yml` brings up Postgres, backend-java, backend-python, and frontend with `docker compose up`. Document every env var in `.env.example` (DB creds, LLM API key, service URLs). The LLM API key is read from env — never hardcode it, never commit it.

---

## 15. Definition of Done (per the demo)

- Add a card/loan → it appears in the dues list with correct due date + a reminder scheduled.
- Dashboard shows both safe-to-spend numbers with a visible breakdown.
- Record / import transactions → auto-categorized → an anomaly is flagged.
- Tax estimate returns a number and an old-vs-new regime comparison.
- Ask the agent an affordability question → correct yes/no using live data via tools.
- Ask an advice question → answer cites a knowledge source via RAG.
- `docker compose up` runs the whole stack; seed data is present.

---

## 16. Working Agreements for Claude Code

1. Build in the Phase order of §4. Do not start Phase N+1 until Phase N runs and is committed.
2. Treat §5 (data model) and §6 (API contracts) as frozen shared contracts. Changing one = update this file + the PRD in the same commit.
3. Enforce the two hard rules in code: no LLM-invented numbers (§1, §9), no raw PII to the LLM (§1).
4. Money is `BigDecimal`/`NUMERIC(14,2)` everywhere. Scope every query by the JWT's user_id.
5. Write a per-service README (how to run + test independently). Keep secrets in env only.
6. Prefer the simplest thing that satisfies the spec — this is a time-boxed student project. When a choice is ambiguous, pick the simpler option and leave a `// TODO:` note rather than over-engineering.
7. After each phase, output a short summary of what was built and how to run/test it.
