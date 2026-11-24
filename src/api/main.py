from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Form, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Categories, Customers, MonthlySpendSubmissions

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
    customer_id: int = Field(default=1, ge=1, description="the persona picked on the form, until we have a login system")
    subcategory_id: list[str] = Field(min_length=1, max_length=50)
    amount: list[Annotated[Decimal, Field(gt=0, le=1_000_000_000, decimal_places=2)]] = Field(min_length=1, max_length=50)
    # optional, one per entry (blank if the user didn't write one). Same 200 limit as the form's input box
    note: list[Annotated[str, Field(max_length=200)]] = Field(default_factory=list, max_length=50)


@app.get("/categories")
def categories(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    # the form builds its dropdowns from the categories table, so front and back always agree
    result: dict[str, list[str]] = {}
    for cat, sub in db.execute(
        select(Categories.category_name, Categories.subcategory_name)
        .order_by(Categories.category_name, Categories.subcategory_name)
    ):
        result.setdefault(cat, []).append(sub)
    return result

@app.get("/personas")
def personas(db: Session = Depends(get_db)) -> list[dict]:
    # the form's persona dropdown is filled from the customers table
    return [
        {"customerId": c.customer_id, "persona": c.persona}
        for c in db.scalars(select(Customers).order_by(Customers.customer_id))
    ]

@app.get("/totals")
def totals(
    customer_id: Annotated[int, Query(ge=1)] = 1,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    # the dashboard passes the submission's customer and month to get that persona's breakdown
    rows = category_totals(db, customer_id=customer_id, month=month)
    return [
        {"category": rows.category, "spend": round(rows.spend, 2), "carbon": round(rows.carbon, 2)}
        for rows in rows
    ]


@app.get("/", include_in_schema=False)
def home() -> RedirectResponse:
    return RedirectResponse("/spending-form/form.html")

@app.get("/dashboard", include_in_schema=False)
def dashboard() -> RedirectResponse:
    return RedirectResponse("/dashboard/test-example.html")


@app.post("/submit", status_code=201)
def submit(form: Annotated[SpendingForm, Form()], db: Session = Depends(get_db)) -> dict:
    # 1. every card needs a type and an amount (notes are optional)
    if len(form.subcategory_id) != len(form.amount):
        raise HTTPException(422, "each entry needs a type and an amount.")
    # notes can be left out completely, but if they're sent there must be one per entry
    notes = form.note or [""] * len(form.subcategory_id)
    if len(notes) != len(form.subcategory_id):
        raise HTTPException(422, "each entry needs a note (it can be blank).")

    # 2. the persona must exist
    if db.get(Customers, form.customer_id) is None:
        raise HTTPException(422, f"Unknown persona {form.customer_id}.")

    # 3. look up each subcategory's parent category and emission factor in the db
    known = {
        sub: (cat, factor)
        for sub, cat, factor in db.execute(
            select(Categories.subcategory_name, Categories.category_name, Categories.emission_factor)
            .where(Categories.subcategory_name.in_(form.subcategory_id))
        )
    }
    for i, sub in enumerate(form.subcategory_id, start=1):
        if sub not in known:
            raise HTTPException(422, f"Entry {i}: unknown type {sub}.")

    # 4. Save the submission and all its items in one go
    submission_id = (db.scalar(select(func.max(MonthlySpendSubmissions.submission_id))) or 0) + 1
    now = datetime.now(timezone.utc)

    rows = [
        MonthlySpendSubmissions(
            submission_id=submission_id,
            customer_id=form.customer_id,
            month=form.month,
            category=known[sub][0],
            subcategory=sub,
            amount=float(amount),
            carbon_impact=((float(amount)*100)*(known[sub][1]*1000))/100000, #amount*emission_factor but avoids floating point rounding errors
            notes=note.strip() or None,  # blank notes are saved as NULL
            date_submitted=now,
        )
        for sub, amount, note in zip(form.subcategory_id, form.amount, notes)
    ]

    # 5. all saved or none do
    db.add_all(rows)
    db.commit()

    return {"status": "saved", "submissionId": submission_id, "entries": len(rows)}

@app.get("/submissions/{submission_id}")
def get_submission(submission_id: int, db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(MonthlySpendSubmissions)
        .where(MonthlySpendSubmissions.submission_id == submission_id)
        .order_by(MonthlySpendSubmissions.entry_id)
    ).all()
    if not rows:
        raise HTTPException(404, "Submission not found.")

    customer = db.get(Customers, rows[0].customer_id)
    return {
        "submissionId": submission_id,
        "customerId": rows[0].customer_id,
        "persona": customer.persona if customer else None,
        "month": rows[0].month,
        "totalSpend": round(sum(r.amount for r in rows), 2),
        "totalCarbonKg": round(sum(r.carbon_impact for r in rows), 2),
        "entries": [
            {
                "category": r.category,
                "subcategory": r.subcategory,
                "amount": r.amount,
                "carbonKg": round(r.carbon_impact, 2),
                "note": r.notes,
            }
            for r in rows
        ],
    }


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

    return db.execute(stmt).all()

# {"category": "Travel", "subcategory": "Self-owned car", "amount": 280, "carbon_impact": 53.76}, 

# keep this last: anything not matched by an API route above falls through to the website files
app.mount("/", StaticFiles(directory=WEBSITE_DIR, html=True), name="website")
