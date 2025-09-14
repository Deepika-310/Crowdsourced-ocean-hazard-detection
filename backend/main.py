# main.py
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import SessionLocal, Report
from predict import predict_text
import math
from typing import List
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev only, allows all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)









# ----- Config -----
SCORE_THRESHOLD = 0.1   # reports with score >= show on dashboard
CONSENSUS_RADIUS_KM = 5.0   # treat reports within 5km as same area
CONSENSUS_TARGET = 5    # number of distinct users to reach full consensus (tunable)

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
    # returns distance in kilometers
    R = 6371.0
    phi1 = math.radians(lat1); phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1); dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.asin(math.sqrt(a))

# ----- Scoring function -----
def calculate_score(db: Session, new_report):
    """
    new_report is a DB Report instance that has hazard_type, lat, lon, user_id and base 'score' from ML confidence.
    We'll compute:
      - consensus_score in [0,1] based on # distinct users reporting same hazard in radius
      - spam_penalty in [0,1] if same user posts many reports in short time (simple version)
      - final_score = 0.6*ml_confidence + 0.3*consensus_score - 0.2*spam_penalty
    """
    # 1) ML confidence (base)
    ml_confidence = float(new_report.score or 0.0)

    # 2) Consensus: count distinct users for same hazard within radius
    reports_all = db.query(Report).filter(Report.hazard_type == new_report.hazard_type).all()
    distinct_users = set()
    for r in reports_all:
        # skip the new report itself (it may be included)
        if r.id == new_report.id:
            continue
        d = haversine_km(new_report.lat, new_report.lon, r.lat, r.lon)
        if d <= CONSENSUS_RADIUS_KM:
            distinct_users.add(r.user_id)
    # include the new reporter
    distinct_users.add(new_report.user_id)
    count = len(distinct_users)
    consensus_score = min(1.0, count / CONSENSUS_TARGET)  # linear up to CONSENSUS_TARGET

    # 3) Spam penalty: if same user has many reports of *any* type in DB, penalize
    user_reports_count = db.query(Report).filter(Report.user_id == new_report.user_id).count()
    # simple penalty: 0 if <=3 reports, else scaled
    if user_reports_count <= 3:
        spam_penalty = 0.0
    else:
        spam_penalty = min(1.0, (user_reports_count - 3) / 10.0)  # heavy spam capped at 1

    # 4) Combine
    final = 0.6 * ml_confidence + 0.3 * consensus_score - 0.2 * spam_penalty
    final = max(0.0, min(1.0, final))
    return final, {"ml_confidence": ml_confidence, "consensus": consensus_score, "spam_penalty": spam_penalty}

# ----- POST /report -----
@app.post("/report")
def create_report(report_in: ReportIn, db: Session = Depends(get_db)):
    # 1) ML prediction
    result = predict_text(report_in.text)
    pred = result["prediction"]
    ml_confidence = max(result["probabilities"].values())

    # 2) persist initial report (with base score = ml_confidence)
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

    # 3) compute full score (consensus/spam) and update record
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
    # return reports with score >= threshold
    reports = db.query(Report).filter(Report.score >= SCORE_THRESHOLD).all()
    out = []
    for r in reports:
        out.append({
            "id": r.id,
            "hazard_type": r.hazard_type,
            "lat": r.lat,
            "lon": r.lon,
            "score": r.score,
            "timestamp": r.timestamp.isoformat()
        })
    return out
