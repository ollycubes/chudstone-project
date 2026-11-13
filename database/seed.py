from database import Base, SessionLocal, engine
import models

#create the database tables based on the models defined in models.py
Base.metadata.create_all(bind=engine)

db = SessionLocal()
if not db.query(models.Customer).first():
    #seed the database with some initial data
    personas = [
        models.Customer(persona = "Single Professional", travel_spend=280.0, food_spend=320.0, utility_spend=140.0),
        models.Customer(persona = "Family Household", travel_spend=450.0, food_spend=650.0, utility_spend=260.0),
        models.Customer(persona = "Student", travel_spend=120.0, food_spend=180.0, utility_spend=70.0),
        models.Customer(persona = "Retired Couple", travel_spend=90.0, food_spend=280.0, utility_spend=70.0),
        models.Customer(persona = "High Commuter", travel_spend=520.0, food_spend=340.0, utility_spend=160.0),
    ]
    db.add_all(personas)
    db.commit()
    print("Database seeded with personas")
else:
    print("Database already seeded with personas")

db.close()