# FinPilot ML & agent service (Python / FastAPI)

Internal service called only by the Java backend (header `X-Internal-Key`).

| Endpoint | What it does |
|---|---|
| `POST /ml/categorize` | Keyword rules, then TF-IDF (char n-grams) + Logistic Regression; the user's confirmed labels are added as training data on each call |
| `POST /ml/forecast` | Recurring-cost detection (same merchant, similar amount, ~monthly) + Linear Regression on daily variable spend → month-end balance with breakdown |
| `POST /ml/anomaly` | Isolation Forest plus explainable evidence (robust z-score vs the category, first-time merchant, duplicate charge) |
| `POST /agent/query` | The agent loop: Interpret → Plan → Act (tools) → Compute → Synthesize → Verify |

## Agent

Seven fixed tools, each an HTTP call back into the Java API with the user's JWT: `get_transactions`, `get_dues`,
`get_budget`, `forecast_balance`, `compute_payoff`, `estimate_tax`, `search_knowledge`.

* With `ANTHROPIC_API_KEY` set, a hosted Claude model (`LLM_MODEL`, default `claude-opus-5-5`) plans tool calls and
  writes the answer. It is used as-is: no fine-tuning, no pretraining.
* Without a key (or `AGENT_MODE=offline`), a deterministic planner routes the question and fills templates from
  the same tool results.
* `grounding.py` verifies every figure in the answer against tool outputs; `redact.py` strips PII from anything
  sent to the LLM.

## RAG

`knowledge/*.md` is split by section, embedded with a local TF-IDF embedder and indexed in FAISS
(`data/index.faiss`, rebuilt automatically when the documents change). Advice answers cite `[n]` sources; if no
passage clears the relevance threshold, Pilot says so instead of guessing.

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/uvicorn app.main:app --port 8000
```

Environment variables: `INTERNAL_API_KEY`, `JAVA_API_URL`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `AGENT_MODE`,
`KNOWLEDGE_DIR`, `INDEX_DIR`.

## Test

```bash
.venv/bin/python -m pytest -q
```

Covers the categorizer (including learning from corrections), recurring detection, forecast arithmetic, anomaly
flags, intent routing, the grounding check, redaction, payoff simulation, retrieval, and the LLM loop with a
scripted fake client (including the fallback when a draft contains an invented number).
