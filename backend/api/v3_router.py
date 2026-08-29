import json
from pathlib import Path
from typing import Any, List
from fastapi import APIRouter, HTTPException

from backend.agents.v3_triage_agent import V3TriageAgent
from backend.models.v3_agent import (
    HumanReviewDetails,
    HumanReviewRecord,
    HumanReviewRequest,
    V3TriageRequest,
    V3TriageResponse,
)
from backend.tools.escalation_tool import get_escalation_by_ticket_id, record_human_review

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


@router.get("/review/{ticket_id}", response_model=HumanReviewDetails)
def get_ticket_review(ticket_id: str) -> HumanReviewDetails:
    """Retrieve details for human review of an escalated ticket."""
    record = get_escalation_by_ticket_id(ticket_id)
    if not record:
        raise HTTPException(
            status_code=404,
            detail=f"Escalated ticket '{ticket_id}' not found.",
        )

    proposed_cls = record.get("proposed_classification") or {}
    human_rev = record.get("human_review")
    rev_record = (
        HumanReviewRecord(
            human_action=human_rev["human_action"],
            status=human_rev["status"],
            timestamp=human_rev["timestamp"],
            reviewer_notes=human_rev.get("reviewer_notes"),
        )
        if human_rev
        else None
    )

    return HumanReviewDetails(
        ticket_id=record.get("ticket_id", ticket_id),
        ticket_text=record.get("ticket_text", ""),
        proposed_category=proposed_cls.get("category"),
        proposed_priority=proposed_cls.get("priority"),
        escalation_reason=record.get("reason"),
        status=record.get("status", "escalated"),
        available_actions=["confirm", "reassign", "ask_more_info"],
        review_record=rev_record,
    )


@router.post("/review/{ticket_id}", response_model=HumanReviewDetails)
def submit_human_review(
    ticket_id: str, request: HumanReviewRequest
) -> HumanReviewDetails:
    """Submit a real human review decision ('confirm', 'reassign', or 'ask_more_info')."""
    # Pydantic automatically validates human_action enum
    record = record_human_review(
        ticket_id=ticket_id,
        human_action=request.human_action,
        reviewer_notes=request.reviewer_notes,
    )

    proposed_cls = record.get("proposed_classification") or {}
    human_rev = record.get("human_review")
    rev_record = (
        HumanReviewRecord(
            human_action=human_rev["human_action"],
            status=human_rev["status"],
            timestamp=human_rev["timestamp"],
            reviewer_notes=human_rev.get("reviewer_notes"),
        )
        if human_rev
        else None
    )

    return HumanReviewDetails(
        ticket_id=record.get("ticket_id", ticket_id),
        ticket_text=record.get("ticket_text", ""),
        proposed_category=proposed_cls.get("category"),
        proposed_priority=proposed_cls.get("priority"),
        escalation_reason=record.get("reason"),
        status=record.get("status", "completed"),
        available_actions=["confirm", "reassign", "ask_more_info"],
        review_record=rev_record,
    )
