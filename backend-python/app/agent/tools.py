"""The agent's fixed tool set (§8). Each tool is an HTTP call back into the Java API using the
user's own JWT, so Java's security filter scopes every query to that user.

Tools return *aggregated, derived* figures only (totals, counts, rates). Raw rows never go to
the LLM; that is both the privacy rule and what keeps answers checkable.
"""
from __future__ import annotations

import math
import time
from collections import defaultdict
from datetime import date

import httpx

from ..config import JAVA_API_URL
from ..rag.store import get_store


class JavaApi:
    def __init__(self, token: str, base: str = JAVA_API_URL):
        self.client = httpx.Client(base_url=base, timeout=15.0, headers={"Authorization": f"Bearer {token}"})

    def get(self, path: str, **params):
        r = self.client.get(path, params={k: v for k, v in params.items() if v is not None})
        r.raise_for_status()
        return r.json()


def _f(v) -> float:
    return float(v or 0)


class Toolbox:
    def __init__(self, api: JavaApi, today: date, question_amount: float | None = None):
        self.api = api
        self.today = today
        self.question_amount = question_amount
        self.calls: list[dict] = []
        self.evidence: list = []
        self.sources: list[dict] = []

    def run(self, name: str, args: dict) -> dict:
        fn = getattr(self, name, None)
        if fn is None or name.startswith("_") or name not in TOOL_NAMES:
            return {"error": f"Unknown tool {name}"}
        t0 = time.perf_counter()
        try:
            result = fn(**args)
            ok = True
        except httpx.HTTPError as e:
            result, ok = {"error": f"Could not fetch data: {e.__class__.__name__}"}, False
        except TypeError as e:
            result, ok = {"error": f"Bad arguments: {e}"}, False
        self.calls.append({"name": name, "args": args, "ms": round((time.perf_counter() - t0) * 1000), "ok": ok})
        if ok:
            self.evidence.append(result)
        return result

    # ---- Tools -------------------------------------------------------------------------

    def get_transactions(self, start_date: str, end_date: str, category: str | None = None,
                         merchant: str | None = None) -> dict:
        rows = self.api.get("/transactions", **{"from": start_date, "to": end_date, "category": category, "q": merchant})
        spend_rows = [r for r in rows if _f(r["amount"]) < 0
                      and r["category"] not in ("Card Payment", "Transfers", "Investments", "Loan EMI")]
        total = sum(-_f(r["amount"]) for r in spend_rows)
        income = sum(_f(r["amount"]) for r in rows if _f(r["amount"]) > 0)
        by_cat, by_merchant = defaultdict(float), defaultdict(float)
        for r in spend_rows:
            by_cat[r["category"]] += -_f(r["amount"])
            by_merchant[r["merchant"] or "Unknown"] += -_f(r["amount"])
        largest = sorted(spend_rows, key=lambda r: _f(r["amount"]))[:3]
        return {
            "period": {"from": start_date, "to": end_date},
            "filter": {"category": category, "merchant": merchant},
            "transaction_count": len(spend_rows),
            "total_spent": round(total, 2),
            "total_income": round(income, 2),
            "by_category": [{"category": k, "amount": round(v, 2)} for k, v in
                            sorted(by_cat.items(), key=lambda x: -x[1])[:8]],
            "top_merchants": [{"merchant": k, "amount": round(v, 2)} for k, v in
                              sorted(by_merchant.items(), key=lambda x: -x[1])[:5]],
            "largest": [{"merchant": r["merchant"], "amount": round(-_f(r["amount"]), 2), "date": r["date"]}
                        for r in largest],
            "flagged_unusual": sum(1 for r in spend_rows if r.get("isAnomaly")),
        }

    def get_dues(self, horizon_days: int = 30) -> dict:
        res = self.api.get("/dues", horizon=f"{int(horizon_days)}d")
        items = [{"label": d["label"], "type": d["sourceType"], "amount": _f(d["amount"]),
                  "minimum": _f(d.get("minAmount")), "due_date": d["dueDate"], "status": d["status"],
                  "days_away": (date.fromisoformat(d["dueDate"]) - self.today).days} for d in res["dues"]]
        return {"horizon_days": res["horizonDays"], "total_due": round(_f(res["total"]), 2),
                "count": len(items), "dues": items}

    def get_budget(self, category: str | None = None) -> dict:
        rows = self.api.get("/budgets", category=category)
        return {"month": self.today.strftime("%B %Y"), "day_of_month": self.today.day,
                "budgets": [{"category": b["category"], "limit": _f(b["limit"]), "consumed": _f(b["consumed"]),
                             "remaining": _f(b["remaining"]), "percent_used": _f(b["percent"]),
                             "projected_month_end": _f(b["projected"]), "state": b["state"]} for b in rows]}

    def forecast_balance(self, month: str | None = None) -> dict:
        f = self.api.get("/forecast")
        out = {
            "as_of": f["asOf"], "month_end": f["monthEnd"], "days_left": f["daysLeft"],
            "current_balance": _f(f["balance"]),
            "disposable_now": _f(f["disposableNow"]),
            "disposable_breakdown": [{"label": b["label"], "amount": _f(b["amount"])} for b in f["disposableBreakdown"]],
            "predicted_month_end": _f(f["predictedMonthEnd"]),
            "month_end_breakdown": [{"label": b["label"], "amount": _f(b["amount"]), "kind": b.get("kind")}
                                    for b in f["monthEndBreakdown"]],
            "recurring_detected": [{"merchant": r["merchant"], "amount": _f(r["amount"]), "day": r["day"],
                                    "paid_this_month": r["paid_this_month"]} for r in (f.get("recurring") or [])],
            "typical_daily_variable_spend": _f(f.get("variableDaily")),
            "safe_headroom": _f(f["headroom"]),
            "model": f.get("model"),
        }
        if self.question_amount:
            out["affordability_check"] = affordability(out, self.question_amount)
        return out

    def compute_payoff(self, extra_monthly: float = 5000) -> dict:
        cards = self.api.get("/cards")
        loans = self.api.get("/loans")
        debts = []
        for c in cards:
            bal = _f(c["outstanding"])
            if bal > 0:
                debts.append({"name": f"{c['issuer']} {c.get('nickname') or 'card'}".strip(), "kind": "card",
                              "balance": bal, "apr": _f(c.get("apr") or 42), "min": max(_f(c.get("minDue")), 0.05 * bal, 500)})
        for l in loans:
            n, emi, apr = int(l["remainingInstallments"]), _f(l["installmentAmount"]), _f(l["interestRate"])
            if n <= 0:
                continue
            r = apr / 1200
            bal = emi * n if r == 0 else emi * (1 - (1 + r) ** -n) / r
            debts.append({"name": f"{l.get('lender') or 'Loan'} ({l['type']})", "kind": "loan",
                          "balance": round(bal, 2), "apr": apr, "min": emi})
        if not debts:
            return {"debts": [], "message": "No outstanding debts."}
        aval = simulate(debts, extra_monthly, key=lambda d: -d["apr"])
        snow = simulate(debts, extra_monthly, key=lambda d: d["balance"])
        return {
            "extra_monthly": extra_monthly,
            "debts": [{"name": d["name"], "balance": round(d["balance"], 2), "apr": d["apr"],
                       "monthly_interest_now": round(d["balance"] * d["apr"] / 1200, 2), "minimum": round(d["min"], 2)}
                      for d in debts],
            "avalanche": aval,
            "snowball": snow,
            "recommended": "avalanche" if aval["total_interest"] <= snow["total_interest"] else "snowball",
            "interest_saved_vs_other": round(abs(snow["total_interest"] - aval["total_interest"]), 2),
        }

    def estimate_tax(self, regime: str | None = None) -> dict:
        t = self.api.get("/tax/estimate", regime=regime)
        return {
            "fy": t["fy"], "gross_income": _f(t["grossIncome"]), "selected_regime": t["selectedRegime"],
            "old_regime": {"taxable_income": _f(t["old"]["taxableIncome"]), "total_tax": _f(t["old"]["totalTax"]),
                           "effective_rate_pct": _f(t["old"]["effectiveRate"])},
            "new_regime": {"taxable_income": _f(t["new"]["taxableIncome"]), "total_tax": _f(t["new"]["totalTax"]),
                           "effective_rate_pct": _f(t["new"]["effectiveRate"])},
            "recommended_regime": t["recommended"],
            "saving_with_recommended": _f(t["savingWithRecommended"]),
            "deduction_gaps": [{"title": s["title"], "unused_room": _f(s["gap"]),
                                "potential_saving": _f(s["potentialSaving"]), "note": s["note"]}
                               for s in t["suggestions"]],
            "disclaimer": t["disclaimer"],
        }

    def search_knowledge(self, query: str, k: int = 3) -> dict:
        hits = get_store().search(query, k=k)
        for h in hits:
            if all(s["id"] != h["id"] for s in self.sources):
                self.sources.append({**h, "n": len(self.sources) + 1})
        numbered = [{"ref": next(s["n"] for s in self.sources if s["id"] == h["id"]),
                     "title": h["title"], "section": h["section"], "text": h["text"], "source": h["source"]}
                    for h in hits]
        return {"query": query, "results": numbered,
                "note": None if hits else "No relevant trusted document found. Say so; do not guess."}


def affordability(forecast: dict, amount: float) -> dict:
    """The Compute step for 'can I afford X': exact comparison, done in code."""
    headroom = forecast["safe_headroom"]
    month_end_after = forecast["predicted_month_end"] - amount
    ok = amount <= headroom
    return {
        "amount": amount,
        "safe_headroom": headroom,
        "disposable_now": forecast["disposable_now"],
        "predicted_month_end": forecast["predicted_month_end"],
        "month_end_after_purchase": round(month_end_after, 2),
        "affordable": ok,
        "comfort": "comfortable" if ok and amount <= 0.5 * headroom else ("tight" if ok else "not affordable"),
        "shortfall": round(max(0.0, amount - headroom), 2),
    }


def simulate(debts: list[dict], extra: float, key) -> dict:
    ds = [dict(d) for d in debts]
    order = [d["name"] for d in sorted(ds, key=key)]
    total_interest, months = 0.0, 0
    cleared = []
    while any(d["balance"] > 0.5 for d in ds) and months < 360:
        months += 1
        pool = extra
        for d in ds:
            if d["balance"] <= 0.5:
                pool += d["min"]  # freed-up minimums roll over
                continue
            interest = d["balance"] * d["apr"] / 1200
            total_interest += interest
            d["balance"] += interest
            pay = min(d["min"], d["balance"])
            d["balance"] -= pay
            pool += d["min"] - pay
        for name in order:
            d = next(x for x in ds if x["name"] == name)
            if d["balance"] > 0.5 and pool > 0:
                pay = min(pool, d["balance"])
                d["balance"] -= pay
                pool -= pay
        for d in ds:
            if d["balance"] <= 0.5 and d["name"] not in cleared:
                cleared.append(d["name"])
                d["cleared_month"] = months
    return {"order": order, "months_to_debt_free": months, "total_interest": round(total_interest, 2),
            "cleared_sequence": [{"name": n, "month": next(d.get("cleared_month") for d in ds if d["name"] == n)}
                                 for n in cleared]}


TOOL_NAMES = {"get_transactions", "get_dues", "get_budget", "forecast_balance", "compute_payoff",
              "estimate_tax", "search_knowledge"}

# Tool schemas for the LLM (Claude tool use).
TOOL_SPECS = [
    {"name": "get_transactions",
     "description": "Spending and income totals for the user over a date range, optionally filtered by category "
                    "or merchant text. Returns totals, by-category and top-merchant breakdowns. Use for any 'how much "
                    "did I spend' question.",
     "input_schema": {"type": "object", "properties": {
         "start_date": {"type": "string", "description": "YYYY-MM-DD inclusive"},
         "end_date": {"type": "string", "description": "YYYY-MM-DD inclusive"},
         "category": {"type": "string", "description": "One of: Groceries, Dining, Transport, Fuel, Shopping, "
                      "Utilities, Subscriptions, Entertainment, Health, Travel, Education, Personal Care, Rent"},
         "merchant": {"type": "string", "description": "Case-insensitive merchant text, e.g. 'swiggy'"}},
         "required": ["start_date", "end_date"], "additionalProperties": False}},
    {"name": "get_dues",
     "description": "Upcoming card bills, loan EMIs and instalments within a horizon, with due dates and status.",
     "input_schema": {"type": "object", "properties": {"horizon_days": {"type": "integer", "default": 30}},
                      "additionalProperties": False}},
    {"name": "get_budget",
     "description": "This month's budgets with limit, consumed, remaining, percent used and projected month-end.",
     "input_schema": {"type": "object", "properties": {"category": {"type": "string"}}, "additionalProperties": False}},
    {"name": "forecast_balance",
     "description": "The two safe-to-spend numbers: disposable now (balance minus dues this cycle) and predicted "
                    "month-end balance, each with breakdown, plus detected recurring costs. If the user asked about "
                    "affording an amount, the result includes an exact affordability_check computed in code.",
     "input_schema": {"type": "object", "properties": {"month": {"type": "string", "description": "YYYY-MM"}},
                      "additionalProperties": False}},
    {"name": "compute_payoff",
     "description": "Debt-clearing plan across cards and loans: avalanche (highest interest first) vs snowball "
                    "(smallest balance first), with months to debt-free and total interest for each.",
     "input_schema": {"type": "object", "properties": {"extra_monthly": {"type": "number", "default": 5000}},
                      "additionalProperties": False}},
    {"name": "estimate_tax",
     "description": "The user's projected income tax for the financial year under old and new regimes, the "
                    "recommended regime, and unused deduction room with potential savings.",
     "input_schema": {"type": "object", "properties": {"regime": {"type": "string", "enum": ["old", "new"]}},
                      "additionalProperties": False}},
    {"name": "search_knowledge",
     "description": "Retrieve passages from trusted documents (Indian tax rules, deductions, credit cards, debt "
                    "payoff, budgeting, ITR filing, glossary). Use for any advice or 'what is' question and cite "
                    "results as [ref].",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"],
                      "additionalProperties": False}},
]
