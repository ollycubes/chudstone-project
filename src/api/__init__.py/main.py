# POST /calculate request body example:
import logging
from enum import Enum

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
