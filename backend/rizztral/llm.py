import json
from typing import Protocol

from openai import AsyncOpenAI


class LLM(Protocol):
    async def text(self, model: str, messages: list[dict], temperature: float = 0.8) -> str: ...

    async def json(self, model: str, messages: list[dict], temperature: float = 0.7) -> dict: ...


class OpenAICompatibleLLM:
    """Works with OpenAI and with Mistral's OpenAI-compatible endpoint."""

    def __init__(self, api_key: str | None, base_url: str | None = None):
        self.client = AsyncOpenAI(api_key=api_key or "missing", base_url=base_url, max_retries=2, timeout=40)

    async def text(self, model: str, messages: list[dict], temperature: float = 0.8) -> str:
        response = await self.client.chat.completions.create(
            model=model, messages=messages, temperature=temperature, max_tokens=200
        )
        return (response.choices[0].message.content or "").strip().strip('"').strip()

    async def json(self, model: str, messages: list[dict], temperature: float = 0.7) -> dict:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=700,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content or "{}")
