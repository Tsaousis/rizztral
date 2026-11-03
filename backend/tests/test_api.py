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
