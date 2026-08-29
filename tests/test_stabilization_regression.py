import json
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


class TestStabilizationRegression(unittest.TestCase):

    def test_01_normal_ticket_autoroute(self):
        """TEST 1: Normal ticket -> classification -> valid routing."""
        res = client.post("/api/v3/triage", json={"text": "the lan is not working due to port issue"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "auto_routed")
        self.assertEqual(data["final_decision"]["action"], "auto_route")
        self.assertEqual(data["final_decision"]["category"], "Network")

    def test_02_known_duplicate(self):
        """TEST 2: Known duplicate -> duplicate detected -> linked to INC-1010."""
        res = client.post("/api/v3/triage", json={"text": "My laptop keyboard has stopped working."})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "duplicate_linked")
        self.assertEqual(data["final_decision"]["action"], "duplicate_route")
        self.assertEqual(data["final_decision"]["duplicate_id"], "INC-1010")

    def test_03_ambiguous_ticket_escalation(self):
        """TEST 3: Ambiguous ticket -> verifier disagreement -> escalation."""
        res = client.post("/api/v3/triage", json={"text": "I cannot get into the system and I need it for work."})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "escalated")
        self.assertEqual(data["final_decision"]["action"], "escalate")
        self.assertFalse(data["final_decision"]["verification_result"]["agreement"])

    def test_04_human_review_flow(self):
        """TEST 4: Human review -> escalated ticket -> confirm -> Completed."""
        # 1. Create an escalated ticket
        triage_res = client.post("/api/v3/triage", json={"text": "My laptop is not working"})
        self.assertEqual(triage_res.status_code, 200)
        t_id = triage_res.json()["ticket_id"]

        # 2. Submit human review confirm
        rev_res = client.post(f"/api/v3/review/{t_id}", json={"human_action": "confirm"})
        self.assertEqual(rev_res.status_code, 200)
        self.assertEqual(rev_res.json()["status"], "completed")

        # 3. Verify sync in open tickets
        open_res = client.get("/api/v3/open-tickets")
        self.assertEqual(open_res.status_code, 200)
        ticket_match = next((t for t in open_res.json() if t["ticket_id"] == t_id), None)
        self.assertIsNotNone(ticket_match)
        self.assertEqual(ticket_match["status"], "Completed")

        # 4. Verify sync in agent runs
        runs_res = client.get("/api/v3/agent-runs")
        self.assertEqual(runs_res.status_code, 200)
        run_match = next((r for r in runs_res.json() if r["ticket_id"] == t_id), None)
        self.assertIsNotNone(run_match)
        self.assertEqual(run_match["status"], "Completed")
        self.assertEqual(run_match["trajectory"][-1]["action"], "human_review")

    def test_05_repeated_human_review_rejection(self):
        """TEST 5: Repeated human review on already completed ticket -> 409 Conflict."""
        # 1. Create escalated ticket
        triage_res = client.post("/api/v3/triage", json={"text": "Something is wrong with my computer"})
        self.assertEqual(triage_res.status_code, 200)
        t_id = triage_res.json()["ticket_id"]

        # 2. First review -> success
        rev1 = client.post(f"/api/v3/review/{t_id}", json={"human_action": "confirm"})
        self.assertEqual(rev1.status_code, 200)

        # 3. Repeated review -> 409 Conflict
        rev2 = client.post(f"/api/v3/review/{t_id}", json={"human_action": "reassign"})
        self.assertEqual(rev2.status_code, 409)
        self.assertIn("already been reviewed", rev2.json()["detail"])


if __name__ == "__main__":
    unittest.main()

