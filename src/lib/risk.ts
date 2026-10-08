import type { RiskLevel } from '@/types'

// ── Risk Score Model ──────────────────────────────────────────
// weighted sum of six sub-scores (each 0–100)
export const RISK_WEIGHTS = {
  attendance: 0.3,
  academic: 0.25,
  behavior: 0.15,
  family: 0.15,
  wellbeing: 0.1,
  parent: 0.05,
} as const

export interface RiskInputs {
  attendanceRisk: number
  academicRisk: number
  behaviorRisk: number
  familyRisk: number
  wellbeingRisk: number
  parentRisk: number
}

export function computeRiskScore(i: RiskInputs): number {
  const s =
    i.attendanceRisk * RISK_WEIGHTS.attendance +
    i.academicRisk * RISK_WEIGHTS.academic +
    i.behaviorRisk * RISK_WEIGHTS.behavior +
    i.familyRisk * RISK_WEIGHTS.family +
    i.wellbeingRisk * RISK_WEIGHTS.wellbeing +
    i.parentRisk * RISK_WEIGHTS.parent
  return Math.round(s)
}

// ── Risk Level thresholds ─────────────────────────────────────
export function riskLevel(score: number): RiskLevel {
  if (score >= 85) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 40) return 'watch'
  return 'normal'
}

// ── Semantic colors (matches tailwind.config risk palette) ────
export const RISK_COLOR: Record<RiskLevel, string> = {
  normal: '#16a34a',
  watch: '#eab308',
  high: '#f97316',
  critical: '#dc2626',
}

export const RISK_BG: Record<RiskLevel, string> = {
  normal: '#dcfce7',
  watch: '#fef9c3',
  high: '#ffedd5',
  critical: '#fee2e2',
}

/** Map a province risk-rate (%) to a heat level for the map. */
export function rateToLevel(rate: number): RiskLevel {
  if (rate >= 14) return 'critical'
  if (rate >= 10) return 'high'
  if (rate >= 6) return 'watch'
  return 'normal'
}

/** Icon glyph accompanying each level (color-independent a11y aid). */
export const RISK_ICON: Record<RiskLevel, string> = {
  normal: '●',
  watch: '▲',
  high: '◆',
  critical: '✖',
}

export const RISK_WEIGHT_LABELS: { key: keyof RiskInputs; pct: number }[] = [
  { key: 'attendanceRisk', pct: 30 },
  { key: 'academicRisk', pct: 25 },
  { key: 'behaviorRisk', pct: 15 },
  { key: 'familyRisk', pct: 15 },
  { key: 'wellbeingRisk', pct: 10 },
  { key: 'parentRisk', pct: 5 },
]
