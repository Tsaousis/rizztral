import { useCallback, useEffect, useMemo, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import { renderShareCard } from './share.js'
import { isMuted, setMuted, sfx, startMusic, stopMusic } from './sound.js'
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
  thought: 'Inside Clarissa’s head',
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
const NAME_KEY = 'rizztral-name'
const cleanName = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
const moodFor = (score) => (score >= 9 ? 'love' : score >= 6 ? 'blush' : score <= 3 ? 'meh' : null)
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

function Dialog({ speaker, label, text, onSkip, done, children, tone = '' }) {
  return (
    <div className={`dialog-box ${tone}`} onClick={done ? undefined : onSkip}>
      <div className="dialog-name">{label || SPEAKERS[speaker]}</div>
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
  const [roundCount, setRoundCount] = useState(5)
  const [prep, setPrep] = useState(null)
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
  const [name, setName] = useState(() => cleanName(localStorage.getItem(NAME_KEY) || ''))
  const [muted, setMutedState] = useState(isMuted)
  const [share, setShare] = useState(null)
  const [used, setUsed] = useState([])
  const [peek, setPeek] = useState(null)
  const [wink, setWink] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const playerName = name || 'YOU'
  const displayName = (id) => (id === 'player' ? playerName : game?.lineup?.[id]?.name || CAST[id].name)
  const spriteId = (seat) => (seat === 'player' ? 'player' : game?.lineup?.[seat]?.id || seat)
  const speakerLabel = (speaker) => (CAST[speaker] && speaker !== 'player' ? displayName(speaker) : SPEAKERS[speaker])

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

  const toggleMute = () => {
    setMuted(!muted)
    setMutedState(!muted)
    if (!muted) stopMusic()
    else startMusic()
  }

  const startShow = async (daily = false) => {
    sfx('start')
    startMusic()
    localStorage.setItem(NAME_KEY, name)
    setShare(null)
    setBusy(true)
    setError('')
    try {
      const data = await request('/games', {
        method: 'POST',
        body: JSON.stringify({ player_name: playerName, rounds: roundCount, daily: daily === true }),
      })
      setGame(data)
      setUsed([])
      setPeek(null)
      setWink(false)
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
    setPeek(null)
    setPrep(null)
    setWink(false)
    setRewriting(false)
    setSeconds(config.answer_seconds)
    setError('')
    setPhase('answering')
    void speak(game.questions[number - 1], 'clarissa')
    request(`/games/${game.game_id}/rounds/${number}/prepare`, { method: 'POST' })
      .then(setPrep)
      .catch((err) => setError(err.message))
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
          body: JSON.stringify({ answer: submitted, wink }),
        })
        setResult(data)
        setUsed(data.powerups)
        setRevealStep(0)
        setHistory((current) => [...current, data])
        setPhase('reveal')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    },
    [answer, busy, game, phase, roundNumber, wink],
  )

  const peekAnswer = async () => {
    if (busy || used.includes('peek')) return
    sfx('click')
    try {
      const data = await request(`/games/${game.game_id}/rounds/${roundNumber}/peek`, { method: 'POST' })
      setPeek(data)
      setUsed((current) => [...current, 'peek'])
    } catch (err) {
      setError(err.message)
    }
  }

  const submitRewrite = async () => {
    if (busy || !answer.trim()) return
    setBusy(true)
    setError('')
    try {
      const data = await request(`/games/${game.game_id}/rounds/${roundNumber}/rewrite`, {
        method: 'POST',
        body: JSON.stringify({ answer }),
      })
      setResult(data)
      setUsed(data.powerups)
      setHistory((current) => [...current.slice(0, -1), data])
      setRewriting(false)
      sfx('start')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

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
      sfx(data.winner === 'player' ? 'rose' : 'lose')
      void speak(data.speech, 'clarissa')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const showLeaderboard = async () => {
    try {
      const [all, today] = await Promise.all([
        request('/leaderboard?limit=8'),
        request('/leaderboard?limit=8&daily=true'),
      ])
      setLeaderboard({ ...all, today })
    } catch (err) {
      setError(err.message)
    }
  }

  const totalRounds = game?.questions?.length || roundCount
  const board = (boardTab === 'today' ? leaderboard?.today : leaderboard) || {}
  const revealing = phase === 'reveal' && result
  const revealOrder = result?.order || REVEAL_ORDER
  const revealId = revealing ? revealOrder[Math.min(revealStep, revealOrder.length - 1)] : null
  const allRevealed = revealing && revealStep >= revealOrder.length - 1
  const speakersAfter = prep ? prep.order.slice(prep.order.indexOf('player') + 1) : []

  const advanceReveal = () => {
    if (!revealing) return
    setRewriting(false)
    const gained = result.scores[revealId] + (result.bonus?.[revealId] || 0)
    setTotals((current) => ({ ...current, [revealId]: current[revealId] + gained }))
    if (revealStep < revealOrder.length) setRevealStep((step) => step + 1)
  }
  const revealDone = revealing && revealStep >= revealOrder.length

  const line = useMemo(() => {
    if (phase === 'lobby') return { speaker: 'marvey', text: LOBBY_LINE }
    if (phase === 'intro') return { speaker: 'clarissa', text: game?.intro }
    if (phase === 'answering') return { speaker: 'clarissa', text: game?.questions[roundNumber - 1] }
    if (revealDone) return { speaker: 'thought', text: result.thought || 'All three answers are in. Who is rizzing hardest?' }
    if (revealing) return { speaker: revealId, text: result.answers[revealId] }
    if (phase === 'verdict') return { speaker: 'clarissa', text: verdict?.speech }
    return { speaker: 'marvey', text: '' }
  }, [phase, game, roundNumber, revealing, revealDone, revealId, result, verdict])

  const typed = useTypewriter(line.text)
  const revealScore = revealing && !revealDone ? result.scores[revealId] : null
  const scoreShown = revealScore !== null && typed.done
  const clarissaMood = scoreShown ? moodFor(revealScore) : null

  useEffect(() => {
    if (scoreShown) sfx('heart', revealScore)
  }, [scoreShown, revealScore, revealId])

  useEffect(() => {
    if (phase === 'answering' && seconds > 0 && seconds <= 10) sfx('tick')
  }, [phase, seconds])

  const makeShareCard = async () => {
    const totalsNow = verdict.totals
    const card = await renderShareCard({
      name: playerName,
      score: totalsNow.player,
      max: totalRounds * 10,
      won: verdict.winner === 'player',
      winnerId: spriteId(verdict.winner),
      winnerName: displayName(verdict.winner),
      beaten: ['jacques', 'brad'].filter((id) => totalsNow[id] < totalsNow.player).length,
    title: verdict.profile?.title,
    badges: verdict.badges || [],
    })
    setShare(card)
  }

  const shareCard = async () => {
    const file = new File([share.blob], 'rizztral.png', { type: 'image/png' })
    const text = `I scored ${verdict.totals.player} pts on Rizztral. Can you out-rizz the machines?`
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, url: window.location.origin }).catch(() => {})
    } else {
      await navigator.clipboard?.writeText(`${text} ${window.location.origin}`).catch(() => {})
      setError('Link copied. Paste it anywhere.')
    }
  }
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
        <button className={`fab fab-sun ${muted ? 'off' : ''}`} onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Mute sound'} aria-pressed={!muted}>
          <span aria-hidden="true">{muted ? '×' : '♪'}</span><em>{muted ? 'Muted' : 'Sound'}</em>
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
            <PixelSprite id="clarissa" talking={talker === 'clarissa'} mood={clarissaMood} className="sprite-xl holo bob" label="Clarissa" />
            {clarissaMood && <span className={`mood-pop mood-${clarissaMood}`} aria-hidden="true">{clarissaMood === 'meh' ? '…' : '♥'}</span>}
            {line.speaker === 'thought' && <span className="think-bubble" aria-hidden="true"><i /><i /><i /></span>}
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
            <PixelSprite id={spriteId(verdict.winner)} talking={false} className="sprite-xxl bob" label={displayName(verdict.winner)} />
            <h2 className="winner-title">
              {verdict.winner === 'player' ? `${playerName} got the rose!` : `${displayName(verdict.winner)} got the rose`}
            </h2>
            <ol className="final-scores">
              {sortedScores.map(([id, score], index) => (
                <li key={id} className={id === verdict.winner ? 'winner' : ''}>
                  <span>{index + 1}</span><strong>{displayName(id)}</strong><b>{score} pts</b>
                </li>
              ))}
            </ol>
            {verdict.models && (
              <p className="arena-reveal">
                Tonight’s AIs: <b>{displayName('jacques')}</b> was <code>{verdict.models.jacques}</code>, <b>{displayName('brad')}</b> was <code>{verdict.models.brad}</code>
              </p>
            )}
            {verdict.breakdown && (
              <div className="breakdown">
                <h3>{verdict.winner === 'player' ? 'Why you won' : 'Why you lost'}</h3>
                <p>{verdict.breakdown.why}</p>
                <ul>
                  <li><b>Best:</b> round {verdict.breakdown.best.round}, {verdict.breakdown.best.points} pts</li>
                  <li><b>Worst:</b> round {verdict.breakdown.worst.round}, {verdict.breakdown.worst.points} pts</li>
                  <li><b>Rounds won:</b> {verdict.breakdown.rounds_won}</li>
                </ul>
                <p className="twist">{verdict.breakdown.twist}</p>
              </div>
            )}
            {verdict.type && (
              <div className="profile-card">
                <p className="type-reveal">Clarissa’s secret type: <b>{verdict.type.label}</b></p>
                {verdict.profile && <p className="rizz-profile"><b>{verdict.profile.title}</b> {verdict.profile.blurb}</p>}
                {verdict.badges?.length > 0 && (
                  <ul className="badges" aria-label="Badges">
                    {verdict.badges.map((badge) => <li key={badge}>★ {badge}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {phase !== 'lobby' && phase !== 'verdict' && (
          <div className="podiums" aria-label="Contestants">
            {REVEAL_ORDER.map((id) => {
              const shown = revealing && revealOrder.indexOf(id) < revealStep
              const active = revealId === id && !revealDone
              return (
                <article key={id} className={`podium ${id === 'player' ? 'you' : ''} ${active ? 'active' : ''}`}>
                  {shown && <span className="score-pop">+{result.scores[id] + (result.bonus?.[id] || 0)}</span>}
                  <PixelSprite id={spriteId(id)} talking={talker === id} className="sprite-md" label={displayName(id)} />
                  <div className="plate">
                    <strong>{displayName(id)}</strong>
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
          <Dialog speaker={line.speaker} label={speakerLabel(line.speaker)} text={typed.shown} done={typed.done} onSkip={typed.skip} tone={line.speaker === 'player' ? 'you' : line.speaker === 'thought' ? 'thought' : ''}>
            {phase === 'lobby' && (
              <div className="dialog-actions">
                <label className="name-entry">
                  <span>Enter name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(cleanName(event.target.value))}
                    onKeyDown={(event) => event.key === 'Enter' && !busy && startShow()}
                    placeholder="YOU"
                    maxLength={3}
                    aria-label="Your 3-letter arcade name"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button className="pixel-btn big" onClick={() => startShow()} disabled={busy}>
                  {busy ? 'Opening the villa…' : '▶ Press start'}
                </button>
                <button className="pixel-btn cyan" onClick={() => startShow(true)} disabled={busy}>
                  ☀ Daily challenge
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
                <div className="heard" aria-live="polite">
                  {!prep && <p className="heard-wait">The others are getting ready…</p>}
                  {prep && (
                    <p className="speak-order">
                      Speaking order: {prep.order.map((id) => displayName(id)).join(' → ')}
                    </p>
                  )}
                  {prep && Object.entries(prep.before).map(([id, text]) => (
                    <p key={id} className="peek-card"><b>{displayName(id)} said:</b> “{text}”</p>
                  ))}
                </div>
                {peek && (
                  <p className="peek-card"><b>{displayName(peek.contestant)} will say:</b> “{peek.answer}”</p>
                )}
                <div className="powerups" aria-label="Power-ups, one use each per show">
                  <button type="button" className="power" onClick={peekAnswer} disabled={busy || used.includes('peek') || !speakersAfter.length} title="See what an AI who speaks after you will say">
                    ◉ Peek
                  </button>
                  <button
                    type="button"
                    className={`power ${wink ? 'armed' : ''}`}
                    onClick={() => { sfx('click'); setWink(!wink) }}
                    disabled={busy || used.includes('wink')}
                    aria-pressed={wink}
                    title="Double points this round"
                  >
                    ♥ Wink ×2
                  </button>
                  <span className={`power static ${used.includes('rewrite') ? 'spent' : ''}`} title="After your score, edit your answer and get re-judged">
                    ✎ Rewrite
                  </span>
                </div>
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
                {result.bonus?.[revealId] > 0 && <span className="wink-tag">♥ ×2</span>}
                {revealId === 'player' && !used.includes('rewrite') && !rewriting && (
                  <button className="pixel-btn ghost" onClick={() => { sfx('click'); setRewriting(true) }}>✎ Rewrite</button>
                )}
                <button className="pixel-btn" onClick={advanceReveal} disabled={busy}>{allRevealed ? 'Tally up ▶' : 'Next answer ▶'}</button>
              </div>
            )}

            {rewriting && revealId === 'player' && !revealDone && (
              <form className="answer-form rewrite" onSubmit={(event) => { event.preventDefault(); void submitRewrite() }}>
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value.slice(0, 280))}
                  aria-label="Rewrite your answer"
                  autoFocus
                />
                <div className="answer-footer">
                  <span>One rewrite per show. New score replaces the old one.</span>
                  <button className="pixel-btn" type="submit" disabled={busy || !answer.trim()}>
                    {busy ? 'Re-judging…' : 'Re-judge me ♥'}
                  </button>
                </div>
              </form>
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
                <button className="pixel-btn big" onClick={() => startShow(Boolean(game?.daily))} disabled={busy}>↻ Play again</button>
                <button className="pixel-btn cyan" onClick={makeShareCard}>★ Share card</button>
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
              an AI bachelorette. She asks three or five questions and scores every answer blind, so she never knows who is human.
            </p>
            <p>
              It is meant to be fun, and it is also a small experiment: can a language model flirt, read the room,
              and win over another model? Watch how the AIs reason about charm, humour and chemistry.
            </p>
            <p>The leaderboard tracks the most niche skill on the internet: who has the most rizz, humans or machines.</p>
            <p>Voice is switched off in this version, so the cast speaks in text. The original Game Jam build used ElevenLabs voices.</p>
            <p>
              Every show, two rivals are drawn from a cast of ten (Jacques and Brad are the 2025 originals). Live arena: with an AI key, each is played by a different model, and the
              AI models leaderboard counts which ones win Clarissa over.
            </p>
            <p className="credits">
              Made by <a href="https://github.com/Costopoulos" target="_blank" rel="noreferrer">Costo</a>,{' '}
              <a href="https://github.com/Tsaousis" target="_blank" rel="noreferrer">Costas</a> and{' '}
              <a href="https://github.com/jlexternal" target="_blank" rel="noreferrer">jlexternal</a> ·{' '}
              <a href="https://github.com/Tsaousis/rizztral" target="_blank" rel="noreferrer">Source on GitHub</a>
            </p>
            <p className="privacy">Answers may be processed by AI providers. Please don’t share personal info.</p>
            <p className="about-tip"><b>Tip:</b> be specific, be funny, and ask something back. Clarissa loves curiosity.</p>
            <p>
              <b>Her secret type:</b> every show Clarissa secretly prefers funny, poetic, nerdy, bold or sweet answers. Read her
              reactions and thoughts for clues, then lean into it. <b>Power-ups</b>, once per show: Peek at an AI answer, Wink for
              double points, or Rewrite your answer after you see the score. The <b>daily challenge</b> gives everyone the same five
              questions and its own leaderboard.
            </p>
          </section>
        </div>
      )}

      {share && (
        <div className="modal-backdrop" onClick={() => setShare(null)}>
          <section className="leaderboard-modal share-modal" role="dialog" aria-label="Share your result" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setShare(null)} aria-label="Close">×</button>
            <p className="insert-coin">★ Brag responsibly ★</p>
            <img src={share.url} alt="Your Rizztral result card" />
            <div className="dialog-actions">
              <a className="pixel-btn" href={share.url} download="rizztral.png">⬇ Download</a>
              <button className="pixel-btn cyan" onClick={shareCard}>↗ Share</button>
            </div>
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
              <button role="tab" aria-selected={boardTab === 'today'} className={`pick ${boardTab === 'today' ? 'on' : ''}`} onClick={() => setBoardTab('today')}>
                Today
              </button>
              <button role="tab" aria-selected={boardTab === 'models'} className={`pick ${boardTab === 'models' ? 'on' : ''}`} onClick={() => setBoardTab('models')}>
                AI models
              </button>
            </div>
            {boardTab !== 'models' ? (
              <>
                {boardTab === 'today' && <p className="board-sub">Daily challenge · {board.daily} · same 5 questions for everyone</p>}
                {board.games > 0 && (
                  <p className="versus">Humans {board.human_wins} · Machines {board.games - board.human_wins}</p>
                )}
                {board.entries?.length ? board.entries.map((entry, index) => (
                  <div className="leader-row" key={`${entry.name}-${entry.created_at}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{entry.name}</strong>
                    <b>{entry.score} <small>pts · {entry.max_score / 10}Q</small></b>
                  </div>
                )) : <p>{boardTab === 'today' ? 'Nobody has played today’s challenge yet.' : 'No roses handed out yet.'}</p>}
              </>
            ) : (
              <>
                <h3 className="board-sub">Live arena</h3>
                {leaderboard.models?.length ? leaderboard.models.map((row, index) => {
                  const win = Math.round((100 * row.wins) / row.games)
                  return (
                    <div className="leader-row model-row" key={row.model}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{row.model}</strong>
                      <b>{win}% <small>of {row.games}</small></b>
                      <i className="win-bar" style={{ '--win': `${win}%` }} aria-hidden="true" />
                    </div>
                  )
                }) : <p className="board-note">No live shows yet. Games played with the AI switched on count here.</p>}
                <h3 className="board-sub">Game Jam 2025</h3>
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
