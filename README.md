# Resolve AI

Resolve AI is an agentic IT support ticket triage system designed to move beyond basic zero-shot classification by introducing tool-assisted duplicate investigation, structured adversarial verification, and real human-review escalation workflows.

---

## 1. Problem / Intended User

### Intended User & Environment
The system is built for enterprise IT helpdesk teams managing high volumes of incoming technical support requests (such as an internal IT operations desk supporting employee infrastructure and applications).

### Support Bottlenecks Solved
In traditional IT ticketing:
1. **Misrouting & Re-triage Delay**: Inaccurate initial categorization routes tickets to wrong tier-2 groups, increasing time-to-resolution.
2. **Duplicate Noise**: Mass incident outbreaks (e.g. corporate VPN disconnects or network port failures) create flooded queues of duplicate tickets that obscure root-cause incidents.
3. **Unsafe Blind Auto-Routing**: Standard single-pass classifier models often assign high confidence to vague or ambiguous complaints (e.g. *"I cannot get into the system"*), leading to unsafe automatic routing without necessary technical context.

### Why Triage Needs Safety & Verification
Automated ticket triage cannot rely solely on raw classification probabilities. When an incoming ticket is vague, lacks explicit system evidence, or describes conflicting multi-issue failures, auto-routing is inherently unsafe. An AI triage assistant must possess observable verification logic and a real human-in-the-loop escalation mechanism to handle uncertain cases safely.

### Originality & Pre-existing Assets Disclosure
**Pre-existing assets/design**: The frontend visual design was based on a pre-existing Figma design. The component implementation, application behavior, backend integration, API integration, agent workflow, testing, safety mechanisms, and persistence changes were developed or modified during the hackathon.

---

## 2. What the System Does

When an IT ticket description is submitted, Resolve AI executes a structured 4-stage V3 triage flow:

```
Incoming Ticket Complaint
          │
          ▼
Stage 1: Classification ─────────► Propose Taxonomy Category & Priority
          │
Stage 2: Duplicate Search ───────► Search Active Open Incidents via Vector Embeddings
          │
Stage 3: Adversarial Verification ► Evaluate Explicit Evidence & Multi-Issue Conflicts
          │
          ├───► Agreement == True  ──► Safe Routing Decision (auto_route / duplicate_route)
          └───► Agreement == False ──► Human Review Escalation (escalate_to_human)
```

### Action Semantics & Outcomes
- **`auto_route`**: The verifier confirms explicit textual evidence supporting a single clear category and priority. The ticket is assigned an incident ID (e.g. `INC-1051`) and routed to the team queue.
- **`duplicate_route`**: The duplicate search engine detects a high-similarity match with an existing master incident (e.g. `INC-1010` at 88% similarity). The ticket is linked to the master incident to prevent queue clutter.
- **`escalate` (Human Review)**: The verifier detects generic wording or multi-issue domain conflicts and escalates the ticket to the Human Review queue. Human reviewers can select `Confirm Decision`, `Reassign`, or `Ask User for More Information` via a real interactive interface.

---

## 3. Architecture

Resolve AI consists of a decoupled Vite/React frontend and a FastAPI backend with local Ollama inference services.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Resolve AI Architecture                         │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Frontend (Vite / React)  │ SPA Interface (Investigation, Open Tickets, │
│ http://localhost:8443    │ Agent Runs, Figma-styled Human Review Modal)│
├──────────────────────────┼─────────────────────────────────────────────┤
│ Backend (FastAPI)        │ REST API Routes (/api/v3/triage,            │
│ http://localhost:8000    │ /api/v3/open-tickets, /api/v3/review)       │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Core Triage Pipeline     │ V3TriageAgent, Classifier Tool,             │
│                          │ Duplicate Search Tool, Verifier Tool        │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Local Ollama Services    │ gemma3:4b (Classifier & Verifier Pass)      │
│ http://localhost:11434   │ nomic-embed-text (Cosine Vector Similarity) │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Thread-Safe Persistence  │ JSON Stores (runtime_tickets, runtime_runs, │
│                          │ escalations) with threading.Lock protection │
└──────────────────────────┴─────────────────────────────────────────────┘
```

### Structured Adversarial Verification Pass Disclosure
The system executes a **Structured Adversarial Verification Pass** (`verify_classification()`) using a dedicated verifier prompt and strict safety rubric.

> [!IMPORTANT]
> **Model Family Disclosure**: Both classification (`classify_ticket`) and verification (`verify_classification`) currently utilize the same underlying model family (`gemma3:4b`). Consequently, this pass is accurately described as a **structured adversarial verification pass** (a second-pass check under a stricter rubric) rather than model-independent verification. Utilizing a separate, distinct model family for verification represents a future production enhancement.

---

## 4. Evolution: Baseline → V1 → V2 → V3

| Stage | Capability Added | Why It Matters |
|---|---|---|
| **Baseline** | Single-pass zero-shot classification | Established control benchmark for category and priority classification accuracy. |
| **V1 Agent** | ReAct tool-calling loop (`classify_ticket`, `search_duplicates`) | Enabled agentic tool execution and dynamic duplicate detection. |
| **V2 Agent** | Vector embedding duplicate search (`nomic-embed-text`) | Enabled semantic similarity matching against open master incidents. |
| **V3 Agent** | Structured adversarial verification (`verify_classification`) | Introduced verification safety checks to eliminate unsafe auto-routing on vague tickets. |
| **Production Polish** | Dynamic UI state, thread-safe JSON locks, HTTP 409 re-review protection | Hardened production state sync, concurrent request safety, and human-in-the-loop workflows. |

---

## 5. Evaluation Results

Evaluated on the locked 15-ticket evaluation dataset (`backend/data/evaluation/eval_tickets.json`):

| Metric | Baseline Control | V1 Agent | Initial V3 (Plausible) | Stabilized V3 (Explicit Evidence) |
|---|---|---|---|---|
| **Dataset Size** | 15 tickets | 15 tickets | 15 tickets | **15 tickets** |
| **Category Accuracy** | 100.0% | 100.0% | 100.0% | **100.0%** |
| **Priority Accuracy** | 81.82% | 100.0% | 90.91% | **85.71%** |
| **Exact Classification Accuracy** | 81.82% | 100.0% | 90.91% | **85.71%** |
| **Duplicate Recall** | N/A | 100.0% | 100.0% | **66.67%** |
| **Duplicate Precision** | N/A | 75.0% | 75.0% | **66.67%** |
| **Escalation Recall** | N/A | 100.0% | 0.0% | **100.0%** (4/4 ambiguous/multi-issue escalated) |
| **Escalation Precision** | N/A | 40.0% | N/A | **50.0%** (0.50) |
| **Unsafe Auto-route Rate** | N/A | 0.0% | 100.0% (Unsafe) | **0.0%** (**0% Unsafe!**) |

*Note: Evaluation dataset size is 15 tickets. Metrics reflect exact benchmark calculations recorded in `evaluation/v3/v3_results.json`.*

---

## 6. Safety Design

- **Prompt-Injection Guardrails**: Classifier and verifier prompts explicitly instruct the model that ticket text is **untrusted user data**. Instructions inside ticket descriptions cannot override classification rules or routing policies.
- **Explicit Evidence Requirement**: Auto-routing requires explicit textual evidence naming specific systems or services (e.g. *VPN*, *keyboard*, *Wi-Fi*).
- **Vague & Multi-Issue Rejection**: Complaints using generic wording (*"cannot access system"*) or describing multi-issue conflicts automatically fail verification and escalate to human review.
- **Thread-Safe Critical Sections**: Read-generate-modify-write operations in `runtime_ticket_tool.py`, `runtime_run_tool.py`, and `escalation_tool.py` are enclosed in `threading.Lock()` blocks to prevent concurrent write corruptions or duplicate ticket ID generation.
- **Terminal Re-Review Protection**: Attempts to submit a second human review on an already finalized ticket (`completed`, `reassigned`, `waiting_for_info`) are rejected with `HTTP 409 Conflict`.

---

## 7. Hot Take / Key Engineering Insights

## Hot Take

### Structured verification is not automatically independent verification
It is tempting to label any multi-step LLM pipeline as "self-verifying" or "independently verified." However, because both our classifier and verifier currently use the same `gemma3:4b` base model family, running a second verification step is a **structured adversarial pass under a stricter rubric**, not true cross-model independent verification. If the underlying model has a shared systemic bias, a second pass with the same model family may share that bias. True independent verification requires calling a distinct second model family.

### We intentionally favor escalation recall over escalation precision
In our evaluation metrics:
- **Escalation Recall**: `1.0` (100.0% of ambiguous/multi-issue tickets escalated)
- **Escalation Precision**: `0.5` (50.0%)
- **Unsafe Auto-route Rate**: `0.0%` (0% unsafe auto-routing)

This trade-off is intentional. In enterprise IT helpdesk operations, an unnecessary human review costs a few minutes of reviewer time, whereas an **unsafe automatic route** can misroute a critical incident to an incorrect queue. We deliberately design for 100% escalation recall to guarantee 0% unsafe auto-routing.

---

## 8. Improvement Changelog

| Stage / Iteration | Observed Problem / Evidence | Decision / Change Made | Measurable Impact |
|---|---|---|---|
| **Baseline** | Zero-shot LLM classification lacked tool execution and duplicate detection capabilities. | Built single-pass baseline classifier service and evaluation control harness. | Established control accuracy benchmark (100% Category, 81.82% Priority). |
| **V1 Agent** | Helpdesk queues flooded by manual re-triage and duplicate search delays. | Implemented ReAct tool-calling agent framework (`classify_ticket`, `search_duplicates`). | Enabled automated tool calling and 100% duplicate recall on evaluation dataset. |
| **V2 Agent** | Keyword matching failed to recognize semantically rephrased master incident duplicates. | Integrated vector embedding search (`nomic-embed-text`) with cosine similarity scoring. | Enabled semantic duplicate incident matching against open master tickets. |
| **Initial V3** | Verifier evaluated label *plausibility*, causing generic complaints (`EVAL-008`..`EVAL-011`) to auto-route. | Identified root cause: plausible grading passed vague tickets without explicit evidence. | **Observed 100.0% Unsafe Auto-route Rate** on initial V3 run (4/4 ambiguous cases auto-routed). |
| **Stabilized V3** | Initial V3 passed generic complaints lacking technical context (*"cannot access system"*). | Redesigned `verifier_tool.py` to enforce strict explicit system evidence and multi-issue conflict rejection. | Reduced **Unsafe Auto-route Rate from 100% to 0.0%** and achieved **100% Escalation Recall**. |
| **UI Integration** | Static frontend demo arrays did not reflect live investigation outcomes. | Connected React frontend screens dynamically to FastAPI `/api/v3` endpoints. | Real-time state synchronization across Investigation, Open Tickets, and Agent Runs. |
| **Persistence Hardening** | Concurrent API calls risked JSON write race conditions and duplicate ticket IDs. | Wrapped read-generate-modify-write operations in `threading.Lock()` critical sections. | Guaranteed thread safety (0 lost writes, 0 duplicate IDs) and HTTP 409 re-review protection. |
| **Regression Testing** | Manual testing risked regression on concurrency and human review state sync. | Added 8-test automated regression suite with isolated temporary storage fixtures. | **8/8 passed in 78.06s** with zero production storage mutation. |

---

## 9. Reproduction Guide

### Measured Reproduction Runtime & Cost

- **Total API Cost**: **$0.00** (Uses 100% local Ollama inference with `gemma3:4b` and `nomic-embed-text` models).
- **Automated Regression Suite (8 tests)**: ~1 minute 18 seconds (78.06s).
- **Full V3 Benchmark Evaluation (15 tickets)**: ~2 minutes 48 seconds (168.51s).

### Prerequisites
- Operating System: Windows / macOS / Linux
- Python: 3.10+ (with virtual environment)
- Node.js & pnpm: Node 18+, pnpm installed
- Ollama: Installed and running on `http://localhost:11434`
- Required Ollama Models:
  ```bash
  ollama pull gemma3:4b
  ollama pull nomic-embed-text
  ```

### Environment Configuration
The project is pre-configured to run 100% locally out of the box using Ollama, requiring **zero cloud API keys** for default operation.

1. **Copy Environment Template**:
   ```bash
   cp .env.example .env
   # Or on Windows PowerShell:
   copy .env.example .env
   ```
2. **Variable Classification**:
   - **Required Defaults (Pre-configured)**: `OLLAMA_BASE_URL` (`http://localhost:11434`), `OLLAMA_MODEL` (`gemma3:4b`), `OLLAMA_EMBED_MODEL` (`nomic-embed-text`), `BACKEND_PORT` (`8000`), `FRONTEND_PORT` (`8443`).
   - **Optional Extensions**: `GEMINI_API_KEY` and `GEMINI_MODEL` (only needed if explicitly testing optional cloud LLM fallback providers; NOT required for local evaluation or hackathon demo).

### A. Application Setup & Startup

1. **Backend Startup**:
   ```bash
   # From repository root
   python -m venv backend/venv
   .\backend\venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   python -m uvicorn backend.main:app --port 8000
   ```

2. **Frontend Startup**:
   ```bash
   # In a separate terminal, navigate to frontend/
   cd frontend
   pnpm install
   pnpm dev
   ```
   Access the application at `http://localhost:8443`.

---

### B. Regression Testing Guide

Run the automated test suite from the repository root:
```bash
$env:PYTHONPATH="."
python -m pytest -q
```
*Note: Concurrency regression tests use isolated temporary storage fixtures and execute without invoking Ollama models. Pipeline integration tests exercise live local endpoints. Measured execution runtime: 78.06s (8 passed).*

---

### C. Benchmark Evaluation Commands

Run evaluation benchmarks against the locked 15-ticket dataset:
```bash
# Run Baseline Benchmark
python -m evaluation.baseline.run_baseline

# Run V1 Agent Benchmark
python -m evaluation.v1.run_v1

# Run V3 Verification Benchmark
python -m evaluation.v3.run_v3
```
*Note: Full V3 benchmark evaluation runs in approx 2 minutes 48 seconds (168.51s).*

---

## 10. Testing

The repository includes an 8-test automated regression suite (`tests/test_stabilization_regression.py` and `tests/test_concurrency_regression.py`):

```bash
$env:PYTHONPATH="."
python -m pytest -q
```

**Current Result**: `8 passed in 78.06s`

### Coverage Breakdown
- `test_01_normal_ticket_autoroute`: Verifies clear ticket auto-routing to Network/High.
- `test_02_known_duplicate`: Verifies duplicate detection and master incident linking (`INC-1010`).
- `test_03_ambiguous_ticket_escalation`: Verifies verifier disagreement and escalation to human review.
- `test_04_human_review_flow`: Verifies human review submission and state sync across Open Tickets and Agent Runs.
- `test_05_repeated_human_review_rejection`: Verifies HTTP 409 Conflict on repeated review requests.
- `test_concurrent_runtime_ticket_persistence`: Proves `_ticket_lock` prevents lost writes and duplicate ticket IDs under 10-thread concurrency.
- `test_concurrent_runtime_run_persistence`: Proves `_run_lock` prevents lost writes and duplicate run IDs under 10-thread concurrency.
- `test_concurrent_escalation_review_race_condition`: Proves atomic review validation under concurrent review submissions.

---

## 11. Demo Flow

1. **Initial Preview**: Open `http://localhost:8443` to observe the standard IT ticket example preview.
2. **Clear Ticket Auto-Routing**: Enter *"the lan is not working due to port issue"* and click **Investigate Ticket**. Observe classification (`Network`/`High`), duplicate search, verification agreement, and auto-routing to `INC-1051`.
3. **Duplicate Detection**: Enter *"My laptop keyboard has stopped working."* and click **Investigate Ticket**. Observe duplicate match linking to `INC-1010` (88% similarity).
4. **Ambiguous Ticket Escalation**: Enter *"I cannot get into the system and I need it for work."* Click **Investigate Ticket**. Observe verifier disagreement due to vague text, escalating to Human Review.
5. **Human Review Action**: Click **Review Proposed Decision** in the Decision Summary card. Select **Confirm Decision** and submit. Observe status update to `Completed`.
6. **Open Tickets & Agent Runs Verification**: Click **Open Tickets** in the sidebar to verify `INC-1052` is listed as `Completed`. Click **Agent Runs** to inspect the complete trajectory step timeline.

---

## 12. Known Limitations / Future Improvements

1. **Single Base Model Family**: Classification and verification currently use `gemma3:4b`. Future work includes configuring a distinct secondary model family for cross-model verification.
2. **JSON File Persistence**: File-based JSON storage is ideal for local demo reproducibility. Production scaling would replace JSON files with PostgreSQL/Redis.
3. **Evaluation Benchmark Size**: Evaluated on a locked 15-ticket dataset (`eval_tickets.json`). Expanding to larger multi-department benchmarks represents future evaluation work.

---

## 13. Project Structure

```
resolve-ai/
├── backend/
│   ├── main.py                        # FastAPI application entry point
│   ├── agents/
│   │   └── v3_triage_agent.py         # V3 Triage Agent pipeline logic
│   ├── api/
│   │   ├── v1_router.py               # V1 API routes
│   │   └── v3_router.py               # V3 API routes (/triage, /open-tickets, /review)
│   ├── models/
│   │   └── v3_agent.py                # Pydantic data schemas
│   ├── services/
│   │   └── baseline_classifier.py     # Baseline classifier service
│   ├── tools/
│   │   ├── classifier_tool.py         # Classification tool wrapper
│   │   ├── duplicate_tool.py          # Vector embedding duplicate search
│   │   ├── verifier_tool.py           # Structured adversarial verifier
│   │   ├── escalation_tool.py         # Escalation & human review persistence
│   │   ├── runtime_ticket_tool.py     # Thread-safe runtime ticket persistence
│   │   └── runtime_run_tool.py        # Thread-safe agent run trace persistence
│   └── data/
│       ├── open_tickets/              # Seeded reference open tickets
│       ├── runtime_tickets/           # Runtime ticket JSON store
│       ├── runtime_runs/              # Runtime run trace JSON store
│       └── escalations/               # Escalations JSON store
├── evaluation/
│   ├── baseline/                      # Baseline evaluation scripts & results
│   ├── v1/                            # V1 agent evaluation scripts & results
│   └── v3/                            # V3 agent evaluation scripts & results
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Main React SPA component & UI views
│   │   └── index.css                  # Tailwind CSS styling
│   └── vite.config.ts                 # Vite server & proxy configuration
├── docs/                              # Architecture & verification documentation
└── tests/                             # Automated pytest regression test suite
```

---

## 14. Final Submission Summary

- **0% Unsafe Auto-Routing**: Reduced unsafe auto-routing rate from 100% to 0% by introducing structured adversarial verification.
- **100% Escalation Recall**: Successfully escalates all ambiguous and multi-issue conflicting complaints to human review.
- **Real Human-in-the-Loop Integration**: Fully connected frontend modal and backend review API with HTTP 409 re-review protection.
- **Dynamic End-to-End SPA**: Seamless state synchronization across Investigation, Open Tickets, and Agent Runs screens.
- **Thread-Safe Critical Sections**: Complete `threading.Lock()` protection ensuring zero lost writes or duplicate ticket IDs under concurrent requests.