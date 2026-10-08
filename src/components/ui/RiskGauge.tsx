import { useEffect, useId, useState } from 'react'
import { motion } from 'framer-motion'
import { riskLevel, RISK_COLOR, RISK_BG } from '@/lib/risk'
import { useI18n } from '@/i18n/LanguageContext'
import { AnimatedCounter } from './AnimatedCounter'

/** Thresholds the model uses — drawn on the dial so the number means something
 *  ("why is 75 high?" is answered by seeing where 70 and 85 sit). */
const TICKS = [40, 70, 85]

/**
 * Compact radial dial: a 270° sweep that fills in on mount, semantic colour,
 * threshold ticks, and a counting number.
 *
 * Two things were wrong before. The half-circle version pulled its value back
 * over the arc with `margin-top:-52%`, so the caption collided with the track.
 * The rewrite then animated `strokeDashoffset` through framer-motion *and*
 * passed the same property in `style`, which pinned the arc at its empty
 * starting value — the ring rendered grey with no colour at all. The sweep is
 * now a plain CSS transition driven by a mount flag, so the arc still lands on
 * the right value even in a tab that never paints a frame.
 */
export function RiskGauge({
  score,
  size = 132,
  showLevel = true,
}: {
  score: number
  size?: number
  showLevel?: boolean
}) {
  const { t } = useI18n()
  const uid = useId().replace(/:/g, '')
  const level = riskLevel(score)
  const color = RISK_COLOR[level]
  const alert = level === 'high' || level === 'critical'

  const stroke = Math.max(8, Math.round(size * 0.075))
  const r = (size - stroke) / 2 - 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const arc = circ * 0.75 // 270°
  const pct = Math.max(0, Math.min(100, score)) / 100

  // filled on the next commit so the CSS transition has something to run from
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    setFilled(false)
    const id = window.setTimeout(() => setFilled(true), 60)
    return () => window.clearTimeout(id)
  }, [score])

  /** point on the dial for a 0–100 value (dial starts bottom-left, runs CW) */
  const pointAt = (v: number, radius: number) => {
    const a = (135 + (v / 100) * 270) * (Math.PI / 180)
    return { x: c + radius * Math.cos(a), y: c + radius * Math.sin(a) }
  }

  return (
    <div className="inline-flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        {alert && (
          <motion.span
            className="absolute inset-2 rounded-full"
            style={{ boxShadow: `0 0 0 6px ${color}1f` }}
            animate={{ opacity: [0.55, 0, 0.55], scale: [0.98, 1.04, 0.98] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        <svg width={size} height={size} className="relative block">
          <defs>
            <linearGradient id={`rg-${uid}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="60%" stopColor={color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={color} stopOpacity={1} />
            </linearGradient>
          </defs>
          <g transform={`rotate(135 ${c} ${c})`}>
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke="#eef2f8"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circ}`}
            />
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={`url(#rg-${uid})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circ}`}
              style={{
                strokeDashoffset: filled ? arc * (1 - pct) : arc,
                transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </g>
          {/* model thresholds */}
          {TICKS.map((v) => {
            const a = pointAt(v, r + stroke / 2 + 1)
            const b = pointAt(v, r - stroke / 2 - 1)
            return (
              <line
                key={v}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#ffffff"
                strokeWidth={2}
                opacity={0.9}
              />
            )
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[30px] font-bold leading-none" style={{ color }}>
            <AnimatedCounter value={score} />
          </span>
          <span className="mt-0.5 text-[10px] font-medium text-ink-faint">
            / 100 · {t('risk.score')}
          </span>
        </div>
      </div>

      {showLevel && (
        <span
          className="-mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ backgroundColor: RISK_BG[level], color }}
        >
          {t(`risk.${level}`)}
        </span>
      )}
    </div>
  )
}
