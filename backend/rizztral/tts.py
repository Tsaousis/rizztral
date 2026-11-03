from collections import OrderedDict

from openai import AsyncOpenAI

from .cast import VOICES


class TTS:
    def __init__(self, api_key: str | None, model: str = "gpt-4o-mini-tts", cache_size: int = 256):
        self.client = AsyncOpenAI(api_key=api_key or "missing", max_retries=1, timeout=30)
        self.model = model
        self.cache: OrderedDict[tuple[str, str], bytes] = OrderedDict()
        self.cache_size = cache_size

    async def speak(self, text: str, speaker: str) -> bytes:
        key = (speaker, text)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        voice, instructions = VOICES[speaker]
        response = await self.client.audio.speech.create(
            model=self.model, voice=voice, input=text, instructions=instructions, response_format="mp3"
        )
        audio = response.content
        self.cache[key] = audio
        while len(self.cache) > self.cache_size:
            self.cache.popitem(last=False)
        return audio
