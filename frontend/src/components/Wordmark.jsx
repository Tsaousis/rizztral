export function Wordmark({ size = 'lg' }) {
  return (
    <span className={`wordmark wordmark-${size}`} aria-label="Rizztral">
      RIZZ<span className="wordmark-accent">TRAL</span>
    </span>
  )
}
