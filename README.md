# FinPilot

A personal-finance app that puts your cards, loans, EMIs, transactions, budgets and taxes in one place,
with **Pilot**, an AI agent that answers questions from your real data and never invents a number.

```
React (frontend :3000 / :5173)
   │  REST + JWT  (/api → Java only)
   ▼
Java Spring Boot :8080  ⇄  PostgreSQL        system of record, auth, dues engine, tax rules, @Scheduled reminders
   │  internal REST (X-Internal-Key)
   ▼
Python FastAPI :8000  →  Gemini API (optional)   categorizer, forecaster, anomaly detector, agent loop, RAG (FAISS)
   └── agent tools call back into the Java API with the user's own JWT
```

## Run everything (Docker)

```bash
cp .env.example .env
```

```bash
docker compose up --build
```

Open http://localhost:3000 and press **Explore the demo account** (`demo@finpilot.app` / `demo1234`).
The `seed` service loads three months of synthetic data and runs it through the real ML pipeline.

Set `GEMINI_API_KEY` in `.env` (Google Gemini, the default; get a key at aistudio.google.com) to have Pilot write
answers with an LLM. Anthropic Claude also works (`LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`). Without a key, or
when the model is overloaded, Pilot uses its deterministic planner: same tools, same numbers, same checks.

## Run locally with one command

Needs PostgreSQL running (`brew services start postgresql@16`), Java 17+, Maven, Python 3.11+ and Node 20+.

```bash
./run.sh --seed
```

Open http://localhost:5173. Drop `--seed` on later runs to keep your data. Ctrl-C stops everything; logs are in `.logs/`.

## Run locally without Docker (manual)

Needs Java 17+, Maven, Python 3.11+, Node 20+ and PostgreSQL 16.

```bash
createdb finpilot && psql -d finpilot -c "create role finpilot login password 'finpilot'; alter database finpilot owner to finpilot;"
```

```bash
cd backend-python && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app --port 8000
```

```bash
cd backend-java && mvn spring-boot:run
```

```bash
backend-python/.venv/bin/python infra/seed/load.py
```

```bash
cd frontend && npm install && npm run dev
```

Then open http://localhost:5173.

## Talk to Pilot (voice)

Press the gold mic button (bottom-right) and ask in English, Hinglish or Hindi, e.g. *"Kya main 20 hazaar ka phone le
sakta hoon?"*. Pilot answers out loud and the dashboard reacts: the safe-to-spend strip carves out the purchase, or the
section behind the answer scrolls into view and glows. Voice input uses the browser's speech recognition (Chrome, Edge
or Safari; Chrome needs an internet connection for it). The suggestion chips and the text box work everywhere.

## What to demo

| Feature | Where |
|---|---|
| Safe-to-spend: disposable now + predicted month-end, with the full breakdown | Overview → the runway; type an amount to test a purchase |
| Add a card or loan → its due appears with a reminder | Cards & loans → Add, then Dues and the bell |
| Record/import transactions → auto-categorized → anomaly flagged | Transactions → Import CSV (sample file linked in the dialog) |
| Old vs new regime comparison and save-tax suggestions | Tax (drag the what-if sliders) |
| "Can I afford a ₹20,000 phone this month?" answered from live data | Ask Pilot (⌘K), or the mic button |
| Voice in Hinglish: "Kya main dedh lakh ki bike le sakta hoon?" → spoken answer, EMI suggestion, dashboard reacts | Mic button |
| Daily allowance, FinPilot score, spending calendar, autopay detective (with price-rise alert) | Overview |
| Goals on autopilot: monthly amount needed vs your surplus; add money to a goal | Goals |
| "What is 80C?" answered with a cited source | Ask Pilot; open "How Pilot worked this out" for the tool trace |

## The two hard rules, in code

* **No invented numbers.** Pilot gets figures only from its seven tools. `backend-python/app/agent/grounding.py`
  checks every number in an answer against the tool results; an untraceable answer is sent back once and
  otherwise replaced by the deterministic composer. Affordability verdicts are computed in code. Every answer's
  `tools_used`, `sources` and grounding result are stored in `chat_history`.
* **No raw PII to the LLM.** Tools return aggregates; `redact.py` masks emails, card/account numbers, PAN and
  Aadhaar patterns in anything bound for the model. Cards store only the last four digits.

## Repository

```
backend-java/     Spring Boot core (owns the DB)            → backend-java/README.md
backend-python/   FastAPI ML + agent + RAG                   → backend-python/README.md
frontend/         React + Vite + Recharts + Framer Motion
infra/seed/       synthetic demo data loader (load.py)
infra/sql/        schema.sql (reference; JPA is the source of truth)
knowledge/        RAG source documents (tax rules, deductions, credit, debt, budgeting, ITR, glossary)
```

## Tests

```bash
cd backend-java && mvn test
```

```bash
cd backend-python && .venv/bin/python -m pytest -q
```

## Scope notes

Bank/UPI data comes from manual entry and CSV import (RBI Account Aggregator licensing is out of scope).
The credit score is a simulated, utilisation-based estimate. Tax is a rule-based estimate for a salaried
resident under 60 and is labelled as such.
