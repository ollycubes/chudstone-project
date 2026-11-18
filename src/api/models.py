from sqlalchemy import Column, DateTime, Float, Integer, String

from .database import Base

class MonthlySpendSubmissions(Base):
    __tablename__ = "monthly_spend_submissions"

    entry_id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, nullable=False, index=True)
    customer_id = Column(Integer, nullable=False)
    month = Column(String, nullable=False)  # format is year-month 2077-11
    category = Column(String, nullable=False)
    subcategory = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    notes = Column(String, nullable=True)
    date_submitted = Column(DateTime, nullable=False)

class Customers(Base):
    __tablename__ = "customers"

    customer_id = Column(Integer, primary_key=True, index=True)
    persona = Column(String, nullable=False)

class Categories(Base):
    __tablename__ = "categories"

    category_name = Column(String, nullable=False)
    subcategory_name = Column(String, primary_key=True, index=True)
    emission_factor = Column(Float, nullable=False)
