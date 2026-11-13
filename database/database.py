from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

BASE_DIR = Path(__file__).resolve().parent
#where to save the database (makes local file app.db in project folder)
SQLALCHEMY_DATABASE_URL = f"sqlite:///{BASE_DIR}/app.db"

#engine handles connection between python and db file
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
#makes a session, which is a temp 
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
