import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'

interface Props {
  value: number
  /** number of decimal places */
  decimals?: number
  suffix?: string
  duration?: number
  className?: string
}

/** Counts up from 0 to `value` on mount using requestAnimationFrame. */
export function AnimatedCounter({
  value,
  decimals = 0,
  suffix = '',
  duration = 1100,
  className = '',
}: Props) {
  const { lang } = useI18n()
  const [display, setDisplay] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    startRef.current = null
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const p = Math.min((ts - startRef.current) / duration, 1)
      // easeOutExpo
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setDisplay(value * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    // Safety net: a backgrounded or throttled tab never fires rAF, which would
    // leave every KPI reading 0. Snap to the real figure once the animation
    // window has passed regardless of whether a frame was ever painted.
    const settle = window.setTimeout(() => setDisplay(value), duration + 250)
    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(settle)
    }
  }, [value, duration])

  const text =
    decimals > 0
      ? display.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : formatNumber(Math.round(display), lang)

  return (
    <span className={`tabular ${className}`}>
      {text}
      {suffix}
    </span>
  )
}
