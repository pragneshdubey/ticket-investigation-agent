import json
from typing import Any, Dict, List, Optional
from urllib import error, request

from backend.models.v1_agent import (
    TrajectoryStep,
    V1FinalDecision,
    V1TriageRequest,
    V1TriageResponse,
)
from backend.tools.classifier_tool import classify_ticket
from backend.tools.duplicate_tool import search_duplicate_tickets
from backend.tools.escalation_tool import escalate_to_human

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "gemma3:4b"


class V1TriageAgent:
    """
    V1 Tool-calling Triage Agent.

    Equipped with exactly THREE tools:
    1. classify_ticket
    2. search_duplicate_tickets
    3. escalate_to_human

    Iteratively decides which tool to call based on the ticket context,
    records an observable trajectory (with concise decision reasons and no private CoT),
    and yields a structured final triage decision.
    """

    def __init__(self, max_steps: int = 5):
        self.max_steps = max_steps

    def _call_ollama_decision(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """Call Ollama gemma3:4b with a structured JSON schema for action selection."""
        payload = {
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "format": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "classify_ticket",
                            "search_duplicate_tickets",
                            "escalate_to_human",
                            "final_decision",
                        ],
                    },
                    "reason": {
                        "type": "string",
                        "description": "Short concise observable justification for taking this action.",
                    },
                    "args": {
                        "type": "object",
                        "properties": {
                            "text": {"type": "string"},
                            "escalation_reason": {"type": "string"},
                            "final_action": {
                                "type": "string",
                                "enum": ["auto_route", "duplicate_route", "escalate"],
                            },
                            "category": {"type": "string"},
                            "priority": {"type": "string"},
                            "duplicate_id": {"type": "string"},
                        },
                    },
                },
                "required": ["action", "reason"],
                "additionalProperties": False,
            },
        }

        req = request.Request(
            f"{OLLAMA_BASE_URL}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=60) as resp:
                body = resp.read().decode("utf-8")
                res = json.loads(body)
                content = res.get("message", {}).get("content", "")
                return json.loads(content)
        except Exception as exc:
            raise RuntimeError(f"Ollama agent decision request failed: {exc}") from exc

    def run(self, ticket_req: V1TriageRequest) -> V1TriageResponse:
        ticket_id = ticket_req.ticket_id or "UNTRACKED"
        ticket_text = ticket_req.text.strip()

        system_prompt = (
            "You are an IT support triage agent. Your job is to investigate raw support complaints and choose appropriate tools.\n\n"
            "You have access to EXACTLY THREE TOOLS:\n"
            "1. 'classify_ticket': Categorizes ticket into category (Account Access, Hardware, Network, Software) and priority (Low, Medium, High).\n"
            "2. 'search_duplicate_tickets': Searches open incidents using semantic embeddings for existing duplicate tickets.\n"
            "3. 'escalate_to_human': Escalates vague, ambiguous, or multi-issue tickets that cannot be confidently classified/routed.\n\n"
            "DECISION GUIDELINES:\n"
            "- If a ticket is ambiguous, missing clear details, or describes multiple conflicting issues (e.g. both network and hardware failure), call 'escalate_to_human'.\n"
            "- If a ticket is specific and clear, call 'classify_ticket' or 'search_duplicate_tickets'.\n"
            "- After gathering sufficient tool outputs, select 'final_decision'.\n\n"
            "CRITICAL: Keep your 'reason' field concise, objective, and observable (no internal thinking or chain of thought)."
        )

        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Ticket ID: {ticket_id}\nTicket Text: {ticket_text}"},
        ]

        trajectory: List[TrajectoryStep] = []
        step_number = 1

        last_classification: Optional[Dict[str, Any]] = None
        last_duplicate_info: Optional[Dict[str, Any]] = None
        final_decision_obj: Optional[V1FinalDecision] = None
        final_status: str = "auto_routed"

        for step in range(1, self.max_steps + 1):
            decision = self._call_ollama_decision(messages)
            action = decision.get("action")
            reason = decision.get("reason", "Executing next triage step.")
            args = decision.get("args") or {}

            if action == "classify_ticket":
                input_data = {"text": ticket_text}
                output_data = classify_ticket(ticket_text)
                last_classification = output_data

                trajectory.append(
                    TrajectoryStep(
                        step_number=step_number,
                        action="classify_ticket",
                        reason=reason,
                        input=input_data,
                        output=output_data,
                    )
                )
                step_number += 1

                messages.append(
                    {
                        "role": "assistant",
                        "content": json.dumps({"action": action, "reason": reason, "output": output_data}),
                    }
                )
                messages.append(
                    {
                        "role": "user",
                        "content": f"Tool classify_ticket returned: {json.dumps(output_data)}. What is your next action?",
                    }
                )

            elif action == "search_duplicate_tickets":
                input_data = {"text": ticket_text}
                output_data = search_duplicate_tickets(ticket_text)
                last_duplicate_info = output_data

                trajectory.append(
                    TrajectoryStep(
                        step_number=step_number,
                        action="search_duplicate_tickets",
                        reason=reason,
                        input=input_data,
                        output=output_data,
                    )
                )
                step_number += 1

                messages.append(
                    {
                        "role": "assistant",
                        "content": json.dumps({"action": action, "reason": reason, "output": output_data}),
                    }
                )
                messages.append(
                    {
                        "role": "user",
                        "content": f"Tool search_duplicate_tickets returned: {json.dumps(output_data)}. What is your next action?",
                    }
                )

            elif action == "escalate_to_human":
                esc_reason = args.get("escalation_reason") or reason
                input_data = {
                    "ticket_id": ticket_id,
                    "text": ticket_text,
                    "reason": esc_reason,
                    "proposed_classification": last_classification,
                    "duplicate_info": last_duplicate_info,
                }
                output_data = escalate_to_human(
                    ticket_text=ticket_text,
                    reason=esc_reason,
                    ticket_id=ticket_id,
                    proposed_classification=last_classification,
                    duplicate_info=last_duplicate_info,
                )

                trajectory.append(
                    TrajectoryStep(
                        step_number=step_number,
                        action="escalate_to_human",
                        reason=reason,
                        input=input_data,
                        output=output_data,
                    )
                )
                step_number += 1

                final_status = "escalated"
                final_decision_obj = V1FinalDecision(
                    action="escalate",
                    escalation_reason=esc_reason,
                )
                break

            elif action == "final_decision":
                # Determine decision from trajectory state
                if last_duplicate_info and last_duplicate_info.get("is_duplicate_found"):
                    best = last_duplicate_info.get("best_match") or {}
                    dup_id = best.get("id")
                    cat = best.get("category") or (last_classification.get("category") if last_classification else None)
                    pri = best.get("priority") or (last_classification.get("priority") if last_classification else None)
                    final_status = "duplicate_linked"
                    final_decision_obj = V1FinalDecision(
                        action="duplicate_route",
                        category=cat,
                        priority=pri,
                        duplicate_id=dup_id,
                    )
                elif last_classification:
                    final_status = "auto_routed"
                    final_decision_obj = V1FinalDecision(
                        action="auto_route",
                        category=last_classification.get("category"),
                        priority=last_classification.get("priority"),
                    )
                else:
                    # If final decision chosen without prior classification, run classification first
                    cls_res = classify_ticket(ticket_text)
                    final_status = "auto_routed"
                    final_decision_obj = V1FinalDecision(
                        action="auto_route",
                        category=cls_res.get("category"),
                        priority=cls_res.get("priority"),
                    )

                trajectory.append(
                    TrajectoryStep(
                        step_number=step_number,
                        action="final_decision",
                        reason=reason,
                        input={
                            "status": final_status,
                            "classification": last_classification,
                            "duplicate_info": last_duplicate_info,
                        },
                        output=final_decision_obj.model_dump(),
                    )
                )
                break

        # Fallback if loop ended without final_decision or escalation
        if final_decision_obj is None:
            if last_classification is None:
                last_classification = classify_ticket(ticket_text)
            final_status = "auto_routed"
            final_decision_obj = V1FinalDecision(
                action="auto_route",
                category=last_classification.get("category"),
                priority=last_classification.get("priority"),
            )
            trajectory.append(
                TrajectoryStep(
                    step_number=step_number,
                    action="final_decision",
                    reason="Step limit reached; defaulting to auto-route based on available classification.",
                    input={"classification": last_classification},
                    output=final_decision_obj.model_dump(),
                )
            )

        return V1TriageResponse(
            ticket_id=ticket_id,
            ticket_text=ticket_text,
            status=final_status,
            final_decision=final_decision_obj,
            trajectory=trajectory,
        )

