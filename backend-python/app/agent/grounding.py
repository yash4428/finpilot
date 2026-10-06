"""Enforces the One Rule (§1, §9): every number in an answer must come from a tool result,
the knowledge chunks used, or the user's own question, allowing for simple arithmetic
(sums/differences of two grounded values) and rounding.
"""
from __future__ import annotations

import itertools
import re

NUM_RE = re.compile(
    r"(?<![\w.])₹?\s?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s?(k|K|lakh|lakhs|lac|L|cr|crore)?(?![\w(])(%?)")
UNITS = {"k": 1e3, "K": 1e3, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "L": 1e5, "cr": 1e7, "crore": 1e7}


def extract_numbers(text: str) -> list[float]:
    out = []
    for m in NUM_RE.finditer(text):
        whole, frac, unit, _pct = m.groups()
        try:
            v = float(whole.replace(",", "") + (frac or ""))
        except ValueError:
            continue
        if unit:
            v *= UNITS[unit]
        out.append(v)
    return out


def collect_values(obj, acc: set[float]) -> set[float]:
    if isinstance(obj, bool):
        return acc
    if isinstance(obj, (int, float)):
        acc.add(abs(float(obj)))
    elif isinstance(obj, str):
        for v in extract_numbers(obj):
            acc.add(v)
    elif isinstance(obj, dict):
        for v in obj.values():
            collect_values(v, acc)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            collect_values(v, acc)
    return acc


def _trivial(v: float) -> bool:
    # Small counts, days, months and years carry no financial claim.
    return v <= 31 or (1990 <= v <= 2100 and v == int(v))


def check(answer: str, evidence: list, question: str = "") -> dict:
    allowed = set()
    for e in evidence:
        collect_values(e, allowed)
    collect_values(question, allowed)
    base = sorted(v for v in allowed if v > 31)
    # Simple derived values: a ± b over the largest grounded money figures.
    money = sorted(base, reverse=True)[:80]
    derived = set(base)
    for a, b in itertools.combinations(money, 2):
        derived.add(a + b)
        derived.add(abs(a - b))
    derived.update(v * 12 for v in money)
    derived.update(v / 12 for v in money)

    found = extract_numbers(answer)
    ungrounded = []
    for v in found:
        if _trivial(v):
            continue
        if not any(abs(v - a) <= max(1.0, 0.012 * max(v, a)) for a in derived):
            ungrounded.append(v)
    return {"checked": True, "ok": not ungrounded, "numbers": len(found), "ungrounded": ungrounded}
