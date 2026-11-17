"""Agent loop (§8): Interpret → Plan → Act → Compute → Synthesize, then Verify.

LLM path: a hosted Claude model used as-is through the API with tool calling. It plans and
writes prose; numbers come only from tools. Every answer is checked by `grounding.check`; an
answer with an untraceable figure is sent back once for correction and otherwise replaced by
the deterministic composer.

Offline path: the same tools and checks with a rule-based planner (no API key needed).
"""
from __future__ import annotations

import logging
import time
from datetime import date

from ..config import ANTHROPIC_API_KEY, LLM_ENABLED, LLM_MODEL
from . import offline, speech
from .grounding import check
from .parse import detect_intent, detect_lang, parse_amount
from .redact import redact_text, to_llm_json
from .tools import TOOL_SPECS, JavaApi, Toolbox

log = logging.getLogger("finpilot.agent")

INTENT_LABEL = {
    "afford": "Affordability check", "spend": "Spending question", "budget": "Budget status",
    "dues": "Upcoming payments", "forecast": "Balance forecast", "payoff": "Debt payoff advice",
    "tax": "Tax estimate & advice", "knowledge": "General knowledge", "overview": "General overview",
}

SYSTEM_PROMPT = """You are Pilot, the financial co-pilot inside FinPilot, a personal-finance app for users in India.

Hard rules:
1. Never state a financial figure unless it appears in a tool result in this conversation or in the user's question. If you need a number, call a tool. Simple sums or differences of tool figures are fine; estimates from your own knowledge are not.
2. Questions about the user's own money (spending, balances, dues, budgets, affordability, tax owed, debts) must use the matching tool. Never answer them from general knowledge.
3. Advice or "what is" questions must use search_knowledge and cite the passages you rely on as [n] using each result's ref. If nothing relevant comes back, say you couldn't find it in the trusted documents instead of guessing.
4. For affordability, use forecast_balance; its affordability_check field is computed exactly in code. State its verdict; don't recompute it differently.
5. Any answer about tax ends with: "_Estimate only — consult a tax professional before filing._"
6. If the user writes in Hinglish or Hindi, reply in simple Hinglish written in Roman script; keep figures in ₹.

Style: a calm, direct advisor. Lead with the answer in one or two sentences, bold the key figure, then a short bulleted "why". Use ₹ with Indian digit grouping (₹1,23,456). Keep it under 160 words. No headings larger than bold text."""


def run(question: str, token: str, today: date, history: list[dict] | None = None) -> dict:
    t0 = time.perf_counter()
    intent = detect_intent(question)
    lang = detect_lang(question)
    amount = parse_amount(question)
    tb = Toolbox(JavaApi(token), today, amount if intent == "afford" else None)
    trace = [{"step": "Interpret", "detail": INTENT_LABEL[intent] + (f" · amount {amount:,.0f}" if amount else "")}]

    result = None
    mode = "offline"
    if LLM_ENABLED:
        try:
            result = _run_llm(question, tb, today, history or [], trace)
            mode = "llm"
        except Exception as e:  # network, auth, refusal: fall back, never guess
            log.warning("LLM path failed, using offline planner: %s", e)
            trace.append({"step": "Fallback", "detail": f"LLM unavailable ({e.__class__.__name__}); deterministic planner used"})
            tb.calls.clear(); tb.evidence.clear(); tb.sources.clear()

    if result is None:
        trace.append({"step": "Plan", "detail": " → ".join(offline.plan(intent))})
        result = offline.answer(intent, question, tb, today)
        for c in tb.calls:
            trace.append({"step": "Act", "detail": f"{c['name']}({_args(c['args'])}) · {c['ms']} ms"})
        if result.get("compute"):
            trace.append({"step": "Compute", "detail": result["compute"]})
        trace.append({"step": "Synthesize", "detail": "Templated answer from tool figures"})

    # Spoken summary (voice mode), built from tool results only.
    spoken = speech.build(intent, lang, tb.evidence, result["answer"], today)
    if lang == "hi" and mode == "offline" and spoken:
        result["answer"] = f"**{spoken}**\n\n{result['answer']}"

    grounding = check(result["answer"] + "\n" + spoken, tb.evidence + [s["text"] for s in tb.sources], question)
    trace.append({"step": "Verify", "detail": f"{grounding['numbers']} figures checked against tool data"
                  + ("" if grounding["ok"] else f" · {len(grounding['ungrounded'])} untraced")})

    # Affordability verdict is always decided in code, whichever path wrote the prose.
    verdict = result.get("verdict")
    f = next((e for e in tb.evidence if isinstance(e, dict) and "affordability_check" in e), None)
    if intent == "afford" and f:
        a = f["affordability_check"]
        verdict = {"type": "afford", "ok": a["affordable"], "comfort": a["comfort"], "amount": a["amount"],
                   "headroom": a["safe_headroom"], "monthEndAfter": a["month_end_after_purchase"],
                   "options": a["options"], "recommended": a["recommended_option"]}

    return {
        "answer": result["answer"],
        "intent": intent,
        "lang": lang,
        "speech": spoken,
        "mode": mode,
        "tools_used": tb.calls,
        "sources": [{"n": s["n"], "id": s["id"], "title": s["title"], "section": s["section"],
                     "snippet": s["text"][:280], "source": s["source"], "score": s["score"]} for s in tb.sources],
        "verdict": verdict,
        "facts": result.get("facts", []),
        "trace": trace,
        "grounding": grounding,
        "latency_ms": round((time.perf_counter() - t0) * 1000),
    }


def _args(a: dict) -> str:
    return ", ".join(f"{k}={v!r}" for k, v in a.items() if v is not None)


def _run_llm(question: str, tb: Toolbox, today: date, history: list[dict], trace: list) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, max_retries=1, timeout=60)
    messages = [{"role": h["role"], "content": redact_text(h["content"])} for h in history[-6:] if h.get("content")]
    messages.append({"role": "user", "content": f"(Today is {today.isoformat()}.)\n\n{redact_text(question)}"})

    planned = False
    rejections = 0
    for _ in range(6):
        resp = client.beta.messages.create(
            model=LLM_MODEL,
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            tools=TOOL_SPECS,
            messages=messages,
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default", "output_config": {"effort": "low"}},
        )
        if resp.stop_reason == "refusal":
            raise RuntimeError("model declined")
        tool_uses = [b for b in resp.content if b.type == "tool_use"]
        if resp.stop_reason == "tool_use" and tool_uses:
            if not planned:
                trace.append({"step": "Plan", "detail": " → ".join(b.name for b in tool_uses)})
                planned = True
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for b in tool_uses:
                out = tb.run(b.name, dict(b.input or {}))
                c = tb.calls[-1]
                trace.append({"step": "Act", "detail": f"{c['name']}({_args(c['args'])}) · {c['ms']} ms"})
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": to_llm_json(out),
                                "is_error": "error" in out})
            messages.append({"role": "user", "content": results})
            continue

        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        if not text:
            raise RuntimeError("empty answer")
        evidence = tb.evidence + [s["text"] for s in tb.sources]
        g = check(text, evidence, question)
        if g["ok"]:
            trace.append({"step": "Synthesize", "detail": f"{LLM_MODEL} wrote the answer from tool results"})
            return {"answer": text}
        # One correction round, then the deterministic fallback.
        rejections += 1
        trace.append({"step": "Verify", "detail": f"Rejected draft: untraced figures {g['ungrounded'][:4]}"})
        if rejections > 1:
            break
        messages.append({"role": "assistant", "content": resp.content})
        messages.append({"role": "user", "content":
                         "These figures don't appear in any tool result: "
                         + ", ".join(f"{v:,.0f}" for v in g["ungrounded"][:6])
                         + ". Rewrite the answer using only figures from the tool results, or call a tool."})
    raise RuntimeError("could not produce a grounded answer")
