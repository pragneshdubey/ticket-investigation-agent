# Human Review Phase Documentation

## 1. Overview
When the V3 Triage Agent encounters a ticket that cannot be safely auto-routed (e.g. due to verifier disagreement, vague wording, or conflicting multi-issue complaints), it escalates the ticket to human support. The Human Review phase introduces a real human interaction workflow where an IT operator reviews the ticket and submits a binding decision.

---

## 2. When a Ticket Enters Human Review
A ticket enters Human Review when:
- The V3 structured adversarial verifier disagrees with the proposed category or priority (`verify_classification()` returns `agreement: false`).
- The ticket lacks explicit textual evidence or describes conflicting multi-issue domain failures.
- An explicit escalation tool call (`escalate_to_human()`) is executed.

---

## 3. Supported Human Actions
The human reviewer must select one of exactly three allowed Pydantic-validated actions:

1. **`confirm`**
   - **Semantics**: The human reviewer accepts the agent's proposed category and priority (or duplicate link).
   - **Status**: Marked as `"completed"`.
2. **`reassign`**
   - **Semantics**: The human reviewer rejects the proposed routing and marks the ticket for manual queue reassignment.
   - **Status**: Marked as `"reassigned"`.
3. **`ask_more_info`**
   - **Semantics**: The human reviewer needs more details from the requester before routing can proceed.
   - **Status**: Marked as `"waiting_for_info"`.

Arbitrary string inputs are strictly rejected with an HTTP 422 validation error.

---

## 4. How Human Decisions Are Persisted
- **Persistence Store**: `backend/data/escalations/escalations.json` via helper functions in `backend/tools/escalation_tool.py`.
- **Fields Persisted**: `ticket_id`, `human_review` (`human_action`, `status`, `timestamp`, `reviewer_notes`), and updated `status`.
- **Trajectory Record**: A `human_review` step is appended to the ticket's execution trajectory:
  ```json
  {
    "step_number": 5,
    "action": "human_review",
    "reason": "Human reviewer selected action 'confirm'.",
    "input": {
      "human_action": "confirm",
      "reviewer_notes": "Confirmed by tier 2 engineer."
    },
    "output": {
      "status": "completed",
      "timestamp": "2026-08-29T12:37:29.508525+00:00"
    }
  }
  ```

---

## 5. Safety & Consistency Policy
- **No Automatic Retry**: Human decision submission does NOT trigger LLM reclassification or verifier re-execution.
- **Human Authority**: The human decision is final for this escalation step.

---

## 6. How to Test the Human Review API

### GET Review Details
```bash
curl -X GET http://localhost:8000/api/v3/review/EVAL-008
```

### POST Review Decision (`confirm`)
```bash
curl -X POST http://localhost:8000/api/v3/review/EVAL-008 \
  -H "Content-Type: application/json" \
  -d '{"human_action": "confirm", "reviewer_notes": "Approved by tier 2"}'
```

### POST Review Decision (`reassign`)
```bash
curl -X POST http://localhost:8000/api/v3/review/EVAL-008 \
  -H "Content-Type: application/json" \
  -d '{"human_action": "reassign"}'
```

### POST Review Decision (`ask_more_info`)
```bash
curl -X POST http://localhost:8000/api/v3/review/EVAL-008 \
  -H "Content-Type: application/json" \
  -d '{"human_action": "ask_more_info"}'
```

