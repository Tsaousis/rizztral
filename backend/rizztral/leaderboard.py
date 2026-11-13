import sqlite3
import threading
import time
from pathlib import Path


class Leaderboard:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS results (
                game_id TEXT PRIMARY KEY,
                player_name TEXT NOT NULL,
                score INTEGER NOT NULL,
                max_score INTEGER NOT NULL,
                won INTEGER NOT NULL,
                created_at REAL NOT NULL
            )"""
        )
        self._conn.commit()

    def record(self, game_id: str, player_name: str, score: int, max_score: int, won: bool) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO results VALUES (?, ?, ?, ?, ?, ?)",
                (game_id, player_name, score, max_score, int(won), time.time()),
            )
            self._conn.commit()

    def top(self, limit: int = 10) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT player_name, score, max_score, won, created_at FROM results "
                "ORDER BY score DESC, won DESC, created_at ASC LIMIT ?",
                (limit,),
            ).fetchall()
            games, wins = self._conn.execute("SELECT COUNT(*), COALESCE(SUM(won), 0) FROM results").fetchone()
        return {
            "entries": [
                {"name": n, "score": s, "max_score": m, "won": bool(w), "created_at": c} for n, s, m, w, c in rows
            ],
            "games": games,
            "human_wins": wins,
        }
