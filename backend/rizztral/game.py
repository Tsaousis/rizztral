import asyncio
import logging
import random
import re
import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass, field

from . import features, prompts
from .cast import AI_IDS, ALL_CONTESTANT_IDS, CONTESTANTS, ROSTER, ROSTER_BY_ID
from .config import Settings
from .llm import LLM

PROVIDER_COOLDOWN_SECONDS = 120
log = logging.getLogger("rizztral")
NAMES = {c["id"]: c["name"] for c in CONTESTANTS} | {"player": "the human"}
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
    thought: str = ""
    bonus: dict[str, int] = field(default_factory=dict)
    order: list[str] = field(default_factory=lambda: list(ALL_CONTESTANT_IDS))

    def seats_around_player(self) -> tuple[list[str], list[str]]:
        i = self.order.index("player")
        return self.order[:i], self.order[i + 1 :]


@dataclass
class Game:
    id: str
    player_name: str
    intro: str
    rounds: list[Round]
    created_at: float = field(default_factory=time.time)
    verdict: dict | None = None
    contestant_models: dict[str, str] = field(default_factory=dict)
    live: bool = True
    type_id: str = "funny"
    daily: str | None = None
    powerups: dict[str, int] = field(default_factory=dict)
    lineup: dict[str, str] = field(default_factory=lambda: {c["id"]: c["id"] for c in CONTESTANTS})
    ai_tasks: dict[int, asyncio.Task] = field(default_factory=dict)

    def character(self, seat: str) -> dict:
        return ROSTER_BY_ID[self.lineup[seat]]

    @property
    def names(self) -> dict[str, str]:
        return {seat: self.character(seat)["name"] for seat in AI_IDS} | {"player": self.player_name}

    def totals(self) -> dict[str, int]:
        return {
            cid: sum(r.scores.get(cid, 0) + r.bonus.get(cid, 0) for r in self.rounds) for cid in ALL_CONTESTANT_IDS
        }

    @property
    def finished_rounds(self) -> int:
        return sum(1 for r in self.rounds if r.scores)


THOUGHTS = {
    "jacques": "Jacques went full poet again. Dramatic, a little much, and annoyingly effective.",
    "brad": "Brad made it sound like an adventure. Chaotic, but I could actually picture the date.",
    "player": "That one felt real. Less polished than the others, but it had an actual pulse.",
}


def demo_thought(scores: dict[str, int]) -> str:
    if not scores:
        return ""
    best = max(scores, key=lambda cid: (scores[cid], cid == "player"))
    return THOUGHTS.get(best, "")


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
        self._ai_day, self.ai_games_today = "", 0

    def offline(self) -> bool:
        """True when the built-in show should run instead of the AI provider."""
        return self.always_offline or time.time() < self._provider_down_until

    def _claim_ai_game(self) -> bool:
        """Count a new AI-powered show against the daily budget; False once it is spent."""
        today = features.daily_key()
        if today != self._ai_day:
            self._ai_day, self.ai_games_today = today, 0
        cap = self.settings.max_ai_games_per_day
        if cap and self.ai_games_today >= cap:
            return False
        self.ai_games_today += 1
        return True

    def _ai(self, game: Game) -> bool:
        return game.live and not self.offline()

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

    async def start(self, player_name: str, rounds: int | None = None, daily: bool = False) -> Game:
        n = rounds or self.settings.rounds
        questions, intro = None, None
        live = not self.offline() and self._claim_ai_game()
        day = features.daily_key() if daily else None
        rng = features.daily_rng(day) if daily else self.rng
        type_id = rng.choice(sorted(features.TYPES))
        shift = rng.randrange(3)
        lineup = dict(zip(AI_IDS, (c["id"] for c in rng.sample(ROSTER, len(AI_IDS)))))
        names = [ROSTER_BY_ID[lineup[seat]]["name"] for seat in AI_IDS]
        if daily:
            n = max(self.settings.round_options)
            questions = rng.sample(prompts.QUESTION_BANK, n)
            intro = (
                f"Welcome to today's challenge, {player_name}. Everyone gets the same questions today, "
                "so make yours the answer they talk about."
            )
        elif live:
            try:
                data = await self.llm.json(
                    self.settings.models["clarissa"],
                    prompts.start_messages(player_name, n, self.rng, names),
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
            live = False
            questions = prompts.QUESTION_BANK[:n]
            intro = (
                f"Welcome to the villa, {player_name}. Tonight I want wit, warmth, and one answer "
                "that makes the machines look nervous."
            )
        game = Game(
            id=secrets.token_urlsafe(12),
            player_name=player_name,
            intro=intro,
            rounds=[
                Round(question=q, order=ALL_CONTESTANT_IDS[i % 3 :] + ALL_CONTESTANT_IDS[: i % 3])
                for i, q in enumerate(self._with_roast(questions, rng), start=shift)
            ],
            contestant_models=self._pick_models(),
            live=live,
            type_id=type_id,
            daily=day,
            lineup=lineup,
        )
        self.games[game.id] = game
        while len(self.games) > self.settings.max_games:
            self.games.popitem(last=False)
        return game

    def _pick_models(self) -> dict[str, str]:
        pool = list(dict.fromkeys(self.settings.arena_models))
        if len(pool) < len(AI_IDS):
            return {cid: self.settings.models[cid] for cid in AI_IDS}
        return dict(zip(AI_IDS, self.rng.sample(pool, len(AI_IDS))))

    @staticmethod
    def _demo_answer(contestant_id: str, question: str) -> str:
        answers = DEMO_ANSWERS[contestant_id]
        return answers[sum(ord(char) for char in question) % len(answers)]

    @staticmethod
    def _with_roast(questions: list[str], rng: random.Random) -> list[str]:
        if any(q.lower().startswith("roast round") for q in questions):
            return questions
        questions = list(questions)
        questions[len(questions) // 2] = rng.choice(prompts.ROAST_QUESTIONS)
        return questions

    @staticmethod
    def _transcript(game: Game, number: int) -> str:
        lines = []
        for i, r in enumerate(game.rounds[: number - 1], start=1):
            said = "; ".join(
                f'{game.names[cid]}: "{(r.player_answer if cid == "player" else (r.ai_answers or {}).get(cid, ""))[:140]}"'
                for cid in r.order
            )
            lines.append(f'Round {i} "{r.question}" -> {said}')
        return "\n".join(lines)

    async def _ai_answer(self, game: Game, number: int, seat: str, heard: dict[str, str]) -> str:
        rnd = game.rounds[number - 1]
        if not self._ai(game):
            game.live = False
            return self._demo_answer(seat, rnd.question)
        contestant = game.character(seat)
        rival = next(game.names[other] for other in AI_IDS if other != seat)
        roast = rnd.question.lower().startswith("roast round")
        messages = prompts.contestant_messages(
            contestant["persona"],
            rnd.question,
            rival,
            transcript=self._transcript(game, number),
            heard=[(game.names[cid], text) for cid, text in heard.items()] if roast else None,
            player_name=game.player_name,
            roast=roast,
        )
        for model in dict.fromkeys([game.contestant_models[seat], self.settings.models[seat]]):
            try:
                answer = await self.llm.text(model, messages, temperature=0.9)
            except Exception:
                log.exception("AI provider failed during %s answer with %s", seat, model)
                continue
            if answer:
                game.contestant_models[seat] = model
                return answer
        self._mark_provider_down()
        game.live = False
        return self._demo_answer(seat, rnd.question)

    async def _answer_in_order(self, game: Game, number: int, seats: list[str]) -> None:
        rnd = game.rounds[number - 1]
        for seat in rnd.order:
            if seat in seats and seat not in rnd.ai_answers:
                heard = {}
                for cid in rnd.order[: rnd.order.index(seat)]:
                    text = rnd.player_answer if cid == "player" else rnd.ai_answers.get(cid)
                    if text is not None:
                        heard[cid] = text
                rnd.ai_answers[seat] = await self._ai_answer(game, number, seat, heard)

    async def ai_answers(self, game: Game, number: int) -> dict[str, str]:
        """Answers from the AIs who speak before the player this round."""
        rnd = self._round(game, number)
        if rnd.ai_answers is None:
            rnd.ai_answers = {}
        before, _ = rnd.seats_around_player()
        task = game.ai_tasks.get(number)
        if task is None:
            task = asyncio.ensure_future(self._answer_in_order(game, number, before))
            game.ai_tasks[number] = task
        await asyncio.shield(task)
        return {seat: rnd.ai_answers[seat] for seat in before}

    def _use_powerup(self, game: Game, name: str, number: int) -> None:
        if name in game.powerups:
            raise GameError(409, f"{name.title()} is already used this show.")
        game.powerups[name] = number

    async def peek(self, game: Game, number: int) -> dict:
        rnd = self._round(game, number)
        if number != game.finished_rounds + 1:
            raise GameError(409, "You can only peek at the current round.")
        await self.ai_answers(game, number)
        _, after = rnd.seats_around_player()
        if not after:
            raise GameError(409, "Everyone already spoke before you this round.")
        self._use_powerup(game, "peek", number)
        contestant = self.rng.choice(after)
        await self._answer_in_order(game, number, [contestant])
        return {"contestant": contestant, "answer": rnd.ai_answers[contestant]}

    async def _score(self, game: Game, rnd: Round, number: int) -> None:
        answers = {**(rnd.ai_answers or {}), "player": rnd.player_answer or "I don't know."}
        if self._ai(game):
            try:
                await self._judge(rnd, answers, number, len(game.rounds), game.type_id, game.names)
                return
            except Exception:
                log.exception("AI provider failed during %s; using the built-in show", "judging")
                self._mark_provider_down()
        game.live = False
        self._demo_judge(rnd, rnd.player_answer or "", game.type_id)

    async def submit(self, game: Game, number: int, answer: str, wink: bool = False) -> Round:
        rnd = self._round(game, number)
        if number != game.finished_rounds + 1:
            raise GameError(409, "Rounds must be played in order.")
        await self.ai_answers(game, number)
        if rnd.scores:
            return rnd
        if wink:
            self._use_powerup(game, "wink", number)
        rnd.player_answer = answer.strip()[: self.settings.max_answer_chars]
        await self._answer_in_order(game, number, AI_IDS)
        await self._score(game, rnd, number)
        if wink:
            rnd.bonus["player"] = rnd.scores["player"]
        return rnd

    async def rewrite(self, game: Game, number: int, answer: str) -> Round:
        rnd = self._round(game, number)
        if game.verdict or number != game.finished_rounds or not rnd.scores:
            raise GameError(409, "You can only rewrite the answer you just gave.")
        self._use_powerup(game, "rewrite", number)
        retry = Round(question=rnd.question, ai_answers=rnd.ai_answers, order=rnd.order)
        retry.player_answer = answer.strip()[: self.settings.max_answer_chars]
        await self._score(game, retry, number)
        rnd.player_answer = retry.player_answer
        rnd.scores["player"] = retry.scores["player"]
        rnd.reactions["player"] = retry.reactions["player"]
        if game.powerups.get("wink") == number:
            rnd.bonus["player"] = rnd.scores["player"]
        return rnd

    async def _judge(
        self, rnd: Round, answers: dict[str, str], number: int, total: int, type_id: str = "funny",
        names: dict[str, str] | None = None,
    ) -> None:
        ids = list(answers)
        self.rng.shuffle(ids)
        labels = {chr(ord("A") + i): cid for i, cid in enumerate(ids)}
        data = await self.llm.json(
            self.settings.models["clarissa"],
            prompts.judge_messages(
                rnd.question,
                {lab: answers[cid] for lab, cid in labels.items()},
                number,
                total,
                features.TYPES[type_id]["desc"],
            ),
            temperature=0.6,
        )
        scores, reactions = {}, {}
        for label, cid in labels.items():
            entry = data.get(label) if isinstance(data.get(label), dict) else {}
            scores[cid] = clamp_score(entry.get("score"))
            raw = str(entry.get("reaction") or "Hmm. Next.").strip()
            reaction = re.sub(r"\[[A-C]\][,:]?\s*", "", raw).strip()
            reactions[cid] = reaction[:1].upper() + reaction[1:] if reaction != raw else reaction
        rnd.scores, rnd.reactions = scores, reactions
        thought = str(data.get("thought") or "").strip()
        for label, cid in labels.items():
            thought = re.sub(
                rf"(?:\b(?i:answer|contestant|option)\s+)?\[{label}\]|\b(?i:answer|contestant|option)\s+{label}\b",
                (names or NAMES)[cid],
                thought,
            )
        rnd.thought = thought or demo_thought(scores)

    @staticmethod
    def _demo_judge(rnd: Round, player_answer: str, type_id: str = "funny") -> None:
        seed = sum(ord(char) for char in rnd.question)
        word_count = len(player_answer.split())
        player_score = 1 if not player_answer else min(9, 2 + min(word_count, 15) // 2)
        if any(word in player_answer.lower() for word in ("laugh", "you", "together", "honest", "adventure")):
            player_score = min(10, player_score + 1)
        rnd.scores = {"jacques": 5 + seed % 3, "brad": 5 + (seed // 3) % 3, "player": player_score}
        kind = features.TYPES[type_id]
        for cid in kind["fans"]:
            rnd.scores[cid] = min(10, rnd.scores[cid] + features.TYPE_BONUS)
        if player_answer and features.matches(type_id, player_answer):
            rnd.scores["player"] = min(10, rnd.scores["player"] + features.TYPE_BONUS)
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
        rnd.thought = f"{demo_thought(rnd.scores)} {kind['hint']}"

    def winner(self, game: Game) -> str:
        totals = game.totals()
        order = {cid: i for i, cid in enumerate(ALL_CONTESTANT_IDS)}  # ties go to the human
        return max(
            ALL_CONTESTANT_IDS,
            key=lambda cid: (totals[cid], max(r.scores.get(cid, 0) for r in game.rounds), order[cid]),
        )

    @staticmethod
    def badges(game: Game, winner: str) -> list[str]:
        totals = game.totals()
        earned = []
        if all(totals["player"] > totals[cid] for cid in AI_IDS):
            earned.append("Out-rizzed both AIs")
        if any(r.scores.get("player") == 10 for r in game.rounds):
            earned.append("Perfect 10")
        if sum(features.matches(game.type_id, r.player_answer or "") for r in game.rounds) >= 2:
            earned.append("Type whisperer")
        if winner == "player" and not game.powerups:
            earned.append("No power-ups needed")
        before = {
            cid: sum(r.scores.get(cid, 0) + r.bonus.get(cid, 0) for r in game.rounds[:-1]) for cid in ALL_CONTESTANT_IDS
        }
        if winner == "player" and any(before[cid] > before["player"] for cid in AI_IDS):
            earned.append("Comeback kid")
        if game.daily:
            earned.append("Daily contender")
        return earned

    @staticmethod
    def breakdown(game: Game, winner: str) -> dict:
        def pts(r: Round, cid: str) -> int:
            return r.scores.get(cid, 0) + r.bonus.get(cid, 0)

        numbered = list(enumerate(game.rounds, start=1))
        best_n, best = max(numbered, key=lambda nr: pts(nr[1], "player"))
        worst_n, worst = min(numbered, key=lambda nr: pts(nr[1], "player"))
        rival = winner if winner != "player" else max(AI_IDS, key=lambda cid: game.totals()[cid])
        swing_n, swing = max(numbered, key=lambda nr: abs(pts(nr[1], rival) - pts(nr[1], "player")))
        won_rounds = sum(pts(r, "player") >= max(pts(r, cid) for cid in AI_IDS) for r in game.rounds)
        matched = sum(features.matches(game.type_id, r.player_answer or "") for r in game.rounds)
        totals = game.totals()
        gap = abs(totals[winner] - totals["player"]) if winner != "player" else totals["player"] - totals[rival]
        label = features.TYPES[game.type_id]["label"].lower()
        if winner == "player":
            why = (
                f"You took {won_rounds} of {len(game.rounds)} rounds and beat {game.names[rival]} by {gap} pts. "
                f"Round {best_n} sealed it: {pts(best, 'player')} pts."
            )
        else:
            why = (
                f"{game.names[winner]} beat you by {gap} pts. Round {swing_n} hurt most: "
                f"{game.names[rival]} got {pts(swing, rival)}, you got {pts(swing, 'player')}."
            )
        if matched:
            twist = f"Plot twist: she was secretly into {label} answers, and {matched} of yours hit her type."
        else:
            twist = f"Plot twist: she was secretly into {label} answers, and none of yours hit her type."
        return {
            "why": why,
            "twist": twist,
            "rounds_won": won_rounds,
            "best": {"round": best_n, "question": best.question, "points": pts(best, "player")},
            "worst": {"round": worst_n, "question": worst.question, "points": pts(worst, "player")},
        }

    @staticmethod
    def night_summary(game: Game) -> str:
        lines = []
        for i, r in enumerate(game.rounds, start=1):
            scores = ", ".join(
                f"{game.names[cid]} {r.scores.get(cid, 0) + r.bonus.get(cid, 0)}"
                for cid in ALL_CONTESTANT_IDS
            )
            lines.append(f'Round {i} "{r.question}": {scores}. {game.player_name} said: "{(r.player_answer or "")[:160]}"')
        return "\n".join(lines)

    async def verdict(self, game: Game) -> dict:
        if game.verdict:
            return game.verdict
        if game.finished_rounds < len(game.rounds):
            raise GameError(409, "The show isn't over yet.")
        winner = self.winner(game)
        best = max(game.rounds, key=lambda r: r.scores.get(winner, 0))
        best_answer = best.player_answer if winner == "player" else (best.ai_answers or {}).get(winner, "")
        winner_name = game.names[winner]
        speech = ""
        breakdown = self.breakdown(game, winner)
        if self._ai(game):
            try:
                data = await self.llm.json(
                    self.settings.models["clarissa"],
                    prompts.verdict_messages(
                        winner_name,
                        best_answer or "",
                        game.player_name,
                        winner == "player",
                        self.night_summary(game),
                        features.TYPES[game.type_id]["label"],
                    ),
                    temperature=0.8,
                )
                speech = str(data.get("speech") or "").strip()
                for key in ("why", "twist"):
                    breakdown[key] = str(data.get(key) or "").strip() or breakdown[key]
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
            "live": game.live,
            "type": {"id": game.type_id, "label": features.TYPES[game.type_id]["label"]},
            "profile": features.profile([r.player_answer or "" for r in game.rounds]),
            "badges": self.badges(game, winner),
            "breakdown": breakdown,
            "lineup": dict(game.lineup),
            "daily": game.daily,
            "models": dict(game.contestant_models) if game.live else None,
        }
        return game.verdict
