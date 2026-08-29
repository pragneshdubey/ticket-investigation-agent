import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

ROOT_DIR = Path(__file__).resolve().parents[2]
ESCALATIONS_DIR = ROOT_DIR / "backend" / "data" / "escalations"
ESCALATIONS_FILE = ESCALATIONS_DIR / "escalations.json"

_escalation_lock = threading.Lock()


def escalate_to_human(
    ticket_text: str,
    reason: str,
    ticket_id: Optional[str] = None,
    proposed_classification: Optional[Dict[str, Any]] = None,
    duplicate_info: Optional[Dict[str, Any]] = None,
    trajectory: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Escalate an ambiguous or complex IT ticket to human review.
    """
    with _escalation_lock:
        ESCALATIONS_DIR.mkdir(parents=True, exist_ok=True)

    escalation_id = f"ESC-{uuid.uuid4().hex[:8].upper()}"
    record = {
        "escalation_id": escalation_id,
        "ticket_id": ticket_id or "UNTRACKED",
        "ticket_text": ticket_text,
        "reason": reason,
        "proposed_classification": proposed_classification,
        "duplicate_info": duplicate_info,
        "trajectory": trajectory or [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "escalated",
        "human_review": None,
    }

    # Load existing escalations
    existing: List[Dict[str, Any]] = []
    if ESCALATIONS_FILE.exists():
        try:
            existing = json.loads(ESCALATIONS_FILE.read_text(encoding="utf-8"))
        except Exception:
            existing = []

    # Check if an escalation for this ticket_id already exists to avoid duplication
    updated = False
    for idx, item in enumerate(existing):
        if item.get("ticket_id") == record["ticket_id"] and record["ticket_id"] != "UNTRACKED":
            existing[idx] = record
            updated = True
            break

    if not updated:
        existing.append(record)

    ESCALATIONS_FILE.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")

    return {
        "status": "escalated",
        "escalation_id": escalation_id,
        "reason": reason,
        "ticket_id": record["ticket_id"],
        "timestamp": record["timestamp"],
    }


def get_escalation_by_ticket_id(ticket_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve an escalation record by ticket_id or escalation_id."""
    if not ESCALATIONS_FILE.exists():
        return None
    try:
        data = json.loads(ESCALATIONS_FILE.read_text(encoding="utf-8"))
        for item in data:
            if item.get("ticket_id") == ticket_id or item.get("escalation_id") == ticket_id:
                return item
    except Exception:
        return None
    return None


def record_human_review(
    ticket_id: str,
    human_action: str,
    reviewer_notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Record a human review decision for an escalated ticket.
    """
    with _escalation_lock:
        status_map = {
            "confirm": "completed",
            "reassign": "reassigned",
            "ask_more_info": "waiting_for_info",
        }
    review_status = status_map.get(human_action, "completed")
    timestamp = datetime.now(timezone.utc).isoformat()

    review_data = {
        "human_action": human_action,
        "status": review_status,
        "timestamp": timestamp,
        "reviewer_notes": reviewer_notes,
    }

    existing: List[Dict[str, Any]] = []
    if ESCALATIONS_FILE.exists():
        try:
            existing = json.loads(ESCALATIONS_FILE.read_text(encoding="utf-8"))
        except Exception:
            existing = []

    target_record: Optional[Dict[str, Any]] = None
    for item in existing:
        if item.get("ticket_id") == ticket_id or item.get("escalation_id") == ticket_id:
            target_record = item
            break

    if target_record and (
        target_record.get("human_review") is not None
        or target_record.get("status") in ["completed", "reassigned", "waiting_for_info"]
    ):
        curr_status = target_record.get("status", "already reviewed")
        raise ValueError(
            f"Ticket '{ticket_id}' has already been reviewed (current status: {curr_status})."
        )

    if not target_record:
        # Create fallback record if ticket_id was not previously persisted
        target_record = {
            "escalation_id": f"ESC-{uuid.uuid4().hex[:8].upper()}",
            "ticket_id": ticket_id,
            "ticket_text": f"Escalated ticket {ticket_id}",
            "reason": "Escalated for human review.",
            "proposed_classification": None,
            "duplicate_info": None,
            "trajectory": [],
            "timestamp": timestamp,
            "status": "escalated",
        }
        existing.append(target_record)

    target_record["status"] = review_status
    target_record["human_review"] = review_data

    # Append human_review step to trajectory if trajectory exists
    traj = target_record.get("trajectory") or []
    step_num = len(traj) + 1
    traj.append(
        {
            "step_number": step_num,
            "action": "human_review",
            "reason": f"Human reviewer selected action '{human_action}'.",
            "input": {"human_action": human_action, "reviewer_notes": reviewer_notes},
            "output": {"status": review_status, "timestamp": timestamp},
        }
    )
    target_record["trajectory"] = traj

    ESCALATIONS_FILE.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
    return target_record
