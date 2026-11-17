"""Exercises the LLM agent loop with a scripted fake Claude client (no network, no key)."""
from datetime import date
from types import SimpleNamespace as NS

import anthropic

from app.agent import core
from tests.test_agent import FakeApi

TODAY = date(2026, 10, 6)


def _tool_use(name, args, id_="tu_1"):
    return NS(stop_reason="tool_use", content=[NS(type="tool_use", name=name, input=args, id=id_)])


def _text(t):
    return NS(stop_reason="end_turn", content=[NS(type="text", text=t)])


class ScriptedClient:
    def __init__(self, script):
        self.script = list(script)
        self.requests = []
        self.beta = NS(messages=NS(create=self._create))

    def _create(self, **kw):
        self.requests.append(kw)
        return self.script.pop(0)


def _run(monkeypatch, script, question):
    client = ScriptedClient(script)
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kw: client)
    monkeypatch.setattr(core, "LLM_ENABLED", True)
    monkeypatch.setattr(core, "JavaApi", lambda token: FakeApi())
    return core.run(question, "token", TODAY), client


def test_llm_answer_from_tool_results(monkeypatch):
    out, client = _run(monkeypatch, [
        _tool_use("forecast_balance", {}),
        _text("**Yes, but it's tight.** Your safe headroom is ₹33,662, so ₹20,000 leaves about ₹13,662."),
    ], "Can I afford a ₹20,000 phone?")
    assert out["mode"] == "llm" and out["grounding"]["ok"]
    assert [t["name"] for t in out["tools_used"]] == ["forecast_balance"]
    assert out["verdict"]["ok"] is True  # decided in code, not by the model
    # The tool result handed to the model carried the exact affordability check.
    tool_msg = client.requests[1]["messages"][-1]["content"][0]
    assert tool_msg["type"] == "tool_result" and "affordability_check" in tool_msg["content"]
    assert client.requests[0]["model"] == core.LLM_MODEL


def test_ungrounded_llm_answer_falls_back_to_deterministic(monkeypatch):
    out, _ = _run(monkeypatch, [
        _tool_use("forecast_balance", {}),
        _text("You can spend ₹45,000 safely."),  # invented figure
        _text("Still ₹45,000."),                 # invented again after correction
        _text("Still ₹45,000."), _text("x"), _text("x"), _text("x"),
    ], "How much will I have at month end?")
    assert out["mode"] == "offline"
    assert "45,000" not in out["answer"] and out["grounding"]["ok"]
    assert any(s["step"] == "Fallback" for s in out["trace"])


# ---- Gemini path ---------------------------------------------------------------------

class _GeminiResp:
    def __init__(self, calls=None, text=None):
        self.function_calls = calls
        self.text = text
        self.candidates = [NS(content=NS(role="model", parts=[]), finish_reason="STOP")]


class FakeGenai:
    def __init__(self, script):
        self.script = list(script)
        self.requests = []
        self.models = NS(generate_content=self._gen)

    def _gen(self, **kw):
        self.requests.append(kw)
        return self.script.pop(0)


def _run_gemini(monkeypatch, script, question):
    from google import genai

    client = FakeGenai(script)
    monkeypatch.setattr(genai, "Client", lambda **kw: client)
    monkeypatch.setattr(core, "LLM_ENABLED", True)
    monkeypatch.setattr(core, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(core, "JavaApi", lambda token: FakeApi())
    return core.run(question, "token", TODAY), client


def test_gemini_answer_from_tool_results(monkeypatch):
    out, client = _run_gemini(monkeypatch, [
        _GeminiResp(calls=[NS(name="forecast_balance", args={}, id="c1")]),
        _GeminiResp(text="Haan, le sakte ho! Aapke paas **₹33,662** safe hai."),
    ], "Kya main 20 hazaar ka phone le sakta hoon?")
    assert out["mode"] == "llm" and out["grounding"]["ok"] and out["lang"] == "hi"
    assert [t["name"] for t in out["tools_used"]] == ["forecast_balance"]
    sent = client.requests[1]["contents"][-1].parts[0].function_response
    assert sent.name == "forecast_balance" and "affordability_check" in sent.response["result"]


def test_gemini_invented_number_falls_back(monkeypatch):
    out, _ = _run_gemini(monkeypatch, [
        _GeminiResp(calls=[NS(name="forecast_balance", args={}, id="c1")]),
        _GeminiResp(text="You can safely spend ₹45,000."),
        _GeminiResp(text="Still ₹45,000."),
    ], "How much will I have at month end?")
    assert out["mode"] == "offline" and "45,000" not in out["answer"]
