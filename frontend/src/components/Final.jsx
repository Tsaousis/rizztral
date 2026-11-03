import { Leaderboard } from './Leaderboard'
import { Wordmark } from './Wordmark'

export function Final({ config, playerName, result, history, leaderboard, onReplay, onLobby }) {
  const { cast, rounds } = config
  const people = Object.fromEntries(cast.contestants.map((c) => [c.id, c]))
  const winner = people[result.winner]
  const won = result.winner === 'player'
  const name = (id) => (id === 'player' ? playerName : people[id].name)
  const ranking = Object.entries(result.totals).sort((a, b) => b[1] - a[1])
  const max = rounds * 10
  const playerScore = result.totals.player
  const share = `I scored ${playerScore}/${max} on Rizztral, the AI dating show${won ? ' and won her heart' : ''}.`

  return (
    <main className="final">
      <header className="topbar">
        <button className="link-btn" onClick={onLobby}>
          <Wordmark size="sm" />
        </button>
      </header>

      {won && (
        <div className="hearts" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} style={{ '--i': i }}>
              ♥
            </span>
          ))}
        </div>
      )}

      <section className="final-hero panel">
        <div className="final-winner">
          <div className="winner-photo">
            <img src={winner.avatar} alt="" />
            <span className="rose" aria-hidden="true">
              🌹
            </span>
          </div>
          <div>
            <span className="eyebrow">{won ? 'You won her heart' : 'The final rose goes to'}</span>
            <h1>{won ? `${playerName}!` : `${winner.name}.`}</h1>
            <blockquote>
              <img src={cast.bachelorette.avatar} alt="" />
              <p>{result.speech}</p>
            </blockquote>
          </div>
        </div>

        <ol className="podium">
          {ranking.map(([id, score], i) => (
            <li key={id} className={id === 'player' ? 'is-player' : ''}>
              <span className="pod-rank">{i + 1}</span>
              <img src={people[id].avatar} alt="" />
              <span className="pod-name">
                {name(id)}
                <span className="model">{people[id].model || 'human'}</span>
              </span>
              <span className="pod-bar">
                <span style={{ width: `${(score / max) * 100}%` }} />
              </span>
              <span className="pod-score">
                {score}
                <span className="muted">/{max}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="row-gap">
          <button className="btn btn-primary" onClick={onReplay}>
            Play again
          </button>
          <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(`${share} ${location.origin}`)}>
            Copy result
          </button>
        </div>
      </section>

      <section className="recap">
        <h2>Your night, line by line</h2>
        {history.map((r) => {
          const ranked = Object.entries(r.scores).sort((a, b) => b[1] - a[1])
          return (
            <article key={r.round} className="panel recap-round">
              <header>
                <span className="eyebrow">Round {r.round}</span>
                <p className="question">{r.question}</p>
              </header>
              <ul>
                {ranked.map(([id, score]) => (
                  <li key={id} className={id === 'player' ? 'is-player' : ''}>
                    <img src={people[id].avatar} alt="" />
                    <div>
                      <strong>{name(id)}</strong>
                      <p>{r.answers[id] || <em className="muted">(silence)</em>}</p>
                      <p className="reaction">“{r.reactions[id]}”</p>
                    </div>
                    <span className={`score-pop s-${Math.min(3, Math.floor(score / 3.4))}`}>{score}</span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </section>

      <Leaderboard data={leaderboard} />
    </main>
  )
}
