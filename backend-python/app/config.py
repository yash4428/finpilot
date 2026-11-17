"""Settings from environment. Secrets are never hardcoded."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal-key")
JAVA_API_URL = os.getenv("JAVA_API_URL", "http://localhost:8080")
KNOWLEDGE_DIR = Path(os.getenv("KNOWLEDGE_DIR", str(ROOT.parent / "knowledge")))
INDEX_DIR = Path(os.getenv("INDEX_DIR", str(ROOT / "data")))

# LLM (used as-is via API: no fine-tuning, no pretraining). Without a key the agent
# runs its deterministic offline planner, which uses the same tools and grounding rules.
# Provider: Google Gemini by default; Anthropic Claude is still supported.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini" if GEMINI_API_KEY else "anthropic" if ANTHROPIC_API_KEY else "none")
LLM_MODEL = os.getenv("LLM_MODEL", {"gemini": "gemini-3.5-flash-lite", "anthropic": "claude-opus-5-5"}.get(LLM_PROVIDER, ""))
# Tried in order when the main model is overloaded (503/504/timeout), before the offline planner.
LLM_FALLBACK_MODELS = [m.strip() for m in os.getenv(
    "LLM_FALLBACK_MODELS", "gemini-3-flash-preview,gemini-flash-lite-latest" if LLM_PROVIDER == "gemini" else "").split(",") if m.strip()]
# Seconds per LLM request; on timeout the agent falls back to the offline planner instead of hanging.
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "25"))
_HAS_KEY = {"gemini": GEMINI_API_KEY, "anthropic": ANTHROPIC_API_KEY}.get(LLM_PROVIDER, "")
LLM_ENABLED = bool(_HAS_KEY) and os.getenv("AGENT_MODE", "auto") != "offline"
