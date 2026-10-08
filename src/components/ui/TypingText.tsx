import { useEffect, useState } from 'react'

/** Reveals text with a short typewriter effect. Re-runs when `text` changes. */
export function TypingText({
  text,
  speed = 16,
  className = '',
  onDone,
}: {
  text: string
  speed?: number
  className?: string
  onDone?: () => void
}) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setCount(i)
      if (i >= text.length) {
        clearInterval(id)
        onDone?.()
      }
    }, speed)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed])

  const done = count >= text.length
  return (
    <span className={className}>
      {text.slice(0, count)}
      {!done && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
      )}
    </span>
  )
}
