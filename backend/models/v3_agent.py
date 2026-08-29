from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class VerificationResult(BaseModel):
    agreement: bool = Field(description="Whether the verifier confirmed the proposed classification.")
    reason: str = Field(description="Concise justification for the verification decision.")


class V3TrajectoryStep(BaseModel):
    step_number: int
    action: Literal[
        "classify_ticket",
        "search_duplicate_tickets",
        "verify_classification",
        "escalate_to_human",
        "final_decision",
    ]
    reason: str = Field(description="Concise observable justification for taking this action.")
    input: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)


class V3TriageRequest(BaseModel):
    ticket_id: Optional[str] = None
    text: str


class V3FinalDecision(BaseModel):
    action: Literal["auto_route", "duplicate_route", "escalate"]
    category: Optional[Literal["Account Access", "Hardware", "Network", "Software"]] = None
    priority: Optional[Literal["Low", "Medium", "High"]] = None
    duplicate_id: Optional[str] = None
    escalation_reason: Optional[str] = None
    verification_result: Optional[VerificationResult] = None


class V3TriageResponse(BaseModel):
    ticket_id: str
    ticket_text: str
    status: Literal["auto_routed", "duplicate_linked", "escalated"]
    final_decision: V3FinalDecision
    trajectory: List[V3TrajectoryStep]

