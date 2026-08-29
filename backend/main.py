from fastapi import FastAPI
from pydantic import BaseModel

from backend.models.baseline import BaselineClassification
from backend.services.baseline_classifier import classify_ticket

app = FastAPI(
    title="ResolveAI",
    description="Agentic IT Support Ticket Triage System",
    version="0.1.0"
)


class BaselineClassifyRequest(BaseModel):
    text: str


@app.post("/baseline/classify", response_model=BaselineClassification)
def baseline_classify(request: BaselineClassifyRequest) -> BaselineClassification:
    return classify_ticket(request.text)


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "ResolveAI backend is running"
    }