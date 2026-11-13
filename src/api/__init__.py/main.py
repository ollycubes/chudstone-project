# POST /calculate request body example:
import logging
from enum import Enum

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("carbon-api")

app = FastAPI(title="Carbon Footprint & Savings Advisor API", version="0.1.0")


