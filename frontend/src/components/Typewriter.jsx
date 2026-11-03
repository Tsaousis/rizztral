import { useEffect, useState } from 'react'

export function Typewriter({ text, done, speed = 28 }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(id)
          return c
        }
        return c + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])

  const shown = done ? text.length : count
  return (
    <span className="typewriter" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {shown < text.length && <span className="caret" aria-hidden="true" />}
    </span>
  )
}
