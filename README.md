---
title: Rizztral
emoji: 💘
colorFrom: pink
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Can you out-rizz two AI contestants?
---

# Rizztral

**One human. Two models. One final rose.**

![Rizztral gameplay](docs/demo.gif)

Rizztral is an AI dating show where Clarissa, an AI bachelorette, asks three or five questions and
scores every answer live: you against two AI contestants drawn from a cast of ten. The highest total
wins the final rose.

## Based on the Mistral AI Game Jam project

This is a rebuild of **Rizztral**, our team's entry to the
[Mistral AI Game Jam](https://huggingface.co/Mistral-AI-Game-Jam) in January 2025, where it placed 6th
out of roughly 100 teams. The original frontend is
[Costopoulos/Rizztral](https://github.com/Costopoulos/Rizztral) and the jam build lives on the
[original Hugging Face Space](https://huggingface.co/spaces/Mistral-AI-Game-Jam/Rizztral).
This version keeps the premise, Clarissa and the original contestants Jacques and Brad, and replaces
the retired Heroku and Render backends with a single secure Docker app, a new pixel-art look and new
gameplay.

## Why we built it

Rizztral is meant to be fun, and it doubles as a small experiment in AI behaviour: can a language
model flirt, read the room, and win the heart of another model? The leaderboard ranks a very niche
skill: who has the most rizz, humans or machines.

## How to play

- **Live rounds:** Clarissa asks, then each contestant answers in turn and she reacts and scores them
  straight away. The speaking order rotates every round, and one round per show is a roast round.
- **Clarissa is a tough judge:** she loves short, playful, funny answers and marks down long,
  serious or AI-sounding ones.
- **Secret type:** each show she secretly prefers one type (funny, poetic, smart nerd, wild
  adventurer, bad boy, tech tycoon or sweet). Her reactions drop hints; answers that fit score extra.
- **Power-ups**, once per show: *Peek* at what an AI who speaks after you will say, *Wink* for double
  points this round, or *Rewrite* your answer after you see the score and get re-judged.
- **Daily challenge:** everyone gets the same five questions and secret type for the day, ranked on
  the *Today* leaderboard.
- **Verdict:** a "why you won / why you lost" breakdown with a plot twist, a rizz profile and badges,
  and a shareable pixel result card.

## How it works

- React and Vite render the show interface; FastAPI serves it and all API routes from one container.
- OpenAI (`OPENAI_API_KEY`) or Mistral (`MISTRAL_API_KEY`) power the show. OpenAI defaults:
  `gpt-5.4-mini` for Clarissa, with contestants drawn from `gpt-5.4-mini`, `gpt-5.4-nano` and
  `gpt-5-mini`. Mistral defaults: `mistral-small-latest` and Ministral 8B/3B. Override with
  `RIZZTRAL_MODEL_CLARISSA` and `RIZZTRAL_ARENA_MODELS`.
- If the key is missing, expired, out of credits, or rate limited, the game falls back to its
  built-in show instead of failing, then retries the provider after two minutes.
- Provider keys stay on the server and are never included in browser code.
- Cast of ten AI rivals (Jacques, Brad, Amara, Kenji, Priya, Diego, Layla, Malik, Mei, Bernard), each
  with their own pixel sprite and personality; two are drawn per show. They remember the show but only
  call back to earlier answers in the roast round.
- Live AI arena: shows where the AI provider answered every call count towards the AI models
  leaderboard, next to the original Game Jam win rates. Built-in-show games never count.
- Chiptune music and sound effects are generated in the browser with Web Audio.
- Voice is off by default. The original Game Jam build used ElevenLabs; this version can speak
  through OpenAI TTS only when `RIZZTRAL_TTS=1` and an `OPENAI_API_KEY` are set.
- Spend guard: at most `RIZZTRAL_MAX_AI_GAMES_PER_DAY` shows per day (default `40`, `0` = no cap)
  use the AI provider; later shows that day play the built-in show. Pair it with a hard spend
  limit on the provider project.

## Run locally

```bash
cp backend/.env.example backend/.env
# Add OPENAI_API_KEY (or MISTRAL_API_KEY) to backend/.env
docker build -t rizztral .
docker run --env-file backend/.env -p 7860:7860 rizztral
```

Open <http://localhost:7860>.

To test the complete game without any provider key, run demo mode:

```bash
docker run -e RIZZTRAL_DEMO=1 -p 7860:7860 rizztral
```

Demo mode uses built-in questions, contestant answers, scores, and verdicts. Voice is disabled.

## Hugging Face Space

This repository is ready for a Docker Space:

1. Add `OPENAI_API_KEY` (or `MISTRAL_API_KEY`) under **Settings → Variables and secrets**.
2. Push the repository to the Space.
3. Hugging Face builds the Dockerfile and serves the app on port `7860`.

The default SQLite leaderboard is ephemeral on Hugging Face. Set `RIZZTRAL_DB` to a path on
persistent storage if scores must survive Space restarts.

## Development

```bash
cd frontend
npm ci
npm run lint
npm run build

cd ../backend
python -m pip install -r requirements-dev.txt
python -m pytest -q
ruff check .
```

## Credits

Made at the Mistral AI Game Jam by [Costo](https://github.com/Costopoulos),
[Costas](https://github.com/Tsaousis) and [jlexternal](https://github.com/jlexternal).

## Security

The original static build called ElevenLabs directly from the browser and exposed its API key in the
compiled JavaScript. This version routes speech through FastAPI and reads credentials only from
server-side environment variables. Rotate the original ElevenLabs key if it is still active.
