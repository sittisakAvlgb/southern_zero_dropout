import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AnimatedCounter } from './AnimatedCounter'
import { Sparkline } from './Sparkline'
import { IconDown, IconUp } from '../icons'
import { useI18n } from '@/i18n/LanguageContext'
import type { RiskLevel } from '@/types'
import { RISK_COLOR } from '@/lib/risk'

interface Props {
  label: string
  value: number
  decimals?: number
  suffix?: string
  deltaPct?: number
  goodDirection?: 'up' | 'down'
  icon: ReactNode
  level?: RiskLevel
  spark?: number[]
  index?: number
  pulse?: boolean
}

export function KPICard({
  label,
  value,
  decimals = 0,
  suffix = '',
  deltaPct,
  goodDirection = 'up',
  icon,
  level,
  spark,
  index = 0,
  pulse = false,
}: Props) {
  const { t } = useI18n()
  const accent = level ? RISK_COLOR[level] : '#2f66f6'
  const isUp = (deltaPct ?? 0) >= 0
  const isGood =
    deltaPct === undefined
      ? true
      : (goodDirection === 'up' && isUp) || (goodDirection === 'down' && !isUp)
  const deltaColor = isGood ? 'text-risk-normal' : 'text-risk-critical'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      whileHover={{ y: -4 }}
      className={`relative overflow-hidden rounded-xl border border-surface-border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover ${
        pulse ? 'animate-pulse-ring' : ''
      }`}
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="flex items-start justify-between">
        <span
          className="grid h-9 w-9 place-items-center rounded-lg"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          {icon}
        </span>
        {level ? (
          <span
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: `${accent}14`, color: accent }}
          >
            {t(`risk.${level}`)}
          </span>
        ) : (
          spark && <Sparkline data={spark} color={accent} width={56} height={24} />
        )}
      </div>

      <p className="mt-3 text-2xl font-bold text-ink md:text-[26px]">
        <AnimatedCounter value={value} decimals={decimals} suffix={suffix} />
      </p>
      <p className="mt-0.5 text-xs font-medium text-ink-muted">{label}</p>

      {deltaPct !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${deltaColor}`}>
            {isUp ? <IconUp width={14} height={14} /> : <IconDown width={14} height={14} />}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
          <span className="text-[11px] text-ink-faint">{t('kpi.vsLastMonth')}</span>
        </div>
      )}
    </motion.div>
  )
}
