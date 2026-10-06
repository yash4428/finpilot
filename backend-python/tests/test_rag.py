from app.rag.store import get_store


def test_retrieves_relevant_sections_with_citations():
    s = get_store()
    hit = s.search("how to improve credit score", 1)[0]
    assert hit["section"] == "How to improve a credit score" and hit["source"]
    assert any("HRA" in h["section"] for h in s.search("what is HRA", 3))


def test_unrelated_question_returns_nothing():
    assert s_empty("recipe for butter chicken with naan")


def s_empty(q):
    return get_store().search(q, 3) == []
