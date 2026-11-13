import json
import re
from typing import Protocol

from openai import AsyncOpenAI


class LLM(Protocol):
    async def text(self, model: str, messages: list[dict], temperature: float = 0.8) -> str: ...

    async def json(self, model: str, messages: list[dict], temperature: float = 0.7) -> dict: ...


def sampling(model: str, temperature: float, max_tokens: int) -> dict:
    """GPT-5 models take max_completion_tokens and a reasoning effort; only effort 'none' allows temperature."""
    if not model.startswith("gpt-5"):
        return {"temperature": temperature, "max_tokens": max_tokens}
    if re.fullmatch(r"gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?", model):
        return {"reasoning_effort": "minimal", "max_completion_tokens": max_tokens + 400}
    return {"reasoning_effort": "none", "temperature": temperature, "max_completion_tokens": max_tokens}


class OpenAICompatibleLLM:
    """Works with OpenAI and with Mistral's OpenAI-compatible endpoint."""

    def __init__(self, api_key: str | None, base_url: str | None = None):
        self.client = AsyncOpenAI(api_key=api_key or "missing", base_url=base_url, max_retries=2, timeout=40)

    async def text(self, model: str, messages: list[dict], temperature: float = 0.8) -> str:
        response = await self.client.chat.completions.create(
            model=model, messages=messages, **sampling(model, temperature, 200)
        )
        return (response.choices[0].message.content or "").strip().strip('"').strip()

    async def json(self, model: str, messages: list[dict], temperature: float = 0.7) -> dict:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            **sampling(model, temperature, 900),
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content or "{}")
