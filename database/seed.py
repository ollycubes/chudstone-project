from datetime import datetime

from database import Base, SessionLocal, engine
import models

#create the database tables based on the models defined in models.py
Base.metadata.create_all(bind=engine)

db = SessionLocal()
if not db.query(models.MonthlySpendSubmissions).first():
    #seed the database with some initial data
    submissions = [
        models.MonthlySpendSubmissions(entry_id=1, submission_id=1, customer_id=1, month="2026-10", category="Travel", subcategory="Car", amount=280.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=2, submission_id=1, customer_id=1, month="2026-10", category="Travel", subcategory="Bus", amount=20.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=3, submission_id=1, customer_id=1, month="2026-10", category="Travel", subcategory="Train", amount=63.4, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=4, submission_id=1, customer_id=1, month="2026-10", category="Food", subcategory="Groceries", amount=320.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=5, submission_id=1, customer_id=1, month="2026-10", category="Food", subcategory="Delivery", amount=55.94, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=6, submission_id=1, customer_id=1, month="2026-10", category="Utilities", subcategory="Electricity", amount=40.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=7, submission_id=1, customer_id=1, month="2026-10", category="Utilities", subcategory="Water", amount=30.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=8, submission_id=1, customer_id=1, month="2026-10", category="Utilities", subcategory="Heating", amount=50.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=9, submission_id=2, customer_id=2, month="2026-10", category="Travel", subcategory="Car", amount=300.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=10, submission_id=2, customer_id=2, month="2026-10", category="Travel", subcategory="Train", amount=25.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=11, submission_id=2, customer_id=2, month="2026-10", category="Food", subcategory="Groceries", amount=250.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=12, submission_id=2, customer_id=2, month="2026-10", category="Food", subcategory="Restaurant/Dine out", amount=60.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=13, submission_id=2, customer_id=2, month="2026-10", category="Utilities", subcategory="Electricity", amount=35.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=14, submission_id=2, customer_id=2, month="2026-10", category="Utilities", subcategory="Water", amount=25.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(entry_id=15, submission_id=2, customer_id=2, month="2026-10", category="Utilities", subcategory="Heating", amount=45.0, date_submitted=datetime.now()),
    ]
    db.add_all(submissions)
    db.commit()
    print("Database seeded with monthly spend submissions")
else:
    print("Database already seeded with monthly spend submissions")

db.close()