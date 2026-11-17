from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
SQLALCHEMY_DATABASE_URL = f"sqlite:///{BASE_DIR / 'app.db'}"
# this tells us that the DB file is in the same directory as this file, and that we want to use sqlite

# create engine tells sqlalchemy to connect to the db and manage the connectiions
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite with FastAPI's threads
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