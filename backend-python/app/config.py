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
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-opus-5-5")
LLM_ENABLED = bool(ANTHROPIC_API_KEY) and os.getenv("AGENT_MODE", "auto") != "offline"
