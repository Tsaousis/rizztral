import asyncio
import logging
import random
import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass, field

from . import prompts
from .cast import AI_IDS, ALL_CONTESTANT_IDS, CONTESTANTS
from .config import Settings
from .llm import LLM

FALLBACK_ANSWER = "..."
log = logging.getLogger("rizztral")
NAMES = {c["id"]: c["name"] for c in CONTESTANTS}


class GameError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class Round:
    question: str
    ai_answers: dict[str, str] | None = None
    player_answer: str | None = None
    scores: dict[str, int] = field(default_factory=dict)
    reactions: dict[str, str] = field(default_factory=dict)


@dataclass
class Game:
    id: str
    player_name: str
    intro: str
    rounds: list[Round]
    created_at: float = field(default_factory=time.time)
    verdict: dict | None = None
    ai_tasks: dict[int, asyncio.Task] = field(default_factory=dict)

    def totals(self) -> dict[str, int]:
        return {cid: sum(r.scores.get(cid, 0) for r in self.rounds) for cid in ALL_CONTESTANT_IDS}

    @property
    def finished_rounds(self) -> int:
        return sum(1 for r in self.rounds if r.scores)


def clamp_score(value) -> int:
    try:
        return max(0, min(10, round(float(value))))
    except (TypeError, ValueError):
        return 0


class GameService:
    def __init__(self, settings: Settings, llm: LLM, rng: random.Random | None = None):
        self.settings = settings
        self.llm = llm
        self.rng = rng or random.Random()
        self.games: OrderedDict[str, Game] = OrderedDict()

    def get(self, game_id: str) -> Game:
        game = self.games.get(game_id)
        if not game:
            raise GameError(404, "Game not found. Start a new show.")
        return game

    def _round(self, game: Game, number: int) -> Round:
        if not 1 <= number <= len(game.rounds):
            raise GameError(404, "No such round.")
        return game.rounds[number - 1]

    async def start(self, player_name: str) -> Game:
        n = self.settings.rounds
        data = await self.llm.json(
            self.settings.models["clarissa"], prompts.start_messages(player_name, n, self.rng), temperature=0.95
        )
        questions = [q.strip() for q in data.get("questions", []) if isinstance(q, str) and q.strip()]
        fallback = [q for q in self.rng.sample(prompts.QUESTION_BANK, n) if q not in questions]
        questions = (questions + fallback)[:n]
        intro = str(data.get("intro") or "Hello, boys. Impress me.").strip()
        game = Game(
            id=secrets.token_urlsafe(12),
            player_name=player_name,
            intro=intro,
            rounds=[Round(question=q) for q in questions],
        )
        self.games[game.id] = game
        while len(self.games) > self.settings.max_games:
            self.games.popitem(last=False)
        return game

    async def _generate_ai_answers(self, question: str) -> dict[str, str]:
        async def one(contestant: dict) -> str:
            try:
                answer = await self.llm.text(
                    self.settings.models[contestant["id"]],
                    prompts.contestant_messages(contestant["persona"], question),
                    temperature=0.9,
                )
                return answer or FALLBACK_ANSWER
            except Exception:
                log.exception("contestant %s failed", contestant["id"])
                return FALLBACK_ANSWER

        answers = await asyncio.gather(*(one(c) for c in CONTESTANTS))
        return dict(zip(AI_IDS, answers))

    async def ai_answers(self, game: Game, number: int) -> dict[str, str]:
        rnd = self._round(game, number)
        if rnd.ai_answers is None:
            task = game.ai_tasks.get(number)
            if task is None:
                task = asyncio.ensure_future(self._generate_ai_answers(rnd.question))
                game.ai_tasks[number] = task
            rnd.ai_answers = await asyncio.shield(task)
        return rnd.ai_answers

    async def submit(self, game: Game, number: int, answer: str) -> Round:
        rnd = self._round(game, number)
        if number != game.finished_rounds + 1:
            raise GameError(409, "Rounds must be played in order.")
        ai = await self.ai_answers(game, number)
        if rnd.scores:
            return rnd
        player_answer = answer.strip()[: self.settings.max_answer_chars]
        answers = {**ai, "player": player_answer or "I don't know."}

        ids = list(answers)
        self.rng.shuffle(ids)
        labels = {chr(ord("A") + i): cid for i, cid in enumerate(ids)}
        data = await self.llm.json(
            self.settings.models["clarissa"],
            prompts.judge_messages(
                rnd.question, {lab: answers[cid] for lab, cid in labels.items()}, number, self.settings.rounds
            ),
            temperature=0.6,
        )
        for label, cid in labels.items():
            entry = data.get(label) if isinstance(data.get(label), dict) else {}
            rnd.scores[cid] = clamp_score(entry.get("score"))
            rnd.reactions[cid] = str(entry.get("reaction") or "Hmm. Next.").strip()
        rnd.player_answer = player_answer
        return rnd

    def winner(self, game: Game) -> str:
        totals = game.totals()
        order = {cid: i for i, cid in enumerate(ALL_CONTESTANT_IDS)}  # ties go to the human
        return max(
            ALL_CONTESTANT_IDS,
            key=lambda cid: (totals[cid], max(r.scores.get(cid, 0) for r in game.rounds), order[cid]),
        )

    async def verdict(self, game: Game) -> dict:
        if game.verdict:
            return game.verdict
        if game.finished_rounds < len(game.rounds):
            raise GameError(409, "The show isn't over yet.")
        winner = self.winner(game)
        best = max(game.rounds, key=lambda r: r.scores.get(winner, 0))
        best_answer = best.player_answer if winner == "player" else (best.ai_answers or {}).get(winner, "")
        winner_name = game.player_name if winner == "player" else NAMES[winner]
        try:
            data = await self.llm.json(
                self.settings.models["clarissa"],
                prompts.verdict_messages(winner_name, best_answer or "", game.player_name, winner == "player"),
                temperature=0.8,
            )
            speech = str(data.get("speech") or "").strip()
        except Exception:
            log.exception("verdict speech failed")
            speech = ""
        game.verdict = {
            "winner": winner,
            "speech": speech or f"My heart belongs to {winner_name}.",
            "totals": game.totals(),
        }
        return game.verdict
