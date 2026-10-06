"""FinPilot ML + agent service. Internal only: called by the Java backend (§6.1)."""
from __future__ import annotations

import logging
from datetime import date

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .agent import core
from .config import INTERNAL_API_KEY, LLM_ENABLED, LLM_MODEL
from .ml import anomaly, categorizer, forecaster
from .rag.store import get_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = FastAPI(title="FinPilot ML & Agent", version="1.0.0")


def internal_only(x_internal_key: str = Header(default="")):
    if x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="internal key required")


@app.on_event("startup")
def warm():
    store = get_store()
    logging.getLogger("finpilot").info("Knowledge index ready: %d chunks. LLM: %s",
                                        len(store.chunks), LLM_MODEL if LLM_ENABLED else "offline planner")


@app.get("/health")
def health():
    return {"status": "ok", "llm": LLM_MODEL if LLM_ENABLED else "offline", "chunks": len(get_store().chunks)}


# ---- /ml/categorize --------------------------------------------------------------------

class CatItem(BaseModel):
    id: int
    merchant: str = ""
    description: str | None = ""
    amount: float


class CatExample(BaseModel):
    text: str
    category: str


class CatReq(BaseModel):
    transactions: list[CatItem]
    examples: list[CatExample] = Field(default_factory=list)


@app.post("/ml/categorize", dependencies=[Depends(internal_only)])
def categorize(req: CatReq):
    return {"results": categorizer.categorize([t.model_dump() for t in req.transactions],
                                              [e.model_dump() for e in req.examples])}


# ---- /ml/forecast ----------------------------------------------------------------------

class Txn(BaseModel):
    id: int
    date: str
    merchant: str = ""
    amount: float
    category: str = "Other"
    is_anomaly: bool = False


class Due(BaseModel):
    label: str
    amount: float
    due_date: str
    type: str


class ForecastReq(BaseModel):
    today: str
    balance: float
    transactions: list[Txn]
    known_dues: list[Due] = Field(default_factory=list)


@app.post("/ml/forecast", dependencies=[Depends(internal_only)])
def forecast(req: ForecastReq):
    return forecaster.forecast(date.fromisoformat(req.today), req.balance,
                               [t.model_dump() for t in req.transactions], [d.model_dump() for d in req.known_dues])


# ---- /ml/anomaly -----------------------------------------------------------------------

class AnomalyReq(BaseModel):
    transactions: list[Txn]


@app.post("/ml/anomaly", dependencies=[Depends(internal_only)])
def detect(req: AnomalyReq):
    return {"results": anomaly.score([t.model_dump() for t in req.transactions]), "model": "isolation-forest"}


# ---- /agent/query ----------------------------------------------------------------------

class AgentReq(BaseModel):
    question: str
    user_token: str
    today: str | None = None
    history: list[dict] = Field(default_factory=list)


@app.post("/agent/query", dependencies=[Depends(internal_only)])
def agent_query(req: AgentReq):
    today = date.fromisoformat(req.today) if req.today else date.today()
    return core.run(req.question, req.user_token, today, req.history)
