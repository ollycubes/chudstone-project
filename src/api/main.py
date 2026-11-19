from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Form, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Categories, MonthlySpendSubmissions

CATEGORIES: dict[str, list[str]] = {
    "Travel": ["Train", "Bus", "Self-owned car", "Car share", "Taxi", "Plane", "Other"],
    "Food": ["Delivery", "Restaurant", "Groceries"],
    "Utilities": ["Heating", "Electricity", "Water"],
}

CATEGORY_OF = {sub: cat for cat, subs in CATEGORIES.items() for sub in subs} # Would this not cause an issue if we ended up with two subcategories that went by the same name, such as "Other"?

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
    amount: list[Annotated[Decimal, Field(gt=0, le=1_000_000_000, decimal_places=2)]] = Field(min_length=1, max_length=50)


@app.get("/categories")
def categories() -> dict[str, list[str]]:
    # the form builds its dropdowns from this, so front and back always agree
    return CATEGORIES

@app.get("/totals")
def totals(month: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    rows = category_totals(db, customer_id=1, month=month)
    return [
        {"category": rows.category, "spend": round(rows.spend, 2), "carbon": round(rows.carbon, 2)}
        for rows in rows
    ]


@app.get("/", include_in_schema=False)
def home() -> RedirectResponse:
    return RedirectResponse("/spending-form/form.html")

@app.get("/dashboard", include_in_schema=False)
def dashboard() -> RedirectResponse:
    return RedirectResponse("/dashboard/dashboard.html")


@app.post("/submit", status_code=201)
def submit(form: Annotated[SpendingForm, Form()], db: Session = Depends(get_db)) -> dict:
    # 1. every card needs a type and an amount (notes are optional)
    if len(form.subcategory_id) != len(form.amount):
        raise HTTPException(422, "each entry needs a type and an amount.")

    # 2. each subcategory checked and finds its parent category
    for i, sub in enumerate(form.subcategory_id, start=1):
        if sub not in CATEGORY_OF:
            raise HTTPException(422, f"Entry {i}: unknown type {sub}.")

    # 3. Receive the emission factors for the given subcategories
    emission_factors = dict(
        db.execute(
            select(Categories.subcategory_name, Categories.emission_factor).where(
                Categories.subcategory_name.in_(form.subcategory_id)
            )
        ).all()
    )
    for i, sub in enumerate(form.subcategory_id, start=1):
        if sub not in emission_factors:
            raise HTTPException(422, f"Entry {i}: no emission factor configured for {sub}.")

    # 4. Save the submission and all its items in one go
    submission_id = (db.scalar(select(func.max(MonthlySpendSubmissions.submission_id))) or 0) + 1
    now = datetime.now(timezone.utc)

    rows = [
        MonthlySpendSubmissions(
            submission_id=submission_id,
            customer_id=form.customer_id,
            month=form.month,
            category=CATEGORY_OF[sub],
            subcategory=sub,
            amount=float(amount),
            carbon_impact=((float(amount)*100)*(emission_factors[sub]*1000))/100000, #amount*emission_factor but avoids floating point rounding errors
            date_submitted=now,
        )
        for sub, amount in zip(form.subcategory_id, form.amount)
    ]

    # 5. all saved or none do
    db.add_all(rows)
    db.commit()

    return {"status": "saved", "submissionId": submission_id, "entries": len(rows)}


def category_totals(db: Session, customer_id: int, month: str | None = None):
    M = MonthlySpendSubmissions
    stmt = (
        select(
            M.category,
            func.sum(M.amount).label("spend"),        
            func.sum(M.carbon_impact).label("carbon"),
        )
        .where(M.customer_id == customer_id)
        .group_by(M.category)                          
        .order_by(func.sum(M.carbon_impact).desc())     
    )
    if month:
        stmt = stmt.where(M.month == month)

    # e.g. of JSON shape with values -> Version containing subcategories in the JSON form too

    return db.execute(stmt).all()


# keep this last: anything not matched by an API route above falls through to the website files
app.mount("/", StaticFiles(directory=WEBSITE_DIR, html=True), name="website")
