import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent

# read DATABASE_URL from the .env file at the repo root (if there is one).
# Real environment variables win over .env, so the pipeline/Azure can set it directly.
load_dotenv(BASE_DIR.parents[1] / ".env")

# If DATABASE_URL is set we use it (the Azure PostgreSQL database), e.g.
#   postgresql+psycopg://user:password@server.postgres.database.azure.com:5432/dbname?sslmode=require
# If it isn't set we fall back to the local SQLite file, so the pipeline and tests still work without secrets.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'app.db'}"
IS_SQLITE = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

# create engine tells sqlalchemy to connect to the db and manage the connections
if IS_SQLITE:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},  # needed for SQLite with FastAPI's threads
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,  # check a connection still works before using it (Azure drops idle ones)
        pool_recycle=1800,  # replace pooled connections every 30 minutes for the same reason
    )

# new db sessions ( a visit to the db)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass
# This is the base class for all our models, telling sqlalchemyy that this is a the model class and it should be mapped to db table


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()