import { useEffect, useRef, useState } from 'react'

export function Composer({ question, seconds, maxChars, onSubmit }) {
  const [text, setText] = useState('')
  const [left, setLeft] = useState(seconds)
  const textRef = useRef('')
  const sent = useRef(false)
  const inputRef = useRef(null)

  const send = () => {
    if (sent.current) return
    sent.current = true
    onSubmit(textRef.current.trim())
  }

  useEffect(() => {
    inputRef.current?.focus()
    const deadline = Date.now() + seconds * 1000
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) {
        clearInterval(id)
        send()
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds])

  const r = 22
  const circ = 2 * Math.PI * r
  const urgent = left <= 10

  return (
    <form
      className="composer panel"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <div className="composer-head">
        <div>
          <span className="eyebrow">Your turn</span>
          <p className="composer-q">{question}</p>
        </div>
        <div className={`timer ${urgent ? 'urgent' : ''}`} aria-label={`${left} seconds left`}>
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r={r} className="timer-track" />
            <circle
              cx="26"
              cy="26"
              r={r}
              className="timer-fill"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - left / seconds)}
            />
          </svg>
          <span>{left}</span>
        </div>
      </div>
      <textarea
        ref={inputRef}
        value={text}
        maxLength={maxChars}
        rows={3}
        placeholder="Be charming. Be specific. Don't be cringe."
        onChange={(e) => {
          setText(e.target.value)
          textRef.current = e.target.value
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (text.trim()) send()
          }
        }}
      />
      <div className="composer-foot">
        <span className="muted small">
          {text.length}/{maxChars} · Enter to send
        </span>
        <button className="btn btn-primary" disabled={!text.trim()}>
          Send answer
        </button>
      </div>
    </form>
  )
}
