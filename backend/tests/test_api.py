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
        if "A contestant just answered" in prompt:
            text = re.search(r'"""(.*?)"""', prompt, flags=re.DOTALL).group(1)
            return {"score": 1 if text == "I don't know." else min(10, len(text) // 2), "reaction": f"re {text[:4]}"}
        if "Round recap" in prompt:
            return {"thought": "Loved that one."}
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
        assert client.post(f"/api/games/{gid}/rounds/{i}/prepare").json()["ready"] is True
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
    assert len(game["questions"]) == 3 and game["questions"][0] == "Q1?"
    assert sum(q.startswith("Roast round") for q in game["questions"]) == 1


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
    client.post(f"/api/games/{gid}/rounds/1/prepare")
    r = client.post(f"/api/games/{gid}/rounds/1/answer", json={"answer": "y" * 900}).json()
    assert len(r["answers"]["player"]) == 280
    client.post(f"/api/games/{gid}/rounds/1/answer", json={"answer": "again"})
    assert sum(1 for kind, _ in client.llm.calls if kind == "text") == 2


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
            "ai_games_today": 0,
            "ai_games_cap": 40,
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


def test_clarissa_reacts_to_each_answer_as_it_lands(client):
    gid = client.post("/api/games", json={"player_name": "KOS"}).json()["game_id"]
    for i in range(1, 4):
        prep = client.post(f"/api/games/{gid}/rounds/{i}/prepare").json()
        for turn in prep["before"].values():
            assert turn["answer"] and isinstance(turn["score"], int) and turn["reaction"].startswith("re ")
        rnd = client.post(f"/api/games/{gid}/rounds/{i}/answer", json={"answer": "a cheeky answer"}).json()
        assert set(rnd["scores"]) == {"jacques", "brad", "player"} and rnd["thought"] == "Loved that one."
        for seat, turn in prep["before"].items():
            assert rnd["scores"][seat] == turn["score"]


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
        from rizztral.features import TYPES

        assert verdict["type"]["label"] in {t["label"] for t in TYPES.values()}
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


def test_daily_ai_cap_switches_new_shows_to_built_in(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    settings = Settings(db_path=tmp_path / "db.sqlite", static_dir=tmp_path / "none", max_ai_games_per_day=1)
    llm = FakeLLM()
    with TestClient(create_app(settings, llm=llm, tts=False)) as c:
        play(c, ["a fun long answer", "x", "y"])
        used = len(llm.calls)
        assert used > 0
        gid, _, _ = play(c, ["a fun long answer", "x", "y"])
        assert c.post(f"/api/games/{gid}/verdict").status_code == 200
        assert len(llm.calls) == used
        assert c.get("/api/health").json()["ai_games_today"] == 1


def test_tts_is_opt_in(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.delenv("RIZZTRAL_TTS", raising=False)
    assert Settings().tts_enabled is False
    monkeypatch.setenv("RIZZTRAL_TTS", "1")
    assert Settings().tts_enabled is True


def test_broken_arena_model_falls_back_to_default_model(client, monkeypatch):
    original = client.llm.text

    async def text(model, messages, temperature=0.8):
        if model == "retired-model":
            raise RuntimeError("model deprecated")
        return await original(model, messages, temperature)

    monkeypatch.setattr(client.llm, "text", text)
    monkeypatch.setenv("RIZZTRAL_ARENA_MODELS", "retired-model,gpt-4o-mini")
    gid, _, _ = play(client, ["a fun long answer", "x", "y"])
    verdict = client.post(f"/api/games/{gid}/verdict").json()
    assert verdict["live"] is True
    assert "retired-model" not in verdict["models"].values()


def test_verdict_explains_why_with_twist(client):
    gid, _, _ = play(client, ["a fun long answer that wins", "x", "y"])
    breakdown = client.post(f"/api/games/{gid}/verdict").json()["breakdown"]
    assert breakdown["why"] and breakdown["twist"].startswith("Plot twist")
    assert {"round", "question", "points"} <= set(breakdown["best"])


def test_gpt5_sampling_params():
    from rizztral.llm import sampling

    assert sampling("gpt-4.1-mini", 0.9, 200) == {"temperature": 0.9, "max_tokens": 200}
    assert sampling("gpt-5.4-nano", 0.9, 200)["reasoning_effort"] == "none"
    assert "temperature" not in sampling("gpt-5-mini", 0.9, 200)


def test_each_show_draws_two_roster_characters(client):
    seen = set()
    for _ in range(12):
        lineup = client.post("/api/games", json={"player_name": "KOS"}).json()["lineup"]
        assert set(lineup) == {"jacques", "brad"}
        ids = [c["id"] for c in lineup.values()]
        assert len(set(ids)) == 2 and all("persona" not in c for c in lineup.values())
        seen.update(ids)
    assert len(seen) > 2
    assert len(client.get("/api/config").json()["cast"]["roster"]) == 10


def test_speaking_order_rotates_and_later_speakers_hear_earlier_ones(client, monkeypatch):
    heard = []
    original = client.llm.text

    async def text(model, messages, temperature=0.8):
        heard.append(messages[-1]["content"])
        return await original(model, messages, temperature)

    monkeypatch.setattr(client.llm, "text", text)
    gid = client.post("/api/games", json={"player_name": "KOS"}).json()["game_id"]
    orders = []
    for i in range(1, 4):
        prep = client.post(f"/api/games/{gid}/rounds/{i}/prepare").json()
        before = prep["order"][: prep["order"].index("player")]
        assert set(prep["before"]) == set(before)
        rnd = client.post(f"/api/games/{gid}/rounds/{i}/answer", json={"answer": f"zebra pun {i}"}).json()
        assert rnd["order"] == prep["order"] and set(rnd["answers"]) == {"jacques", "brad", "player"}
        orders.append(tuple(prep["order"]))
    assert len(set(orders)) == 3 and {o.index("player") for o in orders} == {0, 1, 2}
    assert all("Roast round" in h for h in heard if "just said" in h)
    assert any("Earlier in the show" in h and "zebra pun 1" in h for h in heard)


def test_peek_only_targets_ais_after_the_player(client):
    gid = client.post("/api/games", json={"player_name": "KOS"}).json()["game_id"]
    for i in range(1, 4):
        prep = client.post(f"/api/games/{gid}/rounds/{i}/prepare").json()
        after = prep["order"][prep["order"].index("player") + 1 :]
        res = client.post(f"/api/games/{gid}/rounds/{i}/peek")
        if after:
            assert res.status_code == 200 and res.json()["contestant"] in after
            break
        assert res.status_code == 409
        client.post(f"/api/games/{gid}/rounds/{i}/answer", json={"answer": "x"})
