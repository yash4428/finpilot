"""Transaction categorizer (§10).

Stage 1: keyword rules (high precision, explainable).
Stage 2: TF-IDF (char n-grams) + Logistic Regression trained on the base corpus plus the
user's own confirmed labels, so corrections are learned the next time it runs.
"""
from __future__ import annotations

import re
from functools import lru_cache

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

from .training_data import CORPUS

# Ordered: the first matching rule wins.
RULES: list[tuple[str, str]] = [
    (r"\b(salary|payroll)\b", "Income"),
    (r"\brent\b", "Rent"),
    (r"\b(emi|loan repayment|nach)\b", "Loan EMI"),
    (r"credit card (bill|payment)|card bill|cred card", "Card Payment"),
    (r"\b(sip|mutual fund|zerodha|groww|ppf|nps)\b", "Investments"),
    (r"swiggy instamart|blinkit|zepto|bigbasket|dmart|d-mart", "Groceries"),
    (r"\b(swiggy|zomato|dominos|starbucks|mcdonald)", "Dining"),
    (r"\b(uber|ola|rapido|metro|fastag)\b", "Transport"),
    (r"\b(netflix|spotify|youtube premium|hotstar|prime video|amazon prime)\b", "Subscriptions"),
    (r"\b(croma|reliance digital|vijay sales|electronics|amazon|flipkart|myntra|ajio|nykaa|decathlon|tanishq|jewell?ers?|jewell?ery)\b", "Shopping"),
    (r"\b(bescom|electricity|broadband|fibernet|jio fiber|airtel xstream)\b", "Utilities"),
    (r"\b(petrol|iocl|hpcl|bpcl|indian oil)\b", "Fuel"),
    (r"\b(pharmacy|pharmeasy|apollo|cult\.?fit|1mg)\b", "Health"),
    (r"\b(makemytrip|goibibo|indigo|irctc|cleartrip|oyo)\b", "Travel"),
    (r"\b(bookmyshow|pvr|inox)\b", "Entertainment"),
]
INCOME_RULES: list[tuple[str, str]] = [
    (r"\b(upi from|imps from|transfer from|self transfer|split)\b", "Transfers"),
]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def rule_category(text: str, amount: float) -> str | None:
    t = _norm(text)
    if amount > 0:
        for pat, cat in INCOME_RULES:
            if re.search(pat, t):
                return cat
        return "Income"
    for pat, cat in RULES:
        if re.search(pat, t):
            return cat
    return None


def _build(examples: tuple[tuple[str, str], ...]):
    texts, labels = [], []
    for cat, items in CORPUS.items():
        for s in items:
            texts.append(_norm(s))
            labels.append(cat)
    # User corrections count three times: they are the most relevant signal.
    for text, cat in examples:
        for _ in range(3):
            texts.append(_norm(text))
            labels.append(cat)
    model = make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True),
        LogisticRegression(max_iter=2000, C=8.0),
    )
    model.fit(texts, labels)
    return model


@lru_cache(maxsize=8)
def _model_for(examples: tuple[tuple[str, str], ...]):
    return _build(examples)


def categorize(items: list[dict], examples: list[dict] | None = None) -> list[dict]:
    ex = tuple(sorted({(e["text"], e["category"]) for e in (examples or []) if e.get("text") and e.get("category")}))
    model = None
    out = []
    for it in items:
        text = f"{it.get('merchant', '')} {it.get('description', '') or ''}".strip()
        amount = float(it.get("amount", 0))
        cat = rule_category(text, amount)
        if cat:
            out.append({"id": it["id"], "category": cat, "confidence": 0.97, "method": "rule"})
            continue
        if model is None:
            model = _model_for(ex)
        probs = model.predict_proba([_norm(text)])[0]
        best = probs.argmax()
        conf = float(probs[best])
        label = str(model.classes_[best])
        if conf < 0.18:
            label = "Other"
        out.append({"id": it["id"], "category": label, "confidence": round(conf, 3), "method": "tfidf-logreg"})
    return out
