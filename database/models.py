from sqlalchemy import Column, DateTime, Float, Integer, String
from database import Base

class MonthlySpendSubmissions(Base):
    __tablename__ = "monthly_spend_submissions"

    submission_id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, nullable=False)
    month = Column(String, nullable=False)
    travel_spend = Column(Float, nullable=False, default=0.0)
    food_spend = Column(Float, nullable=False, default=0.0)
    utility_spend = Column(Float, nullable=False, default=0.0)
    date_submitted = Column(DateTime, nullable=False)