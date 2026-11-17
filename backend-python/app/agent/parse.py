"""Lightweight question understanding for the Interpret step."""
from __future__ import annotations

import calendar
import re
from datetime import date, timedelta

AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)?\s?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s?(k|thousand|lakh|lakhs|lac|l|cr|crore)?\b",
                       re.I)
UNIT = {"k": 1e3, "thousand": 1e3, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "l": 1e5, "cr": 1e7, "crore": 1e7}

CATEGORY_WORDS = {
    "Dining": ["food delivery", "eating out", "dining", "restaurant", "swiggy", "zomato", "food", "coffee", "cafe"],
    "Groceries": ["grocery", "groceries", "blinkit", "zepto", "bigbasket", "vegetables"],
    "Transport": ["transport", "uber", "ola", "cab", "commute", "metro", "rapido", "travel to work"],
    "Fuel": ["fuel", "petrol", "diesel"],
    "Shopping": ["shopping", "amazon", "flipkart", "myntra", "clothes", "gadgets"],
    "Utilities": ["utilities", "electricity", "internet", "broadband", "phone bill", "recharge"],
    "Subscriptions": ["subscription", "subscriptions", "netflix", "spotify", "ott", "streaming"],
    "Entertainment": ["entertainment", "movies", "movie", "bookmyshow", "concert"],
    "Health": ["health", "medical", "medicine", "pharmacy", "gym", "doctor"],
    "Travel": ["travel", "trip", "flight", "hotel", "vacation", "holiday"],
    "Rent": ["rent"],
    "Personal Care": ["salon", "haircut", "personal care", "grooming"],
    "Education": ["education", "course", "courses", "books"],
}

# ---- Hinglish / Hindi support ----------------------------------------------------------
# Voice input often arrives as romanised Hinglish ("kya main 20 hazaar ka phone le sakta hoon")
# or, with the Hindi recogniser, in Devanagari. Both are normalised to simple English cues
# so the same intent rules apply. Answers stay grounded: only words change, never numbers.

DEVANAGARI = {
    "क्या": "kya", "मैं": "main", "में": "mein", "मेरा": "mera", "मेरी": "meri", "मेरे": "mere", "का": "ka", "की": "ki",
    "के": "ke", "ले": "le", "सकता": "sakta", "सकती": "sakti", "हूं": "hoon", "हूँ": "hoon", "है": "hai", "हैं": "hain",
    "खरीद": "kharid", "हजार": "hazaar", "हज़ार": "hazaar", "लाख": "lakh", "रुपये": "rupaye", "रुपए": "rupaye",
    "कितना": "kitna", "कितने": "kitne", "खर्च": "kharch", "खर्चा": "kharcha", "किया": "kiya", "पिछले": "pichle",
    "महीने": "mahine", "महीना": "mahina", "इस": "is", "बिल": "bill", "बजट": "budget", "टैक्स": "tax", "कैसे": "kaise",
    "बचाऊं": "bachaun", "बचाएं": "bachaye", "बचाये": "bachaye", "बचेगा": "bachega", "बचेंगे": "bachenge", "कर्ज": "karz",
    "कर्ज़": "karz", "लोन": "loan", "पहले": "pehle", "खाना": "khana", "खाने": "khane", "फोन": "phone", "फ़ोन": "phone",
    "भरना": "bharna", "कब": "kab", "पैसे": "paise", "बताओ": "batao", "होता": "hota", "क्रेडिट": "credit", "स्कोर": "score",
}
DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

NUMBER_WORDS = {
    # English
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "twenty five": 25, "thirty": 30, "forty": 40,
    "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100,
    # Hindi (romanised)
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6, "saat": 7, "aath": 8,
    "nau": 9, "das": 10, "pandrah": 15, "bees": 20, "pachchees": 25, "pachis": 25, "tees": 30, "chaalis": 40,
    "chalees": 40, "pachaas": 50, "pachas": 50, "saath": 60, "sattar": 70, "assi": 80, "nabbe": 90, "sau": 100,
    "dedh": 1.5, "dhai": 2.5, "dhaai": 2.5, "sava": 1.25, "saade": None,
}
_NUM_ALT = "|".join(sorted((re.escape(k) for k, v in NUMBER_WORDS.items() if v), key=len, reverse=True))
_SCALE = r"(hazaar|hazar|hajar|hazzar|thousand|lakh|lakhs|lac)"

# Hinglish phrase → English cue. Order matters: longer phrases first.
HINGLISH = [
    (r"\b(le|khareed|kharid) (sakta|sakti|sakte|lu|loon|lun) (hoon|hun|hu|hain|kya)?", " can i buy "),
    (r"\b(lena|kharidna) (chahta|chahti|chahiye)( hoon| hun| hu)?", " can i buy "),
    (r"\bafford kar (sakta|sakti|sakte)( hoon| hun| hu)?", " can i afford "),
    (r"\b(kitna|kitne) (kharcha|kharch|paisa|paise) (kiya|hua|gaye|gaya)", " how much did i spend "),
    (r"\b(kharcha|kharch) (kiya|hua)", " spent "),
    (r"\b(kharcha|kharch)\b", " spend "),
    (r"\bpichhle mahine|\bpichle mahine|\bpichla mahina\b", " last month "),
    (r"\bis mahine\b", " this month "),
    (r"\b(mahine|month) ke (end|aakhir|ant) (tak|mein)?", " month end "),
    (r"\b(kitna|kitne) (paise )?(bachega|bachenge|bachta)", " how much will i have month end "),
    (r"\b(bill|bills|emi|kist) (kab|kab tak) (bharna|bharne|dena)?", " bills due "),
    (r"\b(kab|kitne) bharna\b", " due "),
    (r"\b(kaunsa|kaun sa|konsa) (loan|karz|card) pehle\b", " which debt pay off first "),
    (r"\b(karz|karza|qarz)\b", " debt "),
    (r"\btax (kaise|kese) (bachaye|bachaun|bachayein|bachau|bacha sakta)", " how can i save tax "),
    (r"\b(khana|khane|khaana)\b", " food "),
    (r"\b(kapde|kapda)\b", " clothes "),
    (r"\b(mera|meri|mere)\b", " my "),
]
HINGLISH_MARKERS = re.compile(
    r"\b(kya|mera|meri|mere|hai|hoon|hun|hu|sakta|sakti|sakte|kitna|kitne|kharch|kharcha|hazaar|hazar|mahine|"
    r"bachega|bachenge|kaise|karz|pehle|batao|paise|rupaye|bharna|kab|chahiye|bachaye|bachaun|samjhao|chukau)\b")


def normalize(q: str) -> str:
    """Devanagari → romanised, number words → digits, Hinglish phrases → English cues."""
    s = q.translate(DEVANAGARI_DIGITS)
    for dev, rom in DEVANAGARI.items():
        s = s.replace(dev, rom)
    s = s.lower()
    # "bees hazaar" → "20 hazaar", "twenty thousand" → "20 thousand", "dedh lakh" → "1.5 lakh"
    s = re.sub(rf"\b({_NUM_ALT})\s+{_SCALE}\b", lambda m: f"{NUMBER_WORDS[m.group(1)]:g} {m.group(2)}", s)
    s = re.sub(r"\b(hazaar|hazar|hajar|hazzar)\b", "thousand", s)
    for pat, repl in HINGLISH:
        s = re.sub(pat, repl, s)
    return re.sub(r"\s+", " ", s).strip()


def detect_lang(q: str) -> str:
    """'hi' for Hindi/Hinglish questions, else 'en'. Used only to pick the spoken reply style."""
    if re.search(r"[\u0900-\u097F]", q):
        return "hi"
    return "hi" if len(HINGLISH_MARKERS.findall(q.lower())) >= 2 else "en"


MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_abbr) if m})


def parse_amount(q: str) -> float | None:
    q = normalize(q)
    for m in AMOUNT_RE.finditer(q):
        num, unit = m.groups()
        # Skip things like "80C", "3 months", "last 30 days".
        tail = q[m.end():m.end() + 8].lower()
        if re.match(r"\s?(day|days|month|months|week|weeks|year|years|%)", tail):
            continue
        v = float(num.replace(",", ""))
        if unit:
            v *= UNIT[unit.lower()]
        if v >= 100:
            return v
    return None


def parse_period(q: str, today: date) -> tuple[date, date, str]:
    s = normalize(q)
    first = today.replace(day=1)
    if "last month" in s or "previous month" in s:
        end = first - timedelta(days=1)
        return end.replace(day=1), end, end.strftime("%B %Y")
    m = re.search(r"last (\d+) days", s)
    if m:
        n = int(m.group(1))
        return today - timedelta(days=n - 1), today, f"the last {n} days"
    m = re.search(r"last (\d+|three|two|six) months", s)
    if m:
        n = {"two": 2, "three": 3, "six": 6}.get(m.group(1)) or int(m.group(1))
        return today - timedelta(days=30 * n), today, f"the last {n} months"
    if "last week" in s or "past week" in s or "this week" in s:
        return today - timedelta(days=6), today, "the last 7 days"
    if "this year" in s or "financial year" in s:
        fy_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
        return fy_start, today, "this financial year"
    for name, idx in MONTHS.items():
        # "may" is too common an English word; only accept it as "in may".
        hit = re.search(r"\bin may\b", s) if name == "may" else re.search(rf"\b{name}\b", s)
        if hit:
            year = today.year if idx <= today.month else today.year - 1
            start = date(year, idx, 1)
            end = date(year, idx, calendar.monthrange(year, idx)[1])
            return start, min(end, today), start.strftime("%B %Y")
    return first, today, "this month"


def detect_category(q: str) -> str | None:
    s = normalize(q)
    for cat, words in CATEGORY_WORDS.items():
        if any(re.search(rf"\b{re.escape(w)}\b", s) for w in words):
            return cat
    return None


def detect_intent(q: str) -> str:
    s = normalize(q)
    has_amount = parse_amount(q) is not None
    personal = re.search(r"\b(my|i|me|am i|do i|i'm|i've|main)\b", s) is not None
    # "80C kya hai", "HRA samjhao" → a definition question.
    if re.search(r"\b(kya hai|kya hota hai|kya hoti hai|samjhao|samjha do|matlab)\b", s) and not has_amount:
        s = "what is " + s
    if re.search(r"\b(afford|can i (buy|spend|get)|should i (buy|get)|is it ok to (buy|spend)|purchase)\b", s) and has_amount:
        return "afford"
    if re.search(r"pay ?off|debt|which (loan|card|debt)|avalanche|snowball|clear my (loans?|cards?)|prepay", s):
        return "payoff"
    if re.search(r"\b(tax|taxes|regime|itr|80c|80d|hra|nps)\b", s):
        if re.search(r"how much|my tax|estimate|which regime|should i|liability|owe|payable|save|saving|reduce|compare", s):
            return "tax"
        return "knowledge"
    definitional = re.search(r"^(what is|what's|whats|what are|explain|define|meaning|why|how does|how do|tips|how to)\b", s)
    if definitional and not personal:
        return "knowledge"
    if re.search(r"\b(due|dues|bills?|upcoming|emis?|installments?|payments? coming)\b", s):
        return "dues"
    if re.search(r"\bbudget", s):
        return "budget"
    if re.search(r"month.?end|end of (the )?month|safe to spend|left (this|by)|how much (money )?(do i have|is left|will i have)|forecast|balance", s):
        return "forecast"
    if re.search(r"spend|spent|spending|expenses?|how much did|where did|top merchants?|biggest", s):
        return "spend"
    if definitional or re.search(r"^(how can i|how should i|should i)\b", s):
        return "knowledge"
    return "overview"
