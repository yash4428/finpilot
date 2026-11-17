"""Agent loop (§8): Interpret → Plan → Act → Compute → Synthesize, then Verify.

LLM path: a hosted model (Google Gemini by default, Anthropic Claude optional) used as-is
through the API with tool calling. It plans and
writes prose; numbers come only from tools. Every answer is checked by `grounding.check`; an
answer with an untraceable figure is sent back once for correction and otherwise replaced by
the deterministic composer.

Offline path: the same tools and checks with a rule-based planner (no API key needed).
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import date

from ..config import (ANTHROPIC_API_KEY, GEMINI_API_KEY, LLM_ENABLED, LLM_FALLBACK_MODELS, LLM_MODEL, LLM_PROVIDER,
                      LLM_TIMEOUT)
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
3. Advice or "what is" questions must use search_knowledge and cite the passages you rely on as [n] using each result's ref, written exactly like [1] or [2]. Never cite tool names. If nothing relevant comes back, say you couldn't find it in the trusted documents instead of guessing.
4. For affordability, use forecast_balance; its affordability_check field is computed exactly in code. State its verdict; don't recompute it differently.
5. Any answer about tax ends with: "_Estimate only — consult a tax professional before filing._"
6. Reply in the language named in the user's message note: English, or simple Hinglish written in Roman script. Keep figures in ₹.

Style: a calm, direct advisor. Lead with the answer in one or two sentences, bold the key figure, then a short bulleted "why". Use ₹ with Indian digit grouping (₹1,23,456), rounded to whole rupees. Keep it under 160 words. No headings larger than bold text."""


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
            runner = _run_gemini if LLM_PROVIDER == "gemini" else _run_llm
            result = runner(question, tb, today, history or [], trace)
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
    messages.append({"role": "user", "content": _user_turn(question, today)})

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

        text = clean_citations("".join(b.text for b in resp.content if b.type == "text").strip())
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


GROUNDING_RETRY = ("These figures don't appear in any tool result: {nums}. Rewrite the answer using only figures "
                   "from the tool results, or call a tool.")


def _user_turn(question: str, today: date) -> str:
    lang = "simple Hinglish (Roman script)" if detect_lang(question) == "hi" else "English"
    return f"(Today is {today.isoformat()}. Reply in {lang}.)\n\n{redact_text(question)}"


_TOOL_NAMES = "get_transactions|get_dues|get_budget|forecast_balance|compute_payoff|estimate_tax|search_knowledge"


def clean_citations(text: str) -> str:
    """Normalise citation styles to the [n] form the UI renders; drop tool-name 'citations'."""
    text = re.sub(r"\[(?:ref|source|refs)[:\s]*(\d+)\]", r"[\1]", text, flags=re.I)
    text = re.sub(r"\[(\d+(?:\s*,\s*\d+)+)\]", lambda m: " ".join(f"[{n.strip()}]" for n in m.group(1).split(",")), text)
    # Mixed or tool-only brackets: keep the passage numbers, drop tool names.
    def fix(m):
        nums = [x.strip() for x in m.group(1).split(",") if x.strip().isdigit()]
        return (" " + " ".join(f"[{n}]" for n in nums)) if nums else ""
    text = re.sub(rf"\s*\[((?:\s*(?:{_TOOL_NAMES}|\d+)\s*,?)+)\]", fix, text)
    return text


def _gemini_tools():
    from google.genai import types

    return [types.Tool(function_declarations=[
        types.FunctionDeclaration(name=t["name"], description=t["description"], parameters_json_schema=t["input_schema"])
        for t in TOOL_SPECS])]


def _run_gemini(question: str, tb: Toolbox, today: date, history: list[dict], trace: list) -> dict:
    """Same loop as the Claude path: the model plans tool calls; numbers only come from tools."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY, http_options=types.HttpOptions(
        api_version="v1beta", timeout=int(LLM_TIMEOUT * 1000), retry_options=types.HttpRetryOptions(attempts=1)))
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=_gemini_tools(),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        # Answers here are short and tool-driven; deep thinking only adds latency (voice mode).
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
    )
    contents = [types.Content(role="model" if h["role"] == "assistant" else "user",
                              parts=[types.Part(text=redact_text(h["content"]))])
                for h in history[-6:] if h.get("content")]
    contents.append(types.Content(role="user", parts=[types.Part(text=_user_turn(question, today))]))

    planned, rejections = False, 0
    model = None  # chosen on the first call, then kept: thought signatures are tied to the model
    for _ in range(6):
        resp, model = _gemini_generate(client, model, contents, config, trace)
        cand = (resp.candidates or [None])[0]
        if cand is None or cand.content is None:
            raise RuntimeError(f"no answer (finish reason {getattr(cand, 'finish_reason', None)})")
        calls = resp.function_calls or []
        if calls:
            if not planned:
                trace.append({"step": "Plan", "detail": " → ".join(c.name for c in calls)})
                planned = True
            # Send the model's turn back unchanged (it carries thought signatures).
            contents.append(cand.content)
            parts = []
            for c in calls:
                out = tb.run(c.name, dict(c.args or {}))
                rec = tb.calls[-1]
                trace.append({"step": "Act", "detail": f"{rec['name']}({_args(rec['args'])}) · {rec['ms']} ms"})
                parts.append(types.Part(function_response=types.FunctionResponse(
                    id=c.id, name=c.name, response={"result": json.loads(to_llm_json(out))})))
            contents.append(types.Content(role="user", parts=parts))
            continue

        text = clean_citations((resp.text or "").strip())
        if not text:
            raise RuntimeError("empty answer")
        g = check(text, tb.evidence + [s["text"] for s in tb.sources], question)
        if g["ok"]:
            trace.append({"step": "Synthesize", "detail": f"{model} wrote the answer from tool results"})
            return {"answer": text}
        rejections += 1
        trace.append({"step": "Verify", "detail": f"Rejected draft: untraced figures {g['ungrounded'][:4]}"})
        if rejections > 1:
            break
        contents.append(cand.content)
        contents.append(types.Content(role="user", parts=[types.Part(
            text=GROUNDING_RETRY.format(nums=", ".join(f"{v:,.0f}" for v in g["ungrounded"][:6])))]))
    raise RuntimeError("could not produce a grounded answer")


def _gemini_generate(client, model, contents, config, trace):
    """Call Gemini. Overload errors (503/504/timeouts) get one quick retry on the same model; on the
    first call we may also move to a fallback model. Anything else propagates to the offline fallback."""
    from google.genai import errors

    def transient(e):
        if isinstance(e, errors.ServerError):
            return True
        if isinstance(e, errors.ClientError):
            return getattr(e, "code", None) in (404, 429)  # missing model / quota: try another model
        return "timed out" in str(e).lower() or "timeout" in type(e).__name__.lower()

    candidates = [model] if model else [LLM_MODEL, *LLM_FALLBACK_MODELS]
    last = None
    for m in candidates:
        for attempt in range(2):
            try:
                return client.models.generate_content(model=m, contents=contents, config=config), m
            except Exception as e:  # noqa: BLE001
                if (isinstance(e, errors.ClientError) and getattr(e, "code", None) == 400
                        and "thinking" in str(e).lower() and config.thinking_config):
                    config.thinking_config = None  # older model without thinking levels
                    continue
                if not transient(e):
                    raise
                last = e
                code = getattr(e, "code", type(e).__name__)
                if attempt == 0 and code not in (404, 429):
                    trace.append({"step": "Retry", "detail": f"{m} busy ({code}); retrying"})
                    time.sleep(1.2)
                    continue
                break
        trace.append({"step": "Retry", "detail": f"{m} unavailable; trying next model"})
    raise last
