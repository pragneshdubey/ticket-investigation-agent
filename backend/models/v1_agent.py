from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class TrajectoryStep(BaseModel):
    step_number: int
    action: Literal["classify_ticket", "search_duplicate_tickets", "escalate_to_human", "final_decision"]
    reason: str = Field(description="Concise observable justification for this step.")
    input: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)


class V1TriageRequest(BaseModel):
    ticket_id: Optional[str] = None
    text: str


class V1FinalDecision(BaseModel):
    action: Literal["auto_route", "duplicate_route", "escalate"]
    category: Optional[Literal["Account Access", "Hardware", "Network", "Software"]] = None
    priority: Optional[Literal["Low", "Medium", "High"]] = None
    duplicate_id: Optional[str] = None
    escalation_reason: Optional[str] = None


class V1TriageResponse(BaseModel):
    ticket_id: str
    ticket_text: str
    status: Literal["auto_routed", "duplicate_linked", "escalated"]
    final_decision: V1FinalDecision
    trajectory: List[TrajectoryStep]

