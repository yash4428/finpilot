"""Seed the demo user with ~3 months of synthetic, realistic data (§13).

    python infra/seed/load.py            # needs the Java API to have created the schema

What it creates (all dates relative to today, so dues are always "upcoming" on demo day):
  * demo user  demo@finpilot.app / demo1234   (test credentials for the demo only)
  * HDFC savings + Paytm wallet, 2 credit cards, a personal loan and a laptop EMI
  * ~3 months of transactions: salary, monthly rent, SIP, subscriptions (Netflix, Spotify, Cult.fit,
    Airtel, BESCOM) for recurring detection, varied discretionary spend, and three planted anomalies
    (a duplicate Swiggy charge, a first-time ₹58,999 Croma purchase, an overseas charge)
  * budgets, goals, a filled tax profile, and paid/unpaid dues

Afterwards it signs in through the Java API and runs categorization, anomaly detection and the
reminder pass, so everything visible in the UI was produced by the real pipeline.
Re-running is safe: the demo user is deleted and recreated.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
from datetime import date, datetime, timedelta, timezone

import bcrypt
import httpx
import psycopg

DB_URL = os.getenv("DATABASE_URL", "postgresql://finpilot:finpilot@localhost:5432/finpilot")
JAVA = os.getenv("JAVA_API_URL", "http://localhost:8080")
EMAIL, PASSWORD, NAME = "demo@finpilot.app", "demo1234", "Aarav Mehta"

rng = random.Random(26067)
TODAY = date.today()


def d(days: int) -> date:
    return TODAY + timedelta(days=days)


def month_day(month_offset: int, day: int) -> date:
    y, m = TODAY.year, TODAY.month + month_offset
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, min(day, 28))


def wait_for_schema(conn) -> None:
    for _ in range(60):
        row = conn.execute("select to_regclass('public.transactions'), to_regclass('public.notifications')").fetchone()
        if all(row):
            cnt = conn.execute("select count(*) from categories").fetchone()[0]
            if cnt >= 10:
                return
        print("  waiting for the Java API to create the schema…")
        time.sleep(3)
    sys.exit("Schema not found. Start backend-java first.")


def generate_transactions(cards: dict, bank: int, wallet: int) -> list[dict]:
    tx: list[dict] = []
    hdfc, axis = cards["HDFC"], cards["Axis"]

    def add(day: date, merchant: str, amount: float, cat: str | None, *, card=None, account=None, desc=None):
        if day > TODAY:
            return
        tx.append({"date": day, "merchant": merchant, "amount": round(amount, 2), "category": cat,
                   "card_id": card, "account_id": None if card else (account or bank), "description": desc})

    # Fixed monthly items for the last 3 months + this month.
    for mo in (-3, -2, -1, 0):
        add(month_day(mo, 1), "ACME TECHNOLOGIES PVT LTD SALARY", 148000, "Income", desc="NEFT salary credit")
        add(month_day(mo, 3), "NoBroker Rent - Indiranagar flat", -22000, "Rent", desc="Monthly rent")
        add(month_day(mo, 5), "Zerodha Coin SIP", -10000, "Investments", desc="Nifty 50 index fund SIP")
        add(month_day(mo, 8), "Cult.fit membership", -1499, "Health", card=axis)
        add(month_day(mo, 10), "Airtel Xstream Fiber", -999, "Utilities")
        add(month_day(mo, 12), "Netflix.com", -649, "Subscriptions", card=hdfc)
        add(month_day(mo, 15), "BESCOM electricity bill", -rng.randint(1850, 2450), "Utilities")
        # Spotify raised its price last month: the autopay detective should spot it.
        add(month_day(mo, 18), "Spotify India", -119 if mo <= -2 else -139, "Subscriptions", card=axis)
        if mo < 0:
            add(month_day(mo, 17), "Bajaj Finserv personal loan EMI", -13190, "Loan EMI")
            add(month_day(mo, 20), "HDFC consumer durable EMI", -5761, "Loan EMI")
            add(month_day(mo, 11), "HDFC credit card payment", -rng.randint(36000, 44000), "Card Payment")
            add(month_day(mo, 21), "Axis credit card payment", -rng.randint(15000, 21000), "Card Payment")

    groceries = ["Blinkit", "Zepto", "BigBasket", "Swiggy Instamart", "DMart Indiranagar"]
    food = ["Swiggy", "Zomato", "Swiggy", "Zomato", "Domino's Pizza", "Chaayos"]
    cafes = ["Third Wave Coffee", "Truffles Koramangala", "Toit Brewpub", "Blue Tokai Coffee"]
    rides = ["Uber", "Ola Cabs", "Rapido", "Namma Metro"]
    shops = ["Amazon.in", "Myntra", "Flipkart", "Decathlon", "Nykaa"]

    start = TODAY - timedelta(days=95)
    day = start
    while day <= TODAY:
        weekend = day.weekday() >= 5
        if rng.random() < 0.38:
            add(day, rng.choice(groceries), -rng.randint(260, 1900), "Groceries", card=axis if rng.random() < .6 else None)
        if rng.random() < 0.5:
            add(day, rng.choice(food), -rng.randint(210, 780), "Dining", card=hdfc if rng.random() < .5 else None)
        if weekend and rng.random() < 0.6:
            add(day, rng.choice(cafes), -rng.randint(320, 1650), "Dining", card=hdfc)
        if not weekend and rng.random() < 0.7:
            r = rng.choice(rides)
            amt = rng.randint(40, 80) if r == "Namma Metro" else rng.randint(140, 420)
            add(day, r, -amt, "Transport", card=axis if rng.random() < .5 else None)
        if rng.random() < 0.12:
            add(day, rng.choice(shops), -rng.randint(499, 2799), "Shopping", card=hdfc)
        if rng.random() < 0.06:
            add(day, "BookMyShow", -rng.randint(420, 980), "Entertainment", card=hdfc)
        if rng.random() < 0.04:
            add(day, "Apollo Pharmacy", -rng.randint(240, 1150), "Health")
        if rng.random() < 0.08:
            add(day, "HP Petrol Pump", -rng.choice([300, 400, 500]), "Fuel")
        if rng.random() < 0.035:
            add(day, "Urban Company salon", -rng.choice([599, 799, 1099]), "Personal Care")
        if rng.random() < 0.05:
            add(day, "Paytm wallet top-up spend", -rng.randint(80, 300), "Other", account=wallet)
        day += timedelta(days=1)

    # Planted anomalies.
    # The big one-off sits in last month so this month's totals and budgets stay realistic.
    add(month_day(-1, 20), "CROMA ELECTRONICS KORAMANGALA", -58999, "Shopping", card=hdfc, desc="POS purchase")
    dup_day = d(-2)
    add(dup_day, "Swiggy", -1248, "Dining", card=hdfc, desc="Order #SW-88213")
    add(dup_day, "Swiggy", -1248, "Dining", card=hdfc, desc="Order #SW-88213")
    add(d(-1), "INTL*NORDLAYER VPN SINGAPORE", -6850, "Subscriptions", card=axis, desc="Foreign currency txn")

    # Leave a slice of recent, everyday transactions uncategorized for the ML categorizer to fill.
    for t in tx:
        if t["date"] >= d(-20) and t["category"] in ("Groceries", "Dining", "Transport", "Shopping") and rng.random() < 0.35:
            t["category"] = None
    return tx


def due_status(due: date) -> str:
    days = (due - TODAY).days
    return "overdue" if days < 0 else "due_soon" if days <= 5 else "upcoming"


def main() -> None:
    print(f"Seeding FinPilot demo data into {DB_URL.split('@')[-1]} (today = {TODAY})")
    with psycopg.connect(DB_URL, autocommit=False) as conn:
        wait_for_schema(conn)
        cats = {n: i for i, n in conn.execute("select id, name from categories").fetchall()}

        old = conn.execute("select id from users where lower(email) = %s", (EMAIL,)).fetchone()
        if old:
            for table in ("notifications", "chat_history", "goals", "tax_profile", "dues", "budgets",
                          "transactions", "loans", "cards", "accounts"):
                conn.execute(f"delete from {table} where user_id = %s", (old[0],))
            conn.execute("delete from users where id = %s", (old[0],))

        pw = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(10)).decode()
        uid = conn.execute(
            "insert into users (name, email, password_hash, annual_income, tax_regime) values (%s,%s,%s,%s,%s) returning id",
            (NAME, EMAIL, pw, 2100000, "new")).fetchone()[0]

        def acct(name, typ, bal):
            return conn.execute("insert into accounts (user_id, type, name, balance) values (%s,%s,%s,%s) returning id",
                                (uid, typ, name, bal)).fetchone()[0]

        bank = acct("HDFC Savings", "bank", 146380)
        wallet = acct("Paytm Wallet", "wallet", 2140)

        def card(issuer, nick, last4, limit, outstanding, stmt, due, apr):
            return conn.execute(
                """insert into cards (user_id, issuer, nickname, last4, credit_limit, outstanding, statement_date,
                   due_date, min_due, apr) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                (uid, issuer, nick, last4, limit, outstanding, stmt, due, round(outstanding * 0.05, 2), apr)).fetchone()[0]

        hdfc = card("HDFC Bank", "Regalia Gold", "4417", 300000, 42180, d(-16), d(4), 43.2)
        axis = card("Axis Bank", "ACE", "9032", 150000, 18640, d(-4), d(17), 42.0)

        def loan(typ, lender, principal, rate, tenure, emi, next_due, remaining):
            return conn.execute(
                """insert into loans (user_id, type, lender, principal, interest_rate, tenure_months, installment_amount,
                   next_due_date, remaining_installments) values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                (uid, typ, lender, principal, rate, tenure, emi, next_due, remaining)).fetchone()[0]

        pl = loan("personal", "Bajaj Finserv", 400000, 11.5, 36, 13190, d(11), 22)
        lap = loan("emi", "HDFC MacBook", 120000, 14.0, 24, 5761, d(14), 15)

        def due(stype, sid, label, amount, min_amt, due_date, status="upcoming", paid_at=None):
            conn.execute(
                """insert into dues (user_id, source_type, source_id, label, amount, min_amount, due_date, status, paid_at)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (uid, stype, sid, label, amount, min_amt, due_date, status, paid_at))

        due("card", hdfc, "HDFC Bank Regalia Gold bill", 42180, 2109, d(4), due_status(d(4)))
        due("card", axis, "Axis Bank ACE bill", 18640, 932, d(17), due_status(d(17)))
        due("loan", pl, "Bajaj Finserv personal loan EMI", 13190, 13190, d(11), due_status(d(11)))
        due("loan", lap, "HDFC MacBook EMI", 5761, 5761, d(14), due_status(d(14)))
        # Last month's history, paid on time.
        for label, sid, stype, amt, dd in [("HDFC Bank Regalia Gold bill", hdfc, "card", 39410, d(-26)),
                                           ("Axis Bank ACE bill", axis, "card", 17205, d(-13)),
                                           ("Bajaj Finserv personal loan EMI", pl, "loan", 13190, d(-19)),
                                           ("HDFC MacBook EMI", lap, "loan", 5761, d(-16))]:
            due(stype, sid, label, amt, amt, dd, "paid", datetime.combine(dd - timedelta(days=2), datetime.min.time(),
                                                                       tzinfo=timezone.utc))

        txns = generate_transactions({"HDFC": hdfc, "Axis": axis}, bank, wallet)
        with conn.cursor() as cur:
            cur.executemany(
                """insert into transactions (user_id, account_id, card_id, amount, date, merchant, description,
                   category_id, is_recurring, is_anomaly, category_confirmed)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,false,false,%s)""",
                [(uid, t["account_id"], t["card_id"], t["amount"], t["date"], t["merchant"], t["description"],
                  cats.get(t["category"]) if t["category"] else None, False) for t in txns])

        # Limits sit near the generator's typical monthly spend, so a demo shows a mix of
        # on-track, close-to-limit and over (Subscriptions, after the planted overseas charge).
        for cat, limit in [("Groceries", 13000), ("Dining", 14000), ("Transport", 5000), ("Shopping", 7000),
                           ("Entertainment", 2500), ("Subscriptions", 1500), ("Health", 3500)]:
            conn.execute("insert into budgets (user_id, category_id, limit_amount, period) values (%s,%s,%s,'monthly')",
                         (uid, cats[cat], limit))

        # Deadlines relative to today, so "goals on autopilot" stays realistic whenever the demo runs.
        for name, target, saved, deadline in [("Emergency fund", 300000, 142000, TODAY + timedelta(days=420)),
                                              ("Goa trip with friends", 45000, 30000, TODAY + timedelta(days=95)),
                                              ("Parents' anniversary gift", 40000, 18000, TODAY + timedelta(days=125))]:
            conn.execute("insert into goals (user_id, name, target_amount, saved_amount, deadline) values (%s,%s,%s,%s,%s)",
                         (uid, name, target, saved, deadline))

        deductions = {"sec80C": 102000, "sec80D": 12000, "sec80CCD1B": 0, "hraExemption": 144000,
                      "homeLoanInterest": 0, "sec80TTA": 4200}
        conn.execute(
            """insert into tax_profile (user_id, fy, gross_income, deductions_json, regime, estimated_tax)
               values (%s,'2026-27',%s,%s::jsonb,'new',null)""", (uid, 2100000, json.dumps(deductions)))
        conn.commit()
        print(f"  user {EMAIL} (id {uid}): {len(txns)} transactions, 2 cards, 2 loans, 7 budgets, 3 goals")

    run_pipeline()


def run_pipeline() -> None:
    """Categorize, flag anomalies, detect recurring costs and send reminders via the real services."""
    try:
        with httpx.Client(base_url=JAVA, timeout=90) as c:
            tok = c.post("/auth/login", json={"email": EMAIL, "password": PASSWORD}).raise_for_status().json()["token"]
            h = {"Authorization": f"Bearer {tok}"}
            print("  analyze:", c.post("/transactions/analyze", headers=h).raise_for_status().json())
            sts = c.get("/forecast", headers=h).raise_for_status().json()
            print(f"  forecast ({sts['model']}): disposable now {sts['disposableNow']}, month-end {sts['predictedMonthEnd']}")
            print("  reminders:", c.post("/dues/refresh", headers=h).raise_for_status().json())
    except Exception as e:  # The data is in; the pipeline can be re-run from the UI later.
        print(f"  ! could not run the ML pipeline through the API ({e}). Start backend-java and backend-python, then re-run.")
    print(f"Done. Sign in with {EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    main()
