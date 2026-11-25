import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# Load environment variables from .env file
ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

# Azure PostgreSQL connection string
SQLALCHEMY_DATABASE_URL = os.environ["DATABASE_URL"]

# Manage database connections
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True
)

# Create new database sessions
SessionLocal = sessionmaker(bind=engine)


# Base class for all database models
class Base(DeclarativeBase):
    pass


# Provide a database session for API requests
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()