from datetime import date, timedelta

from app.ml import anomaly, categorizer, forecaster

TODAY = date(2026, 10, 6)


def _history():
    tx, i = [], 0
    for m in (7, 8, 9):
        for day, merchant, amt, cat in [(1, "ACME SALARY", 148000, "Income"), (3, "Rent to landlord", -22000, "Rent"),
                                        (12, "Netflix.com", -649, "Subscriptions"), (15, "BESCOM electricity", -2100, "Utilities")]:
            i += 1
            tx.append({"id": i, "date": date(2026, m, day).isoformat(), "merchant": merchant, "amount": amt, "category": cat})
    d = date(2026, 7, 1)
    while d < TODAY:
        i += 1
        tx.append({"id": i, "date": d.isoformat(), "merchant": ["Swiggy", "Blinkit", "Uber"][i % 3],
                   "amount": -(300 + (i * 37) % 500), "category": ["Dining", "Groceries", "Transport"][i % 3]})
        d += timedelta(days=1)
    for day, merchant, amt, cat in [(1, "ACME SALARY", 148000, "Income"), (3, "Rent to landlord", -22000, "Rent")]:
        i += 1
        tx.append({"id": i, "date": date(2026, 10, day).isoformat(), "merchant": merchant, "amount": amt, "category": cat})
    return tx


def test_rules_and_model_categorize():
    out = categorizer.categorize([
        {"id": 1, "merchant": "NoBroker RENT", "amount": -22000},
        {"id": 2, "merchant": "Swiggy", "amount": -400},
        {"id": 3, "merchant": "Croma Electronics", "amount": -58999},
        {"id": 4, "merchant": "ACME SALARY", "amount": 140000},
        {"id": 5, "merchant": "Third Wave Coffee Roasters", "amount": -280},
    ])
    cats = {r["id"]: r["category"] for r in out}
    assert cats == {1: "Rent", 2: "Dining", 3: "Shopping", 4: "Income", 5: "Dining"}


def test_user_corrections_are_learned():
    item = [{"id": 1, "merchant": "Zorblax Studio", "amount": -1500}]
    examples = [{"text": "Zorblax Studio", "category": "Education"}]
    assert categorizer.categorize(item, examples)[0]["category"] == "Education"


def test_recurring_detection_finds_monthly_bills_not_daily_shops():
    rec = forecaster.detect_recurring(_history(), TODAY)
    merchants = {r["merchant"] for r in rec}
    assert {"Netflix.com", "BESCOM electricity", "Rent to landlord", "ACME SALARY"} <= merchants
    assert "Swiggy" not in merchants
    netflix = next(r for r in rec if r["merchant"] == "Netflix.com")
    assert netflix["day"] == 12 and not netflix["paid_this_month"]


def test_forecast_breakdown_adds_up():
    dues = [{"label": "Card bill", "amount": 40000, "due_date": "2026-10-10", "type": "card"}]
    f = forecaster.forecast(TODAY, 150000, _history(), dues)
    total = sum(b["amount"] for b in f["breakdown"])
    assert abs(total - f["predicted_month_end"]) < 0.05
    kinds = [b["kind"] for b in f["breakdown"]]
    assert kinds[0] == "start" and "due" in kinds and "recurring" in kinds and "variable" in kinds
    # Rent and salary were already paid this month, so they must not be subtracted/added again.
    labels = {b["label"] for b in f["breakdown"]}
    assert "Rent to landlord" not in labels and "ACME SALARY" not in labels


def test_anomaly_flags_spike_and_duplicate():
    tx = _history()
    tx.append({"id": 9001, "date": "2026-10-02", "merchant": "CROMA", "amount": -58999, "category": "Shopping"})
    tx.append({"id": 9002, "date": "2026-10-04", "merchant": "Swiggy", "amount": -1248, "category": "Dining"})
    tx.append({"id": 9003, "date": "2026-10-04", "merchant": "Swiggy", "amount": -1248, "category": "Dining"})
    res = {r["id"]: r for r in anomaly.score(tx)}
    assert res[9001]["is_anomaly"] and "First payment" in res[9001]["reason"]
    assert res[9003]["is_anomaly"] and "duplicate" in res[9003]["reason"]
    assert not res[9002]["is_anomaly"]
    normal = [r for r in res.values() if r["is_anomaly"] and r["id"] < 9000]
    assert len(normal) <= 2
