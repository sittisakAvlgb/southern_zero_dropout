// ─────────────────────────────────────────────────────────────
// The operational picture for a สพท. account.
//
// An สพฐ. seat asks "what is the policy question"; an area office asks "who is
// unassigned, what is overdue, and did last month's work move anything". This
// module answers the second kind, from the case records themselves rather than
// from area roll-ups.
// ─────────────────────────────────────────────────────────────
import type { CaseRecord, CaseStage, District, OoscRecord, OpportunityPlan, School, Student } from '@/types'
import { rankDistricts, type RankedDistrict } from './decision'
import { rateToLevel } from './risk'
import { trendFor } from './briefing'

export type PipelineStage = 'unassigned' | 'assigned' | 'working' | 'done'

/** How the eight case stages roll into the four an area officer manages by.
 *
 *  "Unassigned" means exactly what `/intervention` means by it — no owner —
 *  and nothing else. Counting `alerted`-but-owned cases here too made the
 *  dashboard card claim more work than the filtered list it links to could
 *  show, which is the kind of gap that makes people stop trusting the number. */
export function stageOf(c: CaseRecord): PipelineStage {
  const done: CaseStage[] = ['returned', 'resolved']
  const working: CaseStage[] = ['inProgress', 'homeVisit', 'referred', 'planned']
  if (done.includes(c.stage)) return 'done'
  if (!c.owner) return 'unassigned'
  if (working.includes(c.stage)) return 'working'
  return 'assigned'
}

export const PIPELINE: {
  key: PipelineStage
  th: string
  en: string
  hintTh: string
  hintEn: string
  /** where clicking the card lands, filtered to the cases it counted */
  to: string
}[] = [
  {
    key: 'unassigned',
    to: '/intervention?focus=unassigned',
    th: 'ยังไม่มีเจ้าของเคส',
    en: 'Unassigned',
    hintTh: 'แจ้งเตือนแล้วแต่ยังไม่มีใครรับผิดชอบ',
    hintEn: 'Flagged but nobody has picked it up',
  },
  {
    key: 'assigned',
    to: '/intervention?stage=accepted',
    th: 'มอบหมายแล้ว',
    en: 'Assigned',
    hintTh: 'มีเจ้าของเคสแล้ว รอเริ่มดำเนินการ',
    hintEn: 'Has an owner, not yet started',
  },
  {
    key: 'working',
    to: '/intervention?stage=inProgress',
    th: 'กำลังช่วยเหลือ',
    en: 'In progress',
    hintTh: 'เยี่ยมบ้าน ส่งต่อ หรือมีแผนแล้ว',
    hintEn: 'Home visit, referral or plan under way',
  },
  {
    key: 'done',
    to: '/intervention?stage=resolved',
    th: 'ช่วยเหลือสำเร็จ',
    en: 'Resolved',
    hintTh: 'กลับเข้าเรียนหรือปิดเคสแล้ว',
    hintEn: 'Back in learning or case closed',
  },
]

/** The four things a school is judged on here, each already a field on the
 *  school record. The spec asked for "attendance" as one of them, but that
 *  lives on the student, not the school, and averaging the ~14 sampled students
 *  per school would be a thinner number than it looks — data quality is a real
 *  school-level field and is used in its place, named for what it is. */
export const HEALTH_METRICS = [
  { key: 'riskMgmt', th: 'คุมความเสี่ยง', en: 'Risk control' },
  { key: 'response', th: 'ความเร็วตอบสนอง', en: 'Response speed' },
  { key: 'success', th: 'อัตราช่วยสำเร็จ', en: 'Success rate' },
  { key: 'dataQuality', th: 'คุณภาพข้อมูล', en: 'Data quality' },
] as const

export type HealthMetric = (typeof HEALTH_METRICS)[number]['key']

/** Weights say what an area office is actually accountable for: keeping risk
 *  down and closing cases, more than paperwork. */
const HEALTH_WEIGHT: Record<HealthMetric, number> = {
  riskMgmt: 0.3,
  response: 0.25,
  success: 0.3,
  dataQuality: 0.15,
}

export interface SchoolHealth {
  school: School
  /** 0–100 composite */
  score: number
  parts: Record<HealthMetric, number>
  /** the sub-score dragging the composite down most */
  weakest: HealthMetric
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export function schoolHealth(s: School): SchoolHealth {
  const highRiskShare = (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100
  const parts: Record<HealthMetric, number> = {
    // a 20% high-risk share scores zero; below that it scales linearly
    riskMgmt: clamp(100 - highRiskShare * 5),
    // two days to first contact scores zero
    response: clamp(100 - (s.responseHours / 48) * 100),
    success: clamp(s.interventionSuccessRate),
    dataQuality: clamp(s.dataQualityScore),
  }
  const score = (Object.keys(parts) as HealthMetric[]).reduce(
    (a, k) => a + parts[k] * HEALTH_WEIGHT[k],
    0,
  )
  // The metric losing the school the most points, which is the shortfall from
  // 100 times its weight — not the smallest weighted score. Sorting by the
  // latter crowned data quality "weakest" at 95/100 simply because it carries
  // the lightest weight, pointing an area officer at the wrong problem.
  const weakest = (Object.keys(parts) as HealthMetric[]).sort(
    (a, b) => (100 - parts[b]) * HEALTH_WEIGHT[b] - (100 - parts[a]) * HEALTH_WEIGHT[a],
  )[0]
  return { school: s, score, parts, weakest }
}

export interface SchoolRisk {
  school: School
  /** share of the school's own students flagged high-risk */
  rate: number
  level: ReturnType<typeof rateToLevel>
  atRisk: number
  openCases: number
  overdue: number
}

/** A quarter's plan for the area, assembled from figures the system already
 *  holds rather than from a progress bar somebody typed in.
 *
 *  The spec sketched this as "ความคืบหน้า 65%" — a number with no source. Every
 *  row here is a countable ratio instead, so an area officer can check any of
 *  them against the page it came from, and the headline progress is simply how
 *  many known children now have a plan. */
export interface PlanStep {
  key: string
  th: string
  en: string
  done: number
  total: number
  /** where the reader can verify this row */
  to: string
}

export interface AreaPlan {
  /** the coverage this quarter aims at, stated on screen */
  targetPct: number
  /** children in the registry who now have a plan, as a share */
  progressPct: number
  planned: number
  known: number
  steps: PlanStep[]
}

export interface AreaOps {
  schools: number
  students: number
  atRisk: number
  outOfSchool: number
  /** cases not yet resolved */
  activeCases: number
  unassigned: number
  overdue: number
  successRate: number
  pipeline: Record<PipelineStage, number>
  schoolRisk: SchoolRisk[]
  /** every school in scope scored and ranked, best first */
  health: SchoolHealth[]
  plan: AreaPlan
  districts: RankedDistrict[]
  /** at-risk students six months ago vs today, from the same trend series the
   *  briefing draws — demo data, and labelled as such wherever it is shown */
  progress: { before: number; now: number; changePct: number }
}

export function buildAreaOps(input: {
  scopeKey: string
  districts: District[]
  schools: School[]
  students: Student[]
  cases: CaseRecord[]
  oosc: OoscRecord[]
  plans: OpportunityPlan[]
  stats: { total: number; highRisk: number; dropout: number }
}): AreaOps {
  const { districts, schools, students, cases, oosc, plans, stats, scopeKey } = input

  const pipeline: Record<PipelineStage, number> = {
    unassigned: 0,
    assigned: 0,
    working: 0,
    done: 0,
  }
  for (const c of cases) pipeline[stageOf(c)] += 1
  const activeCases = pipeline.unassigned + pipeline.assigned + pipeline.working
  const closed = pipeline.done

  const schoolRisk: SchoolRisk[] = schools
    .map((s) => {
      const rate = (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100
      return {
        school: s,
        rate,
        level: rateToLevel(rate),
        atRisk: s.highRiskStudents,
        openCases: s.openCases,
        overdue: s.overdueCases,
      }
    })
    .sort((a, b) => b.rate - a.rate)

  // the same series the briefing charts, read six months back
  const riskShare = stats.total ? (stats.highRisk / stats.total) * 100 : 0
  const trend = trendFor(scopeKey, riskShare)
  const before = Math.round(stats.total * (trend[5] / 100))
  const now = stats.highRisk

  const TARGET = 90
  const known = oosc.length
  const planned = plans.length
  const plan: AreaPlan = {
    targetPct: TARGET,
    progressPct: known ? (planned / known) * 100 : 0,
    planned,
    known,
    steps: [
      {
        key: 'plans',
        th: 'เด็กในทะเบียนที่มีแผนรายบุคคลแล้ว',
        en: 'Registry children with an individual plan',
        done: planned,
        total: known,
        to: '/plan',
      },
      {
        key: 'coverage',
        th: `อำเภอที่ความครอบคลุมแผนถึง 60%`,
        en: 'Districts at 60% plan coverage or better',
        done: districts.filter((d) => d.planCoverage >= 60).length,
        total: districts.length,
        to: '/area',
      },
      {
        // Counted over cases still open, exactly like the pipeline card above.
        // Including closed cases put "64/71" here beside "4 unassigned" there,
        // two numbers for one fact on one screen.
        key: 'owners',
        th: 'เคสที่ยังเปิดอยู่และมีเจ้าของแล้ว',
        en: 'Open cases with an owner',
        done: activeCases - pipeline.unassigned,
        total: activeCases,
        to: '/intervention?focus=unassigned',
      },
      {
        key: 'response',
        th: 'โรงเรียนที่ตอบสนองภายใน 24 ชม.',
        en: 'Schools responding within 24 hours',
        done: schools.filter((s) => s.responseHours <= 24).length,
        total: schools.length,
        to: '/school',
      },
    ],
  }

  return {
    schools: schools.length,
    students: stats.total,
    atRisk: stats.highRisk,
    outOfSchool: stats.dropout,
    activeCases,
    unassigned: pipeline.unassigned,
    overdue: cases.filter((c) => c.slaBreached).length,
    successRate: cases.length ? (closed / cases.length) * 100 : 0,
    pipeline,
    schoolRisk,
    health: schools.map(schoolHealth).sort((a, b) => b.score - a.score),
    plan,
    districts: rankDistricts(districts),
    progress: {
      before,
      now,
      changePct: before ? ((now - before) / before) * 100 : 0,
    },
  }
}

/** Students in scope who carry a high or critical risk level, worst first —
 *  the queue an area officer actually works through. */
export function urgentStudents(students: Student[], n = 6): Student[] {
  return [...students]
    .filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, n)
}
