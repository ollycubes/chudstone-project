from sqlalchemy import Column, Float, Integer, String
from database import Base

class Customer(Base):
    __tablename__ = "customers"

    #defines the columns in the customers table
    customer_id = Column(Integer, primary_key=True, index=True)
    persona = Column(String, nullable=False)
    travel_spend = Column(Float, nullable=False)
    food_spend = Column(Float, nullable=False)
    utility_spend = Column(Float, nullable=False)