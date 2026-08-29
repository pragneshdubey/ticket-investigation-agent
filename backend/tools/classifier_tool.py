from typing import Dict
from backend.services.baseline_classifier import classify_ticket as baseline_classify_ticket


def classify_ticket(ticket_text: str) -> Dict[str, str]:
    """
    Classify an IT ticket into a taxonomy category and priority using the baseline classification logic.

    Args:
        ticket_text: Plain text description of the issue.

    Returns:
        Dict with "category" and "priority".
    """
    classification = baseline_classify_ticket(ticket_text)
    return {
        "category": classification.category,
        "priority": classification.priority,
    }

