from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.api.v1_router import router as v1_router
from backend.api.v3_router import router as v3_router
from backend.models.baseline import BaselineClassification
from backend.services.baseline_classifier import classify_ticket

app = FastAPI(
    title="ResolveAI",
    description="Agentic IT Support Ticket Triage System",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)
app.include_router(v3_router)


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