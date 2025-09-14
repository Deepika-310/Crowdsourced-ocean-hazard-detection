# predict.py
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

# ---------- Hazard Keywords ----------
hazard_keywords = {
    "flood": ["flood", "waterlogging", "overflow", "submerged"],
    "tsunami": ["tsunami", "seismic wave"],
    "high_waves": ["high waves", "tidal waves", "swells"],
    "storm_surge": ["storm surge", "cyclone surge"],
    "coastal_damage": ["erosion", "damage", "sea wall break"],
    "fire": ["fire", "burning", "wildfire"],
    "earthquake": ["earthquake", "tremor", "quake"]
}

# Trivial words — penalize or auto-ignore
trivial_keywords = ["stone", "rock", "stick", "leaf", "plastic", "garbage", "branch"]

# ---------- Training Data ----------
texts = [
    "Flood in city area",
    "Heavy rainfall causing waterlogging",
    "Huge tsunami approaching",
    "High waves reported near coast",
    "Forest fire spreading rapidly",
    "Earthquake tremors felt"
]

labels = [
    "flood",
    "flood",
    "tsunami",
    "high_waves",
    "fire",
    "earthquake"
]

# ---------- ML Model ----------
model = Pipeline([
    ("tfidf", TfidfVectorizer()),
    ("clf", LogisticRegression(max_iter=1000))
])

model.fit(texts, labels)

# ---------- Prediction ----------
def predict_text(text: str):
    """Takes text input → returns prediction + probabilities"""
    prediction = model.predict([text])[0]
    probabilities = model.predict_proba([text])[0]

    prob_dict = {
        label: float(prob)
        for label, prob in zip(model.classes_, probabilities)
    }

    return {"prediction": prediction, "probabilities": prob_dict}
