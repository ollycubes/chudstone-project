"""Sample data for testing. Run once from src/:  python -m api.seed"""

from datetime import datetime, timezone

from .database import Base, SessionLocal, engine
from .models import *

# (submission_id, customer_id, month, category, subcategory, notes, amount)
SENDSUBMISSIONSSEED = [
    (1, 1, "2026-10", "Travel", "Self-owned car", None, 280.0),
    (1, 1, "2026-10", "Travel", "Bus", None, 20.0),
    (1, 1, "2026-10", "Travel", "Train", None, 63.4),
    (1, 1, "2026-10", "Food", "Groceries", None, 320.0),
    (1, 1, "2026-10", "Food", "Delivery", None, 55.94),
    (1, 1, "2026-10", "Utilities", "Electricity", None, 40.0),
    (1, 1, "2026-10", "Utilities", "Water", None, 30.0),
    (1, 1, "2026-10", "Utilities", "Heating", None, 50.0),
    (2, 2, "2026-10", "Travel", "Self-owned car", None, 300.0),
    (2, 2, "2026-10", "Travel", "Train", None, 25.0),
    (2, 2, "2026-10", "Food", "Groceries", None, 250.0),
    (2, 2, "2026-10", "Food", "Restaurant/Dine out", None, 60.0),
    (2, 2, "2026-10", "Utilities", "Electricity", None, 35.0),
    (2, 2, "2026-10", "Utilities", "Water", None, 25.0),
    (2, 2, "2026-10", "Utilities", "Heating", None, 45.0),
]

CUSTOMERSSEED = [
    (1, "Default"),
    (2, "Single Professional"),
    (3, "Family Household"),
    (4, "Student"),
    (5, "Retired Couple"),
    (6, "High Commuter"),
]

CATEGORIESSEED = [
    ("Travel", "Self-owned car", 0.192),
    ("Travel", "Motorbike", 0.103),
    ("Travel", "Bus", 0.105),
    ("Travel", "Train", 0.041),
    ("Travel", "Subway", 0.285),
    ("Travel", "Taxi", 0.25),
    ("Travel", "Carshare", 0.192),
    ("Travel", "Airplane", 0.103),
    ("Food", "Groceries", 0.5),
    ("Food", "Delivery", 0.3),
    ("Food", "Restaurant/Dine out", 0.4),
    ("Utilities", "Electricity", 0.233),
    ("Utilities", "Water", 0.001),
    ("Utilities", "Heating", 0.2),
]

Base.metadata.create_all(bind=engine)  # create the tables if they don't exist

with SessionLocal() as db:
    if db.query(Categories).first():
        print("Database already seeded with categories")
    else:
        db.add_all(
            Categories(
                category_name=cat, subcategory_name=sub, emission_factor=emission
            )
            for cat, sub, emission in CATEGORIESSEED
        )
        db.commit()
        print("db seeded with categories")

    #create a dictionary of emission factors for creating MonthlySpendSubmissions
    emission_factors = {
        subcategory: emission_factor
        for subcategory, emission_factor in db.query(
            Categories.subcategory_name, Categories.emission_factor
        ).all()
    }

    if db.query(MonthlySpendSubmissions).first():
        print("Database already seeded with monthly spend submissions")
    else:
        now = datetime.now(timezone.utc)
        db.add_all(
            MonthlySpendSubmissions(
                submission_id=sid, customer_id=cid, month=month,
                category=cat, subcategory=sub, notes=notes, amount=amount,
                carbon_impact=((float(amount)*100)*(emission_factors[sub]*1000))/100000, date_submitted=now,
                #carbon_impact=amount*emission_factor but avoids floating point rounding errors
            )
            for sid, cid, month, cat, sub, notes, amount in SENDSUBMISSIONSSEED
        )
        db.commit()
        print("db seeded with monthly spend submissions")
    if db.query(Customers).first():
        print("Database already seeded with customers")
    else:
        db.add_all(Customers(customer_id=cid, persona=name) for cid, name in CUSTOMERSSEED)
        db.commit()
        print("db seeded with customers")
