"""Small labelled corpus of Indian merchant strings for the base categorizer.
The model is retrained per request with the user's own confirmed labels on top."""

CORPUS: dict[str, list[str]] = {
    "Groceries": [
        "BLINKIT", "Blinkit order", "ZEPTO MARKETPLACE", "Zepto", "BIGBASKET", "BB Now", "DMART AVENUE",
        "D-Mart", "RELIANCE FRESH", "Reliance Smart", "MORE SUPERMARKET", "Nature's Basket", "JIOMART",
        "Swiggy Instamart", "Spencer's", "Ratnadeep Supermarket", "Star Bazaar", "kirana store upi",
        "fruits and vegetables", "Milk Basket", "Country Delight", "Licious", "FreshToHome",
    ],
    "Dining": [
        "SWIGGY", "Swiggy order", "ZOMATO", "Zomato online order", "DOMINOS PIZZA", "McDonald's",
        "STARBUCKS", "Third Wave Coffee", "Blue Tokai", "Chaayos", "Haldiram's", "Barbeque Nation",
        "KFC", "Burger King", "Subway", "Truffles cafe", "EatSure", "Box8", "restaurant bill", "Cafe Coffee Day",
        "Taco Bell", "Pizza Hut", "Behrouz Biryani", "Theobroma", "Social bar",
    ],
    "Transport": [
        "UBER", "Uber trip", "OLA CABS", "Ola ride", "RAPIDO", "Rapido bike", "NAMMA METRO", "Delhi Metro DMRC",
        "Mumbai Metro", "BMTC bus", "IRCTC suburban", "FASTag recharge", "Paytm FASTag", "parking fee",
        "BluSmart", "auto rickshaw upi", "Yulu", "Bounce",
    ],
    "Fuel": [
        "INDIAN OIL", "IOCL petrol pump", "HP PETROL", "HPCL", "BHARAT PETROLEUM", "BPCL fuel", "Shell petrol",
        "Nayara Energy", "fuel station",
    ],
    "Shopping": [
        "AMAZON", "Amazon.in order", "FLIPKART", "Flipkart internet", "MYNTRA", "AJIO", "NYKAA", "Meesho",
        "Croma", "Reliance Digital", "Vijay Sales", "Decathlon", "IKEA", "H&M", "Zara", "Uniqlo",
        "Lifestyle stores", "Westside", "Tata CLiQ", "Apple store", "boAt lifestyle", "Pepperfry", "Urban Ladder",
        "Tanishq Jewellers", "CaratLane", "Kalyan Jewellers", "jewellery store", "Titan watches",
    ],
    "Utilities": [
        "BESCOM electricity", "BESCOM", "Tata Power", "Adani Electricity", "MSEDCL bill", "BSES Rajdhani",
        "electricity bill", "water bill BWSSB", "Indane gas", "Bharat Gas cylinder", "piped gas MGL",
        "AIRTEL BROADBAND", "Airtel Xstream fiber", "ACT Fibernet", "JIO FIBER", "Jio prepaid recharge",
        "Airtel postpaid", "Vi postpaid", "BSNL", "society maintenance",
    ],
    "Subscriptions": [
        "NETFLIX", "Netflix.com", "SPOTIFY", "Spotify India", "YOUTUBE PREMIUM", "Google YouTube",
        "AMAZON PRIME", "Prime Video", "Disney+ Hotstar", "JioCinema premium", "SonyLIV", "Zee5",
        "Apple iCloud", "Google One storage", "Microsoft 365", "ChatGPT subscription", "Notion",
        "Audible", "Kindle Unlimited", "LinkedIn Premium",
    ],
    "Entertainment": [
        "BOOKMYSHOW", "BookMyShow tickets", "PVR CINEMAS", "INOX", "Cinepolis", "District by Zomato",
        "Paytm Insider", "Steam games", "PlayStation store", "concert tickets", "Smaaash", "Wonderla",
    ],
    "Health": [
        "APOLLO PHARMACY", "Apollo 247", "PharmEasy", "1mg Tata", "Netmeds", "MedPlus", "Practo consult",
        "Dr Lal PathLabs", "Thyrocare", "hospital bill", "dental clinic", "CULT FIT", "Cult.fit membership",
        "Gold's Gym", "HealthifyMe", "eye care Lenskart",
    ],
    "Personal Care": [
        "Urban Company salon", "Lakme Salon", "Naturals salon", "barber shop", "spa massage",
        "Bombay Shaving", "Mamaearth", "Plum goodness",
    ],
    "Travel": [
        "MAKEMYTRIP", "MakeMyTrip flight", "GOIBIBO", "Cleartrip", "IRCTC train ticket", "INDIGO airlines",
        "Air India", "Akasa Air", "Vistara", "OYO rooms", "Taj Hotels", "Airbnb", "redBus", "Yatra",
        "EaseMyTrip", "Agoda",
    ],
    "Education": [
        "Coursera", "Udemy", "BYJU'S", "Unacademy", "upGrad", "Scaler academy", "college fees",
        "school fees", "exam registration fee", "Physics Wallah", "books Sapna",
    ],
    "Rent": [
        "house rent", "RENT PAYMENT", "Rent to landlord", "NoBroker rent", "CRED rent pay", "Housing.com rent",
        "PG rent", "flat rent",
    ],
    "Investments": [
        "ZERODHA", "Zerodha Coin SIP", "GROWW", "Groww SIP", "Kuvera", "ICICI Prudential MF SIP",
        "SBI Mutual Fund", "PPF deposit", "NPS contribution", "Upstox", "mutual fund SIP", "RD installment",
        "Smallcase", "INDmoney",
    ],
    "Loan EMI": [
        "Bajaj Finserv EMI", "HDFC loan EMI", "home loan EMI", "personal loan EMI", "car loan EMI",
        "education loan EMI", "NACH debit loan", "ECS loan repayment",
    ],
    "Card Payment": [
        "credit card bill payment", "CRED card payment", "HDFC credit card payment", "BillDesk card payment",
        "card bill autopay",
    ],
    "Transfers": [
        "UPI to friend", "IMPS transfer", "NEFT self transfer", "sent to mom", "split with friends",
        "Splitwise settle",
    ],
    "Income": [
        "SALARY", "salary credit", "payroll", "NEFT salary", "interest credit", "dividend", "freelance payment",
        "refund", "cashback",
    ],
}
