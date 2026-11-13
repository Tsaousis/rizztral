import os
import re
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import features
from .cast import BACHELORETTE, CONTESTANTS, HOST, PLAYER, ROSTER
from .config import Settings
from .game import Game, GameError, GameService
from .leaderboard import Leaderboard
from .llm import LLM, OpenAICompatibleLLM
from .tts import TTS


class StartRequest(BaseModel):
    player_name: str = Field(min_length=1, max_length=20)
    rounds: int | None = None
    daily: bool = False

    @field_validator("player_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = re.sub(r"\s+", " ", value).strip()
        if not value:
            raise ValueError("Name required")
        return value


class AnswerRequest(BaseModel):
    answer: str = Field(default="", max_length=1000)
    wink: bool = False


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    speaker: Literal["host", "clarissa", "jacques", "brad"]


def public_cast(settings: Settings) -> dict:
    models = settings.models
    strip = lambda c: {k: v for k, v in c.items() if k != "persona"}
    return {
        "host": HOST,
        "bachelorette": {**BACHELORETTE, "model": models["clarissa"]},
        "contestants": [{**strip(c), "model": models[c["id"]]} for c in CONTESTANTS] + [PLAYER],
        "roster": [strip(c) for c in ROSTER],
    }


def round_payload(game: Game, number: int) -> dict:
    rnd = game.rounds[number - 1]
    answers = {**(rnd.ai_answers or {}), "player": rnd.player_answer or ""}
    return {
        "round": number,
        "question": rnd.question,
        "answers": answers,
        "scores": rnd.scores,
        "reactions": rnd.reactions,
        "thought": rnd.thought,
        "bonus": rnd.bonus,
        "order": rnd.order,
        "powerups": sorted(game.powerups),
        "totals": game.totals(),
    }


def create_app(settings: Settings | None = None, llm: LLM | None = None, tts: TTS | bool | None = None) -> FastAPI:
    """Pass tts=False to disable voices, or a TTS instance to inject one."""
    settings = settings or Settings()
    offline = llm is None and not settings.api_key
    llm = llm or OpenAICompatibleLLM(settings.api_key, settings.base_url)
    if tts is None:
        tts = TTS(os.getenv("OPENAI_API_KEY")) if settings.tts_enabled else False
    tts = tts or None
    service = GameService(settings, llm, offline=offline)
    leaderboard = Leaderboard(settings.db_path)

    app = FastAPI(title="Rizztral", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_origin_regex=r"https://[-a-z0-9]+\.hf\.space",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.state.service = service
    app.state.leaderboard = leaderboard

    @app.exception_handler(GameError)
    async def game_error(_: Request, exc: GameError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.detail})

    async def guarded(coro):
        try:
            return await coro
        except GameError:
            raise
        except Exception as exc:
            raise HTTPException(502, "Clarissa is fixing her makeup (the AI provider failed). Try again.") from exc

    @app.get("/api/health")
    async def health():
        return {
            "ok": True,
            "provider": settings.provider,
            "demo": settings.demo,
            "offline": service.offline(),
            "llm_key": bool(settings.api_key),
            "ai_games_today": service.ai_games_today,
            "ai_games_cap": settings.max_ai_games_per_day,
        }

    @app.get("/api/config")
    async def config():
        return {
            "provider": settings.provider,
            "demo": service.offline(),
            "rounds": settings.rounds,
            "round_options": list(settings.round_options),
            "answer_seconds": settings.answer_seconds,
            "max_answer_chars": settings.max_answer_chars,
            "tts": tts is not None,
            "cast": public_cast(settings),
        }

    @app.post("/api/games")
    async def start_game(body: StartRequest):
        if body.rounds is not None and body.rounds not in settings.round_options:
            raise HTTPException(422, f"rounds must be one of {list(settings.round_options)}")
        game = await guarded(service.start(body.player_name, body.rounds, body.daily))
        return {
            "game_id": game.id,
            "intro": game.intro,
            "questions": [r.question for r in game.rounds],
            "daily": game.daily,
            "lineup": {
                seat: {k: v for k, v in game.character(seat).items() if k != "persona"} for seat in game.lineup
            },
        }

    @app.post("/api/games/{game_id}/rounds/{number}/prepare")
    async def prepare_round(game_id: str, number: int):
        game = service.get(game_id)
        before = await guarded(service.ai_answers(game, number))
        rnd = game.rounds[number - 1]
        return {
            "ready": True,
            "order": rnd.order,
            "before": {
                seat: {"answer": text, "score": rnd.scores.get(seat), "reaction": rnd.reactions.get(seat)}
                for seat, text in before.items()
            },
        }

    @app.post("/api/games/{game_id}/rounds/{number}/answer")
    async def answer_round(game_id: str, number: int, body: AnswerRequest):
        game = service.get(game_id)
        await guarded(service.submit(game, number, body.answer, body.wink))
        return round_payload(game, number)

    @app.post("/api/games/{game_id}/rounds/{number}/peek")
    async def peek_round(game_id: str, number: int):
        return await guarded(service.peek(service.get(game_id), number))

    @app.post("/api/games/{game_id}/rounds/{number}/rewrite")
    async def rewrite_round(game_id: str, number: int, body: AnswerRequest):
        game = service.get(game_id)
        await guarded(service.rewrite(game, number, body.answer))
        return round_payload(game, number)

    @app.post("/api/games/{game_id}/verdict")
    async def verdict(game_id: str):
        game = service.get(game_id)
        result = await guarded(service.verdict(game))
        totals = result["totals"]
        leaderboard.record(
            game.id, game.player_name, totals["player"], 10 * len(game.rounds), result["winner"] == "player", game.daily
        )
        if result["models"]:
            leaderboard.record_models(
                game.id, {model: result["winner"] == cid for cid, model in result["models"].items()}
            )
        return result

    @app.get("/api/leaderboard")
    async def get_leaderboard(limit: int = 10, daily: bool = False):
        return leaderboard.top(max(1, min(limit, 50)), features.daily_key() if daily else None)

    @app.post("/api/speech")
    async def speech(body: SpeechRequest):
        if tts is None:
            raise HTTPException(404, "Voice is disabled on this server.")
        audio = await guarded(tts.speak(body.text, body.speaker))
        return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})

    static = settings.static_dir
    if (static / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            candidate = (static / path).resolve()
            if path and candidate.is_file() and static.resolve() in candidate.parents:
                return FileResponse(candidate)
            if path.startswith("api/"):
                raise HTTPException(404)
            return FileResponse(static / "index.html")

    return app


app = create_app()
