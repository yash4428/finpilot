"""Lightweight question understanding for the Interpret step."""
from __future__ import annotations

import calendar
import re
from datetime import date, timedelta

AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)?\s?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s?(k|thousand|lakh|lakhs|lac|l|cr|crore)?\b",
                       re.I)
UNIT = {"k": 1e3, "thousand": 1e3, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "l": 1e5, "cr": 1e7, "crore": 1e7}

CATEGORY_WORDS = {
    "Dining": ["food delivery", "eating out", "dining", "restaurant", "swiggy", "zomato", "food", "coffee", "cafe"],
    "Groceries": ["grocery", "groceries", "blinkit", "zepto", "bigbasket", "vegetables"],
    "Transport": ["transport", "uber", "ola", "cab", "commute", "metro", "rapido", "travel to work"],
    "Fuel": ["fuel", "petrol", "diesel"],
    "Shopping": ["shopping", "amazon", "flipkart", "myntra", "clothes", "gadgets"],
    "Utilities": ["utilities", "electricity", "internet", "broadband", "phone bill", "recharge"],
    "Subscriptions": ["subscription", "subscriptions", "netflix", "spotify", "ott", "streaming"],
    "Entertainment": ["entertainment", "movies", "movie", "bookmyshow", "concert"],
    "Health": ["health", "medical", "medicine", "pharmacy", "gym", "doctor"],
    "Travel": ["travel", "trip", "flight", "hotel", "vacation", "holiday"],
    "Rent": ["rent"],
    "Personal Care": ["salon", "haircut", "personal care", "grooming"],
    "Education": ["education", "course", "courses", "books"],
}

MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_abbr) if m})


def parse_amount(q: str) -> float | None:
    for m in AMOUNT_RE.finditer(q):
        num, unit = m.groups()
        # Skip things like "80C", "3 months", "last 30 days".
        tail = q[m.end():m.end() + 8].lower()
        if re.match(r"\s?(day|days|month|months|week|weeks|year|years|%)", tail):
            continue
        v = float(num.replace(",", ""))
        if unit:
            v *= UNIT[unit.lower()]
        if v >= 100:
            return v
    return None


def parse_period(q: str, today: date) -> tuple[date, date, str]:
    s = q.lower()
    first = today.replace(day=1)
    if "last month" in s or "previous month" in s:
        end = first - timedelta(days=1)
        return end.replace(day=1), end, end.strftime("%B %Y")
    m = re.search(r"last (\d+) days", s)
    if m:
        n = int(m.group(1))
        return today - timedelta(days=n - 1), today, f"the last {n} days"
    m = re.search(r"last (\d+|three|two|six) months", s)
    if m:
        n = {"two": 2, "three": 3, "six": 6}.get(m.group(1)) or int(m.group(1))
        return today - timedelta(days=30 * n), today, f"the last {n} months"
    if "last week" in s or "past week" in s or "this week" in s:
        return today - timedelta(days=6), today, "the last 7 days"
    if "this year" in s or "financial year" in s:
        fy_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
        return fy_start, today, "this financial year"
    for name, idx in MONTHS.items():
        # "may" is too common an English word; only accept it as "in may".
        hit = re.search(r"\bin may\b", s) if name == "may" else re.search(rf"\b{name}\b", s)
        if hit:
            year = today.year if idx <= today.month else today.year - 1
            start = date(year, idx, 1)
            end = date(year, idx, calendar.monthrange(year, idx)[1])
            return start, min(end, today), start.strftime("%B %Y")
    return first, today, "this month"


def detect_category(q: str) -> str | None:
    s = q.lower()
    for cat, words in CATEGORY_WORDS.items():
        if any(re.search(rf"\b{re.escape(w)}\b", s) for w in words):
            return cat
    return None


def detect_intent(q: str) -> str:
    s = q.lower().strip()
    has_amount = parse_amount(q) is not None
    personal = re.search(r"\b(my|i|me|am i|do i|i'm|i've)\b", s) is not None
    if re.search(r"\b(afford|can i (buy|spend|get)|should i (buy|get)|is it ok to (buy|spend)|purchase)\b", s) and has_amount:
        return "afford"
    if re.search(r"pay ?off|debt|which (loan|card|debt)|avalanche|snowball|clear my (loans?|cards?)|prepay", s):
        return "payoff"
    if re.search(r"\b(tax|taxes|regime|itr|80c|80d|hra|nps)\b", s):
        if re.search(r"how much|my tax|estimate|which regime|should i|liability|owe|payable|save|saving|reduce|compare", s):
            return "tax"
        return "knowledge"
    definitional = re.search(r"^(what is|what's|whats|what are|explain|define|meaning|why|how does|how do|tips|how to)\b", s)
    if definitional and not personal:
        return "knowledge"
    if re.search(r"\b(due|dues|bills?|upcoming|emis?|installments?|payments? coming)\b", s):
        return "dues"
    if re.search(r"\bbudget", s):
        return "budget"
    if re.search(r"month.?end|end of (the )?month|safe to spend|left (this|by)|how much (money )?(do i have|is left|will i have)|forecast|balance", s):
        return "forecast"
    if re.search(r"spend|spent|spending|expenses?|how much did|where did|top merchants?|biggest", s):
        return "spend"
    if definitional or re.search(r"^(how can i|how should i|should i)\b", s):
        return "knowledge"
    return "overview"
