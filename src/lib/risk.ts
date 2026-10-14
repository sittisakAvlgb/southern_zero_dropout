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

// ── คะแนนย่อยที่คำนวณจากทะเบียนจริง ───────────────────────────
// คะแนนย่อยหกด้านเคยเป็นตัวเลขที่สุ่มขึ้นมาเฉย ๆ ไม่มีใครตอบได้ว่า
// "ครอบครัว 86/100" มาจากอะไร สามฟังก์ชันด้านล่างคำนวณจากฟิลด์ในทะเบียน
// นักเรียน (DMC/สพฐ.) ทุกตัว ครูจึงย้อนตรวจได้ว่าคะแนนมาจากข้อเท็จจริงใด
// และเมื่อต่อข้อมูลจริง ตัวเลขจะเปลี่ยนตามข้อมูลโดยไม่ต้องแก้สูตร
//
// เส้นแบ่งรายได้ไล่ตามการกระจายในไฟล์ตัวอย่างที่ได้รับ (กองอยู่ที่ 3,000 และ
// 9,000 บาท) — ยังไม่ใช่เกณฑ์ทุนเสมอภาคของ กสศ. ซึ่งใช้รายได้ *ต่อคน* ≤ 3,000
// บาท/เดือน + PMT ข้อมูลตอนนี้ไม่มีจำนวนสมาชิกครัวเรือนจึงเทียบตรงไม่ได้
// น้ำหนักและเส้นตัดทั้งหมดในไฟล์นี้เป็นค่าตั้งต้น รอปรับเทียบด้วยข้อมูลจริง
// — หลักฐานและข้อเสนอดู docs/risk-model-references.md

/** ผู้ปกครองที่เป็นพ่อแม่จริง ที่เหลือคือญาติที่รับช่วงดูแลแทน ซึ่งในข้อมูล
 *  จริงมักมาคู่กับพ่อแม่ที่ย้ายถิ่นไปทำงาน (สาเหตุรหัส 306) */
const BIRTH_PARENT = ['มารดา', 'บิดา']

export interface FamilyFacts {
  parentSalary: number
  parentRelationName: string
  disadvantaged: string[]
  movedFromRegisteredAddress: boolean
}

/** ความเสี่ยงด้านครอบครัว 0–100 จากรายได้ ผู้ดูแล และสถานะด้อยโอกาส */
export function familyRiskFrom(m: FamilyFacts): number {
  // รายได้เป็นตัวตั้ง เพราะเป็นตัวทำนายที่แรงที่สุดและเป็นฟิลด์ที่ครบที่สุด
  let score =
    m.parentSalary <= 2000 ? 90
    : m.parentSalary <= 3000 ? 78
    : m.parentSalary <= 5000 ? 64
    : m.parentSalary <= 9000 ? 48
    : m.parentSalary <= 15000 ? 30
    : 16
  if (!BIRTH_PARENT.includes(m.parentRelationName)) score += 10
  if (m.movedFromRegisteredAddress) score += 6
  score += Math.min(12, m.disadvantaged.length * 6)
  return Math.max(0, Math.min(100, Math.round(score)))
}

/** ความเสี่ยงด้านสุขภาวะ 0–100 จากความพิการและภาวะโภชนาการ
 *  BMI ต่ำกว่าเกณฑ์เป็นสัญญาณของครัวเรือนที่ขาดแคลนจริง ไม่ใช่แค่เรื่องสุขภาพ */
export function wellbeingRiskFrom(m: { disabilityName: string; weight: number; height: number }, base: number): number {
  let score = base
  if (m.disabilityName) score += 25
  const h = m.height / 100
  const bmi = h > 0 ? m.weight / (h * h) : 0
  if (bmi > 0 && bmi < 15) score += 18
  else if (bmi > 0 && bmi < 17) score += 9
  return Math.max(0, Math.min(100, Math.round(score)))
}

/** การเดินทางไม่ได้เป็นมิติของตัวเอง แต่ไปโผล่เป็น "ขาดเรียน" — เด็กที่ต้อง
 *  เดินเท้า 30 นาทีบนทางลูกรังจะมาไม่ได้ในหน้าฝน นี่คือเส้นทางเหตุผลจริง
 *  จึงบวกเข้ากับ attendanceRisk แทนการเพิ่มน้ำหนักใหม่ในโมเดล */
export function travelPenalty(m: {
  timeDt: number
  rockDt: number
  waterDt: number
  journeyTypeName: string
}): number {
  let p = 0
  if (m.timeDt >= 30) p += 14
  else if (m.timeDt >= 20) p += 8
  else if (m.timeDt >= 15) p += 4
  // ทางลูกรังและทางน้ำคือเส้นทางที่ขาดได้จริงตามฤดูกาล ต่างจากทางลาดยาง
  if (m.rockDt + m.waterDt >= 500) p += 8
  else if (m.rockDt + m.waterDt > 0) p += 4
  if (m.journeyTypeName === 'เดินเท้า') p += 6
  else if (m.journeyTypeName === 'พาหนะเสียค่าโดยสาร') p += 4
  return p
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
