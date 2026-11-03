import { useState } from 'react'
import { Leaderboard } from './Leaderboard'
import { Wordmark } from './Wordmark'

const STEPS = [
  ['01', 'She asks', 'Clarissa, an LLM bachelorette, asks three questions.'],
  ['02', 'You flirt', 'You get 60 seconds to answer. Two AI contestants answer too.'],
  ['03', 'She judges', 'Every answer is scored blind, out of 10, with zero mercy.'],
]

export function Landing({ config, leaderboard, onStart, error }) {
  const [name, setName] = useState(() => localStorage.getItem('rizztral:name') || '')
  const cast = config?.cast
  const submit = (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    localStorage.setItem('rizztral:name', clean)
    onStart(clean)
  }

  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <span className="chip chip-glow">Mistral AI Game Jam · 6th of 100 teams</span>
          <h1>
            <Wordmark size="xl" />
          </h1>
          <p className="headline">Out-flirt the machines.</p>
          <p className="lede">
            A live AI dating show. You compete against two AI contestants for the heart of an AI bachelorette,
            and she scores every line.
          </p>

          <form className="start-form" onSubmit={submit}>
            <label htmlFor="name" className="sr-only">
              Your name
            </label>
            <input
              id="name"
              value={name}
              maxLength={20}
              autoComplete="given-name"
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn btn-primary" disabled={!name.trim() || !config}>
              Start the show
            </button>
          </form>
          {error && <p className="error-text">{error}</p>}

          <ol className="steps">
            {STEPS.map(([n, title, text]) => (
              <li key={n}>
                <span className="step-n">{n}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="cast" aria-label="Tonight's cast">
          {cast && (
            <>
              <figure className="cast-star">
                <img src={cast.bachelorette.avatar} alt="" />
                <figcaption>
                  <span className="muted small">The bachelorette</span>
                  <strong>{cast.bachelorette.name}</strong>
                  <span className="model">{cast.bachelorette.model}</span>
                </figcaption>
              </figure>
              <div className="cast-row">
                {cast.contestants.map((c) => (
                  <figure key={c.id} className={`cast-card ${c.id === 'player' ? 'is-player' : ''}`}>
                    <img src={c.avatar} alt="" />
                    <figcaption>
                      <strong>{c.id === 'player' ? name.trim() || 'You' : c.name}</strong>
                      <span className="model">{c.model || 'human'}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="below">
        <Leaderboard data={leaderboard} />
        <aside className="panel about">
          <h2>Behind the curtain</h2>
          <p>
            Every line is generated live. Contestant answers are shuffled and anonymised before Clarissa scores them,
            so she can't tell which one is human. Telling her what score to give is a bad idea.
          </p>
          <ul className="tech">
            <li>React + Vite</li>
            <li>FastAPI</li>
            <li>{config?.provider === 'mistral' ? 'Mistral' : 'OpenAI'} LLMs</li>
            <li>{config?.tts ? 'Neural TTS voices' : 'Browser voices'}</li>
          </ul>
        </aside>
      </section>

      <footer className="footer">
        Built by Constantinos Tsaousis & Constantinos Costopoulos ·{' '}
        <a href="https://github.com/Tsaousis/rizztral" target="_blank" rel="noreferrer">
          Source
        </a>
      </footer>
    </main>
  )
}
