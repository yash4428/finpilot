"""RAG retrieval (§9): chunk trusted docs → embed → FAISS index → top-k search with citations.

Embedding model: a local TF-IDF embedder (word uni/bi-grams, L2-normalised) so the stack runs
offline and deterministically. The FAISS index stores those vectors and is searched by inner
product (= cosine). TODO: swap in a neural embedding model behind `Embedder` if needed.

Vocabulary: this is retrieval-augmented generation. We do not pretrain or fine-tune anything;
the vector DB is one component inside RAG.
"""
from __future__ import annotations

import hashlib
import json
import pickle
import re
from dataclasses import dataclass
from pathlib import Path

import faiss
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from ..config import INDEX_DIR, KNOWLEDGE_DIR

MIN_SCORE = 0.10


@dataclass
class Chunk:
    id: str
    doc: str
    title: str
    section: str
    text: str
    source: str


def load_chunks(folder: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for path in sorted(folder.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        title_m = re.search(r"^# (.+)$", raw, re.M)
        title = title_m.group(1).strip() if title_m else path.stem
        src_m = re.search(r"^Source: (.+)$", raw, re.M)
        source = src_m.group(1).strip() if src_m else "FinPilot knowledge base"
        parts = re.split(r"^## ", raw, flags=re.M)
        for i, part in enumerate(parts[1:], start=1):
            heading, _, body = part.partition("\n")
            body = body.strip()
            if not body:
                continue
            chunks.append(Chunk(id=f"{path.stem}#{i}", doc=path.name, title=title,
                                section=heading.strip(), text=body, source=source))
    return chunks


class Embedder:
    def __init__(self):
        self.vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english",
                                   token_pattern=r"(?u)\b[\w()]+\b")

    def fit(self, texts: list[str]) -> np.ndarray:
        return self._norm(self.vec.fit_transform(texts).toarray())

    def embed(self, texts: list[str]) -> np.ndarray:
        return self._norm(self.vec.transform(texts).toarray())

    @staticmethod
    def _norm(m: np.ndarray) -> np.ndarray:
        m = m.astype("float32")
        n = np.linalg.norm(m, axis=1, keepdims=True)
        n[n == 0] = 1
        return m / n


class KnowledgeStore:
    def __init__(self, folder: Path = KNOWLEDGE_DIR, index_dir: Path = INDEX_DIR):
        self.folder = folder
        self.index_dir = index_dir
        self.chunks: list[Chunk] = []
        self.embedder = Embedder()
        self.index: faiss.Index | None = None

    def _fingerprint(self) -> str:
        h = hashlib.sha256()
        for p in sorted(self.folder.glob("*.md")):
            h.update(p.name.encode())
            h.update(p.read_bytes())
        return h.hexdigest()

    def build_or_load(self) -> "KnowledgeStore":
        fp = self._fingerprint()
        meta_p = self.index_dir / "meta.json"
        if meta_p.exists() and json.loads(meta_p.read_text()).get("fingerprint") == fp:
            self.index = faiss.read_index(str(self.index_dir / "index.faiss"))
            with open(self.index_dir / "store.pkl", "rb") as f:
                self.chunks, self.embedder = pickle.load(f)
            return self
        return self.build(fp)

    def build(self, fp: str | None = None) -> "KnowledgeStore":
        self.chunks = load_chunks(self.folder)
        if not self.chunks:
            raise RuntimeError(f"No knowledge documents found in {self.folder}")
        # Headings are repeated so a chunk ranks for its own topic, not just passing mentions.
        texts = [f"{c.section}. {c.section}. {c.title}. {c.text}" for c in self.chunks]
        vectors = self.embedder.fit(texts)
        self.index = faiss.IndexFlatIP(vectors.shape[1])
        self.index.add(vectors)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(self.index_dir / "index.faiss"))
        with open(self.index_dir / "store.pkl", "wb") as f:
            pickle.dump((self.chunks, self.embedder), f)
        (self.index_dir / "meta.json").write_text(json.dumps({
            "fingerprint": fp or self._fingerprint(), "chunks": len(self.chunks), "dim": int(vectors.shape[1])}))
        return self

    def search(self, query: str, k: int = 4) -> list[dict]:
        assert self.index is not None, "call build_or_load() first"
        q = self.embedder.embed([query])
        scores, ids = self.index.search(q, min(k * 3, len(self.chunks)))
        terms = {t for t in re.findall(r"[\w()]+", query.lower()) if len(t) > 2} - {"what", "how", "the", "and", "does"}
        out = []
        for s, i in zip(scores[0], ids[0]):
            if i < 0 or s < MIN_SCORE:
                continue
            c = self.chunks[i]
            # Light rerank: a term in the section heading signals the defining passage; earlier
            # sections in a document are usually the definitions.
            heading_hits = sum(1 for t in terms if t in c.section.lower())
            position = int(c.id.split("#")[1])
            rank = float(s) + 0.03 * heading_hits - 0.004 * position
            out.append({"id": c.id, "doc": c.doc, "title": c.title, "section": c.section,
                        "text": c.text, "source": c.source, "score": round(float(s), 3), "_rank": rank})
        out.sort(key=lambda r: -r["_rank"])
        for r in out:
            r.pop("_rank")
        return out[:k]


_store: KnowledgeStore | None = None


def get_store() -> KnowledgeStore:
    global _store
    if _store is None:
        _store = KnowledgeStore().build_or_load()
    return _store
