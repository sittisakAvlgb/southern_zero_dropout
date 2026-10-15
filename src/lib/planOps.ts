// ─────────────────────────────────────────────────────────────
// เคสหนึ่งเคสในหน้าเส้นทางโอกาส — ความเร่งด่วน ขั้นถัดไป milestone timeline
// อุปสรรค การส่งต่อ และการประเมินก่อนปิด
//
// ทุกอย่างคำนวณจากแผน ระเบียนเด็ก และบันทึกของครู ไม่มีการเดา หน้าจอแค่
// แสดงผลจากที่นี่ ครูจึงเห็นคำตอบเดียวกันไม่ว่าจะเปิดจากหน้าไหน และเมื่อต่อ
// โมเดลจริง ชั้นนี้คือกรอบที่โมเดลเติมข้อความ ไม่ใช่สิ่งที่ถูกแทนที่
// ─────────────────────────────────────────────────────────────
import type { Agency, AgencyKind, OpportunityPlan, PlanStep, RiskLevel, Student } from '@/types'
import { SCHOOL_OWNER_ID, SCHOOL_OWNER_TH, isSchoolStep, stepDaysLeft } from '@/data/plans'
import { AGENCIES } from '@/data/agencies'
import { REASON_GROUP, reasonFor, type ReasonGroup } from '@/data/dropReasons'
import { closability } from './recommend'
import { entryTs, type CaseLogEntry, type ObstacleKey, type PlanStepMark } from './caseLog'

// ── ความเร่งด่วน ─────────────────────────────────────────────

export type Priority = 'today' | 'soon' | 'onTrack' | 'improving'

export const PRIORITY_META: Record<Priority, { th: string; en: string; color: string; rank: number }> = {
  today: { th: 'ต้องดำเนินการวันนี้', en: 'Act today', color: '#dc2626', rank: 0 },
  soon: { th: 'ภายใน 3 วัน', en: 'Within 3 days', color: '#ea580c', rank: 1 },
  onTrack: { th: 'ติดตามตามกำหนด', en: 'On schedule', color: '#ca8a04', rank: 2 },
  improving: { th: 'สถานการณ์ดีขึ้น', en: 'Improving', color: '#16a34a', rank: 3 },
}

export type NextKind = 'unblock' | 'agree' | 'doStep' | 'chase' | 'assess' | 'close' | 'done'

export interface NextAction {
  kind: NextKind
  th: string
  en: string
  whyTh: string
  whyEn: string
  /** ใครต้องลงมือ — "คุณ" เมื่อเป็นงานของโรงเรียน */
  ownerTh: string
  ownerIsTeacher: boolean
  step?: PlanStep
  daysLeft?: number
}

export interface PlanCase {
  plan: OpportunityPlan
  student?: Student
  priority: Priority
  /** ขั้นที่ติดขัดหรือกำลังทำอยู่ */
  current?: PlanStep
  daysLeft?: number
  next: NextAction
  closeReady: boolean
  /** นัดติดตามที่ใกล้ที่สุดที่ยังไม่ได้ทำ (ติดลบ = เลยมาแล้ว) */
  followUpIn?: number
}

const days = (n: number, th: boolean) =>
  n < 0
    ? th ? `เลยกำหนด ${-n} วัน` : `${-n} days overdue`
    : n === 0
      ? th ? 'ครบกำหนดวันนี้' : 'due today'
      : th ? `อีก ${n} วัน` : `in ${n} days`

export function buildCase(
  plan: OpportunityPlan,
  student: Student | undefined,
  entries: CaseLogEntry[],
  th: boolean,
  today = new Date(),
): PlanCase {
  const current = plan.steps.find((s) => s.status === 'blocked') ?? plan.steps.find((s) => s.status === 'active')
  const daysLeft = current ? stepDaysLeft(plan, current) : undefined
  const closed = student?.caseStage === 'resolved' || student?.caseStage === 'returned'
  const closeReady = Boolean(student && !closed && closability(student).ready)
  const allDone = plan.steps.every((s) => s.status === 'done')

  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const ups = entries
    .filter((e) => e.childId === plan.childId && e.followUpDate && !e.followUpDone)
    .map((e) => {
      const [y, m, d] = e.followUpDate!.split('-').map(Number)
      return Math.round((Date.UTC(y, m - 1, d) - t0) / 86400000)
    })
    .sort((a, b) => a - b)
  const followUpIn = ups[0]

  // ── ขั้นถัดไป — สิ่งเดียวที่ต้องเด่นกว่าทุกอย่างบนหน้า ──
  // ลำดับ: ติดขัด → ปิดได้ → ทำครบแล้วต้องประเมิน → ยังไม่ได้ความเห็นชอบ →
  // ขั้นปัจจุบัน แผนที่ทำครบแล้วไม่ควรถูกถามหาความเห็นชอบเหมือนเพิ่งเริ่ม
  let next: NextAction
  const ownerOf = (s: PlanStep) => (isSchoolStep(s) ? (th ? 'คุณ (โรงเรียน)' : 'You (the school)') : s.ownerName)
  if (closed) {
    next = { kind: 'done', th: 'ปิดเคสแล้ว', en: 'Case closed', whyTh: 'เด็กคนนี้ปลอดภัยแล้วตามการประเมินของครู', whyEn: 'Closed after the teacher’s assessment', ownerTh: '—', ownerIsTeacher: false }
  } else if (current?.status === 'blocked') {
    next = {
      kind: 'unblock',
      th: `ปลดล็อกขั้น: ${current.titleTh}`,
      en: `Unblock: ${current.titleEn}`,
      whyTh: `ติดขัด ยังไม่มีความคืบหน้าจาก${ownerOf(current)}${daysLeft! < 0 ? ` และ${days(daysLeft!, true)}` : ''}`,
      whyEn: `Blocked with no progress from ${current.ownerName}${daysLeft! < 0 ? `, ${days(daysLeft!, false)}` : ''}`,
      ownerTh: ownerOf(current),
      ownerIsTeacher: isSchoolStep(current),
      step: current,
      daysLeft,
    }
  } else if (closeReady) {
    next = {
      kind: 'close',
      th: 'ประเมินผลและปิดเคส',
      en: 'Assess and close the case',
      whyTh: 'เด็กผ่านเกณฑ์ปิดเคสครบทุกข้อแล้ว',
      whyEn: 'The child now meets every closing criterion',
      ownerTh: th ? 'คุณ (โรงเรียน)' : 'You (the school)',
      ownerIsTeacher: true,
    }
  } else if (allDone || !current) {
    next = {
      kind: 'assess',
      th: 'ประเมินผลหลังช่วยเหลือ',
      en: 'Assess the outcome',
      whyTh: 'ทำครบทุกขั้นในแผนแล้ว แต่เด็กยังไม่ผ่านเกณฑ์ปิดเคส — ต้องดูว่าขาดอะไร',
      whyEn: 'Every step is done but the child does not yet meet the closing bar',
      ownerTh: th ? 'คุณ (โรงเรียน)' : 'You (the school)',
      ownerIsTeacher: true,
    }
  } else if (!plan.agreedByFamily) {
    next = {
      kind: 'agree',
      th: 'ขอความเห็นชอบแผนจากครอบครัว',
      en: 'Get the family to agree the plan',
      whyTh: 'แผนยังไม่ได้รับความเห็นชอบ — ส่งข้อมูลให้หน่วยงานอื่นได้เฉพาะข้อมูลพื้นฐานจนกว่าครอบครัวจะยินยอม',
      whyEn: 'Not yet agreed — only basic details can be shared with other agencies until the family consents',
      ownerTh: th ? 'คุณ (โรงเรียน)' : 'You (the school)',
      ownerIsTeacher: true,
    }
  } else if (isSchoolStep(current)) {
    next = {
      kind: 'doStep',
      th: current.titleTh,
      en: current.titleEn,
      whyTh: 'ขั้นนี้เป็นงานของโรงเรียนเอง ไม่ต้องรอหน่วยงานอื่น',
      whyEn: 'This step is the school’s own — nothing to wait for',
      ownerTh: th ? 'คุณ (โรงเรียน)' : 'You (the school)',
      ownerIsTeacher: true,
      step: current,
      daysLeft,
    }
  } else {
    next = {
      kind: 'chase',
      th: `รอ${current.ownerName}: ${current.titleTh}`,
      en: `Waiting on ${current.ownerName}: ${current.titleEn}`,
      whyTh: 'ลูกบอลอยู่ที่หน่วยงานภายนอก — ครูทวงถามได้จากที่นี่ถ้าใกล้ครบกำหนดแล้วยังเงียบ',
      whyEn: 'With an outside agency — chase it from here if the date is close and nothing has moved',
      ownerTh: current.ownerName,
      ownerIsTeacher: false,
      step: current,
      daysLeft,
    }
  }

  // ── ความเร่งด่วน ──
  let priority: Priority
  if (closed) priority = 'improving'
  else if (
    current?.status === 'blocked' ||
    (daysLeft !== undefined && daysLeft < 0) ||
    (followUpIn !== undefined && followUpIn <= 0) ||
    student?.riskLevel === 'critical'
  )
    priority = 'today'
  else if (closeReady) priority = 'improving'
  else if ((daysLeft !== undefined && daysLeft <= 3) || !plan.agreedByFamily) priority = 'soon'
  else priority = 'onTrack'

  return { plan, student, priority, current, daysLeft, next, closeReady, followUpIn }
}

export function sortCases(cases: PlanCase[]): PlanCase[] {
  return [...cases].sort(
    (a, b) =>
      PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank ||
      (a.daysLeft ?? 99) - (b.daysLeft ?? 99) ||
      (b.student?.riskScore ?? 0) - (a.student?.riskScore ?? 0),
  )
}

// ── สรุปของ AI เป็นภาษาคน ───────────────────────────────────

const LEVEL_TH: Record<RiskLevel, string> = {
  critical: 'เสี่ยงวิกฤต',
  high: 'เสี่ยงสูง',
  watch: 'อยู่ในกลุ่มเฝ้าระวัง',
  normal: 'ความเสี่ยงต่ำ',
}

/** หนึ่งถึงสองประโยคที่ตอบ "เกิดอะไรขึ้น" ก่อนครูจะต้องอ่านอะไรอีก */
export function aiSummary(c: PlanCase, pathwayLabel: string, th: boolean): string {
  const s = c.student
  const p = c.plan
  const done = p.steps.filter((x) => x.status === 'done').length
  if (!th) {
    const head = s ? `${p.childName} is ${s.riskLevel} risk, score ${s.riskScore}.` : `${p.childName}.`
    return `${head} The ${pathwayLabel} plan is ${done} of ${p.steps.length} steps in.${c.current?.status === 'blocked' ? ` It is stuck at “${c.current.titleEn}”.` : ''}`
  }
  const parts: string[] = []
  if (s) {
    const cause = s.causeKeys.map(reasonFor).find(Boolean)
    parts.push(`${p.childName} ${LEVEL_TH[s.riskLevel]}${cause ? `จาก${cause.shortTh}` : ''}`)
    if (s.absenceStreak >= 3) parts.push(`ขาดเรียนติดกัน ${s.absenceStreak} วัน`)
    if (s.parentContact !== 'ok') parts.push('ยังติดต่อผู้ปกครองไม่ได้')
  } else parts.push(p.childName)
  let line = parts.join(' ')
  line += ` · แผน${pathwayLabel}ทำแล้ว ${done} ใน ${p.steps.length} ขั้น`
  if (c.current?.status === 'blocked') line += ` แต่ติดที่ขั้น"${c.current.titleTh}"`
  else if (c.daysLeft !== undefined && c.daysLeft < 0) line += ` และขั้นปัจจุบัน${days(c.daysLeft, true)}`
  if (c.closeReady) line += ' — ตอนนี้ผ่านเกณฑ์ปิดเคสแล้ว'
  return line
}

// ── Milestone — ไม่ใช่ % อย่างเดียว ──────────────────────────

export type MilestoneState = 'done' | 'active' | 'todo'

export function milestones(c: PlanCase): { th: string; en: string; state: MilestoneState }[] {
  const s = c.student
  const steps = c.plan.steps
  const done = steps.filter((x) => x.status === 'done').length
  const allDone = done === steps.length
  const closed = s?.caseStage === 'resolved' || s?.caseStage === 'returned'
  const family = Boolean(s?.parentContact === 'ok' || c.plan.agreedByFamily)
  const st = (isDone: boolean, isActive: boolean): MilestoneState => (isDone ? 'done' : isActive ? 'active' : 'todo')
  return [
    { th: 'ประเมินความเสี่ยง', en: 'Assess risk', state: 'done' },
    { th: 'สร้างแผน', en: 'Build the plan', state: 'done' },
    { th: 'ติดต่อครอบครัว', en: 'Reach the family', state: st(family, !family) },
    { th: 'ดำเนินการช่วยเหลือ', en: 'Deliver the help', state: st(allDone, family && !allDone) },
    { th: 'ติดตามผล', en: 'Follow up', state: st(allDone && (c.closeReady || closed), done >= Math.ceil(steps.length / 2) && !allDone) },
    { th: 'ประเมินซ้ำ', en: 'Re-assess', state: st(c.closeReady || closed, allDone && !c.closeReady && !closed) },
    { th: 'ปิดเคส', en: 'Close', state: st(closed, c.closeReady) },
  ]
}

// ── Timeline — ที่ผ่านมาเกิดอะไรขึ้นแล้วบ้าง ──────────────────

export interface TimelineItem {
  date: string
  /** ลำดับภายในวันเดียวกัน — มากกว่าคือเกิดทีหลัง */
  seq: number
  th: string
  by: string
  kind: 'plan' | 'step' | 'teacher' | 'referral' | 'obstacle' | 'record'
}

const isoAgo = (n: number, today = new Date()) => {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export function timeline(
  c: PlanCase,
  pathwayLabel: string,
  entries: CaseLogEntry[],
  marks: Record<string, PlanStepMark>,
): TimelineItem[] {
  const p = c.plan
  const out: TimelineItem[] = [
    { date: isoAgo(p.startedDaysAgo), seq: 0, th: `สร้างแผน${pathwayLabel}`, by: SCHOOL_OWNER_TH, kind: 'plan' },
  ]
  for (const s of p.steps) {
    const m = marks[s.id]
    // "ติดขัด" ที่ครูตั้งมาจากการแจ้งอุปสรรค ซึ่งขึ้นใน timeline อยู่แล้ว
    if (m?.status === 'blocked') continue
    if (m) out.push({ date: m.at, seq: m.ts ?? 500, th: `${s.titleTh} — ${m.status === 'done' ? 'เสร็จแล้ว' : 'เปิดขั้นนี้'}`, by: m.by, kind: 'step' })
    else if (s.status === 'done') {
      // ขั้นที่เสร็จในข้อมูลตั้งต้นไม่มีวันที่จริง ใช้วันครบกำหนดของขั้นแทน
      // และต้องไม่เลยวันนี้
      const at = Math.max(0, p.startedDaysAgo - s.dueInDays)
      out.push({ date: isoAgo(at), seq: 10 + p.steps.indexOf(s), th: `${s.titleTh} — เสร็จแล้ว`, by: s.ownerName, kind: 'step' })
    }
  }
  // entries เก็บใหม่สุดก่อน — ตัวแรกจึงได้ seq สูงสุด
  const mine = entries.filter((x) => x.childId === p.childId)
  for (const [i, e] of mine.entries()) {
    const th = e.referral
      ? `ส่งต่อ ${e.referral.agencyName} — ${e.referral.reason}`
      : e.obstacle
        ? `แจ้งอุปสรรค: ${OBSTACLES[e.obstacle].th}`
        : e.stage === 'resolved'
          ? 'ปิดเคส'
          : // ผลที่อยู่ในข้อความอยู่แล้วไม่ต้องต่อท้ายซ้ำ ("โทรผู้ปกครอง: ติดต่อไม่ได้ → ติดต่อไม่ได้")
            e.result && !e.note.includes(e.result)
            ? `${e.note} → ${e.result}`
            : e.note
    out.push({
      date: e.date,
      seq: entryTs(e) || 1000 + (mine.length - i),
      th,
      by: e.by,
      kind: e.referral ? 'referral' : e.obstacle ? 'obstacle' : 'teacher',
    })
  }
  for (const ev of c.student?.timeline ?? []) {
    // applyLog รวมบันทึกของครูเข้าไปในประวัติของเด็กแล้ว — ถ้าไม่ข้าม บันทึก
    // เดียวกันจะขึ้นสองครั้ง (ครั้งหนึ่งพร้อมผลลัพธ์ อีกครั้งเป็นข้อความเปล่า)
    if (mine.some((e) => e.date === ev.date && e.note === ev.note)) continue
    if (out.some((o) => o.date === ev.date && o.th === ev.note)) continue
    out.push({ date: ev.date, seq: 5, th: ev.note, by: ev.by, kind: 'record' })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq)
}

// ── อุปสรรค และทางเลือกถัดไปที่ AI เสนอ ──────────────────────

export type ObstacleOption =
  | { th: string; act: 'visit' | 'contact' | 'talk' }
  | { th: string; act: 'refer'; kinds: AgencyKind[]; reason: string }

export const OBSTACLES: Record<ObstacleKey, { th: string; en: string; options: ObstacleOption[] }> = {
  unreachable: {
    th: 'ติดต่อผู้ปกครองไม่ได้',
    en: 'Cannot reach the guardian',
    options: [
      { th: 'ติดต่อผ่านผู้นำชุมชน อสม. หรือครูตาดีกาในพื้นที่', act: 'contact' },
      { th: 'ขอท้องถิ่นช่วยหาที่อยู่ปัจจุบันของครอบครัว (รหัส 701)', act: 'refer', kinds: ['localGov'], reason: 'ติดต่อผู้ปกครองไม่ได้ ขอช่วยหาที่อยู่ปัจจุบัน' },
    ],
  },
  absent: {
    th: 'นักเรียนไม่มาโรงเรียน',
    en: 'The child is not coming to school',
    options: [
      { th: 'ลงเยี่ยมบ้านภายใน 48 ชั่วโมง', act: 'visit' },
      { th: 'ให้เพื่อนสนิทหรือผู้นำศาสนาช่วยชวนกลับมาเรียน', act: 'talk' },
    ],
  },
  noFamilyInfo: {
    th: 'ไม่พบข้อมูลครอบครัว',
    en: 'No family record found',
    options: [
      { th: 'ตรวจทะเบียนราษฎร์ที่ที่ว่าการอำเภอ (รหัส 702)', act: 'refer', kinds: ['admin'], reason: 'ไม่พบข้อมูลครอบครัว ขอตรวจทะเบียนราษฎร์' },
    ],
  },
  noCooperation: {
    th: 'ครอบครัวไม่ให้ความร่วมมือ',
    en: 'The family will not cooperate',
    options: [
      { th: 'ให้ผู้นำศาสนาหรือผู้นำชุมชนช่วยพูดคุยกับครอบครัว (รหัส 307)', act: 'refer', kinds: ['religious'], reason: 'ครอบครัวไม่เห็นคุณค่าการศึกษา ขอผู้นำศาสนาช่วยพูดคุย' },
      { th: 'นำเข้าที่ประชุมทีมสหวิชาชีพระดับอำเภอ', act: 'refer', kinds: ['admin'], reason: 'ครอบครัวไม่ให้ความร่วมมือ ขอนำเข้าทีมสหวิชาชีพ' },
    ],
  },
  needAgency: {
    th: 'ต้องการความช่วยเหลือจากหน่วยงานอื่น',
    en: 'Needs another agency',
    options: [],
  },
}

// ── ส่งต่อจากหน้าเคส ─────────────────────────────────────────

/** กลุ่มรหัสสาเหตุ สพฐ. → ประเภทหน่วยงานที่รับเรื่องได้ */
const GROUP_KINDS: Record<ReasonGroup, AgencyKind[]> = {
  self: ['health', 'social'],
  health: ['health'],
  family: ['social', 'localGov'],
  community: ['localGov', 'religious'],
  school: ['education'],
  studying: ['education'],
  untraceable: ['admin', 'localGov'],
  noNeed: [],
}

/** หน่วยงานที่ควรรับเรื่องเด็กคนนี้ เรียงตามสาเหตุของเด็ก แล้วตามด้วยที่เหลือ
 *  ในจังหวัด — ครูไม่ต้องรู้ว่าหน่วยงานไหนรับเรื่องอะไร ตาราง สพฐ. บอกให้ */
export function suggestAgencies(student: Student | undefined, provinceKey: string, kinds?: AgencyKind[]): { agency: Agency; why?: string }[] {
  const inProv = AGENCIES.filter((a) => a.provinceKey === provinceKey)
  // ลำดับสำคัญ: ประเภทที่ครูเลือกมาจากทางเลือกของอุปสรรคต้องขึ้นก่อนและถูก
  // เลือกไว้ให้ — รุ่นแรกเรียงตามลำดับในรายการหน่วยงาน ครูกด "ขอท้องถิ่น
  // ช่วยหาที่อยู่" แต่ตัวที่ถูกเลือกไว้เป็น พมจ. กดถัดไปรวดก็ส่งผิดหน่วยงาน
  const ranked: { kind: AgencyKind; why: string }[] = []
  const seen = new Set<AgencyKind>()
  for (const k of kinds ?? []) {
    if (seen.has(k)) continue
    seen.add(k)
    ranked.push({ kind: k, why: 'ตรงกับทางเลือกที่คุณเลือก' })
  }
  for (const key of student?.causeKeys ?? []) {
    const r = reasonFor(key)
    if (!r) continue
    for (const k of GROUP_KINDS[r.group]) {
      if (seen.has(k)) continue
      seen.add(k)
      ranked.push({ kind: k, why: `${r.shortTh} (รหัส ${r.id}) · ${REASON_GROUP[r.group].th}` })
    }
  }
  const first = ranked.flatMap(({ kind, why }) => inProv.filter((a) => a.kind === kind).map((agency) => ({ agency, why })))
  const rest = inProv.filter((a) => !seen.has(a.kind)).map((agency) => ({ agency }))
  return [...first, ...rest]
}

export const SHARE_OPTIONS = [
  { key: 'basic', th: 'ชื่อ ชั้น และโรงเรียน', needsConsent: false },
  { key: 'cause', th: 'สาเหตุและปัจจัยเสี่ยง', needsConsent: true },
  { key: 'history', th: 'ประวัติการช่วยเหลือ', needsConsent: true },
  { key: 'family', th: 'ข้อมูลครอบครัวและรายได้', needsConsent: true },
  { key: 'health', th: 'ข้อมูลสุขภาพ', needsConsent: true },
] as const

// ── ประเมินก่อนปิดเคส ────────────────────────────────────────

export interface FinalAssessment {
  questions: { th: string; state: 'ok' | 'no' | 'warn'; detail: string }[]
  summary: string
  canClose: boolean
}

/** สามข้อแรกคือเกณฑ์เดียวกับ closability() ทุกตัวอักษร — รุ่นแรกแบบประเมิน
 *  มีเกณฑ์ภาระครอบครัวเพิ่มเป็นข้อห้ามปิด รายการกับหน้าแรกจึงบอก "ปิดได้"
 *  แต่พอกดเข้ามาแบบประเมินกลับบอก "ยังไม่ควรปิด"
 *
 *  ภาระครอบครัวคิดจากรายได้เป็นหลัก ถ้าใช้เป็นข้อห้าม เด็กจากครอบครัวยากจน
 *  จะปิดเคสไม่ได้ตลอดไปแม้กลับมาเรียน 100% แล้ว จึงแสดงเป็นข้อเตือนพร้อม
 *  คำแนะนำให้ติดตามหลังปิด ไม่ใช่เงื่อนไขห้าม */
export function finalAssessment(c: PlanCase): FinalAssessment | undefined {
  const s = c.student
  if (!s) return undefined
  // เกณฑ์เดียวกับ closability(): เฉลี่ย 4 สัปดาห์ล่าสุด
  const recent = s.attendance.slice(-4)
  const att = Math.round(recent.length ? recent.reduce((a, p) => a + p.rate, 0) / recent.length : 0)
  const first = s.riskHistory[0]?.score ?? s.riskScore
  const burden = s.causeKeys.map(reasonFor).find((r) => r && (r.group === 'family' || r.group === 'health'))
  const ok = (v: boolean) => (v ? 'ok' : 'no') as 'ok' | 'no'
  const questions: FinalAssessment['questions'] = [
    { th: 'นักเรียนกลับมาเรียนสม่ำเสมอหรือไม่', state: ok(att >= 80 && s.absenceStreak <= 2), detail: `มาเรียนเฉลี่ย 4 สัปดาห์ ${att}% · ขาดติดกันล่าสุด ${s.absenceStreak} วัน` },
    { th: 'ระดับความเสี่ยงลดลงหรือไม่', state: ok(first - s.riskScore >= 8 && s.riskScore < 70), detail: `จาก ${first} เป็น ${s.riskScore}` },
    { th: 'ผู้ปกครองรับทราบหรือไม่', state: ok(s.parentContact === 'ok'), detail: s.parentContact === 'ok' ? 'ติดต่อได้ตามปกติ' : 'ยังติดต่อไม่ได้ตามปกติ' },
    {
      th: 'ยังมีปัจจัยเสี่ยงค้างอยู่หรือไม่',
      state: s.familyRisk >= 70 ? 'warn' : 'ok',
      detail: s.familyRisk >= 70
        ? `ยังมีภาระครอบครัว ${s.familyRisk}/100${burden ? ` (${burden.shortTh})` : ''} — ไม่ใช่สิ่งที่โรงเรียนแก้ได้ แต่ควรติดตามหลังปิด`
        : `ด้านครอบครัว ${s.familyRisk}/100`,
    },
  ]
  const canClose = !questions.some((q) => q.state === 'no')
  const warn = questions.find((q) => q.state === 'warn')
  const summary = canClose
    ? `จากข้อมูลล่าสุด ความเสี่ยงลดลงจาก ${first} เป็น ${s.riskScore} มาเรียน ${att}% และขาดติดกันล่าสุดเพียง ${s.absenceStreak} วัน — ปิดเคสได้${warn ? ' แต่ยังมีภาระครอบครัวค้างอยู่ แนะนำให้นัดติดตามสักครั้งหลังปิดเคส' : ''}`
    : `ยังไม่ควรปิดเคส: ${questions.filter((q) => q.state === 'no').map((q) => q.detail).join(' · ')} — แนะนำให้ติดตามต่อ`
  return { questions, summary, canClose }
}

// ── สร้างแผนจากระเบียนเด็ก ───────────────────────────────────

/** เป้าหมายของแผนที่ AI เสนอ — ครูเปลี่ยนได้ แต่ไม่ต้องเริ่มจากหน้าว่าง */
export function suggestPathway(s: Student): { pathway: OpportunityPlan['pathway']; whyTh: string } {
  const has = (k: string) => s.causeKeys.includes(k as never)
  // การศึกษาพิเศษเฉพาะเด็กที่มีความพิการในทะเบียน — ปัญหาสุขภาพอย่างเดียว (เช่นเจ็บป่วยเรื้อรัง)
  // แก้ด้วยการประสานสาธารณสุขในแผนกลับเข้าเรียน ไม่ใช่ย้ายเด็กไปสายการศึกษาพิเศษ
  if (s.master.disabilityName)
    return { pathway: 'specialNeeds', whyTh: `ทะเบียนระบุความพิการ (${s.master.disabilityName}) — ต้องประเมินเฉพาะทางก่อนกำหนดรูปแบบการเรียน` }
  if (has('dualSchooling'))
    return { pathway: 'islamicSchool', whyTh: 'เด็กเรียนควบสายศาสนาอยู่แล้ว การจัดเวลาให้ไม่ชนกันจะลดแรงกดดันที่ทำให้หลุด' }
  if (has('childLabour') && ['m3', 'm4', 'm5'].includes(s.gradeKey))
    return { pathway: 'vocational', whyTh: 'เด็กต้องหารายได้และอยู่ช่วงจบ ม.ต้น สายอาชีพให้ทั้งวุฒิและทักษะที่ใช้หาเลี้ยงได้' }
  return { pathway: 'formalReturn', whyTh: 'เด็กยังอยู่ในระบบ เป้าหมายคือให้เรียนต่อที่โรงเรียนเดิมโดยไม่หลุดออกไป' }
}

const STEP_OWNER: Record<string, 'school' | AgencyKind> = {
  reach: 'school', callback: 'school', visit: 'school', academic: 'school', followUp: 'school',
  guardian: 'school', marriage: 'school', welfare: 'social', health: 'health', docs: 'admin', access: 'localGov',
}
const DUE = [2, 4, 7, 10, 14, 21, 28, 35]

/** แปลงคำแนะนำของ AI เป็นขั้นในแผนจริง พร้อมเจ้าภาพและกำหนด */
export function planStepsFrom(s: Student, recs: { key: string; th: string; en: string }[]): PlanStep[] {
  let prev = 0
  return recs.map((r, i) => {
    const kind = STEP_OWNER[r.key] ?? 'school'
    const agency = kind === 'school' ? undefined : AGENCIES.find((a) => a.provinceKey === s.provinceKey && a.kind === kind)
    // ขั้นนัดติดตามบอกจำนวนวันไว้ในชื่อ ("ภายใน 14 วัน") — ชื่อกับกำหนดต้องเป็นตัวเลขเดียวกัน
    // เดิมกำหนดมาจากลำดับขั้น ชื่อจึงบอก 14 วันแต่กำหนดขึ้น 7 วัน
    const byOrder = DUE[i] ?? 35 + i * 7
    const follow = r.key === 'followUp'
    const due = follow ? Math.max(prev, s.riskLevel === 'critical' ? 7 : 14) : Math.max(prev, byOrder)
    prev = due
    return {
      id: `${s.id}-S${i + 1}`,
      titleTh: follow ? `นัดติดตามภายใน ${due} วัน` : r.th,
      titleEn: follow ? `Set a follow-up within ${due} days` : r.en,
      ownerAgencyId: agency?.id ?? SCHOOL_OWNER_ID,
      ownerName: agency?.th ?? SCHOOL_OWNER_TH,
      dueInDays: due,
      status: i === 0 ? 'active' : 'pending',
    }
  })
}
