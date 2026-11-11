"""Seeded real-engine server for browser tests only; no production test endpoints."""
from functools import partial
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import uvicorn
from blackjack_analysis import web

web.TrainerSession = partial(web.TrainerSession, seed=1)
uvicorn.run(web.create_app(), host="127.0.0.1", port=8765, log_level="warning")
