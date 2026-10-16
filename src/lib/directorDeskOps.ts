// ─────────────────────────────────────────────────────────────
// เส้นทางโอกาส · การส่งต่อ ในมุม ผอ.
//
// ครูเห็นสองหน้านี้เป็น "งานที่ต้องลงมือ" ผอ. ไม่ได้ลงมือแทนครู งานของ ผอ. คือ
// ทำให้แผนและการส่งต่อที่ค้าง "เดินต่อได้": เตือนผู้รับผิดชอบ · ย้ายงานให้คนที่ว่างกว่า ·
// ยกระดับหน่วยงานภายนอกที่เงียบ · นัดคุยกับครอบครัวพร้อมครู
//
// ที่นี่ตอบต่อหนึ่งเรื่องว่า ติดตรงไหน · ทำไม ผอ. ต้องดู · ผอ. มีทางเลือกอะไร
// แบบเดียวกับการ์ดบนหน้าภาพรวมและทะเบียนเด็กนอกระบบ ภาษาเป็น "อาจพิจารณา" ไม่สั่ง ผอ.
// ─────────────────────────────────────────────────────────────
import { requestStatus, type CaseLogEntry, type SupportRequest } from './caseLog'
import { LEVEL_TH, type FollowCase } from './followOps'
import { execSummary, type InboxItem } from './directorOps'
import { isSchoolStep } from '@/data/plans'
import type { PlanCase } from './planOps'
import { BUCKET_META, type RefCase } from './refOps'
import { GRADE_LABEL } from './schoolOps'

const D = 86400000

export type DeskKind = 'nudge' | 'assign' | 'escalate' | 'meeting'

export interface DeskOption {
  kind: DeskKind
  label: string
  effect: string
  recommended?: boolean
  /** ข้อความตั้งต้นที่ ผอ. แก้ได้ */
  message?: string
  /** การส่งต่อที่จะยกระดับ */
  refId?: string
  /** ระดับที่ยกระดับไป */
  level?: 2 | 3
}

export interface DeskBrief {
  /** ป้ายสั้นบนการ์ด — ติดตรงไหน */
  tag: string
  /** สีของจุดหน้าป้าย */
  tone: 'red' | 'orange' | 'green'
  why: string[]
  insight?: string
  question: string
  options: DeskOption[]
}

/** ผอ. ทำอะไรกับเด็กคนนี้ไปแล้วใน 3 วัน — ไม่เสนอเรื่องเดิมซ้ำ */
export function handledBy(entries: CaseLogEntry[], childId: string, days = 3): boolean {
  const since = new Date(Date.now() - days * D)
  const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
  return entries.some((e) => e.childId === childId && e.role === 'director' && e.date >= sinceIso)
}

const sortRec = <T extends { recommended?: boolean }>(o: T[]) => [...o].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)))
const lateTh = (d?: number) => (d !== undefined && d < 0 ? `เลยกำหนด ${-d} วัน` : d === 0 ? 'ครบกำหนดวันนี้' : d !== undefined ? `อีก ${d} วัน` : '')

// ── เส้นทางโอกาส ─────────────────────────────────────────────

export interface PlanDeskCtx {
  owner?: string
  /** ผู้รับผิดชอบคนนี้งานล้นมือ */
  heavy: boolean
  /** คนที่ว่างที่สุดในทีม (ไม่ใช่ผู้รับผิดชอบเดิม) */
  suggest?: string
  /** การส่งต่อของเด็กคนนี้ที่ยังไม่เสร็จ — ใช้ยกระดับหน่วยงานของขั้นที่ติด */
  refs: RefCase[]
}

/** แผนนี้ต้องใช้ ผอ. ไหม — งานปกติของครู (ทำขั้นถัดไป · ประเมิน · ปิดเคส) ไม่ใช่งาน ผอ. */
export function planNeedsDirector(c: PlanCase, owner?: string): boolean {
  if (c.next.kind === 'done') return false
  if (!owner) return true
  if (c.current?.status === 'blocked') return true
  if (c.daysLeft !== undefined && c.daysLeft < 0) return true
  if (!c.plan.agreedByFamily && c.plan.startedDaysAgo >= 14) return true
  return false
}

export function planRank(c: PlanCase, owner?: string): number {
  let n = 0
  if (!owner) n += 60
  if (c.current?.status === 'blocked') n += 40
  if (c.daysLeft !== undefined && c.daysLeft < 0) n += Math.min(30, -c.daysLeft * 2)
  if (!c.plan.agreedByFamily) n += 10
  if (c.student?.riskLevel === 'critical') n += 15
  else if (c.student?.riskLevel === 'high') n += 8
  return n
}

/** ป้ายสั้นของแผน — ใช้ทั้งบนการ์ดและในรายชื่อ */
export function planTag(c: PlanCase, owner?: string): string {
  if (!owner) return 'ยังไม่มีผู้รับผิดชอบ'
  if (c.next.kind === 'done') return 'ปิดเคสแล้ว'
  if (c.current?.status === 'blocked') return `ติดขัด: ${c.current.titleTh}`
  if (c.daysLeft !== undefined && c.daysLeft < 0 && c.current) return `${c.current.titleTh} · ${lateTh(c.daysLeft)}`
  if (!c.plan.agreedByFamily) return 'ครอบครัวยังไม่เห็นชอบแผน'
  if (c.next.kind === 'close') return 'พร้อมปิดเคส — ครูประเมิน'
  if (c.next.kind === 'assess') return 'ทำครบทุกขั้น — ครูประเมินผล'
  return c.current ? `กำลังทำ: ${c.current.titleTh}` : 'เดินหน้าตามแผน'
}

export function planBrief(c: PlanCase, ctx: PlanDeskCtx): DeskBrief {
  const p = c.plan
  const s = c.student
  const step = c.current
  const done = p.steps.filter((x) => x.status === 'done').length
  const why: string[] = []
  if (s) why.push(`${GRADE_LABEL(s.gradeKey, true)} · ${s.riskLevel === 'critical' ? 'เสี่ยงวิกฤต' : s.riskLevel === 'high' ? 'เสี่ยงสูง' : 'อยู่ในกลุ่มเฝ้าระวัง'} · ทำแผนไปแล้ว ${done} จาก ${p.steps.length} ขั้น`)
  else why.push(`ทำแผนไปแล้ว ${done} จาก ${p.steps.length} ขั้น`)
  if (step) why.push(`ขั้นตอนนี้: ${step.titleTh} — ${isSchoolStep(step) ? (ctx.owner ?? 'โรงเรียน') : step.ownerName}${c.daysLeft !== undefined ? ` · ${lateTh(c.daysLeft)}` : ''}`)
  if (!p.agreedByFamily) why.push(`เริ่มแผนมา ${p.startedDaysAgo} วันแล้ว ครอบครัวยังไม่เห็นชอบ — ระหว่างนี้ส่งให้หน่วยงานได้เฉพาะข้อมูลพื้นฐาน`)

  const options: DeskOption[] = []
  let insight: string | undefined
  let question = 'ผอ. อาจพิจารณาทางไหน'
  let tone: DeskBrief['tone'] = 'orange'
  const owner = ctx.owner

  if (!owner) {
    tone = 'red'
    question = 'ใครควรดูแลแผนนี้'
    insight = 'แผนที่ไม่มีผู้รับผิดชอบจะไม่มีใครทำขั้นถัดไป'
    options.push({ kind: 'assign', label: ctx.suggest ? `มอบหมายให้ ${ctx.suggest}` : 'มอบหมายครู', effect: 'แผนขึ้นในงานของผู้รับผิดชอบคนนั้นทันที', recommended: true })
  } else if (step?.status === 'blocked' && !isSchoolStep(step)) {
    tone = 'red'
    const ref = ctx.refs.find((r) => r.toAgencyId === step.ownerAgencyId && r.bucket !== 'done')
    question = 'หน่วยงานยังไม่ขยับ — ผอ. อาจพิจารณาทางไหน'
    insight = `ลูกบอลอยู่ที่หน่วยงานภายนอก ครูทวงถามเองได้ระดับหนึ่ง การที่ ผอ. ประสานหัวหน้าหน่วยงานมักขยับได้เร็วกว่า`
    options.push({
      kind: 'escalate',
      label: `ยกระดับถึงหัวหน้า${step.ownerName}`,
      effect: ref ? 'ลงเป็นเหตุการณ์ในการส่งต่อ ครูและหน่วยงานเห็นตรงกัน' : 'บันทึกว่า ผอ. ประสานหัวหน้าหน่วยงาน ลงไทม์ไลน์ของเด็ก',
      recommended: true,
      refId: ref?.id,
      level: 2,
    })
    options.push({ kind: 'nudge', label: `ให้ ${owner} ทวงถามอีกครั้ง`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', message: `ช่วยโทรทวงถาม${step.ownerName}เรื่อง "${step.titleTh}" และแจ้งผลภายในสัปดาห์นี้` })
  } else if (step && (step.status === 'blocked' || (c.daysLeft !== undefined && c.daysLeft < 0)) && isSchoolStep(step)) {
    tone = step.status === 'blocked' ? 'red' : 'orange'
    question = `ขั้น "${step.titleTh}" ค้างอยู่ที่ครู — ผอ. อาจพิจารณาทางไหน`
    if (ctx.heavy && ctx.suggest) {
      insight = `${owner} ดูแลเคสมากที่สุดในทีม ขั้นนี้อาจค้างเพราะงานล้นมือ ไม่ใช่เพราะไม่ทำ`
      options.push({ kind: 'assign', label: `ย้ายให้ ${ctx.suggest}`, effect: `ลดภาระของ ${owner} — แผนขึ้นในงานของ ${ctx.suggest}`, recommended: true })
      options.push({ kind: 'nudge', label: `เตือน ${owner}`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', message: `ขั้น "${step.titleTh}" ${lateTh(c.daysLeft)} — ติดอะไรบอก ผอ. ได้เลย` })
    } else {
      options.push({ kind: 'nudge', label: `เตือน ${owner}`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', recommended: true, message: `ขั้น "${step.titleTh}" ${lateTh(c.daysLeft)} — ติดอะไรบอก ผอ. ได้เลย` })
      options.push({ kind: 'assign', label: ctx.suggest ? `ย้ายให้ ${ctx.suggest}` : 'เปลี่ยนผู้รับผิดชอบ', effect: 'แผนย้ายไปอยู่ในงานของครูคนใหม่' })
    }
  } else if (step && c.daysLeft !== undefined && c.daysLeft < 0) {
    // ขั้นของหน่วยงานที่เลยกำหนดแต่ยังไม่ถูกทำเครื่องหมายว่าติด
    const ref = ctx.refs.find((r) => r.toAgencyId === step.ownerAgencyId && r.bucket !== 'done')
    question = `หน่วยงาน${lateTh(c.daysLeft)} — ผอ. อาจพิจารณาทางไหน`
    options.push({ kind: 'nudge', label: `ให้ ${owner} ทวงถาม`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', recommended: c.daysLeft > -7, message: `ช่วยทวงถาม${step.ownerName}เรื่อง "${step.titleTh}" และแจ้งผล` })
    options.push({ kind: 'escalate', label: `ยกระดับถึงหัวหน้า${step.ownerName}`, effect: 'ผอ. ประสานหัวหน้าหน่วยงาน ลงไทม์ไลน์ของเด็ก', recommended: c.daysLeft <= -7, refId: ref?.id, level: 2 })
  } else if (!p.agreedByFamily) {
    question = 'ครอบครัวยังไม่เห็นชอบแผน — ผอ. อาจพิจารณาทางไหน'
    insight = 'ครอบครัวที่ลังเลมักตัดสินใจได้เมื่อผู้บริหารโรงเรียนมาคุยด้วย — ครูยังเป็นคนนำ'
    options.push({ kind: 'meeting', label: 'นัดคุยกับครอบครัวพร้อมครู', effect: `นัดขึ้นในงานของ ${owner} · ผอ. ร่วมคุย`, recommended: true })
    options.push({ kind: 'nudge', label: `เตือน ${owner}`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', message: 'ช่วยคุยกับครอบครัวเรื่องความเห็นชอบแผนอีกครั้ง ถ้าต้องการให้ ผอ. ร่วมคุยบอกได้' })
  }

  return {
    tag: planTag(c, owner),
    tone: options.length ? tone : 'green',
    why,
    insight,
    question,
    options: sortRec(options),
  }
}

// ── การส่งต่อข้ามหน่วยงาน ────────────────────────────────────

export interface RefDeskCtx {
  heavy: boolean
  suggest?: string
  now: number
  /** ชื่อ ผอ. — ดูว่ายกระดับไปเองแล้วหรือยัง */
  by: string
}

const lastTs = (r: RefCase) => Math.max(0, ...r.events.map((e) => e.ts))
const daysSince = (ts: number, now: number) => Math.max(0, Math.floor((now - ts) / D))

/** ผอ. ยกระดับการส่งต่อนี้ไปแล้วใน 72 ชม. */
export const refHandled = (r: RefCase, ctx: Pick<RefDeskCtx, 'by' | 'now'>) =>
  r.events.some((e) => e.type === 'escalated' && e.by === ctx.by && ctx.now - e.ts < 3 * D)

export function refNeedsDirector(r: RefCase, now: number): boolean {
  if (r.bucket === 'breach') return true
  const idle = daysSince(lastTs(r), now)
  if (r.bucket === 'returned' && idle >= 2) return true
  if (r.bucket === 'needInfo' && idle >= 3) return true
  if (r.bucket === 'consent' && idle >= 7) return true
  return false
}

export function refRank(r: RefCase, now: number): number {
  const idle = daysSince(lastTs(r), now)
  return (8 - BUCKET_META[r.bucket].rank) * 10 + (r.urgent ? 15 : 0) + Math.min(20, idle) + (r.bucket === 'breach' ? Math.min(20, Math.round(-r.sla.hoursLeft / 12)) : 0)
}

export function refBrief(r: RefCase, ctx: RefDeskCtx): DeskBrief {
  const owner = r.caseOwner
  const idle = daysSince(lastTs(r), ctx.now)
  const why: string[] = [
    `ผู้รับผิดชอบ ${owner}`,
    ...(idle ? [`ไม่มีความเคลื่อนไหว ${idle} วัน`] : []),
  ]
  if (r.urgent) why.unshift('เรื่องเร่งด่วน')
  if (r.escalated) why.push(`ยกระดับไปแล้วถึงระดับ ${r.escalated}${r.escalated >= 2 ? ' (หัวหน้าหน่วยงาน)' : ''}`)

  const options: DeskOption[] = []
  let insight: string | undefined
  let question = 'ผอ. อาจพิจารณาทางไหน'
  let tone: DeskBrief['tone'] = 'orange'

  if (r.bucket === 'breach') {
    tone = 'red'
    question = 'หน่วยงานเกินกำหนด — ผอ. อาจพิจารณาทางไหน'
    if (r.escalated < 2) {
      insight = 'ครูแจ้งเตือนได้เอง แต่การยกระดับถึงหัวหน้าหน่วยงานเป็นอำนาจของ ผอ.'
      options.push({ kind: 'escalate', label: 'ยกระดับถึงหัวหน้าหน่วยงาน', effect: 'ลงเป็นเหตุการณ์ในการส่งต่อ ครูและหน่วยงานเห็นตรงกัน', recommended: true, refId: r.id, level: 2 })
      options.push({ kind: 'nudge', label: `ให้ ${owner} โทรทวงถาม`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', message: `ช่วยโทรถาม ${r.toName} ว่ารับเรื่องแล้วหรือยัง และแจ้งผลวันนี้` })
    } else {
      insight = 'หัวหน้าหน่วยงานรับรู้แล้วแต่ยังไม่ขยับ — อาจถึงเวลายกระดับต่อหรือหาหน่วยงานอื่น'
      options.push({ kind: 'escalate', label: 'ยกระดับถึงระดับจังหวัด', effect: 'ลงเป็นเหตุการณ์ในการส่งต่อ', recommended: r.escalated < 3, refId: r.id, level: 3 })
      options.push({ kind: 'nudge', label: `ให้ ${owner} ส่งต่อหน่วยงานอื่น`, effect: 'ครูเลือกหน่วยงานใหม่จากหน้าส่งต่อ ผอ. ไม่ส่งเอง', recommended: r.escalated >= 3, message: `${r.toName} ยังไม่รับเรื่องหลังยกระดับแล้ว — ช่วยส่งต่อหน่วยงานอื่นที่ช่วยเรื่อง${r.needTh}ได้` })
    }
  } else if (r.bucket === 'returned') {
    question = `ถูกส่งกลับมา ${idle} วันแล้ว — ผอ. อาจพิจารณาทางไหน`
    insight = 'เรื่องที่ถูกส่งกลับไม่มีนาฬิกาเตือน ถ้าครูไม่ทำต่อจะค้างเงียบ ๆ'
    if (ctx.heavy && ctx.suggest)
      options.push({ kind: 'assign', label: `ย้ายเคสให้ ${ctx.suggest}`, effect: `ลดภาระของ ${owner} — เคสขึ้นในงานของ ${ctx.suggest}`, recommended: true })
    options.push({ kind: 'nudge', label: `เตือน ${owner}`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', recommended: !(ctx.heavy && ctx.suggest), message: `${r.toName} ส่งเรื่องกลับมา — ช่วยดูเหตุผลแล้วแก้ไขหรือส่งหน่วยงานอื่น` })
  } else if (r.bucket === 'needInfo') {
    question = `หน่วยงานขอข้อมูลเพิ่มมา ${idle} วัน — ผอ. อาจพิจารณาทางไหน`
    options.push({ kind: 'nudge', label: `เตือน ${owner} ส่งข้อมูล`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', recommended: true, message: `${r.toName} รอข้อมูลเพิ่มอยู่ — ช่วยส่งให้ภายในวันนี้` })
    if (ctx.suggest) options.push({ kind: 'assign', label: `ย้ายเคสให้ ${ctx.suggest}`, effect: 'เคสย้ายไปอยู่ในงานของครูคนใหม่' })
  } else if (r.bucket === 'consent') {
    question = `รอความยินยอมจากครอบครัวมา ${idle} วัน — ผอ. อาจพิจารณาทางไหน`
    insight = 'ส่งข้อมูลให้หน่วยงานไม่ได้จนกว่าครอบครัวยินยอม การที่ ผอ. ร่วมคุยมักช่วยให้ครอบครัวมั่นใจ'
    options.push({ kind: 'meeting', label: 'นัดคุยกับครอบครัวพร้อมครู', effect: `นัดขึ้นในงานของ ${owner} · ผอ. ร่วมคุย`, recommended: true })
    options.push({ kind: 'nudge', label: `เตือน ${owner}`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', message: 'ช่วยคุยกับครอบครัวเรื่องความยินยอมอีกครั้ง ถ้าต้องการให้ ผอ. ร่วมคุยบอกได้' })
  }

  return { tag: BUCKET_META[r.bucket].th, tone: options.length ? tone : 'green', why, insight, question, options: sortRec(options) }
}

// ── เรื่องที่ต้องตัดสินใจ ─────────────────────────────────────

export type DecisionStart = 'decide' | 'assign' | 'nudge' | 'escalate'

export interface DecisionOption {
  label: string
  effect: string
  recommended?: boolean
  /** เปิดขั้นไหนในลิ้นชัก */
  start: DecisionStart
  /** ครูที่ AI เสนอให้รับเคส */
  owner?: string
}

export interface DecisionBrief extends Omit<DeskBrief, 'options'> {
  options: DecisionOption[]
  /** หนึ่งประโยคบนแถว — ติดอะไร */
  headline: string
}

const shortOwner = (owner: string) => (/^ครู/.test(owner) ? `ครู${owner.replace(/^(ครูแนะแนว|ครูประจำชั้น|ครู)\s*/, '')}` : owner)
const lifeOf = (c: FollowCase) =>
  [c.s.absenceStreak >= 3 && `ขาดเรียนต่อเนื่อง ${c.s.absenceStreak} วัน`, c.s.parentContact === 'unreachable' ? 'ติดต่อผู้ปกครองไม่ได้' : c.s.parentContact === 'delayed' ? 'ผู้ปกครองตอบช้า' : '']
    .filter(Boolean)
    .join(' · ') || `มาเรียนสัปดาห์นี้ ${Math.round(c.s.attendance.at(-1)?.rate ?? 0)}%`

/**
 * เรื่องหนึ่งในกล่องของ ผอ. — ตอบสามข้อแบบเดียวกับหน้าอื่นของ ผอ.: ติดอะไร · ทำไม · ผอ. เลือกทางไหน
 * ทางเลือกเปิดขั้นที่ตรงเรื่องในลิ้นชักทันที (ตัดสินใจคำขอ · มอบหมาย · เตือน · Escalate) ไม่ใช่ปุ่ม "พิจารณา" ที่ไม่บอกอะไร
 */
export function decisionBrief(kind: 'request' | 'noOwner' | 'stuck', c: FollowCase, req: SupportRequest | undefined, heavy?: string, lightest?: string): DecisionBrief {
  const s = c.s
  const owner = s.caseOwner
  const risk = `ความเสี่ยง${LEVEL_TH[s.riskLevel]} ${s.riskScore}/100${c.riskDelta >= 5 ? ` (เพิ่ม +${c.riskDelta} ใน 8 สัปดาห์)` : ''}`
  const late = c.refs.find((r) => r.bucket === 'breach')

  if (kind === 'request' && req) {
    const st = requestStatus(req)
    const ai = execSummary(c, req, heavy)
    const waited = Math.floor((Date.now() - (st === 'answered' ? req.replies.at(-1)!.ts : req.ts)) / 86400000)
    const headline = st === 'answered' ? `${shortOwner(req.by)}ตอบข้อมูลที่ขอแล้ว` : `${shortOwner(req.by)}ขอให้ ผอ. ช่วย`
    return {
      tag: st === 'answered' ? 'ครูตอบแล้ว' : st === 'new' ? 'คำขอใหม่' : 'กำลังพิจารณา',
      tone: 'red',
      headline,
      why: [
        `ครูขอ: “${req.ask}”`,
        req.tried.length ? `ครูทำแล้ว: ${req.tried.slice(0, 3).join(' · ')}${req.tried.length > 3 ? ` และอีก ${req.tried.length - 3} อย่าง` : ''}` : 'ครูยังไม่ได้ระบุสิ่งที่ทำไปแล้ว',
        `${risk} · ${waited ? `รอ ผอ. มา ${waited} วัน` : 'ส่งมาวันนี้'}`,
      ],
      insight: `${ai.headline}${ai.options.length ? ` — อาจพิจารณา: ${ai.options.slice(0, 2).map((o) => o.th).join(' · ')}` : ''}`,
      question: `${headline} — จะช่วยตามที่ครูขอไหม?`,
      options: [{ label: 'ตัดสินใจคำขอนี้', effect: 'เลือกอนุมัติ / ขอข้อมูลเพิ่ม / ไม่อนุมัติ — งานกลับไปที่ครูพร้อมผู้รับผิดชอบและกำหนดวัน', start: 'decide', recommended: true }],
    }
  }

  if (kind === 'noOwner' || !owner) {
    return {
      tag: 'ไม่มีผู้รับผิดชอบ',
      tone: 'red',
      headline: 'ยังไม่มีครูผู้รับผิดชอบ',
      why: [risk, lifeOf(c), 'ไม่มีใครถูกนับว่าต้องตามเด็กคนนี้'],
      insight: lightest ? `${lightest} มีเคสเสี่ยงสูงน้อยที่สุดในทีม — รับเพิ่มได้โดยไม่กระทบเคสเดิม` : undefined,
      question: 'ยังไม่มีครูผู้รับผิดชอบ — จะให้ใครดูแล?',
      options: [{ label: lightest ? `มอบหมายให้ ${lightest}` : 'มอบหมายครู', effect: 'เคสขึ้นในงานวันนี้ของครูคนนั้น เปลี่ยนคนได้ในขั้นถัดไป', start: 'assign', owner: lightest, recommended: true }],
    }
  }

  // ค้างนาน — ครูยังไม่ได้ขอ แต่ไม่มีใครขยับได้นอกจาก ผอ.
  const ownerHeavy = owner === heavy && Boolean(lightest)
  const options: DecisionOption[] = []
  if (ownerHeavy) options.push({ label: `ย้ายให้ ${lightest}`, effect: `ลดงานของ${shortOwner(owner)} — เคสขึ้นในงานวันนี้ของ ${lightest}`, start: 'assign', owner: lightest, recommended: true })
  options.push({ label: `เตือน${shortOwner(owner)}`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู — ครูยังดูแลเคสต่อ', start: 'nudge', recommended: !ownerHeavy && !late })
  if (late) options.push({ label: `Escalate ${late.toName}`, effect: 'ยกระดับถึงหัวหน้าหน่วยงาน บันทึกบนการส่งต่อ', start: 'escalate', recommended: !ownerHeavy })
  return {
    tag: 'ค้างนาน',
    tone: c.riskDelta >= 5 ? 'red' : 'orange',
    headline: `ไม่มีความคืบหน้า ${c.updatedDaysAgo} วัน`,
    why: [risk, lifeOf(c), `ผู้รับผิดชอบ ${owner}${late ? ` · ${late.toName} เกินกำหนด` : ''}`],
    insight: ownerHeavy
      ? `${shortOwner(owner)}ดูแลเคสเสี่ยงสูงมากที่สุดในทีม — เคสนี้น่าจะค้างเพราะงานล้นมือ ไม่ใช่เพราะไม่ใส่ใจ`
      : late
        ? 'ลูกบอลอยู่ที่หน่วยงานภายนอก — การยกระดับเป็นอำนาจของ ผอ.'
        : undefined,
    question: `ไม่มีความคืบหน้า ${c.updatedDaysAgo} วัน — ${ownerHeavy ? `จะให้${shortOwner(owner)}เร่ง หรือย้ายให้ครูคนอื่น?` : 'ผอ. อาจพิจารณาทางไหน'}`,
    options: sortRec(options),
  }
}

/** คิวของ ผอ. — แหล่งเดียวของตัวเลข "เรื่องรอ ผอ." บนเมนูและบนหน้าเรื่องที่ต้องตัดสินใจ
 *  คำขอจากครูขึ้นเสมอ เรื่องที่ AI พบซึ่ง ผอ. เพิ่งลงมือใน 3 วัน ย้ายไป "รอผล" */
export function directorQueue(inbox: InboxItem[], entries: CaseLogEntry[]) {
  const asks = inbox.filter((x) => x.kind === 'request')
  const found = inbox.filter((x) => x.kind !== 'request' && !handledBy(entries, x.c.s.id))
  const nudged = inbox.filter((x) => x.kind !== 'request' && handledBy(entries, x.c.s.id))
  return { asks, found, nudged, waiting: asks.length + found.length }
}

// ── คิวของ ผอ. แต่ละหน้า — นิยามเดียว ใช้ทั้งในหน้า บนเมนู ในกระดิ่ง และบนภาพรวม ──
// เดิมแต่ละที่กรองเอง ตัวเลขจึงไม่ตรงกัน (ภาพรวม 5 · เมนู 3 · กระดิ่ง 13 ขณะที่หน้าบอก 14)

/** แผนนี้อยู่ในคิว "ต้องใช้ ผอ." ของหน้าเส้นทางโอกาส */
export const inPlanQueue = (c: PlanCase, owner: string | undefined, entries: CaseLogEntry[]) =>
  c.next.kind !== 'done' && planNeedsDirector(c, owner) && !handledBy(entries, c.plan.childId)

/** การส่งต่อนี้อยู่ในคิว "ต้องใช้ ผอ." ของหน้าส่งต่อ */
export const inRefQueue = (r: RefCase, now: number, by: string) =>
  r.stage !== 'draft' && r.bucket !== 'done' && refNeedsDirector(r, now) && !refHandled(r, { by, now })
