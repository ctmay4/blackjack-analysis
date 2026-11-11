import importlib.util
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

if all(importlib.util.find_spec(name) is not None for name in ("fastapi", "httpx")):
    from fastapi.testclient import TestClient
    from blackjack_analysis.web import COOKIE, create_app
else:
    TestClient = None

from blackjack_analysis.game import Rules
from blackjack_analysis.trainer import TrainerSession


@unittest.skipIf(TestClient is None, "Install web and test extras to run HTTP tests")
class WebTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = create_app(static_dir=self.temp.name, allowed_hosts=["testserver"])
        self.client = TestClient(self.app, headers={"X-Trainer-Request": "1"})
        self.addCleanup(self.client.close)

    def start(self, config=None, **session_options):
        response = self.client.post("/api/session", json=config or {})
        self.assertEqual(response.status_code, 201, response.text)
        if session_options:
            stored = self.app.state.sessions[self.client.cookies.get(COOKIE)]
            stored.session = TrainerSession(**session_options)
            return self.client.get("/api/session").json()
        return response.json()

    def action(self, revision, action):
        return self.client.post("/api/action", json={"revision": revision, "action": action})

    def test_create_read_resume_and_private_cookie(self):
        state = self.start()
        self.assertEqual(state["revision"], 0)
        self.assertEqual(state["config"]["rules"]["decks"], 6)
        self.assertEqual(self.client.get("/api/session").json(), state)
        cookie_response = TestClient(self.app, headers={"X-Trainer-Request": "1"}).post("/api/session", json={})
        self.assertIn("HttpOnly", cookie_response.headers["set-cookie"])
        self.assertIn("SameSite=strict", cookie_response.headers["set-cookie"])
        self.assertEqual(self.client.post("/api/session", json={}).status_code, 409)

    def test_no_hole_card_or_live_recommendation_leaks(self):
        state = self.start(shoe=[7, 6, 10, 10])
        self.assertIsNone(state["dealer_cards"][1])
        self.assertIsNone(state["dealer_total"])
        self.assertIsNone(state["feedback_detail"]["recommendation"])
        ended = self.action(0, "stand").json()
        self.assertEqual(ended["status"], "complete")
        self.assertEqual(ended["dealer_total"], 17)
        self.assertIsNotNone(ended["dealer_cards"][1])
        self.assertEqual(ended["hands"][0]["outcome"], "loss")
        self.assertEqual(ended["round_profit"], -25)

    def test_delayed_feedback_does_not_leak_until_settlement(self):
        self.start(shoe=[10, 7, 2, 11, 10], delayed_feedback=True)
        state = self.action(0, "hit").json()
        self.assertEqual(state["stats"]["decisions"], 0)
        self.assertIsNone(state["feedback_detail"]["correct"])
        self.assertIsNone(state["feedback_detail"]["recommendation"])
        self.assertIsNone(state["dealer_total"])
        self.assertNotIn("recommends", state["feedback"])
        state = self.action(1, "stand").json()
        self.assertEqual(state["stats"]["decisions"], 2)
        self.assertIn("Round complete", state["feedback"])

    def test_correction_illegal_actions_and_stale_revisions(self):
        self.start(shoe=[2, 7, 6, 10, 10], require_correction=True)
        state = self.action(0, "stand").json()
        self.assertEqual(state["status"], "player_turn")
        self.assertEqual(len(state["hands"][0]["cards"]), 2)
        self.assertEqual(state["stats"]["decisions"], 1)
        self.assertFalse(state["feedback_detail"]["correct"])
        self.assertEqual(self.action(0, "hit").status_code, 409)
        state = self.action(1, "split").json()
        self.assertTrue(state["feedback_detail"]["illegal"])
        self.assertEqual(state["stats"]["decisions"], 1)
        self.assertEqual(self.action(2, "next").status_code, 422)
        self.assertEqual(self.client.get("/api/session").json()["revision"], 2)

    def test_concurrent_duplicate_actions_only_apply_once(self):
        self.start(shoe=[7, 6, 10, 10])
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda _: self.action(0, "stand"), range(2)))
        self.assertEqual(sorted(response.status_code for response in responses), [200, 409])
        self.assertEqual(self.client.get("/api/session").json()["stats"]["decisions"], 1)

    def test_split_and_surrender(self):
        self.start(shoe=[5, 2, 3, 10, 8, 8, 6])
        state = self.action(0, "split").json()
        self.assertEqual(len(state["hands"]), 2)
        self.assertTrue(state["hands"][0]["active"])
        self.assertFalse(state["hands"][1]["active"])
        stored = self.app.state.sessions[self.client.cookies.get(COOKIE)]
        stored.session = TrainerSession(rules=Rules(allow_surrender=True), shoe=[7, 6, 10, 10])
        state = self.action(1, "surrender").json()
        self.assertEqual(state["round_profit"], -12.5)
        self.assertEqual(state["hands"][0]["outcome"], "surrender")

    def test_next_round_natural_and_reset(self):
        self.start(shoe=[7, 6, 10, 10, 7, 10, 11, 6])
        state = self.client.get("/api/session").json()
        self.assertEqual(state["status"], "complete")
        self.assertEqual(state["stats"]["decisions"], 0)
        self.assertEqual(state["round_profit"], 37.5)
        state = self.action(0, "next").json()
        self.assertEqual(state["round_number"], 2)
        reset = self.client.put("/api/session", json={"revision": 1, "config": {
            "bankroll": 2500, "bet": 50, "practice": "soft", "feedback_mode": "correction",
            "rules": {"dealer_hits_soft_17": True},
        }})
        self.assertEqual(reset.status_code, 200, reset.text)
        state = reset.json()
        self.assertEqual(state["revision"], 2)
        self.assertEqual(state["stats"]["decisions"], 0)
        self.assertEqual(state["bankroll"], 2500)
        self.assertTrue(state["hands"][0]["soft"])
        self.assertEqual(state["config"]["feedback_mode"], "correction")
        self.assertEqual(self.client.put("/api/session", json={"revision": 1, "config": {}}).status_code, 409)

    def test_config_validation_and_unknown_actions(self):
        for config in ({"bet": 0}, {"bankroll": -1}, {"rules": {"decks": 0}},
                       {"rules": {"max_splits": 99}}, {"rules": {"penetration": 1}},
                       {"practice": "surrender"}, {"feedback_mode": "unknown"},
                       {"seed": 123}, {"rules": {"oops": True}}):
            with self.subTest(config=config):
                self.assertEqual(self.client.post("/api/session", json=config).status_code, 422)
        self.start()
        self.assertEqual(self.action(0, "cheat").status_code, 422)
        self.assertEqual(self.action(-1, "hit").status_code, 422)

    def test_end_session_clears_cookie_and_state_and_checks_revision(self):
        self.start(shoe=[7, 6, 10, 10])
        key = self.client.cookies.get(COOKIE)
        self.action(0, "stand")
        stale = self.client.request("DELETE", "/api/session", json={"revision": 0})
        self.assertEqual(stale.status_code, 409)
        self.assertIn(key, self.app.state.sessions)
        response = self.client.request("DELETE", "/api/session", json={"revision": 1})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json())
        self.assertNotIn(key, self.app.state.sessions)
        self.assertIsNone(self.client.cookies.get(COOKIE))
        self.assertEqual(self.client.get("/api/session").status_code, 404)
        self.assertEqual(self.action(1, "next").status_code, 404)
        self.assertEqual(self.start()["revision"], 0)

    def test_failed_engine_operation_does_not_partially_score_or_mutate(self):
        before = self.start(shoe=[2, 6, 10, 2])
        response = self.action(0, "stand")  # Dealer needs a card, but shoe is empty.
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/session").json(), before)

    def test_chart_uses_configured_strategy(self):
        self.start(config={"rules": {"allow_surrender": True, "dealer_hits_soft_17": True}})
        stored = self.app.state.sessions[self.client.cookies.get(COOKIE)]
        chart = self.client.get("/api/chart").json()
        self.assertEqual(chart, stored.session.strategy_chart())
        self.assertEqual([section["name"] for section in chart], ["Hard", "Soft", "Pairs"])
        self.assertEqual(chart[0]["rows"][11]["actions"][8], "surrender")  # hard 16 vs 10
        self.assertEqual(len(chart[0]["rows"][0]["actions"]), 10)

    def test_session_isolation_expiry_and_bound(self):
        self.start(shoe=[7, 6, 10, 10])
        other = TestClient(self.app, headers={"X-Trainer-Request": "1"})
        self.addCleanup(other.close)
        self.assertEqual(other.get("/api/session").status_code, 404)
        self.assertEqual(other.post("/api/session", json={"bet": 100}).status_code, 201)
        self.action(0, "stand")
        self.assertEqual(other.get("/api/session").json()["stats"]["decisions"], 0)
        stored = self.app.state.sessions[self.client.cookies.get(COOKIE)]
        stored.touched = time.monotonic() - 13 * 3600
        self.assertEqual(self.client.get("/api/session").status_code, 404)
        bounded = create_app(max_sessions=0, allowed_hosts=["testserver"])
        with TestClient(bounded, headers={"X-Trainer-Request": "1"}) as client:
            self.assertEqual(client.post("/api/session", json={}).status_code, 503)

    def test_origin_host_and_request_header_protection(self):
        self.assertEqual(self.client.post("/api/session", json={}, headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.post("/api/session", json={}, headers={"X-Trainer-Request": ""}).status_code, 403)
        self.assertEqual(self.client.get("/api/session", headers={"Host": "evil.example"}).status_code, 400)
        response = self.client.post("/api/session", json={}, headers={"Origin": "http://testserver"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-frame-options"], "DENY")

    def test_missing_and_built_frontend(self):
        self.assertEqual(self.client.get("/").status_code, 503)
        root = Path(self.temp.name)
        (root / "index.html").write_text("<!doctype html><title>Studio</title>")
        (root / "assets").mkdir()
        (root / "assets" / "app.js").write_text("// built app")
        with TestClient(create_app(static_dir=root, allowed_hosts=["testserver"])) as client:
            self.assertEqual(client.get("/").status_code, 200)
            self.assertEqual(client.get("/assets/app.js").status_code, 200)
            self.assertEqual(client.get("/api/unknown").status_code, 404)


if __name__ == "__main__":
    unittest.main()
