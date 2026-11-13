from database import SessionLocal
from sqlalchemy import text

#this is to see if you can receive data from the database
db = SessionLocal()

#Select everything from the customers table
customers = db.execute(text("SELECT * FROM customers")).fetchall()

for c in customers:
    print(f"Customer ID: {c.customer_id}, Persona: {c.persona}, Travel Spend: {c.travel_spend}, Food Spend: {c.food_spend}, Utility Spend: {c.utility_spend}")
db.close()