import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from unittest.mock import patch

from backend.tools.runtime_ticket_tool import (
    persist_triage_result,
    get_runtime_tickets,
)
from backend.tools.runtime_run_tool import (
    persist_agent_run,
    get_runtime_runs,
)
from backend.tools.escalation_tool import (
    escalate_to_human,
    record_human_review,
)


class TestConcurrencyRegression(unittest.TestCase):

    def setUp(self):
        """Set up isolated temporary directory for JSON stores."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.temp_dir.name)

        # Create isolated temporary store subdirectories
        (self.tmp_path / "runtime_tickets").mkdir(parents=True, exist_ok=True)
        (self.tmp_path / "runtime_runs").mkdir(parents=True, exist_ok=True)
        (self.tmp_path / "escalations").mkdir(parents=True, exist_ok=True)

        self.t_file = self.tmp_path / "runtime_tickets" / "runtime_tickets.json"
        self.r_file = self.tmp_path / "runtime_runs" / "runtime_runs.json"
        self.e_file = self.tmp_path / "escalations" / "escalations.json"

        self.t_file.write_text("[]", encoding="utf-8")
        self.r_file.write_text("[]", encoding="utf-8")
        self.e_file.write_text("[]", encoding="utf-8")

        self.patchers = [
            patch("backend.tools.runtime_ticket_tool.RUNTIME_TICKETS_DIR", self.tmp_path / "runtime_tickets"),
            patch("backend.tools.runtime_ticket_tool.RUNTIME_TICKETS_FILE", self.t_file),
            patch("backend.tools.runtime_run_tool.RUNTIME_RUNS_DIR", self.tmp_path / "runtime_runs"),
            patch("backend.tools.runtime_run_tool.RUNTIME_RUNS_FILE", self.r_file),
            patch("backend.tools.escalation_tool.ESCALATIONS_DIR", self.tmp_path / "escalations"),
            patch("backend.tools.escalation_tool.ESCALATIONS_FILE", self.e_file),
        ]

        for p in self.patchers:
            p.start()

    def tearDown(self):
        """Restore patchers and cleanup temporary directory."""
        for p in self.patchers:
            p.stop()
        self.temp_dir.cleanup()

    def test_concurrent_runtime_ticket_persistence(self):
        """
        CONCURRENCY TEST 1:
        Exercises multiple concurrent calls to persist_triage_result().
        Proves that _ticket_lock critical section prevents lost writes
        and guarantees unique ticket ID generation under high thread concurrency.
        """
        num_concurrent = 10

        def worker(i: int):
            return persist_triage_result(
                ticket_text=f"Concurrent test ticket description number {i}",
                action="auto_route",
                category="Hardware",
                priority="High",
            )

        results = []
        with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [executor.submit(worker, i) for i in range(num_concurrent)]
            for future in as_completed(futures):
                results.append(future.result())

        self.assertEqual(len(results), num_concurrent)

        # Retrieve all tickets written to temporary storage
        persisted_tickets = get_runtime_tickets()
        self.assertEqual(
            len(persisted_tickets),
            num_concurrent,
            f"Expected {num_concurrent} persisted tickets, got {len(persisted_tickets)} (lost writes detected!)",
        )

        # Verify all generated ticket IDs are unique
        ticket_ids = [t["id"] for t in persisted_tickets]
        unique_ids = set(ticket_ids)
        self.assertEqual(
            len(unique_ids),
            num_concurrent,
            f"Duplicate ticket IDs detected! All IDs: {ticket_ids}",
        )

    def test_concurrent_runtime_run_persistence(self):
        """
        CONCURRENCY TEST 2:
        Exercises multiple concurrent calls to persist_agent_run().
        Proves that _run_lock critical section prevents lost writes
        and guarantees unique run ID generation under high thread concurrency.
        """
        num_concurrent = 10

        def worker(i: int):
            return persist_agent_run(
                ticket_id=f"INC-900{i}",
                input_text=f"Concurrent run test input text {i}",
                status="auto_routed",
                action="auto_route",
                category="Network",
                priority="Medium",
                duration_seconds=1.5,
            )

        results = []
        with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [executor.submit(worker, i) for i in range(num_concurrent)]
            for future in as_completed(futures):
                results.append(future.result())

        self.assertEqual(len(results), num_concurrent)

        # Retrieve all runs written to temporary storage
        persisted_runs = get_runtime_runs()
        self.assertEqual(
            len(persisted_runs),
            num_concurrent,
            f"Expected {num_concurrent} persisted runs, got {len(persisted_runs)} (lost writes detected!)",
        )

        # Verify all generated run IDs are unique
        run_ids = [r["run_id"] for r in persisted_runs]
        unique_ids = set(run_ids)
        self.assertEqual(
            len(unique_ids),
            num_concurrent,
            f"Duplicate run IDs detected! All run IDs: {run_ids}",
        )

    def test_concurrent_escalation_review_race_condition(self):
        """
        CONCURRENCY TEST 3:
        Exercises concurrent record_human_review() calls on the same ticket.
        Proves that _escalation_lock prevents race conditions where multiple threads
        could both pass validation and overwrite the decision.
        """
        esc = escalate_to_human(
            ticket_text="Concurrent escalation test ticket",
            reason="Ambiguous ticket",
            ticket_id="INC-9999",
        )
        t_id = esc["ticket_id"]

        successes = []
        errors = []

        def review_worker(action: str):
            try:
                rec = record_human_review(ticket_id=t_id, human_action=action)
                successes.append(rec)
            except ValueError as exc:
                errors.append(str(exc))

        actions = ["confirm", "reassign", "ask_more_info"]
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(review_worker, act) for act in actions]
            for future in as_completed(futures):
                future.result()

        # Exactly 1 thread must succeed and 2 must fail with ValueError
        self.assertEqual(
            len(successes),
            1,
            f"Expected exactly 1 review success, got {len(successes)}",
        )
        self.assertEqual(
            len(errors),
            2,
            f"Expected exactly 2 review errors, got {len(errors)}",
        )


if __name__ == "__main__":
    unittest.main()

