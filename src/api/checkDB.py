from .database import SessionLocal
from .models import MonthlySpendSubmissions

from sqlalchemy import text

#this is to see if you can receive data from the database
db = SessionLocal()

#Select everything from the monthly_spend_submissions table
submissions = db.execute(text("SELECT * FROM monthly_spend_submissions")).fetchall()

for s in submissions:
    #print(f"Submission ID: {s.submission_id}, Customer ID: {s.customer_id}, Month: {s.month}, Travel Spend: {s.travel_spend}, Food Spend: {s.food_spend}, Utility Spend: {s.utility_spend}")
    print(f"Entry {s.entry_id} | Submission {s.submission_id} | Customer {s.customer_id} | "f"{s.month} | {s.category} > {s.subcategory} | £{s.amount:.2f}")
db.close()