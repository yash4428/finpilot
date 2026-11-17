"""Short spoken replies for voice mode, in English or Hinglish.

Built only from tool results (never from model prose), so every figure that is read aloud is
grounded the same way as the written answer.
"""
from __future__ import annotations

import re
from datetime import date

from .fmt import inr

OPTION_HI = {"nce_3": "3 mahine ki no-cost EMI", "nce_6": "6 mahine ki no-cost EMI", "emi_12": "12 mahine ki EMI"}
OPTION_EN = {"nce_3": "a 3-month no-cost EMI", "nce_6": "a 6-month no-cost EMI", "emi_12": "a 12-month EMI"}


def _find(evidence: list, key: str) -> dict | None:
    return next((e for e in evidence if isinstance(e, dict) and key in e), None)


def _when(days: int, hi: bool) -> str:
    if days <= 0:
        return "aaj" if hi else "today"
    if days == 1:
        return "kal" if hi else "tomorrow"
    return f"{days} din mein" if hi else f"in {days} days"


def build(intent: str, lang: str, evidence: list, answer: str, today: date) -> str:
    hi = lang == "hi"
    try:
        fn = {"afford": _afford, "dues": _dues, "spend": _spend, "budget": _budget, "forecast": _forecast,
              "overview": _forecast, "payoff": _payoff, "tax": _tax}.get(intent)
        text = fn(evidence, hi, today) if fn else None
    except (KeyError, IndexError, TypeError):
        text = None
    return text or _first_sentence(answer)


def _afford(ev, hi, today):
    f = _find(ev, "affordability_check")
    a = f["affordability_check"]
    head, after, short = inr(a["safe_headroom"]), inr(a["month_end_after_purchase"]), inr(a["shortfall"])
    best = next((o for o in a["options"] if o["id"] == a["recommended_option"]), None)
    if a["affordable"] and a["comfort"] == "comfortable":
        return (f"Haan, le sakte ho! Aapke paas {head} safe hai, aur mahine ke end mein lagbhag {after} bachega."
                if hi else f"Yes, you can buy it. You have {head} safe to spend, and you'd still end the month with about {after}.")
    if a["affordable"]:
        tail = ""
        if best and best["id"] != "pay_now":
            tail = (f" {OPTION_HI[best['id']]} pe {inr(best['monthly'])} mahina better rahega." if hi
                    else f" Splitting it into {OPTION_EN[best['id']]} at {inr(best['monthly'])} a month is easier.")
        return ((f"Le sakte ho, par thoda tight rahega. Mahine ke end mein sirf {after} bachega." if hi
                 else f"Yes, but it's tight. You'd have only {after} left at month end.") + tail)
    if best:
        return (f"Abhi nahi. {short} kam pad rahe hain. Lekin {OPTION_HI[best['id']]} pe {inr(best['monthly'])} mahina, "
                f"wo aaram se chal jayega." if hi else
                f"Not this month. You're {short} short. But {OPTION_EN[best['id']]} at {inr(best['monthly'])} a month would fit.")
    return (f"Abhi nahi. Safe limit se {short} zyada ho raha hai." if hi
            else f"Not this month. That's {short} more than you can safely spend.")


def _dues(ev, hi, today):
    d = _find(ev, "total_due")
    if not d["dues"]:
        return "Agle 30 din mein koi bill nahi hai." if hi else "Nothing is due in the next 30 days."
    n = d["dues"][0]
    return (f"Agle 30 din mein {d['count']} payments hain, total {inr(d['total_due'])}. Sabse pehle {n['label']}, "
            f"{inr(n['amount'])}, {_when(n['days_away'], True)}." if hi else
            f"You have {d['count']} payments coming up, {inr(d['total_due'])} in total. Next is {n['label']}, "
            f"{inr(n['amount'])}, {_when(n['days_away'], False)}.")


def _spend(ev, hi, today):
    t = _find(ev, "total_spent")
    start = date.fromisoformat(t["period"]["from"])
    this_month = start == today.replace(day=1)
    label = ("is mahine" if hi else "this month") if this_month else start.strftime("%B")
    cat = t["filter"].get("category")
    if hi:
        return f"Aapne {label} {cat + ' pe ' if cat else ''}{inr(t['total_spent'])} kharch kiye."
    return f"You spent {inr(t['total_spent'])}{' on ' + cat if cat else ''} {'in ' if not this_month else ''}{label}."


def _budget(ev, hi, today):
    b = _find(ev, "budgets")
    if not b["budgets"]:
        return "Abhi koi budget set nahi hai." if hi else "You haven't set any budgets yet."
    top = max(b["budgets"], key=lambda r: r["percent_used"])
    pct = round(top["percent_used"])
    over = [r for r in b["budgets"] if r["percent_used"] >= 100]
    if hi:
        return f"{top['category']} ka budget {pct} percent ho chuka hai." + (
            f" {len(over)} budget limit cross kar chuke hain." if len(over) > 1 else "")
    return f"Your {top['category']} budget is at {pct} percent." + (
        f" {len(over)} budgets are over their limit." if len(over) > 1 else "")


def _forecast(ev, hi, today):
    f = _find(ev, "predicted_month_end")
    return (f"Abhi aapke paas {inr(f['disposable_now'])} free hai, aur mahine ke end tak {inr(f['predicted_month_end'])} bachega."
            if hi else f"You have {inr(f['disposable_now'])} free right now, and you're on track to end the month with "
                       f"{inr(f['predicted_month_end'])}.")


def _payoff(ev, hi, today):
    p = _find(ev, "avalanche")
    first = p[p["recommended"]]["order"][0]
    d = next(x for x in p["debts"] if x["name"] == first)
    return (f"Pehle {first} chukao. Is par is mahine {inr(d['monthly_interest_now'])} interest lag raha hai." if hi
            else f"Clear {first} first. It's costing you {inr(d['monthly_interest_now'])} in interest this month.")


def _tax(ev, hi, today):
    t = _find(ev, "recommended_regime")
    rec = t["recommended_regime"].capitalize()
    return (f"{rec} regime mein aapke {inr(t['saving_with_recommended'])} bachenge. Yeh sirf estimate hai." if hi
            else f"The {rec.lower()} regime saves you {inr(t['saving_with_recommended'])} this year. This is an estimate only.")


def _first_sentence(answer: str) -> str:
    plain = re.sub(r"\[\d+\]|\*\*|_|\*", "", answer or "").strip()
    first = re.split(r"(?<=[.!?])\s+", plain.split("\n")[0])[0]
    return first[:220]
