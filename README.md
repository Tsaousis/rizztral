---
title: Rizztral
emoji: 💘
colorFrom: pink
colorTo: purple
sdk: static
app_build_command: cd frontend && npm ci && npm run build
app_file: frontend/dist/index.html
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
the retired backend with a secure FastAPI service, a static React frontend, a new pixel-art look and
new gameplay.

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

- React and Vite render the show interface as a static site; FastAPI serves the game API from a
  separate Docker service.
- OpenAI (`OPENAI_API_KEY`) or Mistral (`MISTRAL_API_KEY`) power the show. OpenAI defaults:
  `gpt-5.4-mini` for Clarissa, with contestants drawn from `gpt-5.4-mini`, `gpt-5.4-nano` and
  `gpt-5-mini`. Mistral defaults: `mistral-small-latest` and Ministral 8B/3B. Override with
  `RIZZTRAL_MODEL_CLARISSA` and `RIZZTRAL_ARENA_MODELS`.
- If the key is missing, expired, out of credits, or rate limited, the game falls back to its
  built-in show instead of failing, then retries the provider after two minutes.
- If the API service itself is unavailable, the browser runs an emergency built-in show and uses the
  last saved leaderboard snapshot, so the static Space remains playable.
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

## Deploy

The root `README.md` configures Hugging Face as a free static Space. It builds the React app without
using a CPU slot. Add a public Space variable named `VITE_API_BASE` with the Render service URL, then
push the repository to the Space. `frontend/public/config.js` is also available as a runtime override
for hosts that cannot provide build variables.

Deploy the API from the same repository with the Render Blueprint in `render.yaml`:

1. In Render, choose **New → Blueprint** and connect this repository.
2. Keep the free `rizztral-api` Web Service settings.
3. Enter `OPENAI_API_KEY` (or replace it with `MISTRAL_API_KEY` and set `RIZZTRAL_PROVIDER=mistral`).
4. After Render assigns the `onrender.com` URL, add it to the Hugging Face Space as `VITE_API_BASE`.

The free Render filesystem is ephemeral, so the SQLite leaderboard can reset after a deploy or
service replacement. Browsers keep the latest successful leaderboard as a read-only fallback.

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
