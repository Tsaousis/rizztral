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

PROVIDER_COOLDOWN_SECONDS = 120
log = logging.getLogger("rizztral")
NAMES = {c["id"]: c["name"] for c in CONTESTANTS}
DEMO_ANSWERS = {
    "jacques": [
        "I would turn it into a tiny poem, then pretend the moon helped me write the good parts.",
        "Somewhere with bad phone signal, good wine, and enough stars to make us forget what time it is.",
        "I would choose the honest answer, even if the dramatic answer has much better lighting.",
    ],
    "brad": [
        "Honestly, I would make it an adventure. Sunrise, questionable directions, then pancakes when we survive.",
        "Easy: somewhere outdoors where we can laugh, get a little lost, and race back before sunset.",
        "I would go all in, probably overpack snacks, and make sure it becomes a story worth retelling.",
    ],
}


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
    def __init__(self, settings: Settings, llm: LLM, rng: random.Random | None = None, offline: bool = False):
        self.settings = settings
        self.llm = llm
        self.rng = rng or random.Random()
        self.games: OrderedDict[str, Game] = OrderedDict()
        self.always_offline = settings.demo or offline
        self._provider_down_until = 0.0

    def offline(self) -> bool:
        """True when the built-in show should run instead of the AI provider."""
        return self.always_offline or time.time() < self._provider_down_until

    def _mark_provider_down(self) -> None:
        self._provider_down_until = time.time() + PROVIDER_COOLDOWN_SECONDS

    def get(self, game_id: str) -> Game:
        game = self.games.get(game_id)
        if not game:
            raise GameError(404, "Game not found. Start a new show.")
        return game

    def _round(self, game: Game, number: int) -> Round:
        if not 1 <= number <= len(game.rounds):
            raise GameError(404, "No such round.")
        return game.rounds[number - 1]

    async def start(self, player_name: str, rounds: int | None = None) -> Game:
        n = rounds or self.settings.rounds
        questions, intro = None, None
        if not self.offline():
            try:
                data = await self.llm.json(
                    self.settings.models["clarissa"],
                    prompts.start_messages(player_name, n, self.rng),
                    temperature=0.95,
                )
                questions = [q.strip() for q in data.get("questions", []) if isinstance(q, str) and q.strip()]
                fallback = [q for q in self.rng.sample(prompts.QUESTION_BANK, n) if q not in questions]
                questions = (questions + fallback)[:n]
                intro = str(data.get("intro") or "Hello, boys. Impress me.").strip()
            except Exception:
                log.exception("AI provider failed during %s; using the built-in show", "start")
                self._mark_provider_down()
        if questions is None:
            questions = prompts.QUESTION_BANK[:n]
            intro = (
                f"Welcome to the villa, {player_name}. Tonight I want wit, warmth, and one answer "
                "that makes the machines look nervous."
            )
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

    @staticmethod
    def _demo_answer(contestant_id: str, question: str) -> str:
        answers = DEMO_ANSWERS[contestant_id]
        return answers[sum(ord(char) for char in question) % len(answers)]

    async def _generate_ai_answers(self, question: str) -> dict[str, str]:
        if self.offline():
            return {cid: self._demo_answer(cid, question) for cid in AI_IDS}

        async def one(contestant: dict) -> str:
            try:
                answer = await self.llm.text(
                    self.settings.models[contestant["id"]],
                    prompts.contestant_messages(contestant["persona"], question),
                    temperature=0.9,
                )
                if answer:
                    return answer
            except Exception:
                log.exception("AI provider failed during %s; using the built-in show", f"{contestant['id']} answer")
                self._mark_provider_down()
            return self._demo_answer(contestant["id"], question)

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
        rnd.player_answer = player_answer
        if not self.offline():
            try:
                await self._judge(rnd, answers, number, len(game.rounds))
                return rnd
            except Exception:
                log.exception("AI provider failed during %s; using the built-in show", "judging")
                self._mark_provider_down()
        self._demo_judge(rnd, player_answer)
        return rnd

    async def _judge(self, rnd: Round, answers: dict[str, str], number: int, total: int) -> None:
        ids = list(answers)
        self.rng.shuffle(ids)
        labels = {chr(ord("A") + i): cid for i, cid in enumerate(ids)}
        data = await self.llm.json(
            self.settings.models["clarissa"],
            prompts.judge_messages(
                rnd.question, {lab: answers[cid] for lab, cid in labels.items()}, number, total
            ),
            temperature=0.6,
        )
        scores, reactions = {}, {}
        for label, cid in labels.items():
            entry = data.get(label) if isinstance(data.get(label), dict) else {}
            scores[cid] = clamp_score(entry.get("score"))
            reactions[cid] = str(entry.get("reaction") or "Hmm. Next.").strip()
        rnd.scores, rnd.reactions = scores, reactions

    @staticmethod
    def _demo_judge(rnd: Round, player_answer: str) -> None:
        seed = sum(ord(char) for char in rnd.question)
        word_count = len(player_answer.split())
        player_score = 1 if not player_answer else min(9, 2 + min(word_count, 15) // 2)
        if any(word in player_answer.lower() for word in ("laugh", "you", "together", "honest", "adventure")):
            player_score = min(10, player_score + 1)
        rnd.scores = {"jacques": 6 + seed % 3, "brad": 6 + (seed // 3) % 3, "player": player_score}
        for contestant_id, score in rnd.scores.items():
            if score >= 9:
                reaction = "Okay, that had charm, confidence, and just enough chaos. I like it."
            elif score >= 7:
                reaction = "Strong answer. Specific, playful, and dangerously close to impressive."
            elif score >= 5:
                reaction = "Not bad, but I wanted one more spark before giving you the rose."
            else:
                reaction = "That answer arrived, technically. The chemistry did not."
            rnd.reactions[contestant_id] = reaction

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
        speech = ""
        if not self.offline():
            try:
                data = await self.llm.json(
                    self.settings.models["clarissa"],
                    prompts.verdict_messages(winner_name, best_answer or "", game.player_name, winner == "player"),
                    temperature=0.8,
                )
                speech = str(data.get("speech") or "").strip()
            except Exception:
                log.exception("AI provider failed during %s; using the built-in show", "verdict")
                self._mark_provider_down()
        if not speech:
            speech = (
                f"{winner_name}, you brought the best mix of wit and chemistry tonight. "
                "The final rose is yours."
            )
        game.verdict = {
            "winner": winner,
            "speech": speech,
            "totals": game.totals(),
        }
        return game.verdict
