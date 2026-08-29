import json
from typing import Any, Dict, List, Optional

from backend.models.v3_agent import (
    V3FinalDecision,
    V3TriageRequest,
    V3TriageResponse,
    V3TrajectoryStep,
    VerificationResult,
)
from backend.tools.classifier_tool import classify_ticket
from backend.tools.duplicate_tool import search_duplicate_tickets
from backend.tools.escalation_tool import escalate_to_human
from backend.tools.verifier_tool import verify_classification


class V3TriageAgent:
    """
    V3 Verification-enabled Triage Agent.

    Workflow:
    1. classify_ticket()
    2. search_duplicate_tickets()
    3. verify_classification()
    4. Decision Policy:
       - Agreement == True  -> Proceed to final decision (auto_route or duplicate_route).
       - Agreement == False -> Immediately escalate to human support (NO automatic retry loop).
    """

    def run(self, ticket_req: V3TriageRequest) -> V3TriageResponse:
        ticket_id = ticket_req.ticket_id or "UNTRACKED"
        ticket_text = ticket_req.text.strip()

        trajectory: List[V3TrajectoryStep] = []
        step_number = 1

        # Step 1: Classify ticket
        cls_output = classify_ticket(ticket_text)
        trajectory.append(
            V3TrajectoryStep(
                step_number=step_number,
                action="classify_ticket",
                reason="Initial classification of issue category and priority.",
                input={"text": ticket_text},
                output=cls_output,
            )
        )
        step_number += 1

        # Step 2: Search duplicates
        dup_output = search_duplicate_tickets(ticket_text)
        trajectory.append(
            V3TrajectoryStep(
                step_number=step_number,
                action="search_duplicate_tickets",
                reason="Search open incidents using semantic embeddings for duplicates.",
                input={"text": ticket_text},
                output=dup_output,
            )
        )
        step_number += 1

        # Determine proposed category & priority
        is_duplicate = dup_output.get("is_duplicate_found", False)
        best_match = dup_output.get("best_match") or {}

        if is_duplicate and best_match:
            proposed_cat = best_match.get("category") or cls_output.get("category")
            proposed_pri = best_match.get("priority") or cls_output.get("priority")
            dup_id = best_match.get("id")
        else:
            proposed_cat = cls_output.get("category")
            proposed_pri = cls_output.get("priority")
            dup_id = None

        # Step 3: Verify classification independently
        verify_output = verify_classification(
            ticket_text=ticket_text,
            proposed_category=proposed_cat,
            proposed_priority=proposed_pri,
        )

        verification_res = VerificationResult(
            agreement=verify_output.get("agreement", False),
            reason=verify_output.get("reason", "Verification completed."),
        )

        trajectory.append(
            V3TrajectoryStep(
                step_number=step_number,
                action="verify_classification",
                reason="Independently verify whether proposed category and priority are supported by ticket text.",
                input={
                    "ticket_text": ticket_text,
                    "proposed_category": proposed_cat,
                    "proposed_priority": proposed_pri,
                },
                output=verify_output,
            )
        )
        step_number += 1

        # Step 4: Verification Policy Evaluation
        if verification_res.agreement:
            # Verifier AGREES: proceed to auto-route / duplicate-route
            if is_duplicate and dup_id:
                final_status = "duplicate_linked"
                final_dec = V3FinalDecision(
                    action="duplicate_route",
                    category=proposed_cat,
                    priority=proposed_pri,
                    duplicate_id=dup_id,
                    verification_result=verification_res,
                )
            else:
                final_status = "auto_routed"
                final_dec = V3FinalDecision(
                    action="auto_route",
                    category=proposed_cat,
                    priority=proposed_pri,
                    verification_result=verification_res,
                )

            trajectory.append(
                V3TrajectoryStep(
                    step_number=step_number,
                    action="final_decision",
                    reason="Verifier agreed with proposed classification. Proceeding to route.",
                    input={
                        "proposed_category": proposed_cat,
                        "proposed_priority": proposed_pri,
                        "is_duplicate": is_duplicate,
                    },
                    output=final_dec.model_dump(),
                )
            )

        else:
            # Verifier DISAGREES: Immediately escalate to human (NO retry)
            esc_reason = f"Verifier disagreement: {verification_res.reason}"
            esc_input = {
                "ticket_id": ticket_id,
                "text": ticket_text,
                "reason": esc_reason,
                "proposed_classification": {"category": proposed_cat, "priority": proposed_pri},
                "duplicate_info": dup_output,
            }
            esc_output = escalate_to_human(
                ticket_text=ticket_text,
                reason=esc_reason,
                ticket_id=ticket_id,
                proposed_classification={"category": proposed_cat, "priority": proposed_pri},
                duplicate_info=dup_output,
            )

            trajectory.append(
                V3TrajectoryStep(
                    step_number=step_number,
                    action="escalate_to_human",
                    reason=esc_reason,
                    input=esc_input,
                    output=esc_output,
                )
            )
            step_number += 1

            final_status = "escalated"
            final_dec = V3FinalDecision(
                action="escalate",
                escalation_reason=esc_reason,
                verification_result=verification_res,
            )

            trajectory.append(
                V3TrajectoryStep(
                    step_number=step_number,
                    action="final_decision",
                    reason="Verifier disagreed with classification. Escalate immediately without retry.",
                    input={"escalation_id": esc_output.get("escalation_id")},
                    output=final_dec.model_dump(),
                )
            )

        return V3TriageResponse(
            ticket_id=ticket_id,
            ticket_text=ticket_text,
            status=final_status,
            final_decision=final_dec,
            trajectory=trajectory,
        )

