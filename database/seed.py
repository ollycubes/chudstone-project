from datetime import datetime

from database import Base, SessionLocal, engine
import models

#create the database tables based on the models defined in models.py
Base.metadata.create_all(bind=engine)

db = SessionLocal()
if not db.query(models.MonthlySpendSubmissions).first():
    #seed the database with some initial data
    submissions = [
        models.MonthlySpendSubmissions(customer_id=1, month="2026-10", travel_spend=280.0, food_spend=320.0, utility_spend=140.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(customer_id=2, month="2026-10", travel_spend=450.0, food_spend=650.0, utility_spend=260.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(customer_id=3, month="2026-10", travel_spend=120.0, food_spend=180.0, utility_spend=70.0, date_submitted=datetime.now()),
        models.MonthlySpendSubmissions(customer_id=4, month="2026-10", travel_spend=90.0, food_spend=280.0, utility_spend=70.0, date_submitted=datetime.now()),
    ]
    db.add_all(submissions)
    db.commit()
    print("Database seeded with monthly spend submissions")
else:
    print("Database already seeded with monthly spend submissions")

db.close()