import json
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parents[2]
OPEN_TICKETS_FILE = ROOT_DIR / "backend" / "data" / "open_tickets" / "open_tickets.json"
RUNTIME_TICKETS_DIR = ROOT_DIR / "backend" / "data" / "runtime_tickets"
RUNTIME_TICKETS_FILE = RUNTIME_TICKETS_DIR / "runtime_tickets.json"

_ticket_lock = threading.Lock()


def _ensure_runtime_dir() -> None:
    """Ensure the runtime tickets directory and JSON file exist."""
    RUNTIME_TICKETS_DIR.mkdir(parents=True, exist_ok=True)
    if not RUNTIME_TICKETS_FILE.exists():
        RUNTIME_TICKETS_FILE.write_text("[]", encoding="utf-8")


def get_runtime_tickets() -> List[Dict[str, Any]]:
    """Retrieve all persisted runtime ticket records."""
    _ensure_runtime_dir()
    try:
        data = json.loads(RUNTIME_TICKETS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_runtime_tickets(tickets: List[Dict[str, Any]]) -> None:
    """Save runtime ticket records to JSON file."""
    _ensure_runtime_dir()
    RUNTIME_TICKETS_FILE.write_text(json.dumps(tickets, indent=2), encoding="utf-8")


def _get_next_ticket_id_unlocked(runtime_tickets: List[Dict[str, Any]]) -> str:
    """Internal helper to calculate next ticket ID from existing tickets."""
    existing_ids: List[int] = []

    # Read seeded tickets
    if OPEN_TICKETS_FILE.exists():
        try:
            seeded = json.loads(OPEN_TICKETS_FILE.read_text(encoding="utf-8"))
            for item in seeded:
                match = re.search(r"INC-(\d+)", item.get("id", ""))
                if match:
                    existing_ids.append(int(match.group(1)))
        except Exception:
            pass

    # Read runtime tickets
    for item in runtime_tickets:
        match = re.search(r"INC-(\d+)", item.get("id", ""))
        if match:
            existing_ids.append(int(match.group(1)))

    max_val = max(existing_ids) if existing_ids else 1049
    start_num = max(max_val, 1049) + 1
    return f"INC-{start_num}"


def get_next_ticket_id() -> str:
    """
    Generate a predictable, unique ticket ID (e.g., INC-1050)
    by finding the maximum existing numeric ID across seeded and runtime tickets.
    """
    with _ticket_lock:
        return _get_next_ticket_id_unlocked(get_runtime_tickets())


def persist_triage_result(
    ticket_text: str,
    action: str,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    duplicate_id: Optional[str] = None,
    escalation_reason: Optional[str] = None,
    escalation_id: Optional[str] = None,
    ticket_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Persist the runtime ticket resulting from a live V3 triage investigation.
    Complete READ-MODIFY-WRITE critical section protected by _ticket_lock.
    """
    with _ticket_lock:
        tickets = get_runtime_tickets()

        target_id = (
            ticket_id
            if (ticket_id and ticket_id != "UNTRACKED" and not ticket_id.startswith("PREVIEW-"))
            else _get_next_ticket_id_unlocked(tickets)
        )

        if action == "auto_route":
            record = {
                "id": target_id,
                "text": ticket_text,
                "title": ticket_text,
                "category": category or "General",
                "priority": priority or "Medium",
                "department": "IT",
                "status": "Open",
                "opened": "Just now",
                "action": "auto_route",
                "duplicate_id": None,
                "created_at": datetime.now().isoformat(),
            }

        elif action == "duplicate_route":
            link_id = f"LINK-{target_id}"
            record = {
                "id": link_id,
                "text": ticket_text,
                "title": ticket_text,
                "category": category or "General",
                "priority": priority or "Medium",
                "department": "IT",
                "status": "Duplicate Linked",
                "opened": "Just now",
                "action": "duplicate_route",
                "duplicate_id": duplicate_id,
                "created_at": datetime.now().isoformat(),
            }

        elif action == "escalate":
            record = {
                "id": target_id,
                "text": ticket_text,
                "title": ticket_text,
                "category": category or "Unassigned",
                "priority": priority or "Unassigned",
                "department": "IT",
                "status": "Human Review",
                "opened": "Just now",
                "action": "escalate",
                "escalation_reason": escalation_reason,
                "escalation_id": escalation_id,
                "created_at": datetime.now().isoformat(),
            }

        else:
            record = {
                "id": target_id,
                "text": ticket_text,
                "title": ticket_text,
                "category": category or "General",
                "priority": priority or "Medium",
                "department": "IT",
                "status": "Open",
                "opened": "Just now",
                "action": action,
                "created_at": datetime.now().isoformat(),
            }

        tickets.append(record)
        save_runtime_tickets(tickets)
        return record


def update_runtime_ticket_status(ticket_id: str, human_action: str) -> Optional[Dict[str, Any]]:
    """
    Update runtime ticket status when human review decision is submitted.
    Complete READ-MODIFY-WRITE critical section protected by _ticket_lock.
    """
    with _ticket_lock:
        tickets = get_runtime_tickets()
        status_map = {
            "confirm": "Completed",
            "reassign": "Reassigned",
            "ask_more_info": "Waiting for Info",
        }
        new_status = status_map.get(human_action, "Completed")

        updated_record = None
        for ticket in tickets:
            if ticket.get("id") == ticket_id or ticket.get("escalation_id") == ticket_id:
                ticket["status"] = new_status
                ticket["human_action"] = human_action
                ticket["updated_at"] = datetime.now().isoformat()
                updated_record = ticket
                break

        if updated_record:
            save_runtime_tickets(tickets)

        return updated_record


def get_all_open_tickets() -> List[Dict[str, Any]]:
    """
    Retrieve all active incidents merged from seeded and runtime tickets.
    """
    combined: List[Dict[str, Any]] = []

    # 1. Load seeded tickets
    if OPEN_TICKETS_FILE.exists():
        try:
            seeded = json.loads(OPEN_TICKETS_FILE.read_text(encoding="utf-8"))
            for i, item in enumerate(seeded):
                ages = ["2h ago", "4h ago", "6h ago", "8h ago", "1d ago", "1d ago", "2d ago", "2d ago", "3d ago", "3d ago"]
                age_str = ages[i % len(ages)]
                combined.append(
                    {
                        "ticket_id": item.get("id", f"INC-{1001 + i}"),
                        "title": item.get("text", ""),
                        "category": item.get("category", "General"),
                        "priority": item.get("priority", "Medium"),
                        "department": item.get("department", "IT"),
                        "status": item.get("status", "Open"),
                        "opened": age_str,
                        "duplicate_id": None,
                        "linked_count": 0,
                    }
                )
        except Exception:
            pass

    # Count duplicate links for master incidents
    runtime_tickets = get_runtime_tickets()
    duplicate_links_map: Dict[str, int] = {}
    for r in runtime_tickets:
        if r.get("action") == "duplicate_route" and r.get("duplicate_id"):
            master_id = r["duplicate_id"]
            duplicate_links_map[master_id] = duplicate_links_map.get(master_id, 0) + 1

    # Attach linked count to seeded master incidents
    for item in combined:
        m_id = item["ticket_id"]
        if m_id in duplicate_links_map:
            item["linked_count"] = duplicate_links_map[m_id]

    # 2. Append runtime master tickets (ignore LINK- records)
    for r in runtime_tickets:
        if r.get("id", "").startswith("LINK-"):
            continue
        combined.append(
            {
                "ticket_id": r.get("id"),
                "title": r.get("title") or r.get("text") or "",
                "category": r.get("category", "General"),
                "priority": r.get("priority", "Medium"),
                "department": r.get("department", "IT"),
                "status": r.get("status", "Open"),
                "opened": r.get("opened", "Just now"),
                "duplicate_id": r.get("duplicate_id"),
                "linked_count": duplicate_links_map.get(r.get("id"), 0),
            }
        )

    return combined
