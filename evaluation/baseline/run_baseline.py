import json
from pathlib import Path

from backend.services.baseline_classifier import classify_ticket


ROOT = Path(__file__).resolve().parents[2]
INPUT_PATH = ROOT / "backend" / "data" / "evaluation" / "eval_tickets.json"
OUTPUT_PATH = ROOT / "evaluation" / "baseline" / "baseline_results.json"


def accuracy(correctness: list[bool | None]) -> float | None:
    labeled = [result for result in correctness if result is not None]
    return sum(labeled) / len(labeled) if labeled else None


def main() -> None:
    tickets = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    results = []
    category_correctness = []
    priority_correctness = []
    exact_correctness = []

    for ticket in tickets:
        prediction = classify_ticket(ticket["text"])
        expected_category = ticket["expected_category"]
        expected_priority = ticket["expected_priority"]
        category_is_correct = (
            prediction.category == expected_category
            if expected_category is not None
            else None
        )
        priority_is_correct = (
            prediction.priority == expected_priority
            if expected_priority is not None
            else None
        )
        exact_is_correct = (
            category_is_correct and priority_is_correct
            if category_is_correct is not None and priority_is_correct is not None
            else None
        )
        category_correctness.append(category_is_correct)
        priority_correctness.append(priority_is_correct)
        exact_correctness.append(exact_is_correct)
        results.append(
            {
                "ticket_id": ticket["id"],
                "predicted_category": prediction.category,
                "expected_category": expected_category,
                "category_correct": category_is_correct,
                "predicted_priority": prediction.priority,
                "expected_priority": expected_priority,
                "priority_correct": priority_is_correct,
            }
        )

    category_accuracy = accuracy(category_correctness)
    priority_accuracy = accuracy(priority_correctness)
    exact_accuracy = accuracy(exact_correctness)
    excluded_cases = sum(
        1
        for ticket in tickets
        if ticket.get("expected_category") is None or ticket.get("expected_priority") is None
    )

    payload = {
        "treatment": {
            "null_expected_labels": (
                "Correctness is recorded as null and unlabeled tickets are "
                "excluded from category, priority, and exact accuracy denominators."
            )
        },
        "metrics": {
            "category_accuracy": category_accuracy,
            "priority_accuracy": priority_accuracy,
            "exact_classification_accuracy": exact_accuracy,
        },
        "results": results,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Tickets evaluated: {len(tickets)}")
    print(f"Excluded/null-label cases: {excluded_cases}")
    print(f"Category accuracy: {category_accuracy}")
    print(f"Priority accuracy: {priority_accuracy}")
    print(f"Exact classification accuracy: {exact_accuracy}")
    print(f"Results file: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()