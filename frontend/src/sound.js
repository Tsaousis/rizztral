const KEY = 'rizztral-muted'
const PROGRESSION = [
  [60, 64, 67, 72],
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [55, 59, 62, 67],
]
const STEP = 60 / 112 / 2

let ctx = null
let master = null
let musicTimer = null
let nextStep = 0
let step = 0
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(midi, start, duration, { type = 'square', gain = 0.12 } = {}) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.value = hz(midi)
  env.gain.setValueAtTime(gain, start)
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(env).connect(master)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

function melody(notes, gap, options) {
  const now = ctx.currentTime + 0.01
  notes.forEach((midi, index) => tone(midi, now + index * gap, gap * 1.6, options))
}

const SFX = {
  click: () => melody([84], 0.05, { gain: 0.06 }),
  start: () => melody([72, 76, 79, 84], 0.09),
  tick: () => melody([96], 0.03, { gain: 0.04 }),
  heart: (score = 5) =>
    score <= 3
      ? melody([67, 63, 60], 0.12, { type: 'triangle', gain: 0.18 })
      : melody([72, 76, 79, 84, 88].slice(0, Math.max(2, Math.round(score / 2))), 0.07),
  rose: () => {
    melody([72, 76, 79, 84, 79, 84, 88], 0.11)
    melody([48, 52, 55, 60], 0.2, { type: 'triangle', gain: 0.2 })
  },
  lose: () => melody([67, 66, 65, 60], 0.18, { type: 'triangle', gain: 0.2 }),
}

export function sfx(name, arg) {
  if (muted || !audio()) return
  SFX[name]?.(arg)
}

function schedule() {
  while (nextStep < ctx.currentTime + 0.3) {
    const chord = PROGRESSION[Math.floor(step / 8) % PROGRESSION.length]
    const beat = step % 8
    tone(chord[[0, 1, 2, 3, 2, 1, 2, 3][beat]] + 12, nextStep, STEP * 0.9, { gain: 0.03 })
    if (beat % 4 === 0) tone(chord[0] - 12, nextStep, STEP * 3, { type: 'triangle', gain: 0.09 })
    nextStep += STEP
    step += 1
  }
}

export function startMusic() {
  if (musicTimer || !audio()) return
  nextStep = ctx.currentTime + 0.05
  musicTimer = window.setInterval(schedule, 100)
  schedule()
}

export function stopMusic() {
  window.clearInterval(musicTimer)
  musicTimer = null
}

export const isMuted = () => muted

export function setMuted(value) {
  muted = value
  localStorage.setItem(KEY, value ? '1' : '0')
  if (master) master.gain.setTargetAtTime(value ? 0 : 0.5, ctx.currentTime, 0.05)
}
