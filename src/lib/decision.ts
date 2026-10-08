// ─────────────────────────────────────────────────────────────
// The arithmetic behind the decision centre.
//
// Everything here is deterministic and runs with no API key — the AI layer on
// top only *narrates* these numbers. That split is deliberate: a demo that goes
// blank when the key is missing is worse than one that reasons out loud, and a
// ranking an officer can reproduce by hand is worth more than one only the
// model can explain.
// ─────────────────────────────────────────────────────────────
import type { District } from '@/types'

export type SignalKey = 'risk' | 'oos' | 'planGap' | 'stuck'

export interface Signal {
  key: SignalKey
  /** 0–1 after normalising against the worst district in scope */
  value: number
  /** the raw figure, for showing the user what drove the score */
  raw: number
}

export interface RankedDistrict {
  district: District
  /** 0–100, relative to the other districts this account governs */
  score: number
  signals: Signal[]
  /** the signal contributing most to the score */
  lead: Signal
}

/** How much each signal counts. Risk says how many *could* fall out, plan gap
 *  says how many known cases nobody is working — the gap is weighted highest
 *  because it is the one an เขต office can close this term. */
export const SIGNAL_WEIGHT: Record<SignalKey, number> = {
  planGap: 0.3,
  risk: 0.3,
  oos: 0.25,
  stuck: 0.15,
}

export const SIGNAL_LABEL: Record<SignalKey, { th: string; en: string }> = {
  risk: { th: 'สัดส่วนเด็กเสี่ยงสูง', en: 'High-risk share' },
  oos: { th: 'เด็กนอกระบบต่อพันคน', en: 'Out-of-school per 1,000' },
  planGap: { th: 'เด็กนอกระบบที่ยังไม่มีแผน', en: 'Known cases with no plan' },
  stuck: { th: 'เคสค้างเกินกำหนด', en: 'Overdue cases' },
}

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0)

/** Raw, un-normalised signal values for one district. */
function rawSignals(d: District): Record<SignalKey, number> {
  return {
    risk: d.riskRate,
    oos: safeDiv(d.oosCount, d.totalStudents) * 1000,
    // the share of known out-of-school children with nobody assigned to them
    planGap: Math.max(0, 100 - d.planCoverage),
    stuck: safeDiv(d.overdueCases, d.openCases) * 100,
  }
}

/** Rank the districts an account governs by where action is worth most.
 *  Each signal is normalised against the worst district *in this scope*, so a
 *  เขต office ranks its own four อำเภอ against each other rather than against
 *  the whole region — the comparison an area officer can actually act on. */
export function rankDistricts(districts: District[]): RankedDistrict[] {
  if (!districts.length) return []
  const raw = districts.map(rawSignals)
  const keys: SignalKey[] = ['risk', 'oos', 'planGap', 'stuck']
  const max = Object.fromEntries(
    keys.map((k) => [k, Math.max(...raw.map((r) => r[k]), 0)]),
  ) as Record<SignalKey, number>

  return districts
    .map((district, i) => {
      const signals: Signal[] = keys.map((k) => ({
        key: k,
        value: safeDiv(raw[i][k], max[k]),
        raw: raw[i][k],
      }))
      const score =
        signals.reduce((s, sig) => s + sig.value * SIGNAL_WEIGHT[sig.key], 0) * 100
      const lead = [...signals].sort(
        (a, b) => b.value * SIGNAL_WEIGHT[b.key] - a.value * SIGNAL_WEIGHT[a.key],
      )[0]
      return { district, score, signals, lead }
    })
    .sort((a, b) => b.score - a.score)
}

// ── forecast ────────────────────────────────────────────────
/** Stated out loud in the UI — a forecast whose assumptions are hidden is a
 *  guess wearing a suit. */
export const ASSUMPTION = {
  /** share of high-risk students who fall out within a year if nothing changes */
  dropoutRate: 0.06,
  /** share of planned children who reach a durable outcome within a year */
  planSuccess: 0.55,
}

export interface Scenario {
  key: 'none' | 'coverage' | 'clearBacklog' | 'districtTeam'
  th: string
  en: string
  detailTh: string
  detailEn: string
  /** two or three words — the full names are unreadable on a chart axis */
  axisTh: string
  axisEn: string
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'none',
    th: 'ไม่ทำอะไรเพิ่ม',
    en: 'Do nothing new',
    detailTh: 'คงความครอบคลุมของแผนและอัตราความสำเร็จไว้เท่าปัจจุบัน',
    detailEn: 'Plan coverage and success rate stay where they are',
    axisTh: 'ไม่ทำอะไรเพิ่ม', axisEn: 'Do nothing',
  },
  {
    key: 'coverage',
    th: 'ดันความครอบคลุมของแผนเป็น 90%',
    en: 'Push plan coverage to 90%',
    detailTh: 'ทุกเด็กนอกระบบที่รู้จักมีแผนรายบุคคลภายในปีนี้',
    detailEn: 'Every known out-of-school child gets a plan this year',
    axisTh: 'ครอบคลุม 90%', axisEn: 'Coverage 90%',
  },
  {
    key: 'clearBacklog',
    th: 'เคลียร์เคสค้างให้หมด',
    en: 'Clear the overdue backlog',
    detailTh: 'ปิดเคสเกินกำหนดทั้งหมด อัตราความสำเร็จขึ้น 10 จุด',
    detailEn: 'Overdue cases closed; success rate up 10 points',
    axisTh: 'เคลียร์เคสค้าง', axisEn: 'Clear backlog',
  },
  {
    key: 'districtTeam',
    th: 'ตั้งทีมสหวิชาชีพให้ครบทุกอำเภอ',
    en: 'A multi-agency team in every district',
    detailTh: 'อำเภอที่ยังไม่มีทีม ลดอัตราการหลุดออกกลางคันลงหนึ่งในสี่',
    detailEn: 'Districts without a team cut their dropout rate by a quarter',
    axisTh: 'ทีมครบทุกอำเภอ', axisEn: 'Teams everywhere',
  },
]

export interface Forecast {
  /** children out of school today */
  current: number
  /** projected 12 months out under this scenario */
  projected: number
  /** newly falling out over the year */
  inflow: number
  /** returning to learning or work over the year */
  recovered: number
}

export function forecast(districts: District[], scenario: Scenario['key']): Forecast {
  let inflow = 0
  let recovered = 0
  let current = 0

  for (const d of districts) {
    current += d.oosCount

    let dropoutRate = ASSUMPTION.dropoutRate
    if (scenario === 'districtTeam' && !d.hasDistrictTeam) dropoutRate *= 0.75

    let coverage = d.planCoverage / 100
    if (scenario === 'coverage') coverage = Math.max(coverage, 0.9)

    let success = ASSUMPTION.planSuccess
    if (scenario === 'clearBacklog') success = Math.min(1, success + 0.1)

    inflow += d.highRiskStudents * dropoutRate
    recovered += d.oosCount * coverage * success
  }

  return {
    current,
    inflow: Math.round(inflow),
    recovered: Math.round(recovered),
    projected: Math.max(0, Math.round(current + inflow - recovered)),
  }
}
