import os
from dataclasses import dataclass, field
from pathlib import Path

PROVIDERS = {
    "openai": {
        "base_url": None,
        "key_env": "OPENAI_API_KEY",
        "models": {"clarissa": "gpt-5.4-mini", "jacques": "gpt-5.4-mini", "brad": "gpt-5.4-nano"},
        "arena": ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5-mini"],
    },
    "mistral": {
        "base_url": "https://api.mistral.ai/v1",
        "key_env": "MISTRAL_API_KEY",
        "models": {
            "clarissa": "mistral-small-latest",
            "jacques": "ministral-8b-latest",
            "brad": "ministral-3b-latest",
        },
        "arena": ["ministral-8b-latest", "ministral-3b-latest", "mistral-small-latest", "open-mistral-nemo"],
    },
}


def _detect_provider() -> str:
    explicit = os.getenv("RIZZTRAL_PROVIDER", "").strip().lower()
    if explicit:
        if explicit not in PROVIDERS:
            raise ValueError(f"RIZZTRAL_PROVIDER must be one of {sorted(PROVIDERS)}")
        return explicit
    if os.getenv("MISTRAL_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        return "mistral"
    return "openai"


def _enabled(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    provider: str = field(default_factory=_detect_provider)
    demo: bool = field(default_factory=lambda: _enabled("RIZZTRAL_DEMO"))
    rounds: int = 3
    round_options: tuple[int, ...] = (3, 5)
    answer_seconds: int = 60
    max_answer_chars: int = 280
    max_games: int = 500
    max_ai_games_per_day: int = field(default_factory=lambda: int(os.getenv("RIZZTRAL_MAX_AI_GAMES_PER_DAY", "40")))
    db_path: Path = field(
        default_factory=lambda: Path(
            os.getenv("RIZZTRAL_DB", Path(__file__).resolve().parent.parent / "data" / "rizztral.db")
        )
    )
    static_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv("RIZZTRAL_STATIC", Path(__file__).resolve().parents[2] / "frontend" / "dist")
        )
    )

    @property
    def api_key(self) -> str | None:
        return os.getenv(PROVIDERS[self.provider]["key_env"])

    @property
    def base_url(self) -> str | None:
        return PROVIDERS[self.provider]["base_url"]

    @property
    def models(self) -> dict[str, str]:
        models = dict(PROVIDERS[self.provider]["models"])
        for role in models:
            override = os.getenv(f"RIZZTRAL_MODEL_{role.upper()}")
            if override:
                models[role] = override
        return models

    @property
    def arena_models(self) -> list[str]:
        """Models the AI contestants are randomly drawn from, one per contestant per show."""
        raw = os.getenv("RIZZTRAL_ARENA_MODELS")
        if raw is not None:
            return [m.strip() for m in raw.split(",") if m.strip()]
        return list(PROVIDERS[self.provider]["arena"])

    @property
    def tts_enabled(self) -> bool:
        return not self.demo and bool(os.getenv("OPENAI_API_KEY")) and _enabled("RIZZTRAL_TTS")
