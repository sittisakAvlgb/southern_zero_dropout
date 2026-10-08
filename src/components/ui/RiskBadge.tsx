import type { RiskLevel } from '@/types'
import { RISK_BG, RISK_COLOR, RISK_ICON } from '@/lib/risk'
import { useI18n } from '@/i18n/LanguageContext'

/** Colored pill with an icon + label — never color alone (a11y). */
export function RiskBadge({
  level,
  size = 'md',
  pulse = false,
}: {
  level: RiskLevel
  size?: 'sm' | 'md'
  pulse?: boolean
}) {
  const { t } = useI18n()
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${pulse && level === 'critical' ? 'animate-pulse-ring' : ''}`}
      style={{ backgroundColor: RISK_BG[level], color: RISK_COLOR[level] }}
    >
      <span aria-hidden className="text-[0.85em] leading-none">
        {RISK_ICON[level]}
      </span>
      {t(`risk.${level}`)}
    </span>
  )
}
