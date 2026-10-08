// ─────────────────────────────────────────────────────────────
// The operational picture for a ผอ.สถานศึกษา account.
//
// An area office asks "which school", a principal asks "which child, whose
// caseload, and did the parent pick up the phone". Everything here comes off
// the student and case records for one school — teacher workload from
// `caseOwner`, attendance from the weekly series, parent reach from
// `parentContact` and `homeVisited`. No field is invented.
//
// One number needs care: the school record counts the whole enrolment (1,536
// students, 110 flagged) while the platform tracks a detailed sample of ~23.
// Both are real and they are not the same population, so anything built here
// says which one it is rather than letting a reader assume.
// ─────────────────────────────────────────────────────────────
import type { CaseRecord, GradeLevel, RiskLevel, School, Student } from '@/types'
import { stageOf, type PipelineStage } from './areaOps'

export interface TeacherLoad {
  owner: string
  cases: number
  overdue: number
  urgent: number
  /** cases already closed by this owner */
  done: number
  /** share of this owner's cases that reached a close */
  completion: number
  /** mean days a case of theirs has been open — a stand-in for response time,
   *  which the case record does not carry directly */
  avgOpenDays: number
}

/** The four things a school is scored on, each already a field or a countable
 *  ratio. Weights follow the brief: risk 30, attendance 25, cases 25, parents
 *  20. */
export const SCORE_PARTS = [
  { key: 'risk', th: 'ดูแลกลุ่มเสี่ยง', en: 'Risk management', weight: 0.3 },
  { key: 'attendance', th: 'คุมการมาเรียน', en: 'Attendance control', weight: 0.25 },
  { key: 'cases', th: 'ปิดเคสได้', en: 'Case resolution', weight: 0.25 },
  { key: 'parents', th: 'ติดต่อผู้ปกครอง', en: 'Parent engagement', weight: 0.2 },
] as const

export type ScorePart = (typeof SCORE_PARTS)[number]['key']

/** One thing on the principal's desk today, with somewhere to go and do it. */
export interface PrincipalTask {
  key: string
  th: string
  en: string
  count: number
  tone: 'critical' | 'high' | 'watch'
  actionTh: string
  actionEn: string
  to: string
}

export interface GradeRisk {
  grade: GradeLevel
  tracked: number
  atRisk: number
  /** share of this grade's tracked students flagged high or critical */
  rate: number
}

export interface AttendanceWatch {
  student: Student
  /** percentage points the weekly rate moved across the series */
  delta: number
  latest: number
  streak: number
}

export interface SchoolOps {
  school: School | undefined
  /** whole enrolment, from the school record */
  enrolled: number
  flagged: number
  /** children the platform holds a detailed record for — a subset of enrolment */
  tracked: number
  riskMix: Record<RiskLevel, number>
  pipeline: Record<PipelineStage, number>
  activeCases: number
  overdue: number
  teachers: TeacherLoad[]
  grades: GradeRisk[]
  /** tracked students whose weekly attendance is falling fastest */
  attendanceWatch: AttendanceWatch[]
  attendanceRate: number
  parents: { ok: number; delayed: number; unreachable: number; visited: number }
  /** the queue: worst risk score first */
  priority: Student[]
  score: { total: number; parts: Record<ScorePart, number> }
  tasks: PrincipalTask[]
}

const RISK_ORDER: RiskLevel[] = ['normal', 'watch', 'high', 'critical']
const HIGH = new Set<RiskLevel>(['high', 'critical'])

export function buildSchoolOps(input: {
  school: School | undefined
  students: Student[]
  cases: CaseRecord[]
  stats: { total: number; highRisk: number }
}): SchoolOps {
  const { school, students, cases, stats } = input

  const riskMix = Object.fromEntries(RISK_ORDER.map((k) => [k, 0])) as Record<RiskLevel, number>
  for (const s of students) riskMix[s.riskLevel] += 1

  const pipeline: Record<PipelineStage, number> = {
    unassigned: 0,
    assigned: 0,
    working: 0,
    done: 0,
  }
  for (const c of cases) pipeline[stageOf(c)] += 1

  // ── who is carrying what ──────────────────────────────────
  const byOwner = new Map<string, TeacherLoad>()
  for (const c of cases) {
    const owner = c.owner ?? ''
    if (!owner) continue
    const row: TeacherLoad =
      byOwner.get(owner) ?? {
        owner,
        cases: 0,
        overdue: 0,
        urgent: 0,
        done: 0,
        completion: 0,
        avgOpenDays: 0,
      }
    row.cases += 1
    if (c.slaBreached) row.overdue += 1
    if (c.urgent) row.urgent += 1
    if (stageOf(c) === 'done') row.done += 1
    byOwner.set(owner, row)
  }
  for (const row of byOwner.values()) {
    row.completion = row.cases ? (row.done / row.cases) * 100 : 0
    const mine = cases.filter((c) => c.owner === row.owner)
    row.avgOpenDays = mine.length
      ? mine.reduce((a, c) => a + c.openedDaysAgo, 0) / mine.length
      : 0
  }
  const teachers = [...byOwner.values()].sort(
    (a, b) => b.overdue - a.overdue || b.cases - a.cases,
  )

  // ── where in the school the risk sits ─────────────────────
  const gradeMap = new Map<GradeLevel, { tracked: number; atRisk: number }>()
  for (const s of students) {
    const row = gradeMap.get(s.gradeKey) ?? { tracked: 0, atRisk: 0 }
    row.tracked += 1
    if (HIGH.has(s.riskLevel)) row.atRisk += 1
    gradeMap.set(s.gradeKey, row)
  }
  const grades: GradeRisk[] = [...gradeMap.entries()]
    .map(([grade, v]) => ({
      grade,
      tracked: v.tracked,
      atRisk: v.atRisk,
      rate: v.tracked ? (v.atRisk / v.tracked) * 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.atRisk - a.atRisk)

  // ── attendance, read off the weekly series ────────────────
  const watch: AttendanceWatch[] = students
    .map((s) => {
      const series = s.attendance
      const first = series[0]?.rate ?? 0
      const latest = series[series.length - 1]?.rate ?? 0
      return { student: s, delta: latest - first, latest, streak: s.absenceStreak }
    })
    // falling attendance first, then the longest unbroken absence
    .sort((a, b) => a.delta - b.delta || b.streak - a.streak)

  const rates = students.flatMap((s) => s.attendance.map((a) => a.rate))
  const attendanceRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

  // ── the school's own score ────────────────────────────────
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  const flaggedShare = stats.total ? (stats.highRisk / stats.total) * 100 : 0
  const closed = pipeline.done
  const parentTotal = students.length
  const parts: Record<ScorePart, number> = {
    // a 20% flagged share scores zero
    risk: clamp(100 - flaggedShare * 5),
    attendance: clamp(attendanceRate),
    cases: clamp(cases.length ? (closed / cases.length) * 100 : 0),
    parents: clamp(
      parentTotal
        ? (students.filter((s) => s.parentContact === 'ok').length / parentTotal) * 100
        : 0,
    ),
  }
  const total = SCORE_PARTS.reduce((a, p) => a + parts[p.key] * p.weight, 0)

  // ── what is on the desk today ──────────────────────────────
  const critical = students.filter((s) => s.riskLevel === 'critical').length
  const unreachable = students.filter((s) => s.parentContact === 'unreachable').length
  const notVisited = students.filter(
    (s) => !s.homeVisited && (s.riskLevel === 'high' || s.riskLevel === 'critical'),
  ).length
  const overdueCases = cases.filter((c) => c.slaBreached).length

  const tasks: PrincipalTask[] = ([
    {
      key: 'unassigned',
      th: 'เคสที่ยังไม่มีครูรับผิดชอบ',
      en: 'Cases with no owner',
      count: pipeline.unassigned,
      tone: 'critical',
      actionTh: 'มอบหมายครู',
      actionEn: 'Assign a teacher',
      to: '/intervention?focus=unassigned',
    },
    {
      key: 'overdue',
      th: 'เคสเกินกำหนดติดตาม',
      en: 'Overdue follow-up',
      count: overdueCases,
      tone: 'critical',
      actionTh: 'ทบทวนเคส',
      actionEn: 'Review cases',
      to: '/intervention?focus=overdue',
    },
    {
      key: 'critical',
      th: 'นักเรียนระดับวิกฤต',
      en: 'Critical students',
      count: critical,
      tone: 'high',
      actionTh: 'เปิดแฟ้มนักเรียน',
      actionEn: 'Open student files',
      to: '/student',
    },
    {
      key: 'visit',
      th: 'เด็กเสี่ยงสูงที่ยังไม่ได้เยี่ยมบ้าน',
      en: 'At-risk children not yet visited',
      count: notVisited,
      tone: 'watch',
      actionTh: 'วางแผนเยี่ยมบ้าน',
      actionEn: 'Plan home visits',
      to: '/student',
    },
    {
      key: 'unreachable',
      th: 'ผู้ปกครองที่ติดต่อไม่ได้',
      en: 'Families unreachable',
      count: unreachable,
      tone: 'watch',
      actionTh: 'ส่งต่อขอความช่วยเหลือ',
      actionEn: 'Refer for support',
      to: '/referral',
    },
  ] as PrincipalTask[]).filter((t) => t.count > 0)

  return {
    school,
    enrolled: stats.total,
    flagged: stats.highRisk,
    tracked: students.length,
    riskMix,
    pipeline,
    activeCases: pipeline.unassigned + pipeline.assigned + pipeline.working,
    overdue: cases.filter((c) => c.slaBreached).length,
    teachers,
    grades,
    attendanceWatch: watch.filter((w) => w.delta < 0 || w.streak > 0).slice(0, 5),
    attendanceRate,
    parents: {
      ok: students.filter((s) => s.parentContact === 'ok').length,
      delayed: students.filter((s) => s.parentContact === 'delayed').length,
      unreachable: students.filter((s) => s.parentContact === 'unreachable').length,
      visited: students.filter((s) => s.homeVisited).length,
    },
    priority: [...students].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6),
    score: { total, parts },
    tasks,
  }
}

export const GRADE_LABEL = (g: GradeLevel, th: boolean) =>
  th ? `${g[0] === 'p' ? 'ป.' : 'ม.'}${g.slice(1)}` : `${g[0].toUpperCase()}${g.slice(1)}`
