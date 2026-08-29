import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.agents.v3_triage_agent import V3TriageAgent
from backend.models.v3_agent import V3TriageRequest

ROOT_DIR = Path(__file__).resolve().parents[2]
EVAL_INPUT_PATH = ROOT_DIR / "backend" / "data" / "evaluation" / "eval_tickets.json"
EVAL_OUTPUT_PATH = ROOT_DIR / "evaluation" / "v3" / "v3_results.json"


def safe_div(num: float, den: float) -> Optional[float]:
    return round(num / den, 4) if den > 0 else None


def main() -> None:
    if not EVAL_INPUT_PATH.exists():
        raise FileNotFoundError(f"Evaluation dataset missing at {EVAL_INPUT_PATH}")

    tickets = json.loads(EVAL_INPUT_PATH.read_text(encoding="utf-8"))
    agent = V3TriageAgent()

    results: List[Dict[str, Any]] = []

    cat_correct_count = 0
    pri_correct_count = 0
    exact_cls_correct_count = 0
    labeled_tickets_count = 0

    true_dup_expected = 0
    dup_predicted_count = 0
    dup_correct_count = 0

    escalation_expected = 0
    escalation_predicted_count = 0
    escalation_correct_count = 0

    ambiguous_tickets_count = 0
    unsafe_autoroute_count = 0

    print(f"Starting V3 Verification Agent Evaluation on {len(tickets)} tickets...")

    for idx, ticket in enumerate(tickets, start=1):
        ticket_id = ticket["id"]
        ticket_text = ticket["text"]
        expected_cat = ticket.get("expected_category")
        expected_pri = ticket.get("expected_priority")
        expected_dup = ticket.get("expected_duplicate", False)
        expected_dup_of = ticket.get("duplicate_of")
        expected_esc = ticket.get("expected_escalation", False)

        print(f"[{idx}/{len(tickets)}] Evaluating {ticket_id}...")

        response = agent.run(V3TriageRequest(ticket_id=ticket_id, text=ticket_text))
        final_dec = response.final_decision

        pred_cat = final_dec.category
        pred_pri = final_dec.priority
        pred_dup_id = final_dec.duplicate_id
        pred_action = final_dec.action
        is_escalated = response.status == "escalated"
        is_dup_linked = response.status == "duplicate_linked" or pred_action == "duplicate_route"

        # Classification accuracy on non-escalated labeled tickets
        cat_correct: Optional[bool] = None
        pri_correct: Optional[bool] = None
        exact_correct: Optional[bool] = None

        if expected_cat is not None and not is_escalated:
            labeled_tickets_count += 1
            cat_correct = (pred_cat == expected_cat)
            pri_correct = (pred_pri == expected_pri)
            exact_correct = cat_correct and pri_correct

            if cat_correct:
                cat_correct_count += 1
            if pri_correct:
                pri_correct_count += 1
            if exact_correct:
                exact_cls_correct_count += 1

        # Duplicate tracking
        if expected_dup:
            true_dup_expected += 1

        if is_dup_linked:
            dup_predicted_count += 1
            if expected_dup and (expected_dup_of is None or pred_dup_id == expected_dup_of):
                dup_correct_count += 1

        # Escalation tracking
        if expected_esc:
            escalation_expected += 1
            ambiguous_tickets_count += 1
            if not is_escalated:
                unsafe_autoroute_count += 1

        if is_escalated:
            escalation_predicted_count += 1
            if expected_esc:
                escalation_correct_count += 1

        results.append(
            {
                "ticket_id": ticket_id,
                "ticket_type": ticket.get("type"),
                "ticket_text": ticket_text,
                "status": response.status,
                "predicted": {
                    "action": pred_action,
                    "category": pred_cat,
                    "priority": pred_pri,
                    "duplicate_id": pred_dup_id,
                    "escalation_reason": final_dec.escalation_reason,
                    "verification_result": (
                        final_dec.verification_result.model_dump()
                        if final_dec.verification_result
                        else None
                    ),
                },
                "expected": {
                    "category": expected_cat,
                    "priority": expected_pri,
                    "expected_duplicate": expected_dup,
                    "duplicate_of": expected_dup_of,
                    "expected_escalation": expected_esc,
                },
                "correctness": {
                    "category_correct": cat_correct,
                    "priority_correct": pri_correct,
                    "exact_classification_correct": exact_correct,
                    "duplicate_correct": (
                        (expected_dup and pred_dup_id == expected_dup_of)
                        if is_dup_linked
                        else (not expected_dup if not is_dup_linked else False)
                    ),
                    "escalation_correct": (is_escalated == expected_esc),
                },
                "trajectory": [step.model_dump() for step in response.trajectory],
            }
        )

    classification_accuracy = safe_div(cat_correct_count, labeled_tickets_count)
    priority_accuracy = safe_div(pri_correct_count, labeled_tickets_count)
    exact_classification_accuracy = safe_div(exact_cls_correct_count, labeled_tickets_count)

    duplicate_precision = safe_div(dup_correct_count, dup_predicted_count)
    duplicate_recall = safe_div(dup_correct_count, true_dup_expected)

    escalation_precision = safe_div(escalation_correct_count, escalation_predicted_count)
    escalation_recall = safe_div(escalation_correct_count, escalation_expected)
    escalation_accuracy = safe_div(
        sum(1 for r in results if r["correctness"]["escalation_correct"]), len(tickets)
    )

    unsafe_autoroute_rate = safe_div(unsafe_autoroute_count, ambiguous_tickets_count)

    summary_metrics = {
        "tickets_evaluated": len(tickets),
        "labeled_classification_tickets": labeled_tickets_count,
        "classification_accuracy": classification_accuracy,
        "priority_accuracy": priority_accuracy,
        "exact_classification_accuracy": exact_classification_accuracy,
        "duplicate_metrics": {
            "expected_duplicates": true_dup_expected,
            "predicted_duplicates": dup_predicted_count,
            "correct_duplicates": dup_correct_count,
            "duplicate_precision": duplicate_precision,
            "duplicate_recall": duplicate_recall,
        },
        "escalation_metrics": {
            "expected_escalations": escalation_expected,
            "predicted_escalations": escalation_predicted_count,
            "correct_escalations": escalation_correct_count,
            "escalation_precision": escalation_precision,
            "escalation_recall": escalation_recall,
            "escalation_accuracy": escalation_accuracy,
        },
        "safety_metrics": {
            "ambiguous_tickets": ambiguous_tickets_count,
            "unsafe_autoroutes": unsafe_autoroute_count,
            "unsafe_autoroute_rate": unsafe_autoroute_rate,
        },
    }

    payload = {
        "evaluator": "V3 Verification Agent Evaluator",
        "models": {
            "generation": "gemma3:4b",
            "embeddings": "nomic-embed-text",
            "verifier": "gemma3:4b",
        },
        "duplicate_threshold": 0.80,
        "metrics": summary_metrics,
        "results": results,
    }

    EVAL_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVAL_OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print("\n================ V3 EVALUATION SUMMARY ================")
    print(f"Tickets Evaluated: {len(tickets)}")
    print(f"Classification Category Accuracy: {classification_accuracy}")
    print(f"Classification Priority Accuracy: {priority_accuracy}")
    print(f"Exact Classification Accuracy: {exact_classification_accuracy}")
    print(f"Duplicate Precision: {duplicate_precision} | Duplicate Recall: {duplicate_recall}")
    print(f"Escalation Accuracy: {escalation_accuracy} (Precision: {escalation_precision}, Recall: {escalation_recall})")
    print(f"Unsafe Auto-route Rate: {unsafe_autoroute_rate}")
    print(f"Results saved to: {EVAL_OUTPUT_PATH}")
    print("=======================================================")


if __name__ == "__main__":
    main()

