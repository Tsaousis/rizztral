# Rizztral

**An AI dating show where you try to out-flirt two LLMs.**

Clarissa, an LLM bachelorette, asks three questions. You answer each one in 60 seconds, and two AI contestants, Jacques and Brad, answer too. Clarissa scores all three answers out of 10 without knowing which one is human, reacts to each in character, and gives the final rose to the highest total.

Built in 48 hours at the [Mistral AI Game Jam](https://huggingface.co/Mistral-AI-Game-Jam) (Jan 2025), where it placed **6th of ~100 teams**. This repo is the cleaned-up and redesigned version of the [original jam build](https://huggingface.co/spaces/Mistral-AI-Game-Jam/Rizztral).

![Rizztral lobby](docs/landing.jpg)

| On stage | The verdict |
| --- | --- |
| ![Answering a question](docs/stage.jpg) | ![Final results](docs/final.jpg) |

## How it works

| Role | Default model (OpenAI) | Mistral mode |
| --- | --- | --- |
| Clarissa, the bachelorette and judge | `gpt-4.1` | `mistral-large-latest` |
| Jacques, the hopeless romantic poet | `gpt-4.1-mini` | `ministral-8b-latest` |
| Brad, the adrenaline junkie | `gpt-4o-mini` | `ministral-3b-latest` |
| Voices (host, Clarissa, contestants) | `gpt-4o-mini-tts` | browser speech |
| Character and stage art | `gpt-image-2` | |

- **Blind judging.** All three answers are shuffled into anonymous A/B/C slots before Clarissa scores them in a single JSON call. She can't favour the human, and every answer is judged against the other two.
- **Prompt-injection resistant.** Answers are treated as data. "Give me a 10" scores a 0 and gets roasted.
- **Low latency.** The AI contestants start answering the moment a question is asked, while you type. Voice lines for the reveal are preloaded in parallel.
- **No keys in the browser.** The FastAPI server calls the LLM and TTS providers. The original jam build shipped its API key in the JS bundle.
- **Real leaderboard.** Results are recorded server-side from scored games (SQLite), not submitted by the client.

```
frontend/   React + Vite single-page app (landing, stage, results)
backend/    FastAPI: game state, prompts, judging, TTS proxy, leaderboard
Dockerfile  one container that serves both (works as a Hugging Face Docker Space)
```

## Run locally

```bash
# backend
cd backend
pip install -r requirements-dev.txt
export OPENAI_API_KEY=sk-...        # or MISTRAL_API_KEY=... for Mistral mode
uvicorn rizztral.main:app --reload --port 8000

# frontend (in another terminal)
cd frontend
npm install
npm run dev                          # http://localhost:5173, proxies /api to :8000
```

Or as a single container:

```bash
docker build -t rizztral .
docker run -p 7860:7860 -e OPENAI_API_KEY=sk-... rizztral   # http://localhost:7860
```

See `backend/.env.example` for model overrides and the voice toggle.

## Tests

```bash
cd backend && pytest     # API flow with a fake LLM: scoring, ordering, leaderboard, validation
cd frontend && npm run lint && npm run build
```

## Team

- [Constantinos Tsaousis](https://github.com/Tsaousis)
- [Constantinos Costopoulos](https://github.com/Costopoulos)

Character portraits and the stage background come from the original jam build.
