import { useEffect, useRef, useState } from 'react'
import { Final } from './components/Final'
import { Landing } from './components/Landing'
import { Show } from './components/Show'
import { api } from './lib/api'
import { createVoice } from './lib/voice'

const AI_IDS = ['jacques', 'brad']
const ORDER = [...AI_IDS, 'player']
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Use an already-started request on the first try, then fresh requests on retries.
const firstThen = (pending, retry) => {
  let used = false
  return () => {
    if (used) return retry()
    used = true
    return pending
  }
}

class Cancelled extends Error {}

const initialShow = () => ({
  phase: 'intro',
  round: 0,
  question: '',
  line: null,
  banner: null,
  spotlight: null,
  error: null,
  reveal: {},
  totals: { jacques: 0, brad: 0, player: 0 },
})

function standingsLine(totals, names, playerName) {
  const [leader, score] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]
  if (leader === 'player') return `${playerName} leads with ${score} points. The machines are sweating!`
  return `${names[leader]} leads with ${score}. ${playerName}, time to turn up the rizz!`
}

export default function App() {
  const [config, setConfig] = useState(null)
  const [lobbyError, setLobbyError] = useState('')
  const [leaderboard, setLeaderboard] = useState(null)
  const [screen, setScreen] = useState('landing')
  const [playerName, setPlayerName] = useState('')
  const [show, setShow] = useState(initialShow)
  const [history, setHistory] = useState([])
  const [result, setResult] = useState(null)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('rizztral:sound') !== 'off')

  const soundRef = useRef(soundOn)
  const voiceRef = useRef(null)
  const runRef = useRef(0)
  const lineId = useRef(0)
  const skipRef = useRef(null)
  const answerRef = useRef(null)
  const retryRef = useRef(null)

  const refreshLeaderboard = () => api.leaderboard().then(setLeaderboard).catch(() => {})

  useEffect(() => {
    api
      .config()
      .then((cfg) => {
        setConfig(cfg)
        voiceRef.current = createVoice(cfg.tts)
      })
      .catch(() => setLobbyError('The studio is offline right now. Is the backend running?'))
    refreshLeaderboard()
  }, [])

  const patch = (update) => setShow((s) => ({ ...s, ...(typeof update === 'function' ? update(s) : update) }))

  const guard = (run) => {
    if (runRef.current !== run) throw new Cancelled()
  }

  const say = async (run, speaker, text, { kind, voice = true, readMs } = {}) => {
    guard(run)
    const id = ++lineId.current
    patch({ line: { id, speaker, text, kind, skipped: false, wait: false } })
    const minRead = readMs ?? Math.min(9000, 1400 + text.length * 42)
    const skipped = new Promise((resolve) => {
      skipRef.current = resolve
    })
    const spoken = (async () => {
      const started = Date.now()
      const played = voice && soundRef.current ? await voiceRef.current?.play(text, speaker) : false
      await delay(played ? 300 : Math.max(0, minRead - (Date.now() - started)))
    })()
    const how = await Promise.race([spoken.then(() => 'done'), skipped.then(() => 'skip')])
    skipRef.current = null
    if (how === 'skip') {
      voiceRef.current?.stop()
      patch((s) => ({ line: s.line?.id === id ? { ...s.line, skipped: true } : s.line }))
    }
    guard(run)
  }

  const attempt = async (run, fn) => {
    for (;;) {
      guard(run)
      try {
        return await fn()
      } catch (err) {
        guard(run)
        patch({ error: err.message })
        await new Promise((resolve) => {
          retryRef.current = resolve
        })
        patch({ error: null })
      }
    }
  }

  const preload = (pairs) => {
    if (!soundRef.current || !config.tts) return
    pairs.forEach(([text, speaker]) => text && voiceRef.current?.load(text, speaker))
  }

  const runShow = async (name) => {
    const run = ++runRef.current
    voiceRef.current?.stop()
    setPlayerName(name)
    setLobbyError('')
    setShow(initialShow())
    setHistory([])
    setResult(null)
    setScreen('show')

    const names = Object.fromEntries(config.cast.contestants.map((c) => [c.id, c.name]))
    names.player = name
    const gameRequest = api.start(name)
    gameRequest.catch(() => {})

    try {
      await say(
        run,
        'host',
        `Good evening and welcome to Rizztral! Tonight ${name} takes on two AI heartbreakers, ${names.jacques} and ${names.brad}, for the heart of our bachelorette. Please welcome… Clarissa!`,
      )
      const game = await attempt(run, firstThen(gameRequest, () => api.start(name)))
      api.prepare(game.game_id, 1).catch(() => {})
      preload([[game.questions[0], 'clarissa']])
      await say(run, 'clarissa', game.intro)

      const rounds = []
      for (let n = 1; n <= game.questions.length; n++) {
        const question = game.questions[n - 1]
        if (n > 1) {
          api.prepare(game.game_id, n).catch(() => {})
          preload([[question, 'clarissa']])
        }
        patch({ round: n, question, reveal: {}, spotlight: null, banner: `Round ${n}`, phase: 'question', line: null })
        await delay(1400)
        guard(run)
        patch({ banner: null })
        await say(run, 'clarissa', question, { kind: 'question' })

        patch((s) => ({ phase: 'answering', line: { ...s.line, wait: true, skipped: true } }))
        const answer = await new Promise((resolve) => {
          answerRef.current = resolve
        })
        answerRef.current = null
        guard(run)
        patch({ phase: 'judging', reveal: {} })

        const r = await attempt(run, () => api.answer(game.game_id, n, answer))
        rounds.push(r)
        setHistory([...rounds])
        patch({ phase: 'reveal' })
        preload([...AI_IDS.map((id) => [r.answers[id], id]), ...ORDER.map((id) => [r.reactions[id], 'clarissa'])])

        for (const id of ORDER) {
          patch((s) => ({ spotlight: id, reveal: { ...s.reveal, [id]: { answer: r.answers[id] } } }))
          if (id === 'player') await say(run, 'player', r.answers.player || '…', { voice: false, readMs: 1600 })
          else await say(run, id, r.answers[id] || '…')
          patch((s) => ({
            totals: { ...s.totals, [id]: s.totals[id] + r.scores[id] },
            reveal: { ...s.reveal, [id]: { answer: r.answers[id], score: r.scores[id], reaction: r.reactions[id] } },
          }))
          await say(run, 'clarissa', r.reactions[id])
        }
        patch({ spotlight: null, totals: r.totals })
        if (n < game.questions.length) await say(run, 'host', standingsLine(r.totals, names, name))
      }

      patch({ phase: 'verdict', reveal: {}, spotlight: null, round: game.questions.length + 1 })
      const verdictRequest = api.verdict(game.game_id)
      verdictRequest.catch(() => {})
      await say(run, 'host', 'The scores are in. Clarissa, the final rose is yours. Who will it be?')
      const verdict = await attempt(run, firstThen(verdictRequest, () => api.verdict(game.game_id)))
      patch({ spotlight: verdict.winner })
      await say(run, 'clarissa', verdict.speech)
      setResult(verdict)
      refreshLeaderboard()
      setScreen('final')
      window.scrollTo({ top: 0 })
    } catch (err) {
      if (err instanceof Cancelled) return
      setLobbyError(err.message)
      setScreen('landing')
    }
  }

  const exit = () => {
    runRef.current++
    voiceRef.current?.stop()
    setScreen('landing')
    refreshLeaderboard()
  }

  const toggleSound = () => {
    const next = !soundRef.current
    soundRef.current = next
    setSoundOn(next)
    localStorage.setItem('rizztral:sound', next ? 'on' : 'off')
    if (!next) voiceRef.current?.stop()
  }

  if (screen === 'show' && config) {
    return (
      <Show
        config={config}
        playerName={playerName}
        show={show}
        soundOn={soundOn}
        toggleSound={toggleSound}
        onSkip={() => skipRef.current?.()}
        onAnswer={(text) => answerRef.current?.(text)}
        onRetry={() => retryRef.current?.()}
        onExit={exit}
      />
    )
  }

  if (screen === 'final' && config && result) {
    return (
      <Final
        config={config}
        playerName={playerName}
        result={result}
        history={history}
        leaderboard={leaderboard}
        onReplay={() => runShow(playerName)}
        onLobby={exit}
      />
    )
  }

  return <Landing config={config} leaderboard={leaderboard} onStart={runShow} error={lobbyError} />
}
