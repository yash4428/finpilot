"""Privacy guard (§1): nothing that looks like raw PII reaches the external LLM.

Tool results are already aggregates, but every string bound for the LLM passes through
here as defence in depth.
"""
import json
import re

PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[email]"),
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[PAN]"),
    (re.compile(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b"), "[card-number]"),
    (re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"), "[aadhaar]"),
    (re.compile(r"\b\d{9,18}\b"), "[account-number]"),
    (re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"), "[IFSC]"),
    (re.compile(r"\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}"), "[hash]"),
]
SENSITIVE_KEYS = {"email", "password", "password_hash", "passwordHash", "last4", "account_number", "token"}


def redact_text(s: str) -> str:
    for pat, repl in PATTERNS:
        s = pat.sub(repl, s)
    return s


def redact_obj(obj):
    if isinstance(obj, dict):
        return {k: ("[redacted]" if k in SENSITIVE_KEYS else redact_obj(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact_obj(v) for v in obj]
    if isinstance(obj, str):
        return redact_text(obj)
    return obj


def to_llm_json(obj) -> str:
    return json.dumps(redact_obj(obj), ensure_ascii=False, default=str)
