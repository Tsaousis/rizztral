import { ContestantCard } from './ContestantCard'
import { Composer } from './Composer'
import { Typewriter } from './Typewriter'
import { Wordmark } from './Wordmark'

const SPEAKER_LABEL = { host: 'Host', clarissa: 'Bachelorette' }

export function Show({ config, playerName, show, onSkip, onAnswer, onExit, onRetry, soundOn, toggleSound }) {
  const { cast, rounds, answer_seconds: seconds, max_answer_chars: maxChars } = config
  const people = {
    host: cast.host,
    clarissa: cast.bachelorette,
    ...Object.fromEntries(cast.contestants.map((c) => [c.id, c])),
  }
  const line = show.line
  const speaker = line ? people[line.speaker] : null
  const displayName = (p) => (p.id === 'player' ? playerName : p.name)
  const top = Math.max(...Object.values(show.totals))
  const clarissaSpeaking = line?.speaker === 'clarissa'

  return (
    <main className="show">
      <header className="topbar">
        <button className="link-btn" onClick={onExit} aria-label="Leave the show">
          <Wordmark size="sm" />
        </button>
        <ol className="rounds" aria-label="Rounds">
          {Array.from({ length: rounds }, (_, i) => i + 1).map((n) => (
            <li key={n} className={n < show.round ? 'done' : n === show.round ? 'current' : ''}>
              Round {n}
            </li>
          ))}
        </ol>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={toggleSound} aria-pressed={soundOn} title="Toggle voices">
            {soundOn ? <SoundOn /> : <SoundOff />}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onExit}>
            Exit
          </button>
        </div>
      </header>

      {show.banner && (
        <div className="banner" key={show.banner}>
          <span>{show.banner}</span>
        </div>
      )}

      <section className="spotlight">
        <div className={`star ${clarissaSpeaking ? 'is-speaking' : ''} ${show.phase === 'judging' ? 'is-judging' : ''}`}>
          <div className="star-halo" aria-hidden="true" />
          <img src={cast.bachelorette.avatar} alt="Clarissa" />
          <span className="star-name">
            {cast.bachelorette.name}
            <span className="model">{cast.bachelorette.model}</span>
          </span>
        </div>

        <div className="bubble-wrap">
          {show.error ? (
            <div className="bubble error">
              <span className="speaker">Technical difficulties</span>
              <p>{show.error}</p>
              <div className="row-gap">
                <button className="btn btn-primary btn-sm" onClick={onRetry}>
                  Try again
                </button>
                <button className="btn btn-ghost btn-sm" onClick={onExit}>
                  Back to lobby
                </button>
              </div>
            </div>
          ) : show.phase === 'judging' ? (
            <div className="bubble thinking">
              <span className="speaker">
                <img src={cast.bachelorette.avatar} alt="" />
                Clarissa is judging
              </span>
              <span className="dots" aria-label="thinking">
                <i />
                <i />
                <i />
              </span>
            </div>
          ) : line && speaker ? (
            <div className={`bubble from-${line.speaker}`} key={line.id}>
              <span className="speaker">
                <img src={speaker.avatar} alt="" />
                {displayName(speaker)}
                <span className="muted small">{SPEAKER_LABEL[line.speaker] || speaker.role}</span>
              </span>
              <p className={line.kind === 'question' ? 'question' : ''}>
                <Typewriter text={line.text} done={line.skipped} />
              </p>
              {!line.wait && (
                <button className="skip" onClick={onSkip}>
                  Skip ›
                </button>
              )}
            </div>
          ) : (
            <div className="bubble thinking">
              <span className="dots" aria-label="loading">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>
      </section>

      {show.phase === 'answering' && (
        <Composer
          key={show.round}
          question={show.question}
          seconds={seconds}
          maxChars={maxChars}
          onSubmit={onAnswer}
        />
      )}

      <section className="contestants" aria-label="Contestants">
        {cast.contestants.map((c) => (
          <ContestantCard
            key={c.id}
            contestant={c}
            name={displayName(c)}
            total={show.totals[c.id]}
            maxTotal={rounds * 10}
            reveal={show.reveal[c.id]}
            speaking={line?.speaker === c.id || show.spotlight === c.id}
            leader={top > 0 && show.totals[c.id] === top}
          />
        ))}
      </section>
    </main>
  )
}

const SoundOn = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
  </svg>
)
const SoundOff = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="m22 9-6 6M16 9l6 6" />
  </svg>
)
