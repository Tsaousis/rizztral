import os
import re
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from .cast import BACHELORETTE, CONTESTANTS, HOST, PLAYER
from .config import Settings
from .game import Game, GameError, GameService
from .leaderboard import Leaderboard
from .llm import LLM, OpenAICompatibleLLM
from .tts import TTS


class StartRequest(BaseModel):
    player_name: str = Field(min_length=1, max_length=20)
    rounds: int | None = None

    @field_validator("player_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = re.sub(r"\s+", " ", value).strip()
        if not value:
            raise ValueError("Name required")
        return value


class AnswerRequest(BaseModel):
    answer: str = Field(default="", max_length=1000)


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
        game = await guarded(service.start(body.player_name, body.rounds))
        return {"game_id": game.id, "intro": game.intro, "questions": [r.question for r in game.rounds]}

    @app.post("/api/games/{game_id}/rounds/{number}/prepare")
    async def prepare_round(game_id: str, number: int):
        game = service.get(game_id)
        await guarded(service.ai_answers(game, number))
        return {"ready": True}

    @app.post("/api/games/{game_id}/rounds/{number}/answer")
    async def answer_round(game_id: str, number: int, body: AnswerRequest):
        game = service.get(game_id)
        await guarded(service.submit(game, number, body.answer))
        return round_payload(game, number)

    @app.post("/api/games/{game_id}/verdict")
    async def verdict(game_id: str):
        game = service.get(game_id)
        result = await guarded(service.verdict(game))
        totals = result["totals"]
        leaderboard.record(
            game.id, game.player_name, totals["player"], 10 * len(game.rounds), result["winner"] == "player"
        )
        if result["models"]:
            leaderboard.record_models(
                game.id, {model: result["winner"] == cid for cid, model in result["models"].items()}
            )
        return result

    @app.get("/api/leaderboard")
    async def get_leaderboard(limit: int = 10):
        return leaderboard.top(max(1, min(limit, 50)))

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
