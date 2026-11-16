from sqlalchemy import Column, DateTime, Float, Integer, String
from database import Base

class MonthlySpendSubmissions(Base):
    __tablename__ = "monthly_spend_submissions"

    entry_id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, nullable=False)
    customer_id = Column(Integer, nullable=False)
    month = Column(String, nullable=False)
    category = Column(String, nullable=False)
    subcategory = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    date_submitted = Column(DateTime, nullable=False)