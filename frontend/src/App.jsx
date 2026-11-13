import { useCallback, useEffect, useMemo, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import './App.css'

const CAST = {
  jacques: { name: 'Jacques', role: 'Hopeless romantic' },
  brad: { name: 'Brad', role: 'Adrenaline junkie' },
  player: { name: 'You', role: 'Human wildcard' },
}
const SPEAKERS = {
  marvey: 'Marvey · Host',
  clarissa: 'Clarissa · AI bachelorette',
  jacques: 'Jacques',
  brad: 'Brad',
  player: 'You',
}
const REVEAL_ORDER = ['jacques', 'brad', 'player']
const JAM_MODELS = [
  ['DeepSeek-R1', 60],
  ['Gemini-2.0-Flash-Thinking-Exp-1219', 58],
  ['o1-2024-12-17', 57],
  ['Gemini-2.0-Flash-Exp', 55],
  ['Gemini-Exp-1114', 54],
  ['o1-preview', 50],
  ['DeepSeek-V3', 49],
  ['Step-2-16K-Exp', 48],
  ['o1-mini', 45],
]
const LOBBY_LINE =
  "Welcome to Rizztral! Tonight, one human and two AIs fight for Clarissa's heart. Pick three or five questions. Blind judging, one rose."

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail || 'The villa lost its signal. Try again.')
  return body
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useTypewriter(text, speed = 26) {
  const [state, setState] = useState({ text, count: 0 })
  const count = state.text === text ? state.count : 0
  if (state.text !== text) setState({ text, count: 0 })
  const total = text?.length || 0

  useEffect(() => {
    if (!text) return undefined
    if (prefersReducedMotion()) {
      setState({ text, count: text.length })
      return undefined
    }
    const timer = window.setInterval(() => {
      setState((current) => {
        if (current.text !== text || current.count >= text.length) return current
        return { text, count: current.count + 1 }
      })
    }, speed)
    return () => window.clearInterval(timer)
  }, [text, speed])

  const skip = useCallback(() => setState({ text, count: total }), [text, total])
  return { shown: (text || '').slice(0, count), done: count >= total, skip }
}

function Hearts({ value, max = 10, label }) {
  return (
    <span className="hearts" role="img" aria-label={label}>
      {Array.from({ length: max }, (_, index) => {
        const fill = Math.max(0, Math.min(1, value - index))
        return <i key={index} className={fill >= 1 ? 'full' : fill > 0 ? 'half' : ''} />
      })}
    </span>
  )
}

function Dialog({ speaker, text, onSkip, done, children, tone = '' }) {
  return (
    <div className={`dialog-box ${tone}`} onClick={done ? undefined : onSkip}>
      <div className="dialog-name">{SPEAKERS[speaker]}</div>
      <p className="dialog-text" aria-live="polite">
        {text}
        {!done && <span className="caret" aria-hidden="true">▌</span>}
      </p>
      {done ? children : <span className="dialog-hint">click to skip ▼</span>}
    </div>
  )
}

function App() {
  const [config, setConfig] = useState({ rounds: 3, round_options: [3, 5], answer_seconds: 60, tts: false })
  const [roundCount, setRoundCount] = useState(3)
  const [boardTab, setBoardTab] = useState('humans')
  const [phase, setPhase] = useState('lobby')
  const [game, setGame] = useState(null)
  const [roundNumber, setRoundNumber] = useState(0)
  const [answer, setAnswer] = useState('')
  const [seconds, setSeconds] = useState(60)
  const [result, setResult] = useState(null)
  const [revealStep, setRevealStep] = useState(0)
  const [history, setHistory] = useState([])
  const [totals, setTotals] = useState({ jacques: 0, brad: 0, player: 0 })
  const [verdict, setVerdict] = useState(null)
  const [leaderboard, setLeaderboard] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [audioTalking, setAudioTalking] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  useEffect(() => {
    request('/config').then(setConfig).catch(() => {})
  }, [])

  const speak = useCallback(
    async (text, speaker) => {
      if (!config.tts || !text) return
      try {
        const response = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speaker }),
        })
        if (!response.ok) return
        const url = URL.createObjectURL(await response.blob())
        const audio = new Audio(url)
        audio.onplay = () => setAudioTalking(true)
        audio.onended = () => {
          setAudioTalking(false)
          URL.revokeObjectURL(url)
        }
        await audio.play()
      } catch {
        setAudioTalking(false)
      }
    },
    [config.tts],
  )

  const startShow = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await request('/games', {
        method: 'POST',
        body: JSON.stringify({ player_name: 'You', rounds: roundCount }),
      })
      setGame(data)
      setHistory([])
      setTotals({ jacques: 0, brad: 0, player: 0 })
      setVerdict(null)
      setResult(null)
      setRoundNumber(0)
      setPhase('intro')
      void speak(data.intro, 'clarissa')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const beginRound = async (number) => {
    setRoundNumber(number)
    setAnswer('')
    setResult(null)
    setRevealStep(0)
    setSeconds(config.answer_seconds)
    setError('')
    setPhase('answering')
    void speak(game.questions[number - 1], 'clarissa')
    request(`/games/${game.game_id}/rounds/${number}/prepare`, { method: 'POST' }).catch((err) =>
      setError(err.message),
    )
  }

  const submitAnswer = useCallback(
    async (forcedAnswer) => {
      if (busy || phase !== 'answering') return
      setBusy(true)
      setError('')
      try {
        const submitted = typeof forcedAnswer === 'string' ? forcedAnswer : answer
        const data = await request(`/games/${game.game_id}/rounds/${roundNumber}/answer`, {
          method: 'POST',
          body: JSON.stringify({ answer: submitted }),
        })
        setResult(data)
        setRevealStep(0)
        setHistory((current) => [...current, data])
        setPhase('reveal')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    },
    [answer, busy, game, phase, roundNumber],
  )

  useEffect(() => {
    if (phase !== 'answering' || busy) return undefined
    if (seconds <= 0) {
      void submitAnswer("I don't know")
      return undefined
    }
    const timer = window.setTimeout(() => setSeconds((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [busy, phase, seconds, submitAnswer])

  const finishShow = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await request(`/games/${game.game_id}/verdict`, { method: 'POST' })
      setVerdict(data)
      setTotals(data.totals)
      setPhase('verdict')
      void speak(data.speech, 'clarissa')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const showLeaderboard = async () => {
    try {
      setLeaderboard(await request('/leaderboard?limit=8'))
    } catch (err) {
      setError(err.message)
    }
  }

  const totalRounds = game?.questions?.length || roundCount
  const revealing = phase === 'reveal' && result
  const revealId = revealing ? REVEAL_ORDER[Math.min(revealStep, REVEAL_ORDER.length - 1)] : null
  const allRevealed = revealing && revealStep >= REVEAL_ORDER.length - 1

  const advanceReveal = () => {
    if (!revealing) return
    setTotals((current) => ({ ...current, [revealId]: current[revealId] + result.scores[revealId] }))
    if (revealStep < REVEAL_ORDER.length) setRevealStep((step) => step + 1)
  }
  const revealDone = revealing && revealStep >= REVEAL_ORDER.length

  const line = useMemo(() => {
    if (phase === 'lobby') return { speaker: 'marvey', text: LOBBY_LINE }
    if (phase === 'intro') return { speaker: 'clarissa', text: game?.intro }
    if (phase === 'answering') return { speaker: 'clarissa', text: game?.questions[roundNumber - 1] }
    if (revealDone) return { speaker: 'clarissa', text: 'All three answers are in. Who is rizzing hardest?' }
    if (revealing) return { speaker: revealId, text: result.answers[revealId] }
    if (phase === 'verdict') return { speaker: 'clarissa', text: verdict?.speech }
    return { speaker: 'marvey', text: '' }
  }, [phase, game, roundNumber, revealing, revealDone, revealId, result, verdict])

  const typed = useTypewriter(line.text)
  const talker = !typed.done || audioTalking ? line.speaker : null
  const completedRounds = history.length
  const playerRounds = revealing && !revealDone ? completedRounds - 1 : completedRounds
  const playerHearts = playerRounds ? totals.player / playerRounds : 0
  const sortedScores = useMemo(
    () => Object.entries(totals).sort(([, left], [, right]) => right - left),
    [totals],
  )

  return (
    <main className={`show-shell phase-${phase}`}>
      <div className="stage-art" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <div className="sparkles" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>

      <header className="hud">
        <img className="logo" src="/img/rizztral-logo.svg" alt="Rizztral, AI dating show" />
        <section className="rizz-meter" aria-label="Your Rizz Meter">
          <span className="hud-label">Rizz</span>
          <Hearts value={playerHearts} label={`Rizz Meter ${totals.player} points`} />
          <b className="hud-score">{totals.player}</b>
        </section>
        {phase !== 'lobby' && phase !== 'verdict' && (
          <div className="round-pips" aria-label={`Round ${roundNumber || 0} of ${totalRounds}`}>
            {Array.from({ length: totalRounds }, (_, i) => (
              <i key={i} className={i < completedRounds ? 'done' : i === roundNumber - 1 ? 'live' : ''} />
            ))}
          </div>
        )}
      </header>

      <nav className="fab-dock" aria-label="Quick actions">
        <button className="fab" onClick={showLeaderboard} aria-label="Open leaderboard">
          <span aria-hidden="true">♛</span><em>Top</em>
        </button>
        <button className="fab fab-cyan" onClick={() => setAboutOpen(true)} aria-label="About Rizztral">
          <span aria-hidden="true">?</span><em>About</em>
        </button>
      </nav>

      <section className="stage">
        {(phase === 'lobby') && (
          <div className="title-card">
            <p className="insert-coin">★ Insert rizz to continue ★</p>
            <h1>Can you out-rizz <span>the machines?</span></h1>
            <div className="host-spot">
              <PixelSprite id="marvey" talking={talker === 'marvey'} className="sprite-xl bob" label="Marvey, the host" />
              <PixelSprite id="clarissa" className="sprite-xl bob holo" label="Clarissa, the AI bachelorette" />
            </div>
          </div>
        )}

        {phase !== 'lobby' && phase !== 'verdict' && (
          <div className="judge-spot">
            <PixelSprite id="clarissa" talking={talker === 'clarissa'} className="sprite-xl holo bob" label="Clarissa" />
            {phase === 'answering' && (
              <div className={`timer ${seconds <= 10 ? 'urgent' : ''}`} aria-label={`${seconds} seconds left`}>
                <b>{seconds}</b><span>sec</span>
              </div>
            )}
          </div>
        )}

        {phase === 'verdict' && verdict && (
          <div className="verdict-stage">
            <div className="rose-burst" aria-hidden="true" />
            <PixelSprite id={verdict.winner} talking={false} className="sprite-xxl bob" label={CAST[verdict.winner].name} />
            <h2 className="winner-title">
              {verdict.winner === 'player' ? 'You got the rose!' : `${CAST[verdict.winner].name} got the rose`}
            </h2>
            <ol className="final-scores">
              {sortedScores.map(([id, score], index) => (
                <li key={id} className={id === verdict.winner ? 'winner' : ''}>
                  <span>{index + 1}</span><strong>{CAST[id].name}</strong><b>{score}/{totalRounds * 10}</b>
                </li>
              ))}
            </ol>
          </div>
        )}

        {phase !== 'lobby' && phase !== 'verdict' && (
          <div className="podiums" aria-label="Contestants">
            {REVEAL_ORDER.map((id, index) => {
              const shown = revealing && index < revealStep
              const active = revealId === id && !revealDone
              return (
                <article key={id} className={`podium ${id === 'player' ? 'you' : ''} ${active ? 'active' : ''}`}>
                  {shown && <span className="score-pop">+{result.scores[id]}</span>}
                  <PixelSprite id={id} talking={talker === id} className="sprite-md" />
                  <div className="plate">
                    <strong>{CAST[id].name}</strong>
                    <b>{totals[id]}</b>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="console">
        {line.text && (
          <Dialog speaker={line.speaker} text={typed.shown} done={typed.done} onSkip={typed.skip} tone={line.speaker === 'player' ? 'you' : ''}>
            {phase === 'lobby' && (
              <div className="dialog-actions">
                <button className="pixel-btn big" onClick={startShow} disabled={busy}>
                  {busy ? 'Opening the villa…' : '▶ Press start'}
                </button>
                <div className="round-picker" role="radiogroup" aria-label="Number of questions">
                  {config.round_options.map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={roundCount === n}
                      className={`pick ${roundCount === n ? 'on' : ''}`}
                      onClick={() => setRoundCount(n)}
                    >
                      {n} questions
                    </button>
                  ))}
                </div>
                <span className="microcopy">blind judging · no signup{config.demo ? ' · demo mode' : ''}</span>
              </div>
            )}

            {phase === 'intro' && (
              <div className="dialog-actions">
                <button className="pixel-btn" onClick={() => beginRound(1)}>Round 1 ▶</button>
              </div>
            )}

            {phase === 'answering' && (
              <form className="answer-form" onSubmit={(event) => { event.preventDefault(); void submitAnswer() }}>
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value.slice(0, 280))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (answer.trim()) void submitAnswer()
                    }
                  }}
                  placeholder="Type something with actual rizz…"
                  aria-label="Your answer"
                  autoFocus
                />
                <div className="answer-footer">
                  <span>{answer.length}/280</span>
                  <button className="pixel-btn" type="submit" disabled={busy || !answer.trim()}>
                    {busy ? 'Judging…' : 'Lock it in ♥'}
                  </button>
                </div>
              </form>
            )}

            {revealing && !revealDone && (
              <div className="reveal-meta">
                <span className="judge-note">Clarissa: “{result.reactions[revealId]}”</span>
                <div className="score-badge">
                  <Hearts value={result.scores[revealId]} label={`${result.scores[revealId]} out of 10`} />
                  <b>{result.scores[revealId]}/10</b>
                </div>
                <button className="pixel-btn" onClick={advanceReveal}>{allRevealed ? 'Tally up ▶' : 'Next answer ▶'}</button>
              </div>
            )}

            {revealDone && (
              <div className="dialog-actions">
                <button
                  className="pixel-btn"
                  onClick={() => (roundNumber < totalRounds ? beginRound(roundNumber + 1) : finishShow())}
                  disabled={busy}
                >
                  {roundNumber < totalRounds ? `Round ${roundNumber + 1} ▶` : busy ? 'Deciding…' : 'The final rose ♥'}
                </button>
              </div>
            )}

            {phase === 'verdict' && (
              <div className="dialog-actions">
                <button className="pixel-btn big" onClick={startShow} disabled={busy}>↻ Play again</button>
                <button className="pixel-btn ghost" onClick={showLeaderboard}>♛ Leaderboard</button>
              </div>
            )}
          </Dialog>
        )}
      </section>

      {error && (
        <button className="toast" onClick={() => setError('')}>{error} <b>×</b></button>
      )}

      {aboutOpen && (
        <div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
          <section className="leaderboard-modal about-modal" role="dialog" aria-label="About Rizztral" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setAboutOpen(false)} aria-label="Close">×</button>
            <p className="insert-coin">★ Made for the Mistral AI Game Jam ★</p>
            <h2>What is Rizztral?</h2>
            <p>
              A pixel dating show where one human and two AI contestants compete for the heart of Clarissa,
              an AI bachelorette. She asks three questions and scores every answer blind, so she never knows who is human.
            </p>
            <p>
              It is meant to be fun, and it is also a small experiment: can a language model flirt, read the room,
              and win over another model? Watch how the AIs reason about charm, humour and chemistry.
            </p>
            <p>The leaderboard tracks the most niche skill on the internet: who has the most rizz, humans or machines.</p>
            <p>Voice is switched off in this version, so the cast speaks in text. The original Game Jam build used ElevenLabs voices.</p>
            <p className="about-tip"><b>Tip:</b> be specific, be funny, and ask something back. Clarissa loves curiosity.</p>
          </section>
        </div>
      )}

      {leaderboard && (
        <div className="modal-backdrop" onClick={() => setLeaderboard(null)}>
          <section className="leaderboard-modal pixel-frame" role="dialog" aria-label="Leaderboard" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setLeaderboard(null)} aria-label="Close">×</button>
            <p className="insert-coin">★ High scores ★</p>
            <h2>Top rizz</h2>
            <div className="board-tabs" role="tablist">
              <button role="tab" aria-selected={boardTab === 'humans'} className={`pick ${boardTab === 'humans' ? 'on' : ''}`} onClick={() => setBoardTab('humans')}>
                Players
              </button>
              <button role="tab" aria-selected={boardTab === 'models'} className={`pick ${boardTab === 'models' ? 'on' : ''}`} onClick={() => setBoardTab('models')}>
                AI models
              </button>
            </div>
            {boardTab === 'humans' ? (
              <>
                {leaderboard.games > 0 && (
                  <p className="versus">Humans {leaderboard.human_wins} · Machines {leaderboard.games - leaderboard.human_wins}</p>
                )}
                {leaderboard.entries?.length ? leaderboard.entries.map((entry, index) => (
                  <div className="leader-row" key={`${entry.name}-${entry.created_at}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{entry.name}</strong>
                    <b>{entry.score}/{entry.max_score}</b>
                  </div>
                )) : <p>No roses handed out yet.</p>}
              </>
            ) : (
              <>
                <p className="board-note">Which LLM rizzes our bachelorette best? Win rates from the Mistral AI Game Jam, judged by mistral-large-latest.</p>
                {JAM_MODELS.map(([model, win], index) => (
                  <div className="leader-row model-row" key={model}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{model}</strong>
                    <b>{win}%</b>
                    <i className="win-bar" style={{ '--win': `${win}%` }} aria-hidden="true" />
                  </div>
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default App
