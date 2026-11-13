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
        columns = {row[1] for row in self._conn.execute("PRAGMA table_info(results)")}
        if "daily" not in columns:
            self._conn.execute("ALTER TABLE results ADD COLUMN daily TEXT")
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS model_results (
                game_id TEXT NOT NULL,
                model TEXT NOT NULL,
                won INTEGER NOT NULL,
                created_at REAL NOT NULL,
                PRIMARY KEY (game_id, model)
            )"""
        )
        self._conn.commit()

    def record_models(self, game_id: str, results: dict[str, bool]) -> None:
        with self._lock:
            self._conn.executemany(
                "INSERT OR IGNORE INTO model_results VALUES (?, ?, ?, ?)",
                [(game_id, model, int(won), time.time()) for model, won in results.items()],
            )
            self._conn.commit()

    def record(
        self, game_id: str, player_name: str, score: int, max_score: int, won: bool, daily: str | None = None
    ) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO results (game_id, player_name, score, max_score, won, created_at, daily) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (game_id, player_name, score, max_score, int(won), time.time(), daily),
            )
            self._conn.commit()

    def top(self, limit: int = 10, daily: str | None = None) -> dict:
        where, args = ("WHERE daily = ?", (daily,)) if daily else ("", ())
        with self._lock:
            rows = self._conn.execute(
                f"SELECT player_name, score, max_score, won, created_at FROM results {where} "
                "ORDER BY score DESC, won DESC, created_at ASC LIMIT ?",
                (*args, limit),
            ).fetchall()
            games, wins = self._conn.execute("SELECT COUNT(*), COALESCE(SUM(won), 0) FROM results").fetchone()
            models = self._conn.execute(
                "SELECT model, COUNT(*) AS n, SUM(won) AS w FROM model_results GROUP BY model "
                "ORDER BY 1.0 * w / n DESC, n DESC, model ASC"
            ).fetchall()
        return {
            "entries": [
                {"name": n, "score": s, "max_score": m, "won": bool(w), "created_at": c} for n, s, m, w, c in rows
            ],
            "games": games,
            "human_wins": wins,
            "daily": daily,
            "models": [{"model": m, "games": n, "wins": w} for m, n, w in models],
        }
