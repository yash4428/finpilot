from datetime import date

from app.agent import offline
from app.agent.grounding import check, extract_numbers
from app.agent.parse import detect_intent, parse_amount, parse_period
from app.agent.redact import redact_text
from app.agent.tools import Toolbox, affordability, simulate

TODAY = date(2026, 10, 6)


class FakeApi:
    """Stands in for the Java API so the agent can be tested without a server."""

    def get(self, path, **params):
        if path == "/forecast":
            return {"asOf": "2026-10-06", "monthEnd": "2026-10-31", "daysLeft": 25, "balance": 148520,
                    "disposableNow": 68749, "disposableBreakdown": [{"label": "HDFC", "amount": 148520}],
                    "predictedMonthEnd": 33662, "monthEndBreakdown": [{"label": "Card", "amount": -42180, "kind": "due"}],
                    "recurring": [], "variableDaily": 1189, "headroom": 33662, "model": "ml:linear-regression"}
        if path == "/dues":
            return {"horizonDays": 30, "total": 42180, "dues": [
                {"label": "HDFC bill", "sourceType": "card", "amount": 42180, "minAmount": 2109,
                 "dueDate": "2026-10-10", "status": "due_soon"}]}
        raise AssertionError(path)


def test_intent_routing():
    assert detect_intent("Can I afford a ₹20,000 phone this month?") == "afford"
    assert detect_intent("How much did I spend on food last month?") == "spend"
    assert detect_intent("How can I save tax?") == "tax"
    assert detect_intent("What is 80C?") == "knowledge"
    assert detect_intent("What bills are due?") == "dues"
    assert detect_intent("Which debt should I pay off first?") == "payoff"


def test_amount_and_period_parsing():
    assert parse_amount("afford a 50k laptop") == 50000
    assert parse_amount("₹1,20,000 bike") == 120000
    assert parse_amount("1.5 lakh course") == 150000
    assert parse_amount("last 30 days") is None
    start, end, label = parse_period("spent last month", TODAY)
    assert (start.isoformat(), end.isoformat(), label) == ("2026-09-01", "2026-09-30", "September 2026")


def test_grounding_rejects_invented_numbers():
    evidence = [{"headroom": 33662.0, "amount": 20000}]
    assert check("You have **₹33,662** of headroom; after buying you'd have ₹13,662.", evidence)["ok"]
    bad = check("You'll save ₹4,500 by switching.", evidence)
    assert not bad["ok"] and 4500 in bad["ungrounded"]
    assert extract_numbers("₹1.5L and 20k and 80C") == [150000.0, 20000.0]


def test_redaction():
    s = redact_text("mail a@b.com card 4111 1111 1111 1111 pan ABCDE1234F acct 123456789012")
    assert "a@b.com" not in s and "4111" not in s and "ABCDE1234F" not in s and "123456789012" not in s


def test_affordability_is_computed_in_code():
    f = {"safe_headroom": 33662, "predicted_month_end": 33662, "disposable_now": 68749}
    assert affordability(f, 20000)["affordable"] and affordability(f, 20000)["comfort"] == "tight"
    assert not affordability(f, 50000)["affordable"] and affordability(f, 50000)["shortfall"] == 16338


def test_offline_affordability_answer_is_grounded():
    tb = Toolbox(FakeApi(), TODAY)
    r = offline.answer("afford", "Can I afford a ₹20,000 phone?", tb, TODAY)
    assert r["verdict"]["ok"] is True
    assert [c["name"] for c in tb.calls] == ["forecast_balance", "get_dues"]
    assert check(r["answer"], tb.evidence, "Can I afford a ₹20,000 phone?")["ok"]


def test_avalanche_beats_snowball_on_interest():
    debts = [{"name": "Card", "balance": 40000, "apr": 42, "min": 2000},
             {"name": "Loan", "balance": 20000, "apr": 11, "min": 1500}]
    a = simulate(debts, 5000, key=lambda d: -d["apr"])
    s = simulate(debts, 5000, key=lambda d: d["balance"])
    assert a["order"][0] == "Card" and s["order"][0] == "Loan"
    assert a["total_interest"] < s["total_interest"]
