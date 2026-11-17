"""Month-end balance forecaster (§7, §10).

predicted_month_end = balance
                      − known unpaid dues (card bills, EMIs)
                      − recurring costs not yet charged this month (detected here)
                      + recurring income not yet received this month
                      − typical variable spend for the days left (linear regression)

Recurring-cost detection is a heuristic step inside the forecaster, not a separate model.
"""
from __future__ import annotations

import calendar
import re
from collections import defaultdict
from datetime import date, timedelta
from statistics import median

import numpy as np
from sklearn.linear_model import LinearRegression

# Handled elsewhere (known dues) or not consumption.
# Card bills/EMIs are known dues; everyday categories repeat by habit, not by contract.
EXCLUDED_FROM_RECURRING = {"Loan EMI", "Card Payment", "Transfers", "Groceries", "Dining", "Transport", "Fuel",
                           "Shopping", "Personal Care"}
EXCLUDED_FROM_VARIABLE = {"Loan EMI", "Card Payment", "Transfers", "Income", "Investments", "Rent"}


def normalize_merchant(m: str) -> str:
    m = m.lower()
    m = re.sub(r"[^a-z ]+", " ", m)
    m = re.sub(r"\b(upi|pos|ach|nach|ref|txn|payment|pay|india|pvt|ltd|online)\b", " ", m)
    return re.sub(r"\s+", " ", m).strip()


def detect_recurring(txns: list[dict], today: date) -> list[dict]:
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for t in txns:
        if t.get("category") in EXCLUDED_FROM_RECURRING or t.get("is_anomaly"):
            continue
        key = normalize_merchant(t.get("merchant") or "")
        if not key:
            continue
        direction = "in" if float(t["amount"]) > 0 else "out"
        groups[(key, direction)].append(t)

    found = []
    for (key, direction), items in groups.items():
        items = sorted(items, key=lambda x: x["date"])
        months = {x["date"][:7] for x in items}
        # A bill or subscription shows up about once a month; a shop you visit weekly does not.
        if len(months) < 2 or len(items) / len(months) > 1.5:
            continue
        amounts = [abs(float(x["amount"])) for x in items]
        med = median(amounts)
        # Keep charges within ±25% of the typical amount (bills like electricity vary).
        consistent = [x for x, a in zip(items, amounts) if med and abs(a - med) / med <= 0.25]
        if len({x["date"][:7] for x in consistent}) < 2:
            continue
        if len(consistent) < 0.6 * len(items):
            continue
        dates = [date.fromisoformat(x["date"]) for x in consistent]
        if np.std([d.day for d in dates]) > 5:
            continue
        gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
        # One charge per month on average: gaps of roughly a month.
        if gaps and not (20 <= median(gaps) <= 40):
            continue
        day = int(median([d.day for d in dates]))
        paid = any(d.year == today.year and d.month == today.month for d in dates)
        last = consistent[-1]
        last_amt, prev_amt = abs(float(consistent[-1]["amount"])), abs(float(consistent[-2]["amount"]))
        found.append({
            "last_date": consistent[-1]["date"],
            "next_date": _next_charge(today, day, paid).isoformat(),
            "last_amount": round(last_amt, 2),
            # Flag a price rise (e.g. a subscription plan going up), ignoring tiny bill wobble.
            "price_change": round(last_amt - prev_amt, 2) if prev_amt and (last_amt - prev_amt) / prev_amt > 0.02
                            and r_category_is_fixed(last.get("category")) else 0.0,
            "merchant": last.get("merchant"),
            "key": key,
            "direction": direction,
            "amount": round(float(median([abs(float(x["amount"])) for x in consistent])), 2),
            "day": day,
            "category": last.get("category"),
            "paid_this_month": paid,
            "occurrences": len(consistent),
            "txn_ids": [x["id"] for x in consistent],
        })
    found.sort(key=lambda r: -r["amount"])
    return found


FIXED_PRICE = {"Subscriptions", "Health", "Rent", "Investments", "Education"}


def r_category_is_fixed(category: str | None) -> bool:
    """Bills like electricity vary month to month; subscriptions and rent should not."""
    return category in FIXED_PRICE


def _next_charge(today: date, day: int, paid_this_month: bool) -> date:
    y, m = today.year, today.month
    if paid_this_month:
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return date(y, m, min(day, calendar.monthrange(y, m)[1]))


def predict_variable(txns: list[dict], recurring_ids: set, today: date, days_left: int) -> tuple[float, float, str]:
    """Fit daily variable spend over the last 90 days and project the remaining days."""
    start = today - timedelta(days=90)
    daily: dict[date, float] = defaultdict(float)
    for t in txns:
        amt = float(t["amount"])
        if amt >= 0 or t["id"] in recurring_ids or t.get("is_anomaly"):
            continue
        if t.get("category") in EXCLUDED_FROM_VARIABLE:
            continue
        d = date.fromisoformat(t["date"])
        if start <= d < today:
            daily[d] += -amt
    n = (today - start).days
    if n <= 0 or days_left <= 0:
        return 0.0, 0.0, "none"
    xs = [start + timedelta(days=i) for i in range(n)]
    y = np.array([daily.get(d, 0.0) for d in xs])
    if y.sum() == 0:
        return 0.0, 0.0, "none"
    # Winsorise big one-off days so a single splurge doesn't skew the trend.
    cap = np.percentile(y, 95)
    y = np.minimum(y, cap)
    X = np.array([[i, 1.0 if d.weekday() >= 5 else 0.0] for i, d in enumerate(xs)])
    model = LinearRegression().fit(X, y)
    future = [today + timedelta(days=i) for i in range(1, days_left + 1)]
    Xf = np.array([[n + i, 1.0 if d.weekday() >= 5 else 0.0] for i, d in enumerate(future)])
    pred = np.clip(model.predict(Xf), 0, None)
    # Guard against a steep trend extrapolating wildly: stay within 0.5x–1.5x of the mean.
    mean = float(y.mean())
    pred = np.clip(pred, 0.5 * mean, 1.5 * mean)
    return float(pred.sum()), float(pred.mean()), "linear-regression"


def forecast(today: date, balance: float, txns: list[dict], known_dues: list[dict]) -> dict:
    month_end = date(today.year, today.month, calendar.monthrange(today.year, today.month)[1])
    days_left = (month_end - today).days

    recurring = detect_recurring(txns, today)
    recurring_ids = {i for r in recurring for i in r["txn_ids"]}

    breakdown = [{"label": "Current balance", "amount": round(balance, 2), "kind": "start"}]
    end = balance

    for d in sorted(known_dues, key=lambda x: x["due_date"]):
        amt = float(d["amount"])
        end -= amt
        breakdown.append({"label": d["label"], "amount": -round(amt, 2), "kind": "due",
                          "detail": "due " + d["due_date"]})

    for r in recurring:
        if r["paid_this_month"]:
            # Already charged (or received) this month; the balance reflects it.
            continue
        if r["direction"] == "out":
            end -= r["amount"]
            breakdown.append({"label": r["merchant"], "amount": -r["amount"], "kind": "recurring",
                              "detail": f"usually on the {_ordinal(r['day'])}"})
        else:
            end += r["amount"]
            breakdown.append({"label": r["merchant"], "amount": r["amount"], "kind": "income",
                              "detail": f"expected on the {_ordinal(r['day'])}"})

    variable_total, variable_daily, model = predict_variable(txns, recurring_ids, today, days_left)
    end -= variable_total
    breakdown.append({"label": "Typical variable spend", "amount": -round(variable_total, 2), "kind": "variable",
                      "detail": f"{days_left} days × ~₹{round(variable_daily):,}/day"})

    return {
        "predicted_month_end": round(end, 2),
        "breakdown": breakdown,
        "recurring": recurring,
        "variable_daily": round(variable_daily, 2),
        "variable_remaining": round(variable_total, 2),
        "days_left": days_left,
        "model": f"ml:{model}",
    }


def _ordinal(n: int) -> str:
    suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"
