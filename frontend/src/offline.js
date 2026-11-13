const QUESTIONS = [
  "Be honest: what's the most unhinged thing you've done to impress a crush?",
  "It's 2am and you text me one word. What is it, and what happens next?",
  "Pitch me our first date like it's a Netflix trailer.",
  "We're stuck in a lift for an hour. What's your opening move?",
  "What's the most romantic thing you can do for under five euros?",
  "Where would you take me on a first date, and why there?",
  "What's your love language, and prove it in one line.",
  "Roast round: roast one of your rivals in one line. Make me laugh.",
]

const ROSTER = [
  ['jacques', 'Jacques', 'Hopeless romantic poet'],
  ['brad', 'Brad', 'Adrenaline junkie, heart of gold'],
  ['amara', 'Amara', 'Lagos-born fashion designer'],
  ['kenji', 'Kenji', 'Indie game dev, certified nerd'],
  ['priya', 'Priya', 'Stand-up comic with a sharp tongue'],
  ['diego', 'Diego', 'Chef who cooks in salsa steps'],
  ['layla', 'Layla', 'Beirut DJ who reads your chart'],
  ['malik', 'Malik', 'Smooth jazz saxophonist'],
  ['mei', 'Mei', 'Chaotic startup founder'],
  ['bernard', 'Bernard', 'Silver-fox retired sailor'],
].map(([id, name, tagline]) => ({ id, name, role: 'AI contestant', tagline }))

const ANSWERS = {
  jacques: [
    "Somewhere with bad phone signal, good wine, and enough stars to forget the time.",
    "I'd make it a tiny poem, then blame the moon for the dramatic parts.",
    "You bring the smile. I'll bring a terrible French accent and one suspiciously good playlist.",
  ],
  brad: [
    "Sunrise, questionable directions, then pancakes when we survive.",
    "I'd make it an adventure and pack enough snacks to earn a second date.",
    "Easy. We race to the beach, loser buys ice cream, both pretend it wasn't flirting.",
  ],
}

const TYPES = [
  ['funny', 'Funny', ['laugh', 'lol', 'joke', 'awkward', 'ridiculous']],
  ['poetic', 'Poetic', ['moon', 'star', 'heart', 'sunset', 'ocean']],
  ['nerdy', 'Smart nerd', ['science', 'book', 'code', 'game', 'fact']],
  ['bold', 'Wild adventurer', ['adventure', 'wild', 'risk', 'chaos', 'tonight']],
  ['sweet', 'Sweet', ['kind', 'care', 'together', 'home', 'hug']],
]

const SNAPSHOT_KEY = 'rizztral-leaderboard-snapshot'
const LOCAL_SCORES_KEY = 'rizztral-offline-scores'
const games = new Map()

const hash = (value) => [...String(value)].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7)
const id = () => globalThis.crypto?.randomUUID?.() || `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`
const today = () => new Date().toISOString().slice(0, 10)
const selectedType = (seed) => TYPES[hash(seed) % TYPES.length]
const answerFor = (seat, question) => ANSWERS[seat][hash(`${seat}-${question}`) % ANSWERS[seat].length]

function scoreAnswer(question, seat, answer, type) {
  const text = (answer || '').trim()
  let score
  if (seat === 'player') {
    score = !text || text === "I don't know" ? 1 : Math.min(9, 2 + Math.floor(Math.min(text.split(/\s+/).length, 15) / 2))
    if (/(laugh|you|together|honest|adventure)/i.test(text)) score += 1
    if (type[2].some((word) => text.toLowerCase().includes(word))) score += 2
  } else {
    score = 5 + (hash(`${question}-${seat}`) % 3)
    if ((type[0] === 'funny' && seat === 'brad') || (type[0] === 'poetic' && seat === 'jacques')) score += 2
  }
  score = Math.max(0, Math.min(10, score))
  const reaction = score >= 9
    ? 'Okay, that had charm, confidence, and just enough chaos. I like it.'
    : score >= 7
      ? 'Strong answer. Specific, playful, and dangerously close to impressive.'
      : score >= 5
        ? 'Not bad, but I wanted one more spark before giving you the rose.'
        : 'That answer arrived, technically. The chemistry did not.'
  return [score, reaction]
}

function lineupFor(seed) {
  const first = hash(seed) % ROSTER.length
  let second = hash(`${seed}-rival`) % ROSTER.length
  if (second === first) second = (second + 1) % ROSTER.length
  return { jacques: ROSTER[first], brad: ROSTER[second] }
}

function roundPayload(game, index) {
  const round = game.rounds[index]
  return {
    round: index + 1,
    question: round.question,
    answers: { ...round.aiAnswers, player: round.playerAnswer || '' },
    scores: { ...round.scores },
    reactions: { ...round.reactions },
    thought: round.thought,
    bonus: { ...round.bonus },
    order: [...round.order],
    powerups: [...game.powerups],
    totals: totals(game),
  }
}

function totals(game) {
  return game.rounds.reduce(
    (sum, round) => {
      for (const seat of ['jacques', 'brad', 'player']) sum[seat] += (round.scores[seat] || 0) + (round.bonus[seat] || 0)
      return sum
    },
    { jacques: 0, brad: 0, player: 0 },
  )
}

function ensureAi(game, round, seat) {
  if (!round.aiAnswers[seat]) round.aiAnswers[seat] = answerFor(seat, round.question)
  if (round.scores[seat] === undefined) {
    const [score, reaction] = scoreAnswer(round.question, seat, round.aiAnswers[seat], game.type)
    round.scores[seat] = score
    round.reactions[seat] = reaction
  }
}

function getGame(gameId) {
  const game = games.get(gameId)
  if (!game) throw new Error('Offline show expired. Start a new show.')
  return game
}

function localEntries() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) || '[]')
  } catch {
    return []
  }
}

function saveLocalScore(game, verdict) {
  const entries = localEntries()
  entries.push({
    name: game.playerName,
    score: verdict.totals.player,
    max_score: game.rounds.length * 10,
    won: verdict.winner === 'player',
    created_at: Date.now() / 1000,
    daily: game.daily,
  })
  localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(entries.slice(-40)))
}

function board(daily = false) {
  const key = daily ? today() : null
  const entries = localEntries()
    .filter((entry) => !key || entry.daily === key)
    .sort((a, b) => b.score - a.score || Number(b.won) - Number(a.won) || a.created_at - b.created_at)
    .slice(0, 8)
  return {
    entries,
    games: entries.length,
    human_wins: entries.filter((entry) => entry.won).length,
    daily: key,
    models: [],
    offline: true,
  }
}

function startGame(body = {}) {
  const count = body.daily ? 5 : [3, 5].includes(body.rounds) ? body.rounds : 3
  const seed = body.daily ? `daily-${today()}` : `${Date.now()}-${body.player_name}`
  const lineup = lineupFor(seed)
  const roastIndex = Math.floor(count / 2)
  const chosen = Array.from({ length: count }, (_, index) => QUESTIONS[(hash(seed) + index) % (QUESTIONS.length - 1)])
  chosen[roastIndex] = QUESTIONS.at(-1)
  const shift = hash(`${seed}-order`) % 3
  const seats = ['jacques', 'brad', 'player']
  const game = {
    id: id(),
    playerName: body.player_name || 'YOU',
    daily: body.daily ? today() : null,
    lineup,
    type: selectedType(seed),
    powerups: [],
    rounds: chosen.map((question, index) => ({
      question,
      order: [...seats.slice((index + shift) % 3), ...seats.slice(0, (index + shift) % 3)],
      aiAnswers: {},
      playerAnswer: '',
      scores: {},
      reactions: {},
      bonus: {},
      thought: '',
    })),
  }
  games.set(game.id, game)
  return {
    game_id: game.id,
    intro: `Welcome to the backup villa, ${game.playerName}. The server is waking up, but the flirting does not wait.`,
    questions: chosen,
    daily: game.daily,
    lineup,
    offline: true,
  }
}

function prepare(game, number) {
  const round = game.rounds[number - 1]
  const before = round.order.slice(0, round.order.indexOf('player'))
  for (const seat of before) ensureAi(game, round, seat)
  return {
    ready: true,
    order: [...round.order],
    before: Object.fromEntries(before.map((seat) => [
      seat,
      { answer: round.aiAnswers[seat], score: round.scores[seat], reaction: round.reactions[seat] },
    ])),
    offline: true,
  }
}

function answer(game, number, body = {}) {
  const round = game.rounds[number - 1]
  round.playerAnswer = String(body.answer || '').trim().slice(0, 280)
  const [score, reaction] = scoreAnswer(round.question, 'player', round.playerAnswer, game.type)
  round.scores.player = score
  round.reactions.player = reaction
  for (const seat of ['jacques', 'brad']) ensureAi(game, round, seat)
  if (body.wink && !game.powerups.includes('wink')) {
    game.powerups.push('wink')
    round.bonus.player = score
  }
  const best = Object.entries(round.scores).sort((a, b) => b[1] - a[1])[0][0]
  const name = best === 'player' ? game.playerName : game.lineup[best].name
  round.thought = `${name} had the strongest spark that round. ${game.type[1]} energy is winning me over tonight.`
  return roundPayload(game, number - 1)
}

function rewrite(game, number, body = {}) {
  if (game.powerups.includes('rewrite')) throw new Error('Rewrite is already used this show.')
  game.powerups.push('rewrite')
  const round = game.rounds[number - 1]
  round.playerAnswer = String(body.answer || '').trim().slice(0, 280)
  const [score, reaction] = scoreAnswer(round.question, 'player', round.playerAnswer, game.type)
  round.scores.player = score
  round.reactions.player = reaction
  if (round.bonus.player) round.bonus.player = score
  return roundPayload(game, number - 1)
}

function verdict(game) {
  const sums = totals(game)
  const winner = Object.keys(sums).sort((a, b) => sums[b] - sums[a] || (a === 'player' ? -1 : 1))[0]
  const playerPoints = game.rounds.map((round) => round.scores.player + (round.bonus.player || 0))
  const best = Math.max(...playerPoints)
  const worst = Math.min(...playerPoints)
  const bestRound = playerPoints.indexOf(best) + 1
  const worstRound = playerPoints.indexOf(worst) + 1
  const rival = winner === 'player'
    ? (sums.jacques > sums.brad ? 'jacques' : 'brad')
    : winner
  const rivalName = game.lineup[rival].name
  const wonRounds = game.rounds.filter((round) => {
    const player = round.scores.player + (round.bonus.player || 0)
    return player >= Math.max(round.scores.jacques, round.scores.brad)
  }).length
  const gap = Math.abs(sums.player - sums[rival])
  const result = {
    winner,
    speech: `${winner === 'player' ? game.playerName : game.lineup[winner].name}, you brought the best mix of wit and chemistry tonight. The final rose is yours.`,
    totals: sums,
    live: false,
    type: { id: game.type[0], label: game.type[1] },
    profile: {
      title: game.rounds.some((round) => round.playerAnswer.split(/\s+/).length > 8) ? 'The Wildcard' : 'The Dry Texter',
      blurb: 'Offline, unpredictable, and still in the game.',
    },
    badges: winner === 'player' ? ['Out-rizzed both AIs'] : [],
    breakdown: {
      why: winner === 'player'
        ? `You took ${wonRounds} of ${game.rounds.length} rounds and beat ${rivalName} by ${gap} pts.`
        : `${rivalName} beat you by ${gap} pts, but the server never got to see your full power.`,
      twist: `Plot twist: Clarissa was secretly into ${game.type[1].toLowerCase()} answers.`,
      rounds_won: wonRounds,
      best: { round: bestRound, question: game.rounds[bestRound - 1].question, points: best },
      worst: { round: worstRound, question: game.rounds[worstRound - 1].question, points: worst },
    },
    lineup: Object.fromEntries(Object.entries(game.lineup).map(([seat, character]) => [seat, character.id])),
    daily: game.daily,
    models: null,
    offline: true,
  }
  saveLocalScore(game, result)
  return result
}

export function fallbackLeaderboard() {
  try {
    const cached = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null')
    if (cached) return { ...cached, offline: true }
  } catch {
    localStorage.removeItem(SNAPSHOT_KEY)
  }
  return { ...board(false), today: board(true) }
}

export function saveLeaderboardSnapshot(value) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(value))
}

export async function offlineRequest(path, options = {}) {
  const method = options.method || 'GET'
  const body = options.body ? JSON.parse(options.body) : {}
  if (path === '/config') {
    return {
      provider: 'browser',
      demo: true,
      rounds: 3,
      round_options: [3, 5],
      answer_seconds: 60,
      max_answer_chars: 280,
      tts: false,
    }
  }
  if (path.startsWith('/leaderboard')) return board(path.includes('daily=true'))
  if (path === '/games' && method === 'POST') return startGame(body)

  const match = path.match(/^\/games\/([^/]+)\/(?:rounds\/(\d+)\/(prepare|answer|peek|rewrite)|verdict)$/)
  if (!match) throw new Error('This feature needs the server.')
  const game = getGame(match[1])
  if (path.endsWith('/verdict')) return verdict(game)
  const number = Number(match[2])
  const action = match[3]
  if (action === 'prepare') return prepare(game, number)
  if (action === 'answer') return answer(game, number, body)
  if (action === 'rewrite') return rewrite(game, number, body)
  if (action === 'peek') {
    if (game.powerups.includes('peek')) throw new Error('Peek is already used this show.')
    game.powerups.push('peek')
    const round = game.rounds[number - 1]
    const after = round.order.slice(round.order.indexOf('player') + 1)
    if (!after.length) throw new Error('Everyone already spoke before you this round.')
    const seat = after[0]
    ensureAi(game, round, seat)
    return { contestant: seat, answer: round.aiAnswers[seat] }
  }
  throw new Error('This feature needs the server.')
}
