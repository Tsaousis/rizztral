const BROWSER_VOICE = {
  host: { pitch: 0.8, rate: 1.05 },
  clarissa: { pitch: 1.3, rate: 1.0 },
  jacques: { pitch: 0.95, rate: 0.9 },
  brad: { pitch: 1.0, rate: 1.1 },
}

export function createVoice(serverTts) {
  const cache = new Map()
  let audio = null
  let finish = null

  const load = (text, speaker) => {
    if (!serverTts) return Promise.resolve(null)
    const key = `${speaker}::${text}`
    if (!cache.has(key)) {
      cache.set(
        key,
        fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speaker }),
        })
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => (blob ? URL.createObjectURL(blob) : null))
          .catch(() => null),
      )
    }
    return cache.get(key)
  }

  const playBrowser = (text, speaker) =>
    new Promise((resolve) => {
      const synth = window.speechSynthesis
      if (!synth) return resolve(false)
      const u = new SpeechSynthesisUtterance(text)
      Object.assign(u, BROWSER_VOICE[speaker] || {})
      u.onend = () => resolve(true)
      u.onerror = () => resolve(false)
      finish = () => resolve(true)
      synth.speak(u)
    })

  const play = async (text, speaker) => {
    stop()
    if (!serverTts) return playBrowser(text, speaker)
    const url = await load(text, speaker)
    if (!url) return false
    return new Promise((resolve) => {
      audio = new Audio(url)
      finish = () => resolve(true)
      audio.onended = () => resolve(true)
      audio.onerror = () => resolve(false)
      audio.play().catch(() => resolve(false))
    })
  }

  function stop() {
    if (audio) {
      audio.pause()
      audio = null
    }
    window.speechSynthesis?.cancel()
    if (finish) {
      const f = finish
      finish = null
      f()
    }
  }

  return { load, play, stop }
}
