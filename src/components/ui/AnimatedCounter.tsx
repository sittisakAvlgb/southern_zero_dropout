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
    // The clock starts at mount, not at the first painted frame: a tab that
    // paints a few frames late must not restart the count from 0 and then stall
    // mid-way (the number read 37 while the dial showed 48).
    startRef.current = performance.now()
    let settled = false
    const step = (ts: number) => {
      if (settled) return
      const p = Math.max(0, Math.min((ts - (startRef.current ?? ts)) / duration, 1))
      // easeOutExpo
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setDisplay(value * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    // Safety net: a backgrounded or throttled tab never fires rAF, which would
    // leave every KPI reading 0. Snap to the real figure once the animation
    // window has passed regardless of whether a frame was ever painted — and
    // stop any frame that arrives later from overwriting it.
    const settle = window.setTimeout(() => {
      settled = true
      cancelAnimationFrame(rafRef.current)
      setDisplay(value)
    }, duration + 250)
    return () => {
      settled = true
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
