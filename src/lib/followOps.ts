// ─────────────────────────────────────────────────────────────
// ติดตามการช่วยเหลือ — ศูนย์ติดตามงานของครู
//
// "ครูไม่ควรเปิดระบบเพื่อเช็กว่าเคสอยู่สถานะอะไร แต่ต้องเปิดแล้วรู้ทันทีว่า
//  ควรทำอะไรต่อ"
//
// เด็กหนึ่งคน = เคสหนึ่งเคส ที่นี่รวมทุกอย่างที่รู้เกี่ยวกับเด็กคนนั้น (ระเบียน
// + บันทึกของครู + นัดติดตาม + แผน + การส่งต่อ) แล้วตอบห้าข้อ:
//   ทำไมต้องดู (reasons) · สำคัญแค่ไหน (attn / health) · ทำอะไรต่อ (next)
//   · AI สรุปว่าอะไร (summary) · ที่ผ่านมาเกิดอะไร (timeline)
// หน้าจอแค่แสดงผล — ห้ามตัดสินใจซ้ำในหน้าจอ
// ─────────────────────────────────────────────────────────────
import type { CaseRecord, CaseStage, RiskLevel, Student } from '@/types'
import { closability, needsAgency } from './recommend'
import { riskLevel } from './risk'
import { FOLLOW_UP_SLA_DAYS } from './teacherOps'
import { crossTimeline, type RefCase, type XItem } from './refOps'
import { isScheduleOnly, type CaseLogEntry } from './caseLog'

const D = 86400000

export const LEVEL_TH: Record<RiskLevel, string> = { critical: 'วิกฤต', high: 'สูง', watch: 'เฝ้าระวัง', normal: 'ปกติ' }

// ── สุขภาพของเคส ─────────────────────────────────────────────

export type Health = 'now' | 'stuck' | 'watch' | 'ok'
export const HEALTH_META: Record<Health, { icon: string; th: string; color: string }> = {
  now: { icon: '🔴', th: 'ต้องดำเนินการทันที', color: '#dc2626' },
  stuck: { icon: '🟠', th: 'เสี่ยงค้าง', color: '#ea580c' },
  watch: { icon: '🟡', th: 'ต้องติดตาม', color: '#ca8a04' },
  ok: { icon: '🟢', th: 'เดินหน้าปกติ', color: '#16a34a' },
}

// ── ทำไมต้องสนใจ (เรียงตามความสำคัญ) ──────────────────────────

export type Attn = 'critical' | 'sla' | 'rising' | 'due' | 'stale' | 'agency' | 'normal' | 'closing'
export const ATTN_META: Record<Attn, { th: string; rank: number }> = {
  critical: { th: 'วิกฤต — ต้องดำเนินการทันที', rank: 0 },
  sla: { th: 'เกิน SLA', rank: 1 },
  rising: { th: 'ความเสี่ยงเพิ่มขึ้น', rank: 2 },
  due: { th: 'ครบกำหนดวันนี้', rank: 3 },
  stale: { th: 'ไม่มีการอัปเดตนาน', rank: 4 },
  agency: { th: 'รอหน่วยงานภายนอก', rank: 5 },
  normal: { th: 'ติดตามตามปกติ', rank: 6 },
  closing: { th: 'ใกล้ปิดเคส', rank: 7 },
}

/** ไม่มีการอัปเดตกี่วันถึงเริ่มนับว่า "นาน" — ก่อนถึงเส้น SLA 7 วัน */
export const STALE_DAYS = 5

// ── ขั้นถัดไป ────────────────────────────────────────────────

export type NextKind =
  | 'contact' | 'visit' | 'logVisit' | 'reassess' | 'followUp' | 'refer' | 'agency' | 'plan' | 'close' | 'reopen'

/** สิ่งที่ปุ่มทำ — sheet ในหน้า หรือไปหน้าอื่นที่ทำเรื่องนั้นอยู่แล้ว */
export type Go =
  | { sheet: 'outcome'; mode: 'contact' | 'visit' | 'followUp' }
  | { sheet: 'schedule'; method?: string }
  | { sheet: 'close' | 'reopen' | 'escalate' }
  | { href: string }

export interface NextAction {
  kind: NextKind
  th: string
  whyTh: string
  cta: string
  go: Go
}

export const METHODS = ['โทรผู้ปกครอง', 'คุยกับนักเรียน', 'เยี่ยมบ้าน', 'ประชุมทีม', 'ติดตามหน่วยงาน', 'ประเมินซ้ำ'] as const

export interface FollowCase {
  s: Student
  record?: CaseRecord
  open: boolean
  updatedDaysAgo: number
  /** เกิน SLA กี่วัน (0 = ยังไม่เกิน) */
  slaOverDays: number
  sla: { level: 'breach' | 'near' | 'ok' | 'done'; text: string }
  riskDelta: number
  riskFrom: RiskLevel
  closable: boolean
  followUp?: { entry: CaseLogEntry; daysAway: number }
  refs: RefCase[]
  hasPlan: boolean
  attn: Attn
  health: Health
  reasons: string[]
  /** "ต้องดูวันนี้ เพราะ…" */
  because: string
  today: boolean
  doneToday: boolean
  next: NextAction
  secondary: { th: string; go: Go }[]
  escalated?: CaseLogEntry
  summary: { situation: string; risk: string; change: string; recommend: string }
  /** เคสปิดแล้วแต่ความเสี่ยงกลับมา */
  relapse: boolean
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysSince = (isoDate: string, today: Date) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((t0 - Date.UTC(y, (m ?? 1) - 1, d ?? 1)) / D)
}
const att = (s: Student) => Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)
const fmtDate = (isoDate: string) => {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${d} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][(m ?? 1) - 1]}`
}

export function buildFollowCase(input: {
  s: Student
  record?: CaseRecord
  entries: CaseLogEntry[]
  /** วันล่าสุดที่ครูลงมือกับเด็กคนนี้ (บันทึก/ติ๊กขั้นในแผน) */
  lastLogged?: string
  refs: RefCase[]
  hasPlan: boolean
  today?: Date
}): FollowCase {
  const { s, record, entries, refs, hasPlan } = input
  const today = input.today ?? new Date()
  const todayIso = iso(today)
  const open = s.caseStage !== 'resolved' && s.caseStage !== 'returned'

  // ── อัปเดตล่าสุด + SLA ── เหมือน teacherOps: บันทึกแล้วเริ่มนับใหม่
  const updatedDaysAgo = input.lastLogged ? Math.max(0, daysSince(input.lastLogged, today)) : record?.openedDaysAgo ?? 0
  const breached = input.lastLogged ? updatedDaysAgo > FOLLOW_UP_SLA_DAYS : Boolean(record?.slaBreached)
  const slaOverDays = breached ? Math.max(1, updatedDaysAgo - FOLLOW_UP_SLA_DAYS) : 0
  const left = FOLLOW_UP_SLA_DAYS - updatedDaysAgo

  // ── นัดที่ยังไม่ได้ทำ (เร็วสุดก่อน) ──
  const fus = entries
    .filter((e) => e.followUpDate && !e.followUpDone)
    .map((entry) => ({ entry, daysAway: -daysSince(entry.followUpDate!, today) }))
    .sort((a, b) => a.daysAway - b.daysAway)
  const fu = fus[0]

  const sla: FollowCase['sla'] = !open
    ? { level: 'done', text: 'ปิดเคสแล้ว' }
    : breached
      ? { level: 'breach', text: `เกิน SLA ${slaOverDays} วัน` }
      : fu && fu.daysAway <= 0
        ? { level: 'near', text: fu.daysAway === 0 ? 'ครบกำหนดนัดวันนี้' : `เลยวันนัด ${-fu.daysAway} วัน` }
        : left <= 1
          ? { level: 'near', text: left <= 0 ? 'ครบกำหนดติดตามวันนี้' : 'ครบกำหนดติดตามพรุ่งนี้' }
          : { level: 'ok', text: `ต้องติดตามภายใน ${left} วัน` }

  // ── ความเสี่ยงเปลี่ยนไปอย่างไร ──
  const first = s.riskHistory[0]?.score ?? s.riskScore
  const riskDelta = s.riskScore - first
  const riskFrom = riskLevel(first)
  const rising = riskDelta >= 5
  const closable = open && closability(s).ready

  // ── การส่งต่อ ──
  const live = refs.filter((r) => r.bucket !== 'done')
  const refLate = live.find((r) => r.bucket === 'breach')
  const refMine = live.find((r) => ['returned', 'review', 'needInfo', 'consent'].includes(r.bucket))
  const refWait = live.find((r) => ['near', 'awaiting', 'inProgress'].includes(r.bucket))

  const followDue = fu && fu.daysAway <= 0
  const stale = updatedDaysAgo >= STALE_DAYS
  const doneToday = input.lastLogged === todayIso
  const escalated = entries.find((e) => e.escalation)

  // ── ทำไมต้องดู ──
  const reasons: string[] = []
  if (open) {
    if (s.riskLevel === 'critical') reasons.push(`ความเสี่ยงระดับวิกฤต ${s.riskScore}/100`)
    if (breached) reasons.push(`เกิน SLA ${slaOverDays} วัน — ไม่มีการอัปเดต ${updatedDaysAgo} วัน`)
    if (refLate) reasons.push(`${refLate.toName} ${refLate.sla.text}`)
    if (rising) reasons.push(`ความเสี่ยงเพิ่มขึ้น ${riskDelta} คะแนนใน 8 สัปดาห์`)
    if (followDue) reasons.push(fu!.daysAway === 0 ? 'ครบกำหนดนัดติดตามวันนี้' : `เลยวันนัดติดตาม ${-fu!.daysAway} วัน`)
    if (refMine) reasons.push(refMine.next.th)
    if (!breached && stale) reasons.push(`ไม่มีการอัปเดต ${updatedDaysAgo} วัน`)
    if (s.absenceStreak >= 3) reasons.push(`ขาดเรียนต่อเนื่อง ${s.absenceStreak} วัน`)
    if (s.parentContact === 'unreachable') reasons.push('ยังติดต่อผู้ปกครองไม่ได้')
    if (s.parentContact === 'delayed') reasons.push('ผู้ปกครองยังไม่ตอบกลับ')
    if (refWait) reasons.push(`รอ ${refWait.toName} — ${refWait.sla.text}`)
    if (closable) reasons.push('ผลดีขึ้นจนเข้าเกณฑ์ประเมินเพื่อปิดเคส')
  }
  const relapse = !open && (rising || s.riskLevel === 'high' || s.riskLevel === 'critical')
  if (relapse) reasons.push(`ปิดเคสแล้ว แต่ความเสี่ยงกลับมาที่ ${s.riskScore}/100`)

  // ── ระดับความสำคัญ ──
  const attn: Attn = !open
    ? 'normal'
    : s.riskLevel === 'critical' && !closable
      ? 'critical'
      : breached || refLate
        ? 'sla'
        : rising
          ? 'rising'
          : followDue || refMine
            ? 'due'
            : stale
              ? 'stale'
              : refWait
                ? 'agency'
                : closable
                  ? 'closing'
                  : 'normal'

  const high = s.riskLevel === 'high' || s.riskLevel === 'critical'
  const health: Health = !open
    ? relapse
      ? 'watch'
      : 'ok'
    : attn === 'critical' || ((breached || refLate) && high)
      ? 'now'
      : breached || refLate || stale || refMine || !s.caseOwner
        ? 'stuck'
        : rising || followDue || high
          ? 'watch'
          : 'ok'

  // ── ขั้นถัดไป — ปุ่มเดียวที่ชัดที่สุด ──
  // การลงมือครั้งล่าสุดกับเด็ก ไม่ใช่งานเอกสาร (นัด / Escalate)
  const last = entries.find((e) => !isScheduleOnly(e))
  const failedContact = entries.find((e) => e.mode === 'contact')?.outcome
  const next: NextAction = (() => {
    if (!open)
      return relapse
        ? { kind: 'reopen', th: 'พิจารณาเปิดเคสอีกครั้ง', whyTh: `ความเสี่ยงกลับมาที่ระดับ${LEVEL_TH[s.riskLevel]} (${s.riskScore}/100)`, cta: 'เปิดเคสอีกครั้ง', go: { sheet: 'reopen' } }
        : { kind: 'followUp', th: 'ปิดเคสแล้ว — ติดตามห่าง ๆ', whyTh: 'ความเสี่ยงยังอยู่ในระดับที่ปลอดภัย', cta: 'บันทึกผลติดตาม', go: { sheet: 'outcome', mode: 'followUp' } }
    if (refMine) return { kind: 'agency', th: refMine.next.th, whyTh: refMine.next.whyTh || `การส่งต่อไป ${refMine.toName}`, cta: 'ดูการส่งต่อ', go: { href: `/referral?ref=${refMine.id}` } }
    if (refLate) return { kind: 'agency', th: `ติดตามสถานะกับ ${refLate.toName}`, whyTh: `ส่งต่อไปแล้วแต่หน่วยงานยังไม่ตอบรับ · ${refLate.sla.text}`, cta: 'ติดตามหน่วยงาน', go: { href: `/referral?ref=${refLate.id}` } }
    // นัดเยี่ยมบ้านไว้แล้ว — ถึงวันก็บันทึกผล ยังไม่ถึงก็ไม่ต้องให้นัดซ้ำ
    // ดูทุกนัด ไม่ใช่แค่นัดแรก — นัดโทรกับนัดเยี่ยมบ้านวันเดียวกันต้องเห็นทั้งคู่
    const visitBooked = fus.find((f) => f.entry.followUpMethod === 'เยี่ยมบ้าน')
    if (visitBooked && visitBooked.daysAway <= 0)
      return { kind: 'logVisit', th: 'บันทึกผลการเยี่ยมบ้านตามนัด', whyTh: `นัดไว้วันที่ ${fmtDate(visitBooked.entry.followUpDate!)}`, cta: 'บันทึกผลเยี่ยมบ้าน', go: { sheet: 'outcome', mode: 'visit' } }
    if (s.parentContact !== 'ok' && visitBooked)
      return { kind: 'followUp', th: `รอเยี่ยมบ้านตามนัด ${fmtDate(visitBooked.entry.followUpDate!)}${visitBooked.entry.followUpTime ? ` ${visitBooked.entry.followUpTime}` : ''}`, whyTh: 'ติดต่อทางโทรศัพท์ไม่ได้ จึงนัดไปพบที่บ้าน — ระหว่างนี้ลองช่องทางอื่นได้', cta: 'บันทึกการติดต่อ', go: { sheet: 'outcome', mode: 'contact' } }
    if (s.parentContact !== 'ok') {
      // โทรไม่ติดแล้วครั้งหนึ่ง — ขั้นถัดไปคือไปหาที่บ้าน ไม่ใช่โทรซ้ำ
      if ((failedContact === 'noAnswer' || failedContact === 'wrongNumber') && !s.homeVisited)
        return { kind: 'visit', th: 'นัดเยี่ยมบ้าน', whyTh: 'ติดต่อทางโทรศัพท์ไม่ได้แล้ว ต้องไปพบครอบครัวที่บ้าน', cta: 'นัดเยี่ยมบ้าน', go: { sheet: 'schedule', method: 'เยี่ยมบ้าน' } }
      return {
        kind: 'contact',
        th: 'ติดต่อผู้ปกครองภายในวันนี้',
        whyTh: `${s.absenceStreak >= 2 ? `นักเรียนขาดเรียน ${s.absenceStreak} วันต่อเนื่อง และ` : ''}${s.parentContact === 'delayed' ? 'ผู้ปกครองยังไม่ตอบกลับ' : 'ยังติดต่อครอบครัวไม่ได้'}`,
        cta: 'บันทึกการติดต่อ',
        go: { sheet: 'outcome', mode: 'contact' },
      }
    }
    if (high && !s.homeVisited) {
      if (!visitBooked)
        return { kind: 'visit', th: 'นัดเยี่ยมบ้าน', whyTh: `ความเสี่ยงระดับ${LEVEL_TH[s.riskLevel]} และยังไม่เคยเยี่ยมบ้าน`, cta: 'นัดเยี่ยมบ้าน', go: { sheet: 'schedule', method: 'เยี่ยมบ้าน' } }
    }
    // ดีขึ้นแล้วแต่ยังมีการส่งต่อเปิดอยู่ — ปิดเคสไม่ได้จนกว่าการส่งต่อจะจบ อย่าเสนอปุ่มที่กดแล้วติด
    if (closable && live.length)
      return { kind: 'agency', th: `ดีขึ้นจนเกือบปิดได้ — รอผลจาก ${live[0].toName} ก่อน`, whyTh: `${live[0].next.th} · ปิดเคสได้เมื่อการส่งต่อจบ`, cta: 'ดูการส่งต่อ', go: { href: `/referral?ref=${live[0].id}` } }
    if (closable) return { kind: 'close', th: 'เคสนี้อาจพร้อมปิด', whyTh: closability(s).metTh.slice(0, 2).join(' · '), cta: 'ประเมินเพื่อปิดเคส', go: { sheet: 'close' } }
    if (high && needsAgency(s) && !live.length)
      return { kind: 'refer', th: 'ส่งต่อหน่วยงาน', whyTh: 'สาเหตุของเด็กคนนี้อยู่นอกอำนาจโรงเรียน ต้องให้หน่วยงานรับผิดชอบช่วย', cta: 'ส่งต่อหน่วยงาน', go: { href: `/referral?child=${s.id}` } }
    if (high && !hasPlan) return { kind: 'plan', th: 'สร้างแผนช่วยเหลือ', whyTh: 'เสี่ยงสูงแต่ยังไม่มีแผน — ยังไม่มีใครรู้ว่าใครต้องทำอะไรเมื่อไร', cta: 'สร้างแผนช่วยเหลือ', go: { href: `/plan?child=${s.id}` } }
    if (rising) return { kind: 'reassess', th: 'ประเมินความเสี่ยงอีกครั้ง', whyTh: `คะแนนเพิ่มจาก ${first} เป็น ${s.riskScore} — คุยกับนักเรียนว่ามีอะไรเปลี่ยน`, cta: 'บันทึกผลประเมิน', go: { sheet: 'outcome', mode: 'followUp' } }
    if (fu) return { kind: 'followUp', th: `ติดตามตามนัด: ${fu.entry.followUpMethod ?? 'ติดตามผล'}`, whyTh: fu.daysAway <= 0 ? 'ถึงวันนัดแล้ว' : `นัดไว้อีก ${fu.daysAway} วัน`, cta: 'บันทึกผลติดตาม', go: { sheet: 'outcome', mode: 'followUp' } }
    return { kind: 'followUp', th: 'ติดตามผลตามรอบ', whyTh: sla.text, cta: 'บันทึกผลติดตาม', go: { sheet: 'outcome', mode: 'followUp' } }
  })()

  const secondary: FollowCase['secondary'] = []
  // ครูอาจรู้ปัญหาใหม่ก่อนคะแนนจะขยับ — เปิดเคสที่ปิดแล้วได้เสมอ ประวัติเดิมยังอยู่
  if (!open && !relapse) secondary.push({ th: 'เปิดเคสอีกครั้ง', go: { sheet: 'reopen' } })
  if (open && (breached || stale || refLate)) secondary.push({ th: 'Escalate', go: { sheet: 'escalate' } })
  if (open && next.go && !('sheet' in next.go && next.go.sheet === 'schedule')) secondary.push({ th: 'นัดติดตาม', go: { sheet: 'schedule' } })
  if (open && needsAgency(s) && next.kind !== 'refer' && next.kind !== 'agency') secondary.push({ th: 'ส่งต่อหน่วยงาน', go: { href: `/referral?child=${s.id}` } })

  // ── AI สรุป 4 ช่อง — สั้น ไม่ใช่ย่อหน้า ──
  const lastNote = last?.note ?? s.timeline[s.timeline.length - 1]?.note
  const summary: FollowCase['summary'] = {
    situation: open
      ? `${updatedDaysAgo === 0 ? 'อัปเดตวันนี้' : `ไม่มีการอัปเดตมา ${updatedDaysAgo} วัน`}${lastNote ? ` · ล่าสุด: ${lastNote}` : ''}`
      : `ปิดเคสแล้ว${lastNote ? ` · ล่าสุด: ${lastNote}` : ''}`,
    risk:
      s.absenceStreak >= 3
        ? `ขาดเรียนต่อเนื่อง ${s.absenceStreak} วัน · มาเรียน ${att(s)}%`
        : s.parentContact !== 'ok'
          ? `ยังติดต่อผู้ปกครองไม่ได้ · มาเรียน ${att(s)}%`
          : `ระดับ${LEVEL_TH[s.riskLevel]} ${s.riskScore}/100 · มาเรียน ${att(s)}%`,
    change:
      riskFrom !== s.riskLevel
        ? `ความเสี่ยง${riskDelta > 0 ? 'เพิ่ม' : 'ลด'}จาก "${LEVEL_TH[riskFrom]}" เป็น "${LEVEL_TH[s.riskLevel]}" (${riskDelta > 0 ? '+' : ''}${riskDelta})`
        : Math.abs(riskDelta) >= 5
          ? `คะแนน${riskDelta > 0 ? 'เพิ่ม' : 'ลด'} ${Math.abs(riskDelta)} แต่ยังอยู่ระดับ${LEVEL_TH[s.riskLevel]}`
          : `ทรงตัวที่ระดับ${LEVEL_TH[s.riskLevel]} ใน 8 สัปดาห์`,
    recommend:
      next.kind === 'contact'
        ? 'ติดตามผู้ปกครองอีกครั้งภายในวันนี้ หากยังติดต่อไม่ได้ ให้พิจารณาเยี่ยมบ้านหรือส่งต่อทีมที่เกี่ยวข้อง'
        : next.th,
  }

  const today_ = open && attn !== 'normal' && attn !== 'agency' && !doneToday
  return {
    s,
    record,
    open,
    updatedDaysAgo,
    slaOverDays,
    sla,
    riskDelta,
    riskFrom,
    closable,
    followUp: fu,
    refs,
    hasPlan,
    attn,
    health,
    reasons,
    because: reasons[0] ? `ต้องดูวันนี้ เพราะ${reasons[0]}` : sla.text,
    today: today_ || relapse,
    doneToday,
    next,
    secondary: secondary.slice(0, 2),
    escalated,
    summary,
    relapse,
  }
}

export const sortFollow = (cs: FollowCase[]) =>
  [...cs].sort(
    (a, b) =>
      Number(b.today) - Number(a.today) ||
      ATTN_META[a.attn].rank - ATTN_META[b.attn].rank ||
      b.slaOverDays - a.slaOverDays ||
      b.s.riskScore - a.s.riskScore,
  )

// ── ตัวกรองด่วน ──────────────────────────────────────────────

export type QuickFilter = 'today' | 'sla' | 'high' | 'stale' | 'parent' | 'agency' | 'closing' | 'all'
export const FILTERS: { k: QuickFilter; th: string; test: (c: FollowCase) => boolean }[] = [
  { k: 'today', th: 'วันนี้', test: (c) => c.today },
  { k: 'sla', th: 'เกิน SLA', test: (c) => c.open && (c.sla.level === 'breach' || c.refs.some((r) => r.bucket === 'breach')) },
  { k: 'high', th: 'เสี่ยงสูง', test: (c) => c.open && (c.s.riskLevel === 'high' || c.s.riskLevel === 'critical') },
  { k: 'stale', th: 'ไม่มีการอัปเดต', test: (c) => c.open && c.updatedDaysAgo >= STALE_DAYS },
  { k: 'parent', th: 'รอผู้ปกครอง', test: (c) => c.open && c.s.parentContact !== 'ok' },
  { k: 'agency', th: 'รอหน่วยงาน', test: (c) => c.open && c.refs.some((r) => ['breach', 'near', 'awaiting', 'inProgress', 'needInfo'].includes(r.bucket)) },
  { k: 'closing', th: 'ใกล้ปิดเคส', test: (c) => c.closable },
  { k: 'all', th: 'เคสของฉันทั้งหมด', test: (c) => c.open },
]

/** "เคสที่ค้างส่วนใหญ่ติดที่…" — ข้อสังเกตเดียวจากงานวันนี้ทั้งหมด */
export function insightOf(today: FollowCase[]): string {
  if (!today.length) return 'เยี่ยมมาก วันนี้ไม่มีเคสเร่งด่วน'
  const by = new Map<NextKind, number>()
  for (const c of today) by.set(c.next.kind, (by.get(c.next.kind) ?? 0) + 1)
  const [k, n] = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
  const what: Record<NextKind, string> = {
    contact: 'การติดต่อผู้ปกครอง',
    visit: 'การเยี่ยมบ้านที่ยังไม่ได้นัด',
    logVisit: 'การบันทึกผลเยี่ยมบ้าน',
    reassess: 'ความเสี่ยงที่เพิ่มขึ้นและต้องประเมินใหม่',
    followUp: 'การติดตามผลตามรอบ',
    refer: 'ปัญหาที่ต้องส่งต่อหน่วยงาน',
    agency: 'การรอหน่วยงานภายนอก',
    plan: 'เด็กเสี่ยงสูงที่ยังไม่มีแผน',
    close: 'เคสที่ดีขึ้นแล้วรอประเมินปิด',
    reopen: 'เคสที่ปิดแล้วแต่ความเสี่ยงกลับมา',
  }
  return n >= 2 ? `${n} ใน ${today.length} เคสวันนี้ติดที่${what[k]} — เริ่มจากตรงนี้จะเคลียร์ได้มากที่สุด` : `งานวันนี้กระจายกัน เริ่มจากเคสบนสุดซึ่งสำคัญที่สุด`
}

// ── Timeline ของเคส ─────────────────────────────────────────

/** ประวัติการช่วยเหลือจริง (ไม่ใช่ขั้นของ pipeline) — บันทึกครู + ระเบียน +
 *  การส่งต่อ + จุดที่ระดับความเสี่ยงเปลี่ยน */
export function caseTimeline(c: FollowCase, entries: CaseLogEntry[], now = Date.now()): XItem[] {
  const out = crossTimeline(c.refs, entries, c.s)
  const h = c.s.riskHistory
  for (let i = 1; i < h.length; i++) {
    const a = riskLevel(h[i - 1].score)
    const b = riskLevel(h[i].score)
    if (a === b) continue
    // series เป็นรายสัปดาห์ จุดสุดท้ายคือสัปดาห์นี้
    const ts = now - (h.length - 1 - i) * 7 * D
    out.push({ ts, th: `ความเสี่ยง${h[i].score > h[i - 1].score ? 'เพิ่มขึ้น' : 'ลดลง'}จาก${LEVEL_TH[a]}เป็น${LEVEL_TH[b]} (${h[i].score}/100)`, by: 'ระบบ', who: 'system' })
  }
  return out.sort((x, y) => y.ts - x.ts)
}

export const PIPELINE: CaseStage[] = ['alerted', 'accepted', 'inProgress', 'homeVisit', 'referred', 'planned', 'returned', 'resolved']
