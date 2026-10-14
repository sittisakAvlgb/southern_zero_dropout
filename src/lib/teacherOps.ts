// ─────────────────────────────────────────────────────────────
// The working day of a ครู / ผู้จัดการรายกรณี.
//
// Every tier above this one asks a management question — which school, which
// เขต, which district. A teacher asks four things, in order: who do I see
// today, why is this child slipping, what did I already do, and did it work.
// This module answers them from the child's own record: the weekly attendance
// series, the six risk sub-scores, `parentContact`, `homeVisited`, the case
// stage and the dated intervention timeline.
//
// What is deliberately absent, because the data does not hold it: a diary of
// scheduled visits, uploaded evidence, and a home GPS pin (the platform's own
// rule is never to place a child's home on a map).
//
// A before/after risk score used to be on that list too. `riskHistory` now
// carries eight weekly points per child, so "ใครเสี่ยงเพิ่มขึ้น" and "ที่ช่วย
// ไปแล้วดีขึ้นหรือยัง" are answerable — and the suggestion that a case is
// ready to close rests on that movement rather than on a case simply going
// quiet. The teacher still closes it; the system only proposes.
// ─────────────────────────────────────────────────────────────
import type { CaseRecord, CaseStage, InterventionEvent, RiskLevel, Student } from '@/types'
import { closability } from './recommend'

/** One job on the teacher's desk, with somewhere to go and do it. */
export interface TeacherTask {
  key: string
  th: string
  en: string
  count: number
  tone: 'critical' | 'high' | 'watch' | 'good'
  /** the filter this card stands for, applied to the case list below */
  filter: TaskFilter
}

export type TaskFilter = 'critical' | 'parents' | 'visit' | 'overdue' | 'rising' | 'closable'

/** A reason, drawn from a field rather than written by a model. */
export interface RiskSignal {
  th: string
  en: string
  /** the sub-score or count behind it, for the reader to check */
  value: string
}

export interface StudentAlert {
  student: Student
  /** percentage points the weekly attendance moved across the series */
  delta: number
  latest: number
  signals: RiskSignal[]
  /** the child's own recorded next action — not a generated suggestion */
  action: string
}

export interface CaseRow {
  student: Student
  /** คะแนนเสี่ยงเปลี่ยนไปเท่าไรใน 8 สัปดาห์ — บวกคือแย่ลง */
  riskDelta: number
  /** เข้าเกณฑ์เสนอปิดเคสแล้วหรือยัง */
  closable: boolean
  stage: CaseStage
  /** the matching case record, when the two datasets agree on a name */
  record: CaseRecord | undefined
  overdue: boolean
  urgent: boolean
  /** days since the case last moved, the same field `/intervention` prints */
  updatedDaysAgo: number | undefined
  /** the leading cause on the child's record */
  problem: string | undefined
  lastEvent: InterventionEvent | undefined
}

export interface TeacherOps {
  caseload: number
  riskMix: Record<RiskLevel, number>
  critical: number
  needParent: number
  needVisit: number
  overdue: number
  /** เด็กที่คะแนนเสี่ยงไต่ขึ้นในรอบ 8 สัปดาห์ */
  rising: number
  /** เคสที่เข้าเกณฑ์ปิดแล้ว รอครูตรวจและกดปิด */
  closable: number
  resolved: number
  /** share of the caseload closed — the only outcome figure the data supports */
  resolvedPct: number
  attendanceRate: number
  tasks: TeacherTask[]
  alerts: StudentAlert[]
  rows: CaseRow[]
  /** the caseload's dated events, newest first */
  feed: { event: InterventionEvent; student: Student }[]
}

const RISK_ORDER: RiskLevel[] = ['normal', 'watch', 'high', 'critical']
const HIGH = new Set<RiskLevel>(['high', 'critical'])
const CLOSED = new Set<CaseStage>(['returned', 'resolved'])

/** Does this row belong under that task card? One definition, used by both the
 *  card's count and the list it filters — so the two can never disagree. */
export function matchesTask(row: CaseRow, filter: TaskFilter): boolean {
  switch (filter) {
    case 'critical':
      return row.student.riskLevel === 'critical'
    case 'parents':
      return row.student.parentContact !== 'ok'
    case 'visit':
      return HIGH.has(row.student.riskLevel) && !row.student.homeVisited
    case 'overdue':
      return row.overdue
    case 'rising':
      // ขยับ 5 คะแนนขึ้นไปจึงนับ — ต่ำกว่านั้นคือความแกว่งปกติของ series
      return row.riskDelta >= 5
    case 'closable':
      return row.closable
  }
}

/** ครูต้องแตะเคสอย่างน้อยทุกกี่วัน ถึงไม่นับว่าเลยกำหนด — brief ใช้ตัวเลขนี้
 *  เป็นเกณฑ์ "เคสไม่มีการอัปเดตเกิน 7 วัน" */
export const FOLLOW_UP_SLA_DAYS = 7

export function buildTeacherOps(input: {
  students: Student[]
  cases: CaseRecord[]
  /** only the day unit inside a signal value needs it */
  th: boolean
  /** วันล่าสุดที่ครูบันทึกอะไรสักอย่างกับเด็กแต่ละคน (YYYY-MM-DD)
   *
   *  เดิม "เลยกำหนด" อ่านจาก record.slaBreached ที่ seed ไว้อย่างเดียว ครูโทร
   *  หาผู้ปกครองแล้ว รีโหลดหน้า เด็กคนเดิมยังเลยกำหนดและยังอยู่อันดับหนึ่ง
   *  สิ่งที่ครูทำจึงไม่เปลี่ยนอะไรบนจอเลย ซึ่งเป็นทางที่เร็วที่สุดที่จะทำให้
   *  ครูเลิกบันทึก ตอนนี้บันทึกแล้วเริ่มนับใหม่จากวันนั้น */
  lastLogged?: Record<string, string>
  today?: Date
}): TeacherOps {
  const { students, cases, th, lastLogged = {}, today = new Date() } = input
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const daysSince = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Math.max(0, Math.round((t0 - Date.UTC(y, (m ?? 1) - 1, d ?? 1)) / 86400000))
  }

  const byName = new Map(cases.map((c) => [c.studentName, c]))

  const rows: CaseRow[] = students
    .map((s) => {
      const record = byName.get(s.name)
      const firstScore = s.riskHistory[0]?.score ?? s.riskScore
      return {
        student: s,
        riskDelta: s.riskScore - firstScore,
        closable: closability(s).ready,
        stage: s.caseStage,
        record,
        ...(lastLogged[s.id]
          ? (() => {
              const d = daysSince(lastLogged[s.id])
              return { overdue: d > FOLLOW_UP_SLA_DAYS, updatedDaysAgo: d }
            })()
          : { overdue: Boolean(record?.slaBreached), updatedDaysAgo: record?.openedDaysAgo }),
        urgent: Boolean(record?.urgent),
        problem: s.causeKeys[0],
        lastEvent: s.timeline[s.timeline.length - 1],
      }
    })
    // worst first, and an overdue case outranks a calm one at the same score
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.student.riskScore - a.student.riskScore)

  const riskMix = Object.fromEntries(RISK_ORDER.map((k) => [k, 0])) as Record<RiskLevel, number>
  for (const s of students) riskMix[s.riskLevel] += 1

  const count = (f: TaskFilter) => rows.filter((r) => matchesTask(r, f)).length
  const critical = count('critical')
  const needParent = count('parents')
  const needVisit = count('visit')
  const overdue = count('overdue')
  const rising = count('rising')
  const closable = count('closable')

  const tasks: TeacherTask[] = (
    [
      {
        key: 'critical',
        filter: 'critical',
        th: 'นักเรียนระดับวิกฤต',
        en: 'Critical students',
        count: critical,
        tone: 'critical',
      },
      {
        key: 'overdue',
        filter: 'overdue',
        th: 'เคสเกินกำหนดติดตาม',
        en: 'Overdue cases',
        count: overdue,
        tone: 'critical',
      },
      {
        key: 'parents',
        filter: 'parents',
        th: 'ต้องติดต่อผู้ปกครอง',
        en: 'Parents to reach',
        count: needParent,
        tone: 'high',
      },
      {
        key: 'rising',
        filter: 'rising',
        th: 'ความเสี่ยงเพิ่มขึ้น',
        en: 'Risk rising',
        count: rising,
        tone: 'high',
      },
      {
        key: 'visit',
        filter: 'visit',
        th: 'เสี่ยงสูงและยังไม่ได้เยี่ยมบ้าน',
        en: 'At risk, not yet visited',
        count: needVisit,
        tone: 'watch',
      },
      // ใบเดียวในแถวนี้ที่เป็นข่าวดี — ถ้าไม่มีใครบอกว่าเคสไหนปิดได้
      // เคสจะค้างสะสมจนตัวเลข "เลยกำหนด" หมดความหมาย
      {
        key: 'closable',
        filter: 'closable',
        th: 'เข้าเกณฑ์ปิดเคสได้',
        en: 'Ready to close',
        count: closable,
        tone: 'good',
      },
    ] as TeacherTask[]
  ).filter((t) => t.count > 0)

  // ── why a child is slipping, in that child's own numbers ──
  const alerts: StudentAlert[] = students
    .map((s) => {
      const first = s.attendance[0]?.rate ?? 0
      const latest = s.attendance[s.attendance.length - 1]?.rate ?? 0
      const delta = latest - first
      const gpaFirst = s.grades[0]?.gpa ?? 0
      const gpaLast = s.grades[s.grades.length - 1]?.gpa ?? 0

      const signals: RiskSignal[] = []
      if (delta < 0)
        signals.push({
          th: 'การมาเรียนลดลง',
          en: 'Attendance falling',
          value: `${delta.toFixed(0)} pt → ${latest.toFixed(0)}%`,
        })
      if (s.absenceStreak > 0)
        signals.push({
          th: 'ขาดเรียนต่อเนื่อง',
          en: 'Consecutive absence',
          value: `${s.absenceStreak} ${th ? 'วัน' : 'd'}`,
        })
      if (gpaLast < gpaFirst)
        signals.push({
          th: 'ผลการเรียนตก',
          en: 'Grades slipping',
          value: `${gpaFirst.toFixed(2)} → ${gpaLast.toFixed(2)}`,
        })
      if (s.parentContact !== 'ok')
        signals.push({
          th: s.parentContact === 'unreachable' ? 'ติดต่อผู้ปกครองไม่ได้' : 'ผู้ปกครองตอบช้า',
          en: s.parentContact === 'unreachable' ? 'Parent unreachable' : 'Parent slow to respond',
          value: `${s.parentRisk.toFixed(0)}/100`,
        })
      if (s.familyRisk >= 60)
        signals.push({
          th: 'ภาระทางครอบครัว',
          en: 'Family burden',
          value: `${s.familyRisk.toFixed(0)}/100`,
        })

      return { student: s, delta, latest, signals, action: s.nextAction }
    })
    // the children whose own numbers moved the wrong way, steepest first
    .filter((a) => a.signals.length >= 2 && HIGH.has(a.student.riskLevel))
    .sort((a, b) => a.delta - b.delta || b.student.riskScore - a.student.riskScore)
    .slice(0, 3)

  const rates = students.flatMap((s) => s.attendance.map((a) => a.rate))
  const resolved = students.filter((s) => CLOSED.has(s.caseStage)).length

  const feed = students
    .flatMap((s) => s.timeline.map((event) => ({ event, student: s })))
    .sort((a, b) => b.event.date.localeCompare(a.event.date))
    .slice(0, 6)

  return {
    caseload: students.length,
    riskMix,
    critical,
    needParent,
    needVisit,
    overdue,
    rising,
    closable,
    resolved,
    resolvedPct: students.length ? (resolved / students.length) * 100 : 0,
    attendanceRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
    tasks,
    alerts,
    rows,
    feed,
  }
}
