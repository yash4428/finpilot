# FinPilot — Slide-by-slide script (draft for approval)

**12 slides · about 9 minutes spoken.** Each slide lists what goes *on* the slide, the screenshot we'll use, and the
script to speak. Things in [square brackets] need your input (team names, college, course).

---

## Slide 1 — Title
**On slide:** FinPilot · *Know what's actually yours to spend.* · A personal-finance app with an AI co-pilot that never makes up a number · [Team members] · [Course, college, semester]
**Screenshot:** Login screen (dark panel with the tagline and the gold "yours to keep" strip)
**Time:** ~30 s

> Good [morning/afternoon]. We're [team names], and this is **FinPilot** — a personal-finance app that brings your cards, loans, EMIs, spending, budgets and taxes into one place, with an AI co-pilot called **Pilot** on top. The idea in one line: FinPilot tells you what money is *actually yours to spend*, and its AI answers your money questions using your real data — it never invents a number.

---

## Slide 2 — The problem
**On slide:**
- Money is scattered: 2–3 credit cards, EMIs, UPI apps, bank SMS
- Your bank balance is misleading — bills and EMIs are already "spent"
- Due dates get missed → late fees, interest, lower credit score
- AI chatbots answer money questions confidently… and make numbers up
**Screenshot:** none (simple icon row or a "₹1,48,520 in the bank ≠ ₹1,48,520 to spend" callout)
**Time:** ~45 s

> Think about a typical salaried person in India. Their money is spread across two or three credit cards, a personal loan, a laptop EMI, and a few UPI apps. When they open their banking app, they see a balance — say one and a half lakh — and feel rich. But a big chunk of that is already committed to card bills and EMIs due this month. People miss due dates, pay interest and late fees, and don't notice subscriptions quietly going up. And when they ask an AI chatbot "can I afford this?", it answers confidently — with numbers it simply made up. That's the gap we wanted to close.

---

## Slide 3 — Our solution
**On slide:** Three pillars
1. **One dashboard** — cards, loans, dues, spending, budgets, goals, tax
2. **Safe-to-spend** — your real spendable money, not just your balance
3. **Pilot, the AI co-pilot** — ask in English, Hinglish or Hindi, by text or voice; every figure comes from your data
**Screenshot:** Overview dashboard (full page, top half)
**Time:** ~40 s

> FinPilot solves this with three things. First, one dashboard for everything — cards, loans, dues, spending, budgets, goals and tax. Second, a **safe-to-spend** number instead of a raw balance. Third, **Pilot**, an AI co-pilot you can talk to in English, Hinglish or Hindi — by typing or by voice. And Pilot has one hard rule built into the code: every number it says must come from your actual data.

---

## Slide 4 — How it's built (architecture)
**On slide:** Architecture diagram
React frontend → **Java Spring Boot** (auth, business logic, daily scheduler) ⇄ **PostgreSQL** → **Python FastAPI** (ML models, AI agent, knowledge search) → **Google Gemini**. Pilot's tools call *back* into the Java API for real numbers.
Tech row: React · Recharts · Spring Boot · JWT · PostgreSQL · FastAPI · scikit-learn · FAISS · Gemini · Docker Compose
**Screenshot:** none (diagram)
**Time:** ~50 s

> Under the hood there are two backends, as the course requires. The React frontend talks only to a **Java Spring Boot** server — it's the system of record: login with JWT tokens, all the business rules, the dues engine, and a scheduled job that runs every morning. Data lives in **PostgreSQL**. For the intelligent parts, Java calls a **Python FastAPI** service, which runs our machine-learning models, the AI agent, and a knowledge search. The agent uses **Google Gemini** — but here's the key design choice: when Pilot needs a number, it doesn't guess. It calls a tool, and that tool calls *back* into the Java API with the user's own login, so it only ever sees that user's real data.

---

## Slide 5 — Safe-to-spend, the headline feature
**On slide:**
- **Safe to spend now** = bank balance − card bills and EMIs due this month
- **Predicted month-end** = minus recurring bills (rent, Netflix…) and usual daily spending — forecast by an ML model
- **Spend today** = a daily allowance that still keeps 10% of income as savings
- "Thinking of buying something?" → instant verdict + smarter EMI option
**Screenshot:** Overview → safe-to-spend card with the strip, a ₹90,000 amount typed in (red verdict + EMI hint)
**Time:** ~60 s

> This is the heart of FinPilot. Instead of one balance, you see two numbers. **Safe to spend now** is your balance minus every card bill and EMI due this month. **Predicted on 30th** looks further ahead: it also subtracts your recurring bills — rent, electricity, Netflix — which our system detects automatically, and your usual day-to-day spending, which a **machine-learning regression model** forecasts from your history. The strip shows exactly how the money peels away, and you can open the full breakdown — nothing is a black box. On top, **Spend today** gives a daily allowance that still saves 10% of your income. And if you're thinking of buying something, type the price: it tells you instantly if it fits — and if it doesn't, it suggests a smarter way, like a no-cost EMI.

---

## Slide 6 — Smart transactions: AI that learns your spending
**On slide:**
- **Auto-categorisation** — rules + ML classifier (TF-IDF + Logistic Regression); learns when you correct it
- **CSV bank-statement import** — 11 rows imported, categorised and checked in seconds
- **Unusual-charge detection** — Isolation Forest, with a plain reason: *"Looks like a duplicate"*, *"40× your usual Shopping spend"*
- **Autopay detective** — finds subscriptions and bills, yearly cost, and **price rises** (Spotify +₹20)
**Screenshots:** Transactions page with flagged rows · Autopay detective card
**Time:** ~60 s

> Every transaction is categorised automatically. We combine simple rules with a machine-learning text classifier, and when you correct a category, that correction becomes training data — so it learns your habits. Since Indian banks don't give open APIs to student projects, we support **CSV bank-statement import**, the way real users export statements. Then our **anomaly detector** — an Isolation Forest model — flags unusual charges, and always says *why*: a duplicate Swiggy order, a first-time ₹59,000 electronics purchase, an overseas charge. Finally, the **autopay detective** finds every subscription and bill, shows what they cost you per year — here about sixty-four thousand rupees — and even catches price rises, like Spotify going up by twenty rupees.

---

## Slide 7 — Never miss a due date: dues, budgets, goals
**On slide:**
- **Dues engine** — every card bill and EMI on one timeline; reminders 5 days before, daily 8 AM job
- **Mark paid** → next month's EMI scheduled automatically
- **Budgets** — limit per category with a "where you should be today" marker; alerts at 80% and 100%
- **Goals on autopilot** — "Save ₹X/month to reach it", checked against your monthly surplus
**Screenshots:** Dues page · Goals page
**Time:** ~50 s

> When you add a card or a loan, FinPilot creates its dues automatically. A scheduled job runs every morning, moves bills from upcoming to due-soon to overdue, and sends reminders five days ahead. Mark an EMI paid and next month's instalment appears on its own. Budgets show not just how much you've spent, but a marker for where you *should* be at this point in the month — so you catch overspending early. And goals run on **autopilot**: FinPilot works out how much to save each month for each goal, and checks it against what you actually have left over every month.

---

## Slide 8 — Tax and financial health
**On slide:**
- **Tax**: old vs new regime, slab-by-slab math (FY 2026-27 rules), live what-if sliders for 80C, 80D, NPS, HRA, return-prep checklist
- **FinPilot score (0–100)**: savings rate · debt load · safety net · discipline — with a "focus next" tip
- **Credit health**: simulated 300–900 score from card utilisation and payment history
**Screenshots:** Tax page · FinPilot score card
**Time:** ~50 s

> For tax, FinPilot compares the old and new regimes using the actual slab rules, standard deduction, the 87A rebate and cess — and shows every step of the calculation. You can drag sliders for 80C, health insurance or NPS and watch the tax change live. For our demo user, the new regime saves almost one and a half lakh. The **FinPilot score** rates overall financial health out of 100 across four areas — savings rate, debt load, emergency cushion and discipline — and tells you what to fix next. We also show a simulated credit score, clearly labelled, based on card utilisation and on-time payments.

---

## Slide 9 — Pilot: an AI agent that can't make numbers up
**On slide:**
- Agent loop: **Interpret → Plan → Act (tools) → Compute → Write → Verify**
- 7 tools: transactions · dues · budgets · forecast · debt payoff · tax · knowledge search
- **RAG**: advice comes from 8 trusted documents (tax rules, 80C/80D, HRA, credit, debt…) with **[1] [2] citations**
- **Grounding check**: every figure is matched against tool data — "8 figures traced to your data"
- Works offline too: if the AI is busy, a rule-based planner answers with the same tools
**Screenshot:** Pilot chat — an affordability answer with the EMI table, sources and the expanded "How Pilot worked this out" trace
**Time:** ~70 s

> Pilot is a real AI agent, not just a chatbot. When you ask a question, it first understands the intent, plans which tools it needs, calls them to fetch your real data, does the calculation in code, and only then writes the answer. For advice questions like "what is 80C?", it uses **retrieval-augmented generation** — it searches our library of trusted tax and finance documents and cites the exact source. And here's what makes it trustworthy: after the AI writes its answer, our code checks *every single number* against the data the tools returned. If the AI invents a figure, the answer is rejected and rewritten. You can see this under every answer — "8 figures traced to your data" — and you can open the full trace of what Pilot did. We also built it to be robust: if the AI service is overloaded, Pilot falls back to a rule-based planner with the same tools, so you never get a wrong number or an error.

---

## Slide 10 — The wow moment: just ask, in Hinglish
**On slide:** *"Kya main dedh lakh ki bike le sakta hoon?"*
- Speak in English, Hinglish or Hindi
- Pilot answers out loud — *"Abhi nahi… 6 mahine ki no-cost EMI pe ₹25,000 mahina, wo chal jayega"*
- The dashboard reacts: the safe-to-spend strip carves out the purchase and turns red
**Screenshot:** Overview with the voice caption bar + red strip showing "short ₹73k" (and the voice listening screen as an inset)
**Time:** ~50 s *(in the video this becomes a live demo)*

> And this is our favourite part. You just press the mic and ask, the way you'd ask a friend — in English, Hindi, or Hinglish. "Kya main dedh lakh ki bike le sakta hoon?" Pilot understands it, checks your real numbers, and answers out loud: "Abhi nahi — seventy-three thousand kam pad rahe hain, lekin 6 mahine ki no-cost EMI pe 25,000 mahina, wo chal jayega." And at the same moment, the dashboard reacts — the safe-to-spend strip carves out the bike's price and shows the shortfall in red. Ask about your bills, and the dues section lights up. It feels like talking to a financial advisor who already knows your accounts.

---

## Slide 11 — Built to be trusted
**On slide:**
- **No invented numbers** — enforced in code, logged for every answer
- **Privacy** — only card last-4 stored; emails, card, account, PAN and Aadhaar numbers masked before anything reaches the AI
- **Secure** — JWT login, every query scoped to the logged-in user
- **Tested** — 30 automated tests (Java + Python); one command to run (`./run.sh`, Docker Compose)
- **Honest scope** — CSV import instead of bank linking (RBI Account Aggregator licensing); simulated credit score
**Screenshot:** none (or small screenshot of the green "figures traced" line)
**Time:** ~45 s

> Because this is about money, we focused on trust. The no-invented-numbers rule is enforced in code and every answer is logged with the tools and sources it used. For privacy, we never store full card numbers, and anything sent to the AI is aggregated and masked first. Every request is tied to the logged-in user, so nobody can see anyone else's data. The project has thirty automated tests across Java and Python, and runs with one command. And we were honest about scope: real bank linking needs an RBI Account Aggregator licence, so we built CSV import instead, and the credit score is clearly marked as simulated.

---

## Slide 12 — What's next & thank you
**On slide:**
- Next: bank linking via Account Aggregator · mobile app · SMS/email reminders · shared family budgets · more Indian languages
- **Thank you — questions?** · Live demo
**Screenshot:** Overview dashboard (phone view) next to desktop view
**Time:** ~30 s

> Looking ahead, we'd add real bank linking through the Account Aggregator framework, a mobile app, SMS and email reminders, shared family budgets, and more Indian languages for voice. To sum up: FinPilot shows you what's actually yours to spend, catches problems before they cost you, and gives you an AI co-pilot you can trust — because it never makes up a number. Thank you — we're happy to take questions, or show you a live demo.

---

### Screenshots to capture (after you approve)
1. Login screen · 2. Overview top (safe-to-spend + FinPilot score) · 3. Safe-to-spend with ₹90,000 typed (red + EMI hint) ·
4. Transactions with flagged rows · 5. Autopay detective · 6. Dues · 7. Goals · 8. Tax · 9. Pilot chat with EMI table + trace ·
10. Voice screen (listening) · 11. Voice caption + red strip · 12. Phone view
