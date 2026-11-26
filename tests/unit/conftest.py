"""
Shared setup for the unit tests.

Unlike tests/api, these call the functions in api/ directly (no HTTP, no TestClient).
Each test gets its own fresh in-memory SQLite session seeded with the sample data.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.database import Base
from api.seed import seed


@pytest.fixture
def empty_db():
    # a session on a brand new database with the tables created but no data
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        yield db
    engine.dispose()


@pytest.fixture
def db(empty_db):
    # the same, but filled with the sample data from api.seed
    seed(empty_db)
    return empty_db
