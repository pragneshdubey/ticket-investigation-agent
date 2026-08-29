import json
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parents[2]
RUNTIME_RUNS_DIR = ROOT_DIR / "backend" / "data" / "runtime_runs"
RUNTIME_RUNS_FILE = RUNTIME_RUNS_DIR / "runtime_runs.json"

_run_lock = threading.Lock()


def _ensure_runtime_runs_dir() -> None:
    """Ensure the runtime runs directory and JSON file exist."""
    RUNTIME_RUNS_DIR.mkdir(parents=True, exist_ok=True)
    if not RUNTIME_RUNS_FILE.exists():
        RUNTIME_RUNS_FILE.write_text("[]", encoding="utf-8")


def get_runtime_runs() -> List[Dict[str, Any]]:
    """Retrieve all persisted runtime agent run records."""
    _ensure_runtime_runs_dir()
    try:
        data = json.loads(RUNTIME_RUNS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_runtime_runs(runs: List[Dict[str, Any]]) -> None:
    """Save runtime agent run records to JSON file."""
    _ensure_runtime_runs_dir()
    RUNTIME_RUNS_FILE.write_text(json.dumps(runs, indent=2), encoding="utf-8")


def get_next_run_id() -> str:
    """
    Generate a predictable, unique run ID (e.g., A-2050)
    by finding the maximum existing numeric run ID.
    """
    existing_ids: List[int] = []

    for item in get_runtime_runs():
        match = re.search(r"A-(\d+)", item.get("run_id", ""))
        if match:
            existing_ids.append(int(match.group(1)))

    max_val = max(existing_ids) if existing_ids else 2048
    start_num = max(max_val, 2048) + 1
    return f"A-{start_num}"


def persist_agent_run(
    ticket_id: str,
    input_text: str,
    status: str,
    action: str,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    duration_seconds: float = 0.0,
    trajectory: Optional[List[Dict[str, Any]]] = None,
    escalation_reason: Optional[str] = None,
    duplicate_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Persist a runtime investigation run resulting from a POST /api/v3/triage call.
    """
    with _run_lock:
        runs = get_runtime_runs()

    # Check if a run for this ticket_id already exists
    existing_run = None
    for r in runs:
        if r.get("ticket_id") == ticket_id and ticket_id != "UNTRACKED":
            existing_run = r
            break

    run_id = existing_run["run_id"] if existing_run else get_next_run_id()
    dur_str = f"{max(0.1, round(duration_seconds, 1)):.1f}s"

    record = {
        "run_id": run_id,
        "ticket_id": ticket_id,
        "input": input_text,
        "status": status,
        "action": action,
        "category": category or "General",
        "priority": priority or "Medium",
        "duration_seconds": round(duration_seconds, 2),
        "duration_str": dur_str,
        "duplicate_id": duplicate_id,
        "escalation_reason": escalation_reason,
        "trajectory": trajectory or [],
        "human_review": existing_run.get("human_review") if existing_run else None,
        "created_at": datetime.now().isoformat(),
    }

    if existing_run:
        runs[runs.index(existing_run)] = record
    else:
        runs.append(record)

    save_runtime_runs(runs)
    return record


def append_human_review_to_run(
    ticket_id: str,
    human_action: str,
    reviewer_notes: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Append human review decision step to the corresponding Agent Run.
    """
    with _run_lock:
        runs = get_runtime_runs()

    target_run = None
    for run in runs:
        if run.get("ticket_id") == ticket_id or run.get("run_id") == ticket_id:
            target_run = run
            break

    if not target_run:
        return None

    status_map = {
        "confirm": "Completed",
        "reassign": "Reassigned",
        "ask_more_info": "Waiting for Info",
    }
    human_status = status_map.get(human_action, "Completed")

    # Update run status
    target_run["status"] = human_status
    target_run["human_review"] = {
        "human_action": human_action,
        "status": human_status,
        "reviewer_notes": reviewer_notes,
        "timestamp": datetime.now().isoformat(),
    }

    # Append human review step to trajectory if not already present
    traj = target_run.get("trajectory") or []
    has_human_step = any(s.get("action") == "human_review" for s in traj if isinstance(s, dict))
    if not has_human_step:
        step_num = len(traj) + 1
        traj.append(
            {
                "step_number": step_num,
                "action": "human_review",
                "reason": f"Human reviewer performed action '{human_action}'.",
                "input": {"human_action": human_action, "notes": reviewer_notes},
                "output": {
                    "human_action": human_action,
                    "status": human_status,
                    "category": target_run.get("category"),
                    "priority": target_run.get("priority"),
                },
            }
        )
        target_run["trajectory"] = traj

    save_runtime_runs(runs)
    return target_run

