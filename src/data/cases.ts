import type { CaseRecord, CaseStage, RiskLevel } from '@/types'
import { STUDENTS } from './students'
import { REFERRALS } from './referrals'

const STAGE_ORDER: CaseStage[] = [
  'alerted', 'accepted', 'inProgress', 'homeVisit', 'referred', 'planned',
  'returned', 'resolved',
]

const REFERRAL_COUNT = REFERRALS.reduce<Record<string, number>>((acc, r) => {
  acc[r.childId] = (acc[r.childId] ?? 0) + 1
  return acc
}, {})

// Derive case records from the student set so the two views stay consistent.
export const CASES: CaseRecord[] = STUDENTS.map((s, i) => {
  const openedDaysAgo = (s.absenceStreak * 2 + (i % 9)) % 26
  return {
    id: `CASE-${String(i + 1).padStart(4, '0')}`,
    studentName: s.name,
    provinceKey: s.provinceKey,
    districtKey: s.districtKey,
    tambonKey: s.tambonKey,
    schoolKey: s.schoolKey,
    gradeKey: s.gradeKey,
    riskLevel: s.riskLevel,
    stage: s.caseStage,
    owner: i % 11 === 0 ? null : s.caseOwner,
    openedDaysAgo,
    slaBreached:
      openedDaysAgo > 7 && !['returned', 'resolved'].includes(s.caseStage),
    urgent: s.riskLevel === 'critical' || (s.riskLevel === 'high' && openedDaysAgo > 5),
    referralCount: REFERRAL_COUNT[s.id] ?? 0,
  }
})

/** Live per-stage counts over a set of cases. Nothing is scaled up: an
 *  inflated pipeline used to make the area view look busier than the records
 *  behind it, so drilling in produced numbers that could not be reconciled. */
export function pipelineCounts(rows: CaseRecord[] = CASES): Record<CaseStage, number> {
  const acc = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<
    CaseStage,
    number
  >
  for (const c of rows) acc[c.stage]++
  return acc
}

export const STAGE_SEQUENCE = STAGE_ORDER

export function levelRank(l: RiskLevel): number {
  return { critical: 0, high: 1, watch: 2, normal: 3 }[l]
}
