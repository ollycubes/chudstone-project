"""Sample data for testing. Run once from src/:  python -m api.seed"""

from datetime import datetime, timezone

from .database import Base, SessionLocal, engine
from .models import MonthlySpendSubmissions

# (submission_id, customer_id, month, category, subcategory, amount)
SAMPLE = [
    (1, 1, "2026-10", "Travel", "Self-owned car", 280.0),
    (1, 1, "2026-10", "Travel", "Bus", 20.0),
    (1, 1, "2026-10", "Travel", "Train", 63.4),
    (1, 1, "2026-10", "Food", "Supermarket", 320.0),
    (1, 1, "2026-10", "Food", "Delivery", 55.94),
    (1, 1, "2026-10", "Utilities", "Electricity", 40.0),
    (1, 1, "2026-10", "Utilities", "Water", 30.0),
    (1, 1, "2026-10", "Utilities", "Heating", 50.0),
    (2, 2, "2026-10", "Travel", "Self-owned car", 300.0),
    (2, 2, "2026-10", "Travel", "Train", 25.0),
    (2, 2, "2026-10", "Food", "Supermarket", 250.0),
    (2, 2, "2026-10", "Food", "Restaurant", 60.0),
    (2, 2, "2026-10", "Utilities", "Electricity", 35.0),
    (2, 2, "2026-10", "Utilities", "Water", 25.0),
    (2, 2, "2026-10", "Utilities", "Heating", 45.0),
]

Base.metadata.create_all(bind=engine)  # create the tables if they don't exist

with SessionLocal() as db:
    if db.query(MonthlySpendSubmissions).first():
        print("Database already seeded with monthly spend submissions")
    else:
        now = datetime.now(timezone.utc)
        db.add_all(
            MonthlySpendSubmissions(
                submission_id=sid, customer_id=cid, month=month,
                category=cat, subcategory=sub, amount=amount, date_submitted=now,
            )
            for sid, cid, month, cat, sub, amount in SAMPLE
        )
        db.commit()
        print("db seeded with monthly spend submissions")