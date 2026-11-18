from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Form, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import MonthlySpendSubmissions

CATEGORIES: dict[str, list[str]] = {
    "Travel": ["Train", "Bus", "Self-owned car", "Car share", "Taxi", "Plane", "Other"],
    "Food": ["Delivery", "Restaurant", "Groceries"],
    "Utilities": ["Heating", "Electricity", "Water"],
}

CATEGORY_OF = {sub: cat for cat, subs in CATEGORIES.items() for sub in subs}

# the html/css/js lives in "Website dir" at the repo root; the API serves it so
# the page and the API share one origin (no CORS needed)
WEBSITE_DIR = Path(__file__).resolve().parents[2] / "Website dir"


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


@app.get("/categories")
def categories() -> dict[str, list[str]]:
    # the form builds its dropdowns from this, so front and back always agree
    return CATEGORIES


@app.get("/", include_in_schema=False)
def home() -> RedirectResponse:
    return RedirectResponse("/spending-form/form.html")


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
    submission_id = (db.scalar(select(func.max(MonthlySpendSubmissions.submission_id))) or 0) + 1
    now = datetime.now(timezone.utc)

    rows = [
        MonthlySpendSubmissions(
            submission_id=submission_id,
            customer_id=form.customer_id,
            month=form.month,
            category=CATEGORY_OF[sub],
            subcategory=sub,
            amount=round(amount, 2),
            date_submitted=now,
        )
        for sub, amount in zip(form.subcategory_id, form.amount)
    ]

    # 4. all savec or none do
    db.add_all(rows)
    db.commit()

    return {"status": "saved", "submissionId": submission_id, "entries": len(rows)}

# keep this last: anything not matched by an API route above falls through to the website files
app.mount("/", StaticFiles(directory=WEBSITE_DIR, html=True), name="website")
