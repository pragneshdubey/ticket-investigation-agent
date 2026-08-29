import json
from pathlib import Path
from typing import Any, List
from fastapi import APIRouter, HTTPException

from backend.agents.triage_agent import V1TriageAgent
from backend.models.v1_agent import V1TriageRequest, V1TriageResponse

router = APIRouter(prefix="/api/v1", tags=["V1 Triage Agent"])
agent_instance = V1TriageAgent()

ESCALATIONS_FILE = (
    Path(__file__).resolve().parents[2]
    / "backend"
    / "data"
    / "escalations"
    / "escalations.json"
)


@router.post("/triage", response_model=V1TriageResponse)
def triage_ticket(request: V1TriageRequest) -> V1TriageResponse:
    """Run the V1 Agentic Triage workflow on an incoming ticket."""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Ticket text cannot be empty.")
    try:
        return agent_instance.run(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Triage agent error: {exc}") from exc


@router.get("/escalations", response_model=List[Any])
def get_escalations() -> List[Any]:
    """Retrieve recorded human escalation records."""
    if not ESCALATIONS_FILE.exists():
        return []
    try:
        return json.loads(ESCALATIONS_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read escalations store: {exc}"
        ) from exc

