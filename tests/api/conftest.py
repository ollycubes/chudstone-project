"""
Shared setup for the API tests.

Every test gets its own fresh in-memory SQLite database, seeded with the same
sample data as `python -m api.seed`. Nothing touches the real app.db.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api import main
from api.database import Base, get_db
from api.seed import seed


@pytest.fixture
def db_engine(monkeypatch):
    # StaticPool keeps one connection open so the in-memory db doesn't disappear between requests
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        seed(db)
    # the app creates tables on startup using main.engine, point that at the test db too
    monkeypatch.setattr(main, "engine", engine)
    yield engine
    engine.dispose()


@pytest.fixture
def client(db_engine):
    TestSession = sessionmaker(bind=db_engine)

    def get_test_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = get_test_db
    # raise_server_exceptions=False so a crash shows up as a 500 response, like a real user would see
    with TestClient(main.app, raise_server_exceptions=False) as c:
        yield c
    main.app.dependency_overrides.clear()
