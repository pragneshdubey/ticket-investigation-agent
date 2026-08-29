import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
import uuid

ROOT_DIR = Path(__file__).resolve().parents[2]
ESCALATIONS_DIR = ROOT_DIR / "backend" / "data" / "escalations"
ESCALATIONS_FILE = ESCALATIONS_DIR / "escalations.json"


def escalate_to_human(
    ticket_text: str,
    reason: str,
    ticket_id: Optional[str] = None,
    proposed_classification: Optional[Dict[str, Any]] = None,
    duplicate_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Escalate an ambiguous or complex IT ticket to human review.

    Args:
        ticket_text: Text content of the ticket.
        reason: Justification for human escalation.
        ticket_id: Optional unique identifier for the ticket.
        proposed_classification: Partial or full classification if attempted.
        duplicate_info: Duplicate search findings if available.

    Returns:
        Structured escalation record confirmation.
    """
    ESCALATIONS_DIR.mkdir(parents=True, exist_ok=True)

    escalation_id = f"ESC-{uuid.uuid4().hex[:8].upper()}"
    record = {
        "escalation_id": escalation_id,
        "ticket_id": ticket_id or "UNTRACKED",
        "ticket_text": ticket_text,
        "reason": reason,
        "proposed_classification": proposed_classification,
        "duplicate_info": duplicate_info,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "escalated",
    }

    # Load existing escalations
    existing: list[Dict[str, Any]] = []
    if ESCALATIONS_FILE.exists():
        try:
            existing = json.loads(ESCALATIONS_FILE.read_text(encoding="utf-8"))
        except Exception:
            existing = []

    existing.append(record)
    ESCALATIONS_FILE.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")

    return {
        "status": "escalated",
        "escalation_id": escalation_id,
        "reason": reason,
        "ticket_id": record["ticket_id"],
        "timestamp": record["timestamp"],
    }

