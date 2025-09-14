# predict.py
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

# tiny toy training set — expand later with real data
texts = [
    "Flood in city area",
    "Heavy rainfall causing waterlogging",
    "Huge tsunami approaching",
    "High waves reported near coast",
    "Forest fire spreading rapidly",
    "Earthquake tremors felt"
]
labels = ["flood","flood","tsunami","high_waves","fire","earthquake"]

model = Pipeline([
    ("tfidf", TfidfVectorizer()),
    ("clf", LogisticRegression(max_iter=1000))
])
model.fit(texts, labels)

def predict_text(text: str):
    pred = model.predict([text])[0]
    probs = model.predict_proba([text])[0]
    prob_dict = {label: float(p) for label, p in zip(model.classes_, probs)}
    return {"prediction": pred, "probabilities": prob_dict}
# predict.py
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

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
    ("clf", LogisticRegression())
])

model.fit(texts, labels)

def predict_text(text: str):
    """Takes text input → returns prediction + probabilities"""
    prediction = model.predict([text])[0]
    probabilities = model.predict_proba([text])[0]

    prob_dict = {
        label: float(prob)
        for label, prob in zip(model.classes_, probabilities)
    }

    return {"prediction": prediction, "probabilities": prob_dict}
