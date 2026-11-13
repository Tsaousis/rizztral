import re

import pytest
from fastapi.testclient import TestClient

from rizztral.config import Settings
from rizztral.main import create_app


class FakeLLM:
    """Scores answers by length so tests can steer the winner."""

    def __init__(self):
        self.calls = []

    async def text(self, model, messages, temperature=0.8):
        self.calls.append(("text", model))
        return f"ai {model[-4:]}"

    async def json(self, model, messages, temperature=0.7):
        prompt = messages[-1]["content"]
        self.calls.append(("json", model))
        if "Write your intro" in prompt:
            return {"intro": "Hello boys.", "questions": ["Q1?", "Q2?"]}
        if "Anonymous contestant answers" in prompt:
            pairs = re.findall(r'^([A-C]): """(.*?)"""', prompt, flags=re.MULTILINE | re.DOTALL)
            return {
                lab: {"score": 1 if text == "I don't know." else min(10, len(text) // 2), "reaction": f"re {lab}"}
                for lab, text in pairs
            }
        return {"speech": "You win."}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    settings = Settings(db_path=tmp_path / "db.sqlite", static_dir=tmp_path / "none")
    llm = FakeLLM()
    app = create_app(settings, llm=llm, tts=False)
    with TestClient(app) as c:
        c.llm = llm
        yield c


def play(client, answers):
    game = client.post("/api/games", json={"player_name": "  Costas  "}).json()
    gid = game["game_id"]
    rounds = []
    for i, answer in enumerate(answers, start=1):
        assert client.post(f"/api/games/{gid}/rounds/{i}/prepare").json() == {"ready": True}
        rounds.append(client.post(f"/api/games/{gid}/rounds/{i}/answer", json={"answer": answer}).json())
    return gid, game, rounds


def test_config_hides_personas(client):
    cfg = client.get("/api/config").json()
    assert cfg["rounds"] == 3 and cfg["tts"] is False
    assert all("persona" not in c for c in cfg["cast"]["contestants"])
    assert [c["id"] for c in cfg["cast"]["contestants"]] == ["jacques", "brad", "player"]


def test_start_pads_missing_questions(client):
    game = client.post("/api/games", json={"player_name": "Costas"}).json()
    assert game["intro"] == "Hello boys."
    assert len(game["questions"]) == 3 and game["questions"][:2] == ["Q1?", "Q2?"]


def test_full_game_human_wins_and_hits_leaderboard(client):
    long = "x" * 40
    gid, _, rounds = play(client, [long, long, long])
    assert rounds[-1]["scores"]["player"] == 10
    assert rounds[0]["reactions"]["player"].startswith("re ")
    verdict = client.post(f"/api/games/{gid}/verdict").json()
    assert verdict["winner"] == "player" and verdict["totals"]["player"] == 30
    board = client.get("/api/leaderboard").json()
    assert board["entries"][0] == {**board["entries"][0], "name": "Costas", "score": 30, "won": True}
    client.post(f"/api/games/{gid}/verdict")
    assert client.get("/api/leaderboard").json()["games"] == 1


def test_ai_wins_when_player_is_silent(client):
    gid, _, rounds = play(client, ["", "", ""])
    assert rounds[0]["answers"]["player"] == ""
    assert client.post(f"/api/games/{gid}/verdict").json()["winner"] in {"jacques", "brad"}


def test_rounds_must_be_in_order_and_verdict_waits(client):
    gid = client.post("/api/games", json={"player_name": "A"}).json()["game_id"]
    assert client.post(f"/api/games/{gid}/rounds/2/answer", json={"answer": "hi"}).status_code == 409
    assert client.post(f"/api/games/{gid}/verdict").status_code == 409
    assert client.post("/api/games/nope/verdict").status_code == 404


def test_answer_is_truncated_and_ai_answers_cached(client):
    gid = client.post("/api/games", json={"player_name": "A"}).json()["game_id"]
    client.post(f"/api/games/{gid}/rounds/1/prepare")
    before = sum(1 for kind, _ in client.llm.calls if kind == "text")
    r = client.post(f"/api/games/{gid}/rounds/1/answer", json={"answer": "y" * 900}).json()
    assert len(r["answers"]["player"]) == 280
    assert sum(1 for kind, _ in client.llm.calls if kind == "text") == before


def test_validation(client):
    assert client.post("/api/games", json={"player_name": "   "}).status_code == 422
    assert client.post("/api/speech", json={"text": "hi", "speaker": "host"}).status_code == 404


def test_demo_mode_plays_without_provider_key(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    settings = Settings(demo=True, db_path=tmp_path / "demo.sqlite", static_dir=tmp_path / "none")
    app = create_app(settings, tts=False)
    with TestClient(app) as demo:
        assert demo.get("/api/health").json() == {
            "ok": True,
            "provider": "openai",
            "demo": True,
            "offline": True,
            "llm_key": False,
        }
        gid, game, rounds = play(demo, ["We laugh together on an adventure."] * 3)
        assert game["intro"].startswith("Welcome to the villa")
        assert len(game["questions"]) == 3
        assert all(set(r["scores"]) == {"jacques", "brad", "player"} for r in rounds)
        assert demo.post(f"/api/games/{gid}/verdict").status_code == 200


class BrokenLLM:
    """Simulates an expired key, no credits, or a rate limit."""

    def __init__(self):
        self.calls = 0

    async def text(self, model, messages, temperature=0.8):
        self.calls += 1
        raise RuntimeError("402 out of credits")

    async def json(self, model, messages, temperature=0.7):
        self.calls += 1
        raise RuntimeError("402 out of credits")


def test_provider_failure_falls_back_to_built_in_show(tmp_path, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "expired")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    llm = BrokenLLM()
    settings = Settings(db_path=tmp_path / "db.sqlite", static_dir=tmp_path / "none")
    app = create_app(settings, llm=llm, tts=False)
    with TestClient(app) as c:
        assert c.get("/api/config").json()["demo"] is False
        gid, game, rounds = play(c, ["We laugh together on an adventure."] * 3)
        assert game["intro"].startswith("Welcome to the villa")
        assert all(r["answers"]["jacques"] and r["answers"]["brad"] for r in rounds)
        assert all(set(r["scores"]) == {"jacques", "brad", "player"} for r in rounds)
        verdict = c.post(f"/api/games/{gid}/verdict").json()
        assert "final rose" in verdict["speech"]
        assert llm.calls == 1  # after the first failure the provider is skipped during the cooldown
        assert c.get("/api/health").json()["offline"] is True


def test_missing_key_runs_offline_instead_of_erroring(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    settings = Settings(db_path=tmp_path / "db.sqlite", static_dir=tmp_path / "none")
    with TestClient(create_app(settings, tts=False)) as c:
        assert c.get("/api/config").json()["demo"] is True
        gid, _, rounds = play(c, ["hello"] * 3)
        assert len(rounds) == 3
        assert c.post(f"/api/games/{gid}/verdict").status_code == 200


def test_player_can_pick_five_questions(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    settings = Settings(db_path=tmp_path / "db.sqlite", static_dir=tmp_path / "none")
    with TestClient(create_app(settings, tts=False)) as c:
        assert c.get("/api/config").json()["round_options"] == [3, 5]
        assert c.post("/api/games", json={"player_name": "A", "rounds": 4}).status_code == 422
        game = c.post("/api/games", json={"player_name": "A", "rounds": 5}).json()
        assert len(game["questions"]) == len(set(game["questions"])) == 5
        gid = game["game_id"]
        for i in range(1, 6):
            c.post(f"/api/games/{gid}/rounds/{i}/prepare")
            c.post(f"/api/games/{gid}/rounds/{i}/answer", json={"answer": "hi"})
        assert c.post(f"/api/games/{gid}/verdict").status_code == 200
        assert c.get("/api/leaderboard").json()["entries"][0]["max_score"] == 50


def test_arena_assigns_models_and_records_live_results(client):
    gid, _, rounds = play(client, ["x"] * 3)
    assert all(r["thought"] for r in rounds)
    verdict = client.post(f"/api/games/{gid}/verdict").json()
    assert verdict["live"] is True
    models = verdict["models"]
    assert set(models) == {"jacques", "brad"} and models["jacques"] != models["brad"]
    assert {("text", m) for m in models.values()} <= set(client.llm.calls)
    board = client.get("/api/leaderboard").json()["models"]
    assert {row["model"] for row in board} == set(models.values())
    assert sum(row["wins"] for row in board) == (verdict["winner"] != "player")


def test_offline_games_do_not_count_for_models(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    settings = Settings(db_path=tmp_path / "db.sqlite", static_dir=tmp_path / "none")
    with TestClient(create_app(settings, tts=False)) as c:
        gid, _, rounds = play(c, ["We laugh together."] * 3)
        assert all(r["thought"] for r in rounds)
        verdict = c.post(f"/api/games/{gid}/verdict").json()
        assert verdict["live"] is False and verdict["models"] is None
        assert c.get("/api/leaderboard").json()["models"] == []


def test_judge_thought_names_contestants_not_labels():
    from rizztral.game import GameService, Round

    class ThoughtLLM:
        async def json(self, model, messages, temperature=0.7):
            return {"A": {"score": 5}, "B": {"score": 6}, "C": {"score": 7}, "thought": "A bold [B] beat answer C."}

    import asyncio
    import random

    service = GameService(Settings(), ThoughtLLM(), rng=random.Random(0))
    rnd = Round(question="Q?")
    asyncio.run(service._judge(rnd, {"jacques": "a", "brad": "b", "player": "c"}, 1, 3))
    assert rnd.thought.startswith("A bold ")
    assert "[" not in rnd.thought and "answer C" not in rnd.thought


def test_powerups_peek_wink_rewrite_once_each(client):
    gid = client.post("/api/games", json={"player_name": "KOS"}).json()["game_id"]
    peek = client.post(f"/api/games/{gid}/rounds/1/peek").json()
    assert peek["contestant"] in {"jacques", "brad"} and peek["answer"].startswith("ai ")
    assert client.post(f"/api/games/{gid}/rounds/1/peek").status_code == 409
    rnd = client.post(f"/api/games/{gid}/rounds/1/answer", json={"answer": "abcd", "wink": True}).json()
    assert rnd["scores"]["player"] == 2 and rnd["bonus"] == {"player": 2}
    assert rnd["powerups"] == ["peek", "wink"]
    rnd = client.post(f"/api/games/{gid}/rounds/1/rewrite", json={"answer": "x" * 16}).json()
    assert rnd["scores"]["player"] == 8 and rnd["bonus"] == {"player": 8}
    assert client.post(f"/api/games/{gid}/rounds/1/rewrite", json={"answer": "y"}).status_code == 409
    rnd2 = client.post(f"/api/games/{gid}/rounds/2/answer", json={"answer": "x", "wink": True})
    assert rnd2.status_code == 409


def test_rewrite_only_latest_round(client):
    gid, _, _ = play(client, ["a", "b"])
    assert client.post(f"/api/games/{gid}/rounds/1/rewrite", json={"answer": "z"}).status_code == 409
    assert client.post(f"/api/games/{gid}/rounds/2/rewrite", json={"answer": "z"}).status_code == 200


def test_daily_challenge_shared_questions_type_and_board(client):
    a = client.post("/api/games", json={"player_name": "AAA", "daily": True}).json()
    b = client.post("/api/games", json={"player_name": "BBB", "daily": True}).json()
    assert a["daily"] and a["questions"] == b["questions"] and len(a["questions"]) == 5
    for i in range(1, 6):
        client.post(f"/api/games/{a['game_id']}/rounds/{i}/answer", json={"answer": "x" * 10})
    verdict = client.post(f"/api/games/{a['game_id']}/verdict").json()
    assert verdict["daily"] == a["daily"] and "Daily contender" in verdict["badges"]
    play(client, ["x" * 20] * 2)
    client.post("/api/games", json={"player_name": "CCC"})
    daily = client.get("/api/leaderboard?daily=true").json()
    assert [e["name"] for e in daily["entries"]] == ["AAA"]
    assert len(client.get("/api/leaderboard").json()["entries"]) == 1


def test_verdict_reveals_type_profile_and_badges(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    settings = Settings(demo=True, db_path=tmp_path / "d.sqlite", static_dir=tmp_path / "none")
    with TestClient(create_app(settings, tts=False)) as demo:
        gid = demo.post("/api/games", json={"player_name": "KOS"}).json()["game_id"]
        for i in range(1, 4):
            rnd = demo.post(f"/api/games/{gid}/rounds/{i}/answer", json={"answer": "ok"}).json()
            assert rnd["thought"]
        verdict = demo.post(f"/api/games/{gid}/verdict").json()
        assert verdict["type"]["label"] in {"Funny", "Poetic", "Nerdy", "Bold", "Sweet"}
        assert verdict["profile"]["title"] == "The Dry Texter"
        assert isinstance(verdict["badges"], list)


def test_secret_type_rewards_matching_answers():
    from rizztral import features
    from rizztral.game import GameService, Round

    plain, typed = Round(question="Q?"), Round(question="Q?")
    GameService._demo_judge(plain, "I would take you to dinner at a place I like a lot.", "poetic")
    GameService._demo_judge(typed, "I would take you to dinner under the moon, a place I like.", "poetic")
    assert typed.scores["player"] > plain.scores["player"] or typed.scores["player"] == 10
    assert features.profile(["I'd write you a poem under the stars, my heart is yours"])["title"] == "The Poet"
