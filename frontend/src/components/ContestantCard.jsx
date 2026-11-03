export function ContestantCard({ contestant, name, total, maxTotal, reveal, speaking, leader }) {
  const pct = maxTotal ? Math.round((total / maxTotal) * 100) : 0
  return (
    <article
      className={[
        'contestant',
        contestant.id === 'player' && 'is-player',
        speaking && 'is-speaking',
        leader && 'is-leader',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="contestant-top">
        <div className="avatar">
          <img src={contestant.avatar} alt="" />
          {speaking && <span className="ring" aria-hidden="true" />}
        </div>
        <div className="contestant-meta">
          <strong>{name}</strong>
          <span className="model">{contestant.model || 'human'}</span>
        </div>
        <div className="total" aria-label={`${total} points`}>
          {total}
          <span className="muted">/{maxTotal}</span>
        </div>
      </div>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      {reveal?.answer !== undefined && (
        <div className="answer">
          <p>{reveal.answer || <em className="muted">(silence)</em>}</p>
          {reveal.score !== undefined && (
            <div className="verdict-line">
              <span className={`score-pop s-${Math.min(3, Math.floor(reveal.score / 3.4))}`}>+{reveal.score}</span>
              <span className="reaction">{reveal.reaction}</span>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
