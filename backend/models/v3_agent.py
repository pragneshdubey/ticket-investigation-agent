from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

HumanActionEnum = Literal["confirm", "reassign", "ask_more_info"]


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
        "human_review",
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


class HumanReviewRequest(BaseModel):
    human_action: HumanActionEnum = Field(
        description="The action selected by the human reviewer: 'confirm', 'reassign', or 'ask_more_info'."
    )
    reviewer_notes: Optional[str] = Field(
        default=None, description="Optional notes or comments from the reviewer."
    )


class HumanReviewRecord(BaseModel):
    human_action: HumanActionEnum
    status: str
    timestamp: str
    reviewer_notes: Optional[str] = None


class HumanReviewDetails(BaseModel):
    ticket_id: str
    ticket_text: str
    proposed_category: Optional[str] = None
    proposed_priority: Optional[str] = None
    escalation_reason: Optional[str] = None
    status: str
    available_actions: List[str] = Field(
        default_factory=lambda: ["confirm", "reassign", "ask_more_info"]
    )
    review_record: Optional[HumanReviewRecord] = None


class OpenTicketItem(BaseModel):
    ticket_id: str
    title: str
    category: str
    priority: str
    department: str = "IT"
    status: str
    opened: str
    duplicate_id: Optional[str] = None
    linked_count: Optional[int] = 0


class AgentRunItem(BaseModel):
    run_id: str
    ticket_id: str
    input: str
    status: str
    action: str
    category: Optional[str] = None
    priority: Optional[str] = None
    duration_seconds: float = 0.0
    duration_str: str = "0.0s"
    duplicate_id: Optional[str] = None
    escalation_reason: Optional[str] = None
    trajectory: List[Dict[str, Any]] = Field(default_factory=list)
    human_review: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None


