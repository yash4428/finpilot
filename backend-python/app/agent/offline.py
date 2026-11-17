"""Deterministic planner + composer. Runs the same Interpret → Plan → Act → Compute → Synthesize
loop with the same tools as the LLM path, but writes answers from templates. Used when no LLM
key is configured, when the LLM is unreachable, and as the safe fallback if an LLM answer fails
the grounding check. Every figure here is read straight from a tool result.
"""
from __future__ import annotations

import re
from datetime import date

from .fmt import inr
from .parse import detect_category, parse_amount, parse_period
from .tools import Toolbox

TAX_NOTE = "_Estimate only — consult a tax professional before filing._"


def plan(intent: str) -> list[str]:
    return {
        "afford": ["forecast_balance", "get_dues"],
        "spend": ["get_transactions", "get_budget"],
        "budget": ["get_budget"],
        "dues": ["get_dues"],
        "forecast": ["forecast_balance"],
        "payoff": ["compute_payoff"],
        "tax": ["estimate_tax", "search_knowledge"],
        "knowledge": ["search_knowledge"],
        "overview": ["forecast_balance", "get_dues"],
    }[intent]


def answer(intent: str, question: str, tb: Toolbox, today: date) -> dict:
    fn = {
        "afford": _afford, "spend": _spend, "budget": _budget, "dues": _dues, "forecast": _forecast,
        "payoff": _payoff, "tax": _tax, "knowledge": _knowledge, "overview": _overview,
    }[intent]
    return fn(question, tb, today)


def _afford(q: str, tb: Toolbox, today: date) -> dict:
    amount = parse_amount(q) or 0
    tb.question_amount = amount
    f = tb.run("forecast_balance", {})
    d = tb.run("get_dues", {"horizon_days": 30})
    if "error" in f:
        return _unavailable()
    a = f["affordability_check"]
    next_due = d["dues"][0] if d.get("dues") else None
    if a["affordable"]:
        head = "**Yes, comfortably.**" if a["comfort"] == "comfortable" else "**Yes, but it's tight.**"
        body = (f"{head} You have {inr(a['safe_headroom'])} of safe headroom this month, so {inr(amount)} fits. "
                f"After buying it, you'd be on track to end the month with about {inr(a['month_end_after_purchase'])}.")
    else:
        body = (f"**Not this month.** Your safe headroom is {inr(a['safe_headroom'])}, which is "
                f"{inr(a['shortfall'])} short of {inr(amount)}. Buying it now would take your predicted month-end "
                f"balance to {inr(a['month_end_after_purchase'])}.")
    lines = [body, "", "**How I worked it out**",
             f"- Disposable right now: {inr(f['disposable_now'])} (balance minus bills and EMIs due this cycle)",
             f"- Predicted month-end balance: {inr(f['predicted_month_end'])} after recurring costs and "
             f"~{inr(f['typical_daily_variable_spend'])}/day of typical spending",
             "- Safe amount = the lower of those two"]
    if next_due:
        lines.append(f"- Next bill: {next_due['label']}, {inr(next_due['amount'])} on {_d(next_due['due_date'])}")
    best = next((o for o in a["options"] if o["id"] == a["recommended_option"]), None)
    if best and best["id"] != "pay_now":
        lines += ["", f"**Smarter way to pay:** {best['label']} at {inr(best['monthly'])}/month"
                      + (" with no extra cost." if best["total_interest"] == 0
                         else f", costing {inr(best['total_interest'])} in interest overall.")
                      + " Only the first instalment comes out of this month's money."]
    elif not a["affordable"]:
        lines += ["", "No EMI plan fits this month either. Waiting for next month's salary is the safer move."]
    return {
        "answer": "\n".join(lines),
        "verdict": {"type": "afford", "ok": a["affordable"], "comfort": a["comfort"], "amount": amount,
                    "headroom": a["safe_headroom"], "monthEndAfter": a["month_end_after_purchase"]},
        "facts": [_fact("Safe headroom", a["safe_headroom"]), _fact("Month-end after", a["month_end_after_purchase"]),
                  _fact("Disposable now", f["disposable_now"])],
        "compute": f"Compared {inr(amount)} with min(disposable now, predicted month-end) = {inr(a['safe_headroom'])}",
    }


def _spend(q: str, tb: Toolbox, today: date) -> dict:
    start, end, label = parse_period(q, today)
    cat = detect_category(q)
    t = tb.run("get_transactions", {"start_date": start.isoformat(), "end_date": end.isoformat(), "category": cat})
    if "error" in t:
        return _unavailable()
    what = f"on {cat}" if cat else "in total"
    lines = [f"You spent **{inr(t['total_spent'])}** {what} in {label}, across {t['transaction_count']} transactions."]
    facts = [_fact(f"Spent {label}", t["total_spent"])]
    if t["top_merchants"]:
        tops = ", ".join(f"{m['merchant']} ({inr(m['amount'])})" for m in t["top_merchants"][:3])
        lines.append(f"Most of it went to {tops}.")
    if not cat and t["by_category"]:
        lines += ["", "**By category**"] + [f"- {c['category']}: {inr(c['amount'])}" for c in t["by_category"][:5]]
    if cat and label == "this month":
        b = tb.run("get_budget", {"category": cat})
        if b.get("budgets"):
            bb = b["budgets"][0]
            lines.append("")
            lines.append(f"Your {cat} budget is {inr(bb['limit'])}; you've used {bb['percent_used']:.0f}% and are "
                         f"on pace for {inr(bb['projected_month_end'])} by month end.")
            facts.append(_fact("Budget left", bb["remaining"]))
    if t["flagged_unusual"]:
        lines.append(f"\n{t['flagged_unusual']} of these were flagged as unusual. Check them in Transactions.")
    return {"answer": "\n".join(lines), "facts": facts,
            "compute": f"Summed {t['transaction_count']} debits between {start} and {end}"}


def _budget(q: str, tb: Toolbox, today: date) -> dict:
    cat = detect_category(q)
    b = tb.run("get_budget", {"category": cat} if cat else {})
    if "error" in b:
        return _unavailable()
    rows = b["budgets"]
    if not rows:
        return {"answer": "You haven't set any budgets yet. Add one from the Budgets page and I'll track it.",
                "facts": []}
    over = [r for r in rows if r["percent_used"] >= 100]
    warn = [r for r in rows if 80 <= r["percent_used"] < 100]
    lines = [f"Here's where your budgets stand on day {b['day_of_month']} of {b['month']}:", ""]
    for r in sorted(rows, key=lambda r: -r["percent_used"]):
        lines.append(f"- **{r['category']}**: {inr(r['consumed'])} of {inr(r['limit'])} "
                     f"({r['percent_used']:.0f}%), on pace for {inr(r['projected_month_end'])}")
    if over:
        lines += ["", f"{', '.join(r['category'] for r in over)} is already over. Hold off on more spending there."]
    elif warn:
        lines += ["", f"Watch {', '.join(r['category'] for r in warn)}; it's past 80%."]
    total_left = sum(max(0, r["remaining"]) for r in rows)
    return {"answer": "\n".join(lines), "facts": [_fact("Left across budgets", total_left)]}


def _dues(q: str, tb: Toolbox, today: date) -> dict:
    d = tb.run("get_dues", {"horizon_days": 30})
    if "error" in d:
        return _unavailable()
    if not d["dues"]:
        return {"answer": "Nothing due in the next 30 days.", "facts": []}
    lines = [f"You have **{d['count']} payments** totalling **{inr(d['total_due'])}** in the next 30 days:", ""]
    for x in d["dues"]:
        tag = {"overdue": " — **overdue**", "due_soon": " — due soon"}.get(x["status"], "")
        lines.append(f"- {x['label']}: {inr(x['amount'])} on {_d(x['due_date'])}{tag}")
    lines += ["", "Pay card bills in full to avoid interest; the minimum due only avoids the late fee."]
    return {"answer": "\n".join(lines), "facts": [_fact("Due in 30 days", d["total_due"])]}


def _forecast(q: str, tb: Toolbox, today: date) -> dict:
    f = tb.run("forecast_balance", {})
    if "error" in f:
        return _unavailable()
    lines = [f"Right now you have **{inr(f['disposable_now'])}** that isn't already committed, and you're on track "
             f"to end the month with **{inr(f['predicted_month_end'])}**.", "", "**What's coming out before month end**"]
    for b in f["month_end_breakdown"]:
        if b["kind"] in ("due", "recurring", "variable", "income"):
            lines.append(f"- {b['label']}: {inr(b['amount'])}")
    lines += ["", f"That leaves {inr(f['safe_headroom'])} you could spend on something extra without going short."]
    return {"answer": "\n".join(lines),
            "facts": [_fact("Disposable now", f["disposable_now"]), _fact("Month-end", f["predicted_month_end"]),
                      _fact("Safe headroom", f["safe_headroom"])]}


def _payoff(q: str, tb: Toolbox, today: date) -> dict:
    extra = parse_amount(q) or 5000
    p = tb.run("compute_payoff", {"extra_monthly": extra})
    if "error" in p:
        return _unavailable()
    if not p.get("debts"):
        return {"answer": "You don't have any outstanding debts to plan for.", "facts": []}
    rec = p[p["recommended"]]
    other = p["snowball" if p["recommended"] == "avalanche" else "avalanche"]
    lines = [f"Use the **{p['recommended']}** method: put the extra {inr(p['extra_monthly'])}/month toward "
             f"**{rec['order'][0]}** first while paying minimums on the rest.", "", "**Order**"]
    for i, name in enumerate(rec["order"], 1):
        d = next(x for x in p["debts"] if x["name"] == name)
        lines.append(f"{i}. {name}: {inr(d['balance'])} at {d['apr']:g}% "
                     f"(costs {inr(d['monthly_interest_now'])} interest this month)")
    lines += ["", f"You'd be debt-free in {rec['months_to_debt_free']} months, paying {inr(rec['total_interest'])} "
                  f"in interest — {inr(p['interest_saved_vs_other'])} less than the other method "
                  f"({other['months_to_debt_free']} months)."]
    return {"answer": "\n".join(lines),
            "facts": [_fact("Interest saved", p["interest_saved_vs_other"]),
                      _fact("Total interest", rec["total_interest"])],
            "compute": "Simulated month-by-month payoff for avalanche and snowball"}


def _tax(q: str, tb: Toolbox, today: date) -> dict:
    t = tb.run("estimate_tax", {})
    if "error" in t:
        return _unavailable()
    k = tb.run("search_knowledge", {"query": "old vs new tax regime deductions 80C 80D NPS save tax"})
    old, new = t["old_regime"]["total_tax"], t["new_regime"]["total_tax"]
    rec = t["recommended_regime"]
    lines = [f"For FY {t['fy']}, on a gross income of {inr(t['gross_income'])}, you'd pay about "
             f"**{inr(new)}** under the new regime and **{inr(old)}** under the old one. "
             f"The **{rec} regime** saves you {inr(t['saving_with_recommended'])}."]
    gaps = [g for g in t["deduction_gaps"] if g["unused_room"] > 0]
    if gaps:
        lines += ["", "**Unused deduction room (old regime)**"]
        lines += [f"- {g['title']}: {inr(g['unused_room'])} unused, worth up to {inr(g['potential_saving'])}"
                  for g in gaps]
    verdict_line = next((g for g in t["deduction_gaps"] if g["unused_room"] == 0), None)
    if verdict_line:
        lines += ["", verdict_line["note"]]
    refs = _refs(k)
    if refs:
        lines += ["", f"The new regime skips most deductions (80C, 80D, HRA) in exchange for lower slab rates {refs}."]
    lines += ["", TAX_NOTE]
    return {"answer": "\n".join(lines),
            "facts": [_fact("New regime", new), _fact("Old regime", old),
                      _fact("You save", t["saving_with_recommended"])],
            "compute": "Applied FY slabs, standard deduction, 87A rebate and 4% cess to both regimes"}


def _knowledge(q: str, tb: Toolbox, today: date) -> dict:
    k = tb.run("search_knowledge", {"query": q})
    if not k.get("results"):
        return {"answer": "I couldn't find this in FinPilot's trusted documents, so I won't guess. "
                          "Try rephrasing, or ask about tax, deductions, credit cards, debt payoff or budgeting.",
                "facts": []}
    top = k["results"][0]
    sentences = _sentences(top["text"])[:3]
    lines = [" ".join(sentences) + f" [{top['ref']}]"]
    if len(k["results"]) > 1:
        nxt = k["results"][1]
        lines += ["", _sentences(nxt["text"])[0] + f" [{nxt['ref']}]"]
    if any(w in q.lower() for w in ("tax", "80c", "80d", "hra", "regime", "itr", "nps")):
        lines += ["", TAX_NOTE]
    return {"answer": "\n".join(lines), "facts": []}


def _overview(q: str, tb: Toolbox, today: date) -> dict:
    r = _forecast(q, tb, today)
    d = tb.run("get_dues", {"horizon_days": 14})
    if d.get("dues"):
        r["answer"] += "\n\n**Due in the next two weeks:** " + ", ".join(
            f"{x['label']} {inr(x['amount'])} ({_d(x['due_date'])})" for x in d["dues"])
    r["answer"] += ("\n\nYou can ask things like *\"Can I afford a ₹20,000 phone?\"*, *\"How much did I spend on "
                    "food last month?\"* or *\"How can I save tax?\"*")
    return r


# ---- helpers --------------------------------------------------------------------------

def _fact(label: str, value: float) -> dict:
    return {"label": label, "value": round(float(value), 2), "format": "inr"}


def _d(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%-d %b")


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if p]


def _refs(k: dict) -> str:
    return " ".join(f"[{r['ref']}]" for r in k.get("results", [])[:2])


def _unavailable() -> dict:
    return {"answer": "I couldn't load your data just now, so I won't guess at numbers. Try again in a moment.",
            "facts": []}

