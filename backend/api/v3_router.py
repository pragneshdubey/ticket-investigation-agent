import json
from pathlib import Path
from typing import Any, List
from fastapi import APIRouter, HTTPException

from backend.agents.v3_triage_agent import V3TriageAgent
from backend.models.v3_agent import V3TriageRequest, V3TriageResponse

router = APIRouter(prefix="/api/v3", tags=["V3 Verification Triage Agent"])
v3_agent_instance = V3TriageAgent()

ESCALATIONS_FILE = (
    Path(__file__).resolve().parents[2]
    / "backend"
    / "data"
    / "escalations"
    / "escalations.json"
)


@router.post("/triage", response_model=V3TriageResponse)
def triage_ticket_v3(request: V3TriageRequest) -> V3TriageResponse:
    """Run the V3 Agentic Triage workflow with independent verification."""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Ticket text cannot be empty.")
    try:
        return v3_agent_instance.run(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"V3 triage agent error: {exc}") from exc


@router.get("/escalations", response_model=List[Any])
def get_escalations_v3() -> List[Any]:
    """Retrieve recorded human escalation records."""
    if not ESCALATIONS_FILE.exists():
        return []
    try:
        return json.loads(ESCALATIONS_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read escalations store: {exc}"
        ) from exc

