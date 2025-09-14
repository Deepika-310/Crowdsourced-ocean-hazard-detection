# database.py
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

DATABASE_URL = "sqlite:///./reports.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    text = Column(String)
    hazard_type = Column(String, index=True)
    lat = Column(Float)
    lon = Column(Float)
    score = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

# create tables
Base.metadata.create_all(bind=engine)
