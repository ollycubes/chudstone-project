import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Form, HTTPException, Query, Request
from fastapi import Path as PathParam
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware
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

# Who is using the app lives in a signed session cookie, never in the URL or form fields,
# so changing ?customer= or customer_id can't show or change another persona's data.
# The cookie is signed with SESSION_SECRET: if it isn't set, a random one is made at startup
# (fine for local dev, but everyone gets signed out whenever the server restarts).
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET") or secrets.token_urlsafe(32),
    session_cookie="chudstone_session",
    max_age=8 * 60 * 60,  # 8 hours
    same_site="lax",  # the browser won't send it on another site's POST/PUT/DELETE (blocks CSRF)
    https_only=os.getenv("SESSION_HTTPS_ONLY") == "1",  # set to 1 when served over https
)

MAX_ID = 2_147_483_647  # biggest id the databases can store; bigger ones are rejected with a 422


def current_customer(request: Request, db: Session = Depends(get_db)) -> Customers:
    # every endpoint that reads or changes someone's spending gets the customer from here
    customer_id = request.session.get("customer_id")
    customer = db.get(Customers, customer_id) if isinstance(customer_id, int) else None
    if customer is None:
        request.session.clear()
        raise HTTPException(401, "Pick a persona first.")
    return customer


CurrentCustomer = Annotated[Customers, Depends(current_customer)]


# what the form sends. FastAPI checks the types and limits automatically
# and replies 422 (with the reason) if anything doesn't fit.
class SpendingForm(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")
    subcategory_id: list[str] = Field(min_length=1, max_length=50)
    amount: list[Annotated[Decimal, Field(gt=0, le=1_000_000_000, decimal_places=2)]] = Field(min_length=1, max_length=50)
    # optional, one per entry (blank if the user didn't write one). Same 200 limit as the form's input box
    note: list[Annotated[str, Field(max_length=200)]] = Field(default_factory=list, max_length=50)

def carbon_kg(amount, emission_factor: float) -> float:
    #carbon is calculated to be used by /submit and edits
    #avoids floating point rounding errors
    return ((float(amount) * 100) * (emission_factor * 1000)) / 100000

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

# Demo "login": picking a persona stores it in the session. This is the only place a
# customer id is accepted from the browser, so a real login (checking a password) can
# replace it later without touching any other endpoint.
@app.post("/session")
def start_session(
    request: Request,
    customer_id: Annotated[int, Form(ge=1, le=MAX_ID)],
    db: Session = Depends(get_db),
) -> dict:
    customer = db.get(Customers, customer_id)
    if customer is None:
        raise HTTPException(422, f"Unknown persona {customer_id}.")
    request.session.clear()
    request.session["customer_id"] = customer.customer_id
    return {"customerId": customer.customer_id, "persona": customer.persona}

@app.get("/session")
def get_session(customer: CurrentCustomer) -> dict:
    return {"customerId": customer.customer_id, "persona": customer.persona}

@app.delete("/session")
def end_session(request: Request) -> dict:
    request.session.clear()
    return {"status": "signed out"}

@app.get("/totals")
def totals(
    customer: CurrentCustomer,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    # the signed-in persona's breakdown, optionally for one month
    rows = category_totals(db, customer_id=customer.customer_id, month=month)
    return [
        {"category": rows.category, "spend": round(rows.spend, 2), "carbon": round(rows.carbon, 2)}
        for rows in rows
    ]

#direct user to dashboard first
@app.get("/", include_in_schema=False)
def home() -> RedirectResponse:
    return RedirectResponse("/dashboard/dash.html")

@app.get("/dashboard", include_in_schema=False)
def dashboard() -> RedirectResponse:
    return RedirectResponse("/dashboard/dash.html")


@app.post("/submit", status_code=201)
def submit(form: Annotated[SpendingForm, Form()], customer: CurrentCustomer, db: Session = Depends(get_db)) -> dict:
    # 1. every card needs a type and an amount (notes are optional)
    if len(form.subcategory_id) != len(form.amount):
        raise HTTPException(422, "each entry needs a type and an amount.")
    # notes can be left out completely, but if they're sent there must be one per entry
    notes = form.note or [""] * len(form.subcategory_id)
    if len(notes) != len(form.subcategory_id):
        raise HTTPException(422, "each entry needs a note (it can be blank).")

    # 2. look up each subcategory's parent category and emission factor in the db
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

    # 3. Save the submission and all its items in one go
    submission_id = (db.scalar(select(func.max(MonthlySpendSubmissions.submission_id))) or 0) + 1
    now = datetime.now(timezone.utc)

    rows = [
        MonthlySpendSubmissions(
            submission_id=submission_id,
            customer_id=customer.customer_id,
            month=form.month,
            category=known[sub][0],
            subcategory=sub,
            amount=float(amount),
            carbon_impact=carbon_kg(amount, known[sub][1]), #amount*emission_factor but avoids floating point rounding errors
            notes=note.strip() or None,  # blank notes are saved as NULL
            date_submitted=now,
        )
        for sub, amount, note in zip(form.subcategory_id, form.amount, notes)
    ]

    # 4. all saved or none do
    db.add_all(rows)
    db.commit()

    return {"status": "saved", "submissionId": submission_id, "entries": len(rows)}

@app.get("/submissions/{submission_id}")
def get_submission(
    submission_id: Annotated[int, PathParam(ge=1, le=MAX_ID)],
    customer: CurrentCustomer,
    db: Session = Depends(get_db),
) -> dict:
    # another persona's submission is a 404, so ids can't be used to find out what exists
    M = MonthlySpendSubmissions
    rows = db.scalars(
        select(M)
        .where(M.submission_id == submission_id, M.customer_id == customer.customer_id)
        .order_by(M.entry_id)
    ).all()
    if not rows:
        raise HTTPException(404, "Submission not found.")

    return {
        "submissionId": submission_id,
        "customerId": customer.customer_id,
        "persona": customer.persona,
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

@app.get("/entries")
def entries(customer: CurrentCustomer, db: Session = Depends(get_db)) -> list[dict]:
    # dashboard builds chart, totals and insight cards from this list
    M = MonthlySpendSubmissions
    rows = db.scalars(
        select(M).where(M.customer_id == customer.customer_id).order_by(M.month, M.submission_id, M.entry_id)
    ).all()
    return [
        {
            "entryId": r.entry_id,
            "submissionId": r.submission_id,
            "month": r.month,
            "category": r.category,
            "subcategory": r.subcategory,
            "amount": r.amount,
            "carbonKg": r.carbon_impact,
            "note": r.notes,
        }
        for r in rows
    ]


@app.put("/entries/{entry_id}")
def update_entry(
    entry_id: Annotated[int, PathParam(ge=1, le=MAX_ID)],
    customer: CurrentCustomer,
    subcategory: Annotated[str, Form()],
    amount: Annotated[Decimal, Form(gt=0, le=1_000_000_000, decimal_places=2)],
    note: Annotated[str, Form(max_length=200)] = "",
    db: Session = Depends(get_db),
) -> dict:
    # edit one of the signed-in persona's entries, then category and carbon are calculated again
    row = own_entry(db, entry_id, customer)

    found = db.execute(
        select(Categories.category_name, Categories.emission_factor)
        .where(Categories.subcategory_name == subcategory)
    ).first()
    if found is None:
        raise HTTPException(422, f"Unknown type {subcategory}.")

    row.category = found[0]
    row.subcategory = subcategory
    row.amount = float(amount)
    row.carbon_impact = carbon_kg(amount, found[1])
    row.notes = note.strip() or None 
    db.commit()

    return {
        "entryId": row.entry_id,
        "submissionId": row.submission_id,
        "month": row.month,
        "category": row.category,
        "subcategory": row.subcategory,
        "amount": row.amount,
        "carbonKg": row.carbon_impact,
        "note": row.notes,
    }


@app.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: Annotated[int, PathParam(ge=1, le=MAX_ID)],
    customer: CurrentCustomer,
    db: Session = Depends(get_db),
) -> dict:
    row = own_entry(db, entry_id, customer)
    db.delete(row)
    db.commit()
    return {"status": "deleted", "entryId": entry_id}


def own_entry(db: Session, entry_id: int, customer: Customers) -> MonthlySpendSubmissions:
    # an entry that doesn't exist and one that belongs to another persona look the same (404)
    M = MonthlySpendSubmissions
    row = db.scalar(select(M).where(M.entry_id == entry_id, M.customer_id == customer.customer_id))
    if row is None:
        raise HTTPException(404, "Entry not found.")
    return row


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