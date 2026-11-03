export function Leaderboard({ data }) {
  const entries = data?.entries ?? []
  return (
    <section className="panel leaderboard" aria-labelledby="lb-title">
      <header className="panel-head">
        <h2 id="lb-title">Hall of Rizz</h2>
        {data && (
          <span className="muted small">
            {data.games} shows · humans won {data.human_wins}
          </span>
        )}
      </header>
      {entries.length === 0 ? (
        <p className="muted empty">No one has dared yet. Be the first.</p>
      ) : (
        <ol className="lb-list">
          {entries.map((e, i) => (
            <li key={`${e.name}-${e.created_at}`}>
              <span className={`lb-rank rank-${i + 1}`}>{i + 1}</span>
              <span className="lb-name">{e.name}</span>
              {e.won && <span className="chip chip-win">won her heart</span>}
              <span className="lb-score">
                {e.score}
                <span className="muted">/{e.max_score}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
