import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parents[1] / ".env")  # reads DATABASE_URL from the repo-root .env file if there is one

# If DATABASE_URL is set (e.g. the Azure PostgreSQL server) we use that,
# otherwise we fall back to the local SQLite file next to this file.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'app.db'}"

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    # create engine tells sqlalchemy to connect to the db and manage the connections
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},  # needed for SQLite with FastAPI's threads
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,  # Azure drops idle connections, this checks a connection is alive before using it
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
