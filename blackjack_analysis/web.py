"""Local-only HTTP adapter for TrainerSession. Run with python -m blackjack_analysis.web."""

import argparse
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
import secrets
from threading import RLock
import time
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, model_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .game import RoundStatus, Rules
from .strategy import StrategyType
from .trainer import TrainerSession

COOKIE = "blackjack_session"
STATIC_DIR = Path(__file__).parent / "web_static"


class TableConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    decks: int = Field(default=6, ge=1, le=8)
    penetration: float = Field(default=0.25, gt=0, lt=1)
    dealer_hits_soft_17: bool = False
    allow_surrender: bool = False
    double_after_split: bool = True
    max_splits: int = Field(default=3, ge=0, le=3)
    resplit_aces: bool = True
    one_card_on_split_aces: bool = True


class SessionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    rules: TableConfig = Field(default_factory=TableConfig)
    bankroll: float = Field(default=1000, gt=0, le=1_000_000_000)
    bet: float = Field(default=25, gt=0, le=1_000_000)
    practice: Literal["all", "hard", "soft", "pair", "surrender", "missed"] = "all"
    feedback_mode: Literal["immediate", "correction", "delayed"] = "immediate"

    @model_validator(mode="after")
    def valid_practice(self):
        if self.practice == "surrender" and not self.rules.allow_surrender:
            raise ValueError("Surrender practice requires late surrender to be enabled.")
        return self

    def session(self):
        return TrainerSession(
            strategy_type=StrategyType.HITS_ON_SOFT_17 if self.rules.dealer_hits_soft_17
            else StrategyType.STANDS_ON_SOFT_17,
            rules=Rules(**self.rules.model_dump()), bankroll=self.bankroll, bet=self.bet,
            practice=self.practice, require_correction=self.feedback_mode == "correction",
            delayed_feedback=self.feedback_mode == "delayed",
        )


class ActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    action: Literal["hit", "stand", "double", "split", "surrender", "next"]


class EndRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)


class ResetRequest(EndRequest):
    config: SessionConfig


@dataclass
class StoredSession:
    session: TrainerSession
    touched: float
    revision: int = 0

    def snapshot(self):
        return {**self.session.snapshot(), "revision": self.revision}


def create_app(*, static_dir=STATIC_DIR, session_ttl=12 * 3600, max_sessions=128,
               allowed_hosts=None):
    app = FastAPI(title="Blackjack Studio", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts or ["localhost", "127.0.0.1", "[::1]"])
    # Single-process, bounded, in-memory sessions. One lock also makes revision checks atomic.
    sessions: dict[str, StoredSession] = {}
    lock = RLock()
    app.state.sessions = sessions

    @app.middleware("http")
    async def local_security(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and (urlsplit(origin).netloc != request.headers.get("host")
                           or urlsplit(origin).scheme != request.url.scheme):
                return JSONResponse({"detail": "Only same-origin requests are allowed."}, status_code=403)
            if request.method in ("POST", "PUT", "DELETE") and request.headers.get("x-trainer-request") != "1":
                return JSONResponse({"detail": "Missing trainer request header."}, status_code=403)
        response = await call_next(request)
        key = request.cookies.get(COOKIE)
        if request.url.path.startswith("/api/") and response.status_code < 400 and key in sessions:
            response.set_cookie(COOKIE, key, httponly=True, samesite="strict", max_age=session_ttl)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    def cleanup():
        now = time.monotonic()
        for key in list(sessions):
            if now - sessions[key].touched > session_ttl:
                del sessions[key]

    def current(request):
        cleanup()
        stored = sessions.get(request.cookies.get(COOKIE))
        if stored is None:
            raise HTTPException(404, "Session expired or not started. Start a new practice session.")
        stored.touched = time.monotonic()
        return stored

    def check_revision(stored, revision):
        if stored.revision != revision:
            raise HTTPException(409, "This hand changed in another request. The latest state has been loaded.")

    @app.get("/api/session")
    def get_session(request: Request):
        with lock:
            return current(request).snapshot()

    @app.post("/api/session", status_code=201)
    def start_session(config: SessionConfig, request: Request, response: Response):
        with lock:
            cleanup()
            if request.cookies.get(COOKIE) in sessions:
                raise HTTPException(409, "A session already exists. Reload or use session settings to restart.")
            if len(sessions) >= max_sessions:
                raise HTTPException(503, "Too many local sessions. Try again after a session expires.")
            stored = StoredSession(config.session(), time.monotonic())
            key = secrets.token_urlsafe(32)
            sessions[key] = stored
            response.set_cookie(COOKIE, key, httponly=True, samesite="strict", max_age=session_ttl)
            return stored.snapshot()

    @app.put("/api/session")
    def reset_session(body: ResetRequest, request: Request):
        with lock:
            stored = current(request)
            check_revision(stored, body.revision)
            stored.session = body.config.session()
            stored.revision += 1
            return stored.snapshot()

    @app.delete("/api/session")
    def end_session(body: EndRequest, request: Request, response: Response):
        with lock:
            stored = current(request)
            check_revision(stored, body.revision)
            del sessions[request.cookies[COOKIE]]
            response.delete_cookie(COOKIE, httponly=True, samesite="strict")
            return None

    @app.post("/api/action")
    def action(body: ActionRequest, request: Request):
        with lock:
            stored = current(request)
            check_revision(stored, body.revision)
            # Commit only complete engine operations; a depleted shoe must not leave
            # partially scored decisions or a half-settled round in the live session.
            session = deepcopy(stored.session)
            try:
                if body.action == "next":
                    if session.round.status is not RoundStatus.COMPLETE:
                        raise HTTPException(422, "Finish the current hand first.")
                    session.next_round()
                else:
                    session.choose(body.action)
            except (ValueError, RuntimeError) as exc:
                raise HTTPException(422, "The shoe could not complete this operation. Start a new session in settings.") from exc
            stored.session = session
            stored.revision += 1
            return stored.snapshot()

    @app.get("/api/chart")
    def chart(request: Request):
        with lock:
            return current(request).session.strategy_chart()

    static_dir = Path(static_dir)
    if (static_dir / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/")
    def index():
        if not (static_dir / "index.html").is_file():
            return JSONResponse({"detail": "Frontend not built. Run npm ci && npm run build in frontend/."}, status_code=503)
        return FileResponse(static_dir / "index.html")

    return app


def main(argv=None):
    parser = argparse.ArgumentParser(description="Launch the local Blackjack Studio web trainer")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    import uvicorn

    print(f"Blackjack Studio: http://127.0.0.1:{args.port} (sessions last until server restart or 12h idle)")
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
