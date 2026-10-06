"""Anomaly detection (§10): Isolation Forest + explainable statistical evidence. Not LSTM.

A debit is flagged when the Isolation Forest calls it an outlier AND at least one
human-readable reason backs it up (far above the category's usual amount, first time at a
merchant with a large amount), or when it looks like a duplicate charge.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import date
from statistics import median

import numpy as np
from sklearn.ensemble import IsolationForest

SKIP = {"Income", "Card Payment", "Transfers", "Loan EMI", "Investments", "Rent"}


def _robust_z(value: float, values: list[float]) -> float:
    med = median(values)
    mad = median([abs(v - med) for v in values]) or (med * 0.25) or 1.0
    return (value - med) / (1.4826 * mad)


def score(txns: list[dict]) -> list[dict]:
    debits = [t for t in txns if float(t["amount"]) < 0 and t.get("category") not in SKIP]
    if len(debits) < 10:
        return [{"id": t["id"], "score": 0.0, "is_anomaly": False, "reason": None} for t in txns]

    by_cat: dict[str, list[float]] = defaultdict(list)
    for t in debits:
        by_cat[t.get("category") or "Other"].append(-float(t["amount"]))
    merchant_count = Counter((t.get("merchant") or "").lower() for t in debits)
    all_amounts = [-float(t["amount"]) for t in debits]
    p90 = float(np.percentile(all_amounts, 90))

    # Duplicate: same merchant + same amount on the same day (later copies only).
    seen: dict[tuple, int] = {}
    dup_ids = set()
    for t in sorted(debits, key=lambda x: (x["date"], x["id"])):
        amt = -float(t["amount"])
        key = ((t.get("merchant") or "").lower(), round(amt, 2), t["date"])
        if key in seen and amt >= 300 and t.get("category") != "Transport":
            dup_ids.add(t["id"])
        seen[key] = t["id"]

    feats, zs = [], []
    for t in debits:
        amt = -float(t["amount"])
        cat_vals = by_cat[t.get("category") or "Other"]
        z = _robust_z(amt, cat_vals) if len(cat_vals) >= 4 else _robust_z(amt, all_amounts)
        zs.append(z)
        feats.append([
            math.log1p(amt),
            max(min(z, 20), -5),
            merchant_count[(t.get("merchant") or "").lower()] / len(debits),
            1.0 if t["id"] in dup_ids else 0.0,
            date.fromisoformat(t["date"]).weekday() / 6,
        ])
    X = np.array(feats)
    forest = IsolationForest(n_estimators=200, contamination=0.04, random_state=42).fit(X)
    raw = -forest.score_samples(X)  # higher = more anomalous
    outlier = forest.predict(X) == -1

    results = {}
    for t, z, s, is_out in zip(debits, zs, raw, outlier):
        amt = -float(t["amount"])
        reasons = []
        cat = t.get("category") or "Other"
        cat_med = median(by_cat[cat]) if by_cat[cat] else 0
        if t["id"] in dup_ids:
            reasons.append("Looks like a duplicate: same merchant and amount on the same day")
        if z > 3.5 and cat_med > 0 and amt > 2.5 * cat_med:
            reasons.append(f"{amt / cat_med:.1f}× your usual {cat} spend")
        if merchant_count[(t.get("merchant") or "").lower()] == 1 and amt > max(p90, 5000):
            reasons.append("First payment to this merchant, and a large one")
        flag = t["id"] in dup_ids or (bool(is_out) and len(reasons) > 0)
        results[t["id"]] = {
            "id": t["id"],
            "score": round(float(s), 4),
            "is_anomaly": flag,
            "reason": "; ".join(reasons) if flag else None,
        }
    return [results.get(t["id"], {"id": t["id"], "score": 0.0, "is_anomaly": False, "reason": None}) for t in txns]
