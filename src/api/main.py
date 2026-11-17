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
    # 1. Every card needs a type and an amount (notes are optional)
    if len(form.subcategory_id) != len(form.amount):
        raise HTTPException(422, "Each entry needs a type and an amount.")
    notes = form.note + [""] * (len(form.amount) - len(form.note))  # pad missing notes

    # 2. Build one item per card, checking each type really exists
    items = []
    for i, (sub_id, amount, note) in enumerate(zip(form.subcategory_id, form.amount, notes), start=1):
        subcategory = db.get(Subcategory, sub_id)
        if subcategory is None:
            raise HTTPException(422, f"Entry {i}: unknown type {sub_id}.")
        items.append(
            SubmissionItem(subcategory=subcategory, amount_gbp=round(amount, 2), note=note.strip() or None)
        )

    # 3. Save the submission and all its items in one go
    submission = Submission(month=form.month, items=items)
    db.add(submission)
    db.commit()

    return {"status": "saved", "submissionId": submission.id, "entries": len(items)}