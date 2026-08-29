# V1 Triage Agent Documentation

## Overview

ResolveAI V1 introduces a tool-calling IT support triage agent. Unlike hardcoded classification pipelines, the V1 agent dynamically evaluates incoming complaints, decides which tools to invoke, records observable trajectory steps, and either automatically routes tickets, links duplicates, or escalates ambiguous cases to human operators.

---

## Architecture

```
Raw IT Ticket Complaint
         │
         ▼
 ┌───────────────┐
 │ V1TriageAgent │ ◄── Local Ollama (gemma3:4b) via Structured JSON Schema
 └───────┬───────┘
         │
         ├───► Tool 1: classify_ticket()
         │        └─► Categorizes issue (Account Access, Hardware, Network, Software) & Priority
         │
         ├───► Tool 2: search_duplicate_tickets()
         │        └─► Precomputed nomic-embed-text vector embeddings + Cosine Similarity
         │
         └───► Tool 3: escalate_to_human()
                  └─► Records escalation payload to backend/data/escalations/escalations.json
```

---

## The Three Locked Tools

V1 is restricted to exactly three tools:

1. **`classify_ticket(ticket_text: str)`**
   - **Adapter module**: `backend/tools/classifier_tool.py`
   - Reuses baseline classifier (`backend.services.baseline_classifier.classify_ticket`).
   - Returns locked taxonomy category and priority.

2. **`search_duplicate_tickets(ticket_text: str, top_k: int = 3, threshold: float = 0.80)`**
   - **Module**: `backend/tools/duplicate_tool.py`
   - Uses local Ollama model `nomic-embed-text` via `/api/embeddings`.
   - Precomputes and caches open ticket embeddings from `backend/data/open_tickets/open_tickets.json`.
   - Computes cosine similarity scores, ranks top matches, and returns `is_duplicate_found: true` if similarity >= 0.80.

3. **`escalate_to_human(ticket_text: str, reason: str, proposed_classification: dict, duplicate_info: dict)`**
   - **Module**: `backend/tools/escalation_tool.py`
   - Persists structured escalation records to `backend/data/escalations/escalations.json`.
   - Returns confirmation record with unique `escalation_id` and timestamp.

---

## Agent Decision Loop & Trajectory Format

The agent communicates with local Ollama (`gemma3:4b`) using structured JSON schema response constraints.

### Trajectory Schema (No Private CoT)
To maintain hackathon evaluation integrity and transparency, private chain-of-thought is excluded. Every trajectory step logs observable decision reasons:

```json
{
  "ticket_id": "EVAL-004",
  "status": "duplicate_linked",
  "final_decision": {
    "action": "duplicate_route",
    "category": "Software",
    "priority": "Medium",
    "duplicate_id": "INC-1009"
  },
  "trajectory": [
    {
      "step_number": 1,
      "action": "classify_ticket",
      "reason": "Specific software issue requiring categorization and priority.",
      "input": {"text": "..."},
      "output": {"category": "Software", "priority": "High"}
    },
    {
      "step_number": 2,
      "action": "search_duplicate_tickets",
      "reason": "Check for existing open duplicates.",
      "input": {"text": "..."},
      "output": {
        "is_duplicate_found": true,
        "best_match": {
          "id": "INC-1009",
          "similarity_score": 0.8073
        }
      }
    },
    {
      "step_number": 3,
      "action": "final_decision",
      "reason": "Duplicate ticket found (INC-1009); routing accordingly.",
      "input": {...},
      "output": {
        "action": "duplicate_route",
        "category": "Software",
        "priority": "Medium",
        "duplicate_id": "INC-1009"
      }
    }
  ]
}
```

---

## Evaluation Results

V1 was evaluated against the fixed 15-ticket test set (`backend/data/evaluation/eval_tickets.json`):

| Metric | Baseline Control | V1 Agent |
|---|---|---|
| **Category Accuracy** | 100.0% | 100.0% |
| **Priority Accuracy** | 81.82% | 100.0% |
| **Exact Classification Accuracy** | 81.82% | 100.0% |
| **Duplicate Recall** | N/A | 100.0% (3/3 true duplicates detected) |
| **Duplicate Precision** | N/A | 75.0% |
| **Escalation Recall** | N/A | 100.0% (4/4 ambiguous tickets escalated) |
| **Unsafe Auto-route Rate** | N/A | **0.0%** (Zero ambiguous tickets unsafe-routed) |

### Models Used
- **Generation / Decision Loop**: Ollama `gemma3:4b`
- **Embeddings / Vector Search**: Ollama `nomic-embed-text`

