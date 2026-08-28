# ResolveAI

ResolveAI is an agentic IT support ticket triage system.

Instead of simply classifying a support request, the system investigates the ticket, chooses appropriate tools, checks for possible duplicate incidents, verifies the proposed decision, and either safely routes the ticket or escalates it to a human reviewer.

## Core Workflow

```text
Raw Ticket
    ↓
Agent Investigation
    ↓
Ticket Classification
    ↓
Duplicate Ticket Search
    ↓
Decision Verification
    ↓
Auto-Route or Human Review