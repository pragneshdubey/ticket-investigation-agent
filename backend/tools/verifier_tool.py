import json
from typing import Any, Dict
from urllib import error, request

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "gemma3:4b"

ALLOWED_CATEGORIES = ["Account Access", "Hardware", "Network", "Software"]
ALLOWED_PRIORITIES = ["Low", "Medium", "High"]


def verify_classification(
    ticket_text: str,
    proposed_category: str,
    proposed_priority: str,
) -> Dict[str, Any]:
    """
    Independently verify whether proposed category and priority are supported by ticket text.

    Args:
        ticket_text: Plain text description of the issue.
        proposed_category: Proposed category label.
        proposed_priority: Proposed priority label.

    Returns:
        Dict with "agreement" (bool) and "reason" (str).
    """
    # Sanity validation against taxonomy
    if proposed_category not in ALLOWED_CATEGORIES or proposed_priority not in ALLOWED_PRIORITIES:
        return {
            "agreement": False,
            "reason": (
                f"Proposed classification ({proposed_category}/{proposed_priority}) "
                "violates locked taxonomy enums."
            ),
        }

    system_prompt = (
        "You are an independent verification agent for IT support ticket triage.\n\n"
        "Your task is to determine if an auto-routing classification decision is SAFE and SUFFICIENTLY EVIDENCED.\n\n"
        "Allowed categories:\nAccount Access\nHardware\nNetwork\nSoftware\n\n"
        "Allowed priorities:\nLow\nMedium\nHigh\n\n"
        "VERIFICATION CRITERIA:\n"
        "1. EXPLICIT EVIDENCE REQUIRED: The ticket MUST contain explicit, unambiguous text naming a specific system, application, peripheral, or network resource (e.g. 'Slack', 'VPN', 'password reset', 'keyboard', 'Wi-Fi').\n"
        "2. VAGUE / AMBIGUOUS TICKETS MUST FAIL: If the ticket uses generic wording without specific details (e.g., 'cannot get into system', 'something stopped working', 'it doesn't work'), return agreement=false because auto-routing without explicit evidence is unsafe.\n"
        "3. MULTI-ISSUE CONFLICTS MUST FAIL: If the ticket describes multiple distinct issues spanning different categories (e.g., both VPN disconnects AND Slack crashing, or both flickering screen AND Wi-Fi failure), return agreement=false because a single auto-route category cannot safely handle multiple conflicting issues.\n"
        "4. Return agreement=true ONLY if the ticket contains explicit evidence clearly supporting BOTH the proposed category and priority for a single clear issue.\n\n"
        "Output a concise observable explanation in 'reason' without hidden chain-of-thought."
    )

    user_prompt = (
        f"Ticket:\n{ticket_text.strip()}\n\n"
        f"Proposed category:\n{proposed_category}\n\n"
        f"Proposed priority:\n{proposed_priority}"
    )

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "format": {
            "type": "object",
            "properties": {
                "agreement": {"type": "boolean"},
                "reason": {
                    "type": "string",
                    "description": "Concise justification for agreement or disagreement.",
                },
            },
            "required": ["agreement", "reason"],
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
        with request.urlopen(req, timeout=60) as response:
            body = response.read().decode("utf-8")
            result = json.loads(body)
            content = result.get("message", {}).get("content", "")
            parsed = json.loads(content)
            return {
                "agreement": bool(parsed.get("agreement", False)),
                "reason": str(parsed.get("reason", "Verification completed.")).strip(),
            }
    except error.URLError as exc:
        raise RuntimeError(f"Ollama verifier request failed: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"Error parsing verifier output: {exc}") from exc

