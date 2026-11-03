import os
from dataclasses import dataclass, field
from pathlib import Path

PROVIDERS = {
    "openai": {
        "base_url": None,
        "key_env": "OPENAI_API_KEY",
        "models": {"clarissa": "gpt-4.1", "jacques": "gpt-4.1-mini", "brad": "gpt-4o-mini"},
    },
    "mistral": {
        "base_url": "https://api.mistral.ai/v1",
        "key_env": "MISTRAL_API_KEY",
        "models": {
            "clarissa": "mistral-large-latest",
            "jacques": "ministral-8b-latest",
            "brad": "ministral-3b-latest",
        },
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


@dataclass
class Settings:
    provider: str = field(default_factory=_detect_provider)
    rounds: int = 3
    answer_seconds: int = 60
    max_answer_chars: int = 280
    max_games: int = 500
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
    def tts_enabled(self) -> bool:
        return bool(os.getenv("OPENAI_API_KEY")) and os.getenv("RIZZTRAL_TTS", "1") != "0"
