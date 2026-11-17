from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Form, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import MonthlySpendSubmissions

CATEGORIES: dict[str, list[str]] = {
    "Travel": ["Train", "Bus", "Self-owned car", "Car share", "Taxi", "Plane", "Other"],
    "Food": ["Delivery", "Restaurant", "Supermarket"],
    "Utilities": ["Heating", "Electricity", "Water"],
}

CATEGORY_OF = {sub: cat for cat, subs in CATEGORIES.items() for sub in subs}


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)  # create any missing tables on startup
    yield


app = FastAPI(title="Carbon Footprint & Savings Advisor", lifespan=lifespan)


# what the form sends. FastAPI checks the types and limits automatically
# and replies 422 (with the reason) if anything doesn't fit.
class SpendingForm(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")
    customer_id: int = Field(default=1, ge=1, description="placeholder for now, until we have a login system") # futureproofing
    subcategory_id: list[str] = Field(min_length=1, max_length=50)
    amount: list[Annotated[float, Field(gt=0, le=100_000)]] = Field(min_length=1, max_length=50)


@app.post("/submit", status_code=201)
def submit(form: Annotated[SpendingForm, Form()], db: Session = Depends(get_db)) -> dict:
    # 1. every card needs a type and an amount (notes are optional)
    if len(form.subcategory_id) != len(form.amount):
        raise HTTPException(422, "each entry needs a type and an amount.")

    # 2. each subcategory checked and finds its parent category
    for i, sub in enumerate(form.subcategory_id, start=1):
        if sub not in CATEGORY_OF:
            raise HTTPException(422, f"Entry {i}: unknown type {sub}.")

    # 3. Save the submission and all its items in one go
    submission = Submission(month=form.month, items=items)
    db.add(submission)
    db.commit()

    return {"status": "saved", "submissionId": submission.id, "entries": len(items)}