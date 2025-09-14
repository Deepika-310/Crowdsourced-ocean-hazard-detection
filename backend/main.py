# main.py
from fastapi import FastAPI, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import SessionLocal, Report
from predict import predict_text, hazard_keywords, trivial_keywords
import math, datetime
from typing import List
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Config -----
SCORE_THRESHOLD = 0.0         # only show credible reports
CONSENSUS_RADIUS_KM = 5.0      # reports within 5km considered together
CONSENSUS_TARGET = 5           # distinct users needed for full consensus

# ----- DB dependency -----
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ----- Request schema -----
class ReportIn(BaseModel):
    user_id: str
    text: str
    lat: float
    lon: float

# ----- Utility: haversine distance -----
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.asin(math.sqrt(a))

# ----- Scoring function -----
def calculate_score(db: Session, new_report):
    ml_confidence = float(new_report.score or 0.0)

    # Consensus
    reports_all = db.query(Report).filter(Report.hazard_type == new_report.hazard_type).all()
    distinct_users = set()
    for r in reports_all:
        if r.id == new_report.id:
            continue
        if haversine_km(new_report.lat, new_report.lon, r.lat, r.lon) <= CONSENSUS_RADIUS_KM:
            distinct_users.add(r.user_id)
    distinct_users.add(new_report.user_id)
    consensus_score = min(1.0, len(distinct_users) / CONSENSUS_TARGET)

    # Spam penalty
    user_reports_count = db.query(Report).filter(Report.user_id == new_report.user_id).count()
    spam_penalty = 0.0 if user_reports_count <= 3 else min(1.0, (user_reports_count - 3) / 10.0)

    # Keyword legitimacy
    text_lower = (new_report.text or "").lower()
    hazard_match = any(any(word in text_lower for word in words) for words in hazard_keywords.values())
    trivial_match = any(word in text_lower for word in trivial_keywords)

    if hazard_match:
        keyword_score = 0.2
    elif trivial_match:
        keyword_score = -0.4
    else:
        keyword_score = -0.1

    # Time decay (old reports lose weight)
    now = datetime.datetime.utcnow()
    hours_old = (now - new_report.timestamp).total_seconds() / 3600
    time_decay = -0.2 if hours_old > 24 else 0.0

    # Final score
    final = (
        0.5 * ml_confidence +
        0.3 * consensus_score -
        0.2 * spam_penalty +
        keyword_score +
        time_decay
    )
    final = max(0.0, min(1.0, final))

    return final, {
        "ml_confidence": ml_confidence,
        "consensus": consensus_score,
        "spam_penalty": spam_penalty,
        "keyword_score": keyword_score,
        "time_decay": time_decay
    }

# ----- POST /report -----
@app.post("/report")
def create_report(report_in: ReportIn, db: Session = Depends(get_db)):
    # ML prediction
    result = predict_text(report_in.text)
    pred = result["prediction"]
    ml_confidence = max(result["probabilities"].values())

    # Check trivial
    if any(word in report_in.text.lower() for word in trivial_keywords):
        pred = "ignore"   # auto-label trivial as ignore
        ml_confidence = 0.0

    # Save base report
    db_report = Report(
        user_id=report_in.user_id,
        text=report_in.text,
        hazard_type=pred,
        lat=report_in.lat,
        lon=report_in.lon,
        score=ml_confidence
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)

    # Skip scoring for ignore
    if pred == "ignore":
        return {
            "id": db_report.id,
            "hazard_type": "ignore",
            "score": 0.0,
            "breakdown": {"reason": "trivial keywords detected"}
        }

    # Compute legitimacy score
    final_score, breakdown = calculate_score(db, db_report)
    db_report.score = final_score
    db.add(db_report)
    db.commit()
    db.refresh(db_report)

    return {
        "id": db_report.id,
        "hazard_type": db_report.hazard_type,
        "score": db_report.score,
        "breakdown": breakdown
    }

# ----- GET /dashboard -----
@app.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    reports = db.query(Report).filter(
        Report.score >= SCORE_THRESHOLD,
        Report.hazard_type != "ignore"
    ).all()

    return [
        {
            "id": r.id,
            "hazard_type": r.hazard_type,
            "lat": r.lat,
            "lon": r.lon,
            "score": r.score,
            "timestamp": r.timestamp.isoformat()
        }
        for r in reports
    ]
