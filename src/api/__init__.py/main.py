# POST /calculate request body example:
import logging
from enum import Enum

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("carbon-api")

app = FastAPI(title="Carbon Footprint & Savings Advisor API", version="0.1.0")


class Category(str, Enum):
    travel = "travel"
    food = "food"
    utilities = "utilities"


class SpendItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Category
    amount: float = Field(ge=0, le=100_000, description="Monthly spend in GBP")


class CalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")  # reject unexpected parameters

    customerId: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")
    spending: list[SpendItem] = Field(min_length=1, max_length=50)


class BreakdownItem(BaseModel):
    category: Category
    carbonKg: float


class CalculateResponse(BaseModel):
    status: str
    totalCarbonKg: float
    breakdown: list[BreakdownItem]
    recommendations: list[str]

