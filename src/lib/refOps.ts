// ─────────────────────────────────────────────────────────────
// การส่งต่อหนึ่งรายการ — ตอนนี้อยู่ที่ไหน ใครรับผิดชอบ เกินกำหนดไหม ต้องทำอะไรต่อ
//
// "การส่งต่อไม่ใช่การโยนเคส แต่คือการส่งมอบความรับผิดชอบแบบติดตามได้"
//
// ข้อมูลตั้งต้นมีแค่สถานะหยาบ ๆ (sent/accepted/inProgress/...) กับจำนวนวันที่
// เปิดมา ที่นี่ขยายเป็นลำดับเหตุการณ์พร้อมเวลา (ส่ง → รับเรื่อง
// → ดำเนินการ → เสร็จ → ได้ผล → ปิด) แบบ deterministic จาก id แล้วต่อด้วย
// เหตุการณ์ที่ครูบันทึกจริงใน caseLog หน้าจอทุกหน้าอ่านจากที่นี่ที่เดียว
// ─────────────────────────────────────────────────────────────
import type { Agency, Referral, ReferralNeed, Student } from '@/types'
import { AGENCY_BY_ID } from '@/data/agencies'
import { NEED_LABEL, NEED_SLA } from '@/data/referrals'
import { reasonFor } from '@/data/dropReasons'
import { hashSeed, makeRng, pick } from './format'
import type {
  CaseLogEntry,
  ConsentRecord,
  HandoffType,
  LocalReferral,
  OutcomeKey,
  RefEvent,
  RefEventType,
  RefVia,
} from './caseLog'

const H = 3600_000
const D = 24 * H

// ── ขั้น ─────────────────────────────────────────────────────

export type RefStage =
  | 'draft' | 'sent' | 'received' | 'viewed' | 'accepted' | 'inProgress'
  | 'needInfo' | 'done' | 'outcome' | 'closed' | 'returned'

/**
 * ขั้นที่แสดงบนแถบความคืบหน้า — โหมดภายใน: ยังไม่ต่อระบบของหน่วยงานปลายทาง
 * ครูเป็นคนบันทึกว่าแต่ละขั้นเกิดขึ้นแล้ว (โทรถาม/ได้หนังสือ/พบตัว) จึงเหลือ 5 ขั้นที่ครูรู้ได้จริง
 * ไม่มี "ระบบได้รับ/เจ้าหน้าที่เปิดดู" ซึ่งต้องรอสัญญาณจากระบบปลายทาง
 * needInfo/returned เป็นทางแยก ไม่อยู่ในแถบ
 */
/** `short` ใช้บนแถบขั้น — 5 คอลัมน์บนจอมือถือกว้างช่องละ ~65px ชื่อเต็มจะตกบรรทัด */
export const ACK_STEPS: { stage: RefStage; th: string; short: string; evs: RefEventType[] }[] = [
  { stage: 'sent', th: 'ส่งเรื่อง', short: 'ส่งเรื่อง', evs: ['sent', 'reassigned'] },
  { stage: 'accepted', th: 'หน่วยงานรับเรื่อง', short: 'รับเรื่อง', evs: ['accepted'] },
  { stage: 'inProgress', th: 'ดำเนินการ', short: 'ดำเนินการ', evs: ['started', 'infoSent'] },
  { stage: 'outcome', th: 'ได้ผลแล้ว', short: 'ได้ผล', evs: ['outcome'] },
  { stage: 'closed', th: 'ปิดการส่งต่อ', short: 'ปิดเรื่อง', evs: ['closed'] },
]

/** ขั้นบนแถบที่ผ่านมาแล้วล่าสุด (-1 = ยังไม่ส่ง) — ครูข้ามขั้นได้ เช่น โทรไปแล้วได้ผลเลย */
export function ackIndex(stage: RefStage): number {
  switch (stage) {
    case 'draft': return -1
    case 'sent': case 'received': case 'viewed': case 'returned': return 0
    case 'accepted': return 1
    case 'inProgress': case 'needInfo': return 2
    case 'done': case 'outcome': return 3
    case 'closed': return 4
  }
}

export const VIA_TH: Record<RefVia, string> = {
  phone: 'โทรศัพท์',
  letter: 'หนังสือ',
  inPerson: 'พบตัว',
  line: 'LINE',
}

export const STAGE_TH: Record<RefStage, string> = {
  draft: 'รอความยินยอม',
  sent: 'ส่งเรื่องแล้ว รอหน่วยงานรับ',
  received: 'ส่งเรื่องแล้ว รอหน่วยงานรับ',
  viewed: 'ส่งเรื่องแล้ว รอหน่วยงานรับ',
  accepted: 'หน่วยงานรับเรื่องแล้ว',
  inProgress: 'กำลังดำเนินการ',
  needInfo: 'รอข้อมูลเพิ่มเติม',
  done: 'ดำเนินการเสร็จแล้ว',
  outcome: 'ได้ผลแล้ว',
  closed: 'ปิดการส่งต่อแล้ว',
  returned: 'ปลายทางไม่รับเรื่อง',
}

const STAGE_OF: Partial<Record<RefEventType, RefStage>> = {
  sent: 'sent', received: 'received', viewed: 'viewed', accepted: 'accepted',
  started: 'inProgress', needInfo: 'needInfo', infoSent: 'inProgress',
  done: 'done', outcome: 'outcome', closed: 'closed', returned: 'returned',
  reassigned: 'sent',
}

export const OUTCOME: Record<OutcomeKey, { th: string; ok: 'ok' | 'warn' | 'no' }> = {
  granted: { th: 'ได้รับทุน/เงินสงเคราะห์แล้ว', ok: 'ok' },
  treated: { th: 'เข้ารับการรักษาแล้ว', ok: 'ok' },
  visited: { th: 'เยี่ยมบ้านแล้ว', ok: 'ok' },
  documented: { th: 'เอกสารเรียบร้อยแล้ว', ok: 'ok' },
  followUp: { th: 'ดำเนินการบางส่วน ต้องติดตามต่อ', ok: 'warn' },
  failed: { th: 'ไม่สามารถดำเนินการได้', ok: 'no' },
}

export const NEED_OUTCOME: Record<ReferralNeed, OutcomeKey> = {
  financial: 'granted', mentalHealth: 'treated', physicalHealth: 'treated', protection: 'visited',
  housing: 'visited', transport: 'granted', documents: 'documented', skills: 'followUp',
  jobPlacement: 'followUp', childcare: 'visited',
}

const OFFICERS = ['คุณอามีนะห์ ส.', 'คุณรุสลัน ด.', 'คุณซูไฮลา ม.', 'คุณสมศักดิ์ ท.', 'คุณนูรีดา ย.', 'คุณอับดุลเลาะ ก.']

// ── SLA ─────────────────────────────────────────────────────

/** ปลายทางต้องรับเคสภายในกี่ชั่วโมง — คุ้มครองเด็กหรือเคสเร่งด่วนเร็วกว่า */
export const acceptSlaHours = (need: ReferralNeed, urgent: boolean) =>
  need === 'protection' ? 8 : urgent ? 12 : 24

export type SlaLevel = 'breach' | 'near' | 'ok' | 'done' | 'paused'

export interface Sla {
  clock: 'accept' | 'service' | 'none'
  /** ชั่วโมงที่เหลือ ติดลบ = เกินมาแล้ว */
  hoursLeft: number
  level: SlaLevel
  /** ข้อความประกอบเสมอ — ห้ามใช้สีอย่างเดียว */
  text: string
  /** กติกา เช่น "ต้องรับเคสภายใน 24 ชั่วโมง" */
  rule: string
}

const fmtHours = (h: number) => {
  const a = Math.abs(Math.round(h))
  if (a < 48) return `${a} ชั่วโมง`
  const d = Math.floor(a / 24)
  const r = a % 24
  return r ? `${d} วัน ${r} ชม.` : `${d} วัน`
}

export const fmtTs = (ts: number) => {
  const d = new Date(ts)
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][d.getMonth()]
  return `${d.getDate()} ${m} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── ความยินยอม ─────────────────────────────────────────────

export type ConsentState = 'granted' | 'expiring' | 'pending' | 'none'

export const CONSENT_META: Record<ConsentState, { icon: string; th: string; color: string }> = {
  granted: { icon: '✓', th: 'ยินยอมแล้ว', color: '#16a34a' },
  expiring: { icon: '⏳', th: 'ใกล้หมดอายุ', color: '#ea580c' },
  pending: { icon: '⚠', th: 'กำลังรอ', color: '#ca8a04' },
  none: { icon: '✕', th: 'ยังไม่ได้ยินยอม', color: '#dc2626' },
}

export const SCOPE_OPTIONS = [
  { key: 'basic', th: 'ข้อมูลพื้นฐานนักเรียน (ชื่อ ชั้น โรงเรียน)' },
  { key: 'summary', th: 'สรุปปัญหาและเหตุผลที่ส่งต่อ' },
  { key: 'history', th: 'ประวัติการช่วยเหลือ' },
  { key: 'family', th: 'ข้อมูลครอบครัวและรายได้' },
  { key: 'health', th: 'ข้อมูลสุขภาพ' },
] as const

export interface ConsentView {
  state: ConsentState
  record?: ConsentRecord
  daysLeft?: number
}

const isoAdd = (iso: string, days: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ความยินยอมของเด็กคนหนึ่ง — บันทึกของครูก่อน ไม่มีค่อยใช้ข้อมูลตั้งต้น
 *  ข้อมูลตั้งต้นมีแค่สถานะ จึงขยายเป็นบันทึกเต็มแบบ deterministic */
export function consentOf(
  childId: string,
  seeded: Referral['consent'] | undefined,
  student: Student | undefined,
  logged: ConsentRecord | undefined,
  now = Date.now(),
): ConsentView {
  const rec: ConsentRecord | undefined =
    logged ??
    (seeded === 'granted'
      ? (() => {
          const rng = makeRng(hashSeed(`consent::${childId}`))
          const signedDaysAgo = Math.floor(rng() * 340) + 5
          const date = new Date(now - signedDaysAgo * D).toISOString().slice(0, 10)
          return {
            status: 'granted',
            method: pick(rng, ['ลงนามในแบบฟอร์มยินยอม', 'ลงนามในแบบฟอร์มยินยอม', 'ยินยอมด้วยวาจาต่อหน้าพยาน (มีบันทึก)']),
            date,
            giver: student?.master.parentRelationName ? `${student.master.parentRelationName}ของเด็ก` : 'ผู้ปกครอง',
            relation: student?.master.parentRelationName ?? 'ผู้ปกครอง',
            scope: SCOPE_OPTIONS.map((o) => o.key),
            agencies: 'any',
            purpose: 'เพื่อการช่วยเหลือให้เด็กได้เรียนต่อ',
            expires: isoAdd(date, 365),
            evidence: 'แบบฟอร์มเก็บที่ห้องแนะแนว',
            ts: now - signedDaysAgo * D,
          } as ConsentRecord
        })()
      : seeded === 'pending'
        ? undefined
        : undefined)
  if (!rec || rec.status === 'declined') return { state: seeded === 'pending' && !logged ? 'pending' : 'none', record: rec }
  if (rec.status === 'pending') return { state: 'pending', record: rec }
  const daysLeft = Math.round((new Date(rec.expires).getTime() - now) / D)
  if (daysLeft < 0) return { state: 'none', record: rec, daysLeft }
  return { state: daysLeft <= 30 ? 'expiring' : 'granted', record: rec, daysLeft }
}

// ── การส่งต่อหนึ่งรายการ ────────────────────────────────────

export type Bucket = 'breach' | 'near' | 'returned' | 'review' | 'consent' | 'awaiting' | 'needInfo' | 'inProgress' | 'done'

/** ลำดับตาม brief: เกิน SLA → ใกล้เกิน → รอรับเรื่อง → รอข้อมูล → กำลังทำ → เสร็จ
 *  เพิ่มสองกลุ่มที่ลูกบอลกลับมาอยู่ที่ครู (ถูกส่งกลับ · ส่งผลกลับรอประเมิน) ไว้ต่อจาก SLA
 *  เพราะถ้าครูไม่ทำอะไร เรื่องจะค้างโดยไม่มีนาฬิกาเตือน */
export const BUCKET_META: Record<Bucket, { th: string; color: string; rank: number }> = {
  breach: { th: 'เกิน SLA', color: '#dc2626', rank: 0 },
  near: { th: 'ใกล้เกิน SLA', color: '#ea580c', rank: 1 },
  returned: { th: 'ถูกส่งกลับ', color: '#be123c', rank: 2 },
  review: { th: 'ได้ผลแล้ว รอคุณประเมิน', color: '#0d9488', rank: 3 },
  consent: { th: 'รอความยินยอม', color: '#ca8a04', rank: 4 },
  awaiting: { th: 'รอหน่วยงานรับเรื่อง', color: '#2f66f6', rank: 5 },
  needInfo: { th: 'หน่วยงานขอข้อมูลเพิ่ม', color: '#7c3aed', rank: 6 },
  inProgress: { th: 'กำลังดำเนินการ', color: '#0891b2', rank: 7 },
  done: { th: 'เสร็จแล้ว', color: '#16a34a', rank: 8 },
}

export type QuickAction =
  | 'consent' | 'update' | 'contact' | 'escalate' | 'reassign' | 'followUp'
  | 'sendInfo' | 'review' | 'close' | 'referMore'

export const ACTION_TH: Record<QuickAction, string> = {
  consent: 'บันทึกความยินยอม',
  update: 'อัปเดตความคืบหน้า',
  contact: 'ติดต่อเจ้าหน้าที่',
  escalate: 'Escalate',
  reassign: 'เปลี่ยนหน่วยงาน',
  followUp: 'นัดติดตาม',
  sendInfo: 'ส่งข้อมูลเพิ่มเติม',
  review: 'ประเมินผล',
  close: 'ปิดการส่งต่อ',
  referMore: 'ส่งต่อหน่วยงานอื่น',
}

export interface RefCase {
  id: string
  childId: string
  childName: string
  provinceKey: string
  need: ReferralNeed
  needTh: string
  reason: string
  reasonCode?: number
  fromName: string
  toAgencyId: string
  toName: string
  toAgency?: Agency
  handoff: HandoffType
  caseOwner: string
  referralOwner: string
  officer?: string
  urgent: boolean
  events: RefEvent[]
  stage: RefStage
  sentTs?: number
  acceptedTs?: number
  sla: Sla
  /** 0 ปกติ · 1 เกิน SLA แจ้งเตือน · 2 ค้างเกิน 48 ชม. หัวหน้าหน่วยงาน · 3 ค้างเกิน 72 ชม. เปลี่ยนหน่วยงาน */
  escalation: 0 | 1 | 2 | 3
  /** ยกระดับไปแล้วถึงระดับไหน */
  escalated: 0 | 1 | 2 | 3
  bucket: Bucket
  next: { th: string; whyTh: string; actions: QuickAction[] }
  outcome?: { key: OutcomeKey; th: string; ok: 'ok' | 'warn' | 'no'; note?: string; reviewed: boolean }
  consent: ConsentView
  share: string[]
  local: boolean
}

/** ขยายสถานะหยาบของข้อมูลตั้งต้นเป็นลำดับเหตุการณ์พร้อมเวลา */
function seededEvents(r: Referral, now: number): RefEvent[] {
  if (r.status === 'draft') return []
  const rng = makeRng(hashSeed(`refev::${r.id}`))
  const sentTs = now - r.openedDaysAgo * D - Math.floor(rng() * 20) * H - Math.floor(rng() * 50) * 60_000
  const agency = AGENCY_BY_ID[r.toAgencyId]?.th ?? 'หน่วยงานปลายทาง'
  const out: RefEvent[] = [
    { type: 'sent', ts: sentTs, by: r.fromName },
  ]
  // overdue ในข้อมูลตั้งต้นทับสถานะเดิมไป — กู้คืนว่าค้างตอนรอรับเรื่องหรือตอนดำเนินการ
  const underlying = r.status === 'overdue' ? (rng() > 0.5 ? 'sent' : 'inProgress') : r.status
  const sla = acceptSlaHours(r.need, r.urgent)
  const elapsedH = (now - sentTs) / H
  const viewTs = sentTs + Math.min(elapsedH * 0.4, 2 + rng() * 10) * H
  // โหมดภายใน: ไม่มีสัญญาณ "ได้รับ/เปิดดู" จากระบบปลายทาง — ครูบันทึกเองตั้งแต่ "รับเรื่อง"
  if (underlying === 'sent') return out
  if (underlying === 'rejected') {
    out.push({ type: 'returned', ts: viewTs + (1 + rng() * 20) * H, by: agency, note: 'ไม่อยู่ในอำนาจหน้าที่ของหน่วยงาน แนะนำให้ส่งต่อหน่วยงานอื่น' })
    return out
  }
  const officer = pick(rng, OFFICERS)
  const acceptTs = Math.min(viewTs + (0.5 + rng() * sla * 0.6) * H, now - 60_000)
  out.push({ type: 'accepted', ts: acceptTs, by: agency, officer, via: 'phone' })
  if (underlying === 'accepted') return out
  const startTs = Math.min(acceptTs + (4 + rng() * 30) * H, now - 60_000)
  out.push({ type: 'started', ts: startTs, by: officer })
  if (underlying === 'inProgress') {
    if (rng() > 0.8) out.push({ type: 'needInfo', ts: Math.min(startTs + 20 * H, now - 60_000), by: officer, note: 'ขอสำเนาทะเบียนบ้านและข้อมูลติดต่อผู้ปกครองล่าสุด' })
    return out
  }
  // completed
  const doneTs = Math.min(startTs + (1 + rng() * NEED_SLA[r.need] * 0.8) * D, now - 2 * H)
  const key = rng() > 0.85 ? (rng() > 0.5 ? 'followUp' : 'failed') : NEED_OUTCOME[r.need]
  out.push({ type: 'done', ts: doneTs, by: officer })
  out.push({ type: 'outcome', ts: doneTs + 30 * 60_000, by: officer, outcome: key, note: OUTCOME[key].th })
  return out
}

export function buildRefCase(input: {
  seeded?: Referral
  local?: LocalReferral
  logEvents: RefEvent[]
  student?: Student
  consent: ConsentView
  caseOwner: string
  now?: number
}): RefCase {
  const now = input.now ?? Date.now()
  const s = input.seeded
  const l = input.local
  const need = (l?.need ?? s!.need) as ReferralNeed
  const urgent = Boolean(s?.urgent || need === 'protection' || input.student?.riskLevel === 'critical')
  const base = s ? seededEvents(s, now) : []
  const events = [...base, ...input.logEvents].sort((a, b) => a.ts - b.ts)

  // ปลายทางปัจจุบัน — เปลี่ยนได้ถ้าครูเปลี่ยนหน่วยงาน
  const reassign = [...events].reverse().find((e) => e.type === 'reassigned')
  const toAgencyId = reassign?.toAgencyId ?? l?.toAgencyId ?? s!.toAgencyId
  const toAgency = AGENCY_BY_ID[toAgencyId]
  const toName = reassign?.toAgencyName ?? toAgency?.th ?? l?.toAgencyName ?? 'หน่วยงานปลายทาง'
  // เหตุการณ์หลังการเปลี่ยนหน่วยงานเท่านั้นที่นับเป็นขั้นของปลายทางใหม่
  const live = reassign ? events.filter((e) => e.ts >= reassign.ts) : events

  // ร่างที่ยังไม่ได้ส่ง: ข้อมูลตั้งต้นที่เป็น draft หรือการส่งต่อของครูที่รอความยินยอมอยู่
  let stage: RefStage = (s?.status === 'draft' && !l) || (l && !events.some((e) => e.type === 'sent')) ? 'draft' : 'sent'
  for (const e of live) {
    const st = STAGE_OF[e.type]
    // "ได้รับ/เปิดดู" เป็นสัญญาณช่วงต้นเท่านั้น มาช้ากว่าการรับเคสก็ไม่ดึงขั้นถอยหลัง
    if ((st === 'received' || st === 'viewed') && !['sent', 'received'].includes(stage)) continue
    if (st) stage = st
  }
  const sentEv = reassign ?? live.find((e) => e.type === 'sent')
  const sentTs = sentEv?.ts
  const acc = live.find((e) => e.type === 'accepted')
  const officer = acc?.officer
  const escalated = Math.max(0, ...live.filter((e) => e.type === 'escalated').map((e) => e.level ?? 1)) as 0 | 1 | 2 | 3

  // ── SLA ──
  const slaH = acceptSlaHours(need, urgent)
  const svcDays = NEED_SLA[need]
  let sla: Sla
  let escalation: RefCase['escalation'] = 0
  if (stage === 'sent' || stage === 'received' || stage === 'viewed') {
    const left = slaH - (now - (sentTs ?? now)) / H
    // ยกระดับตามชั่วโมงนับจากส่ง (24 / 48 / 72) ตาม brief — เคสคุ้มครองเด็กที่ SLA 8 ชม.
    // เริ่มระดับ 1 ทันทีที่เกิน SLA ไม่ต้องรอถึง 24
    const sinceH = (now - (sentTs ?? now)) / H
    escalation = left >= 0 ? 0 : sinceH > 72 ? 3 : sinceH > 48 ? 2 : 1
    sla = {
      clock: 'accept',
      hoursLeft: left,
      level: left < 0 ? 'breach' : left <= slaH * 0.25 ? 'near' : 'ok',
      text: left < 0 ? `เกิน SLA ${fmtHours(left)}` : `เหลือเวลา ${fmtHours(left)}`,
      rule: `หน่วยงานควรรับเรื่องภายใน ${slaH} ชั่วโมง`,
    }
  } else if (stage === 'accepted' || stage === 'inProgress') {
    const left = (svcDays * D - (now - (acc?.ts ?? now))) / H
    escalation = left < -48 ? 2 : left < 0 ? 1 : 0
    sla = {
      clock: 'service',
      hoursLeft: left,
      level: left < 0 ? 'breach' : left <= 48 ? 'near' : 'ok',
      text: left < 0 ? `เกินกำหนดดำเนินการ ${fmtHours(left)}` : `ต้องเสร็จภายใน ${fmtHours(left)}`,
      rule: `ต้องดำเนินการให้เสร็จภายใน ${svcDays} วันหลังรับเคส`,
    }
  } else if (stage === 'needInfo') {
    sla = { clock: 'none', hoursLeft: 0, level: 'paused', text: 'นาฬิกาหยุดรอข้อมูลจากโรงเรียน', rule: 'หน่วยงานรอข้อมูลเพิ่มเติม' }
  } else if (stage === 'draft') {
    sla = { clock: 'none', hoursLeft: 0, level: 'paused', text: 'ยังไม่ได้ส่ง — รอความยินยอม', rule: 'ส่งข้อมูลข้ามหน่วยงานไม่ได้จนกว่าจะมีความยินยอม' }
  } else {
    sla = { clock: 'none', hoursLeft: 0, level: 'done', text: STAGE_TH[stage], rule: '' }
  }

  // ── ผลลัพธ์ ──
  const oe = [...live].reverse().find((e) => e.type === 'outcome')
  const outcome = oe?.outcome
    ? { key: oe.outcome, th: OUTCOME[oe.outcome].th, ok: OUTCOME[oe.outcome].ok, note: oe.note, reviewed: stage === 'closed' }
    : undefined

  // ── ถังความเร่งด่วน ──
  let bucket: Bucket
  if (stage === 'draft') bucket = 'consent'
  else if (stage === 'needInfo') bucket = 'needInfo'
  else if (stage === 'returned') bucket = 'returned'
  else if (stage === 'outcome') bucket = 'review'
  else if (stage === 'done' || stage === 'closed') bucket = 'done'
  else if (sla.level === 'breach') bucket = 'breach'
  else if (sla.level === 'near') bucket = 'near'
  else bucket = sla.clock === 'accept' ? 'awaiting' : 'inProgress'
  // ครูประเมินแล้วว่าผลยังไม่พอ ขอให้หน่วยงานเดิมทำต่อ — กลับไปเป็นงานที่กำลังดำเนินการ
  const lastOutcomeIdx = live.map((e) => e.type).lastIndexOf('outcome')
  const continued = stage === 'outcome' && live.slice(lastOutcomeIdx + 1).find((e) => e.type === 'followUp')
  if (continued) bucket = 'inProgress'

  // ── ขั้นถัดไป และปุ่มที่เกี่ยวกับสถานะนี้เท่านั้น ──
  const next = ((): RefCase['next'] => {
    if (stage === 'draft' && (input.consent.state === 'granted' || input.consent.state === 'expiring'))
      return { th: 'ได้รับความยินยอมแล้ว — พร้อมส่งต่อ', whyTh: `ส่งถึง ${toName} ได้ทันที`, actions: [] }
    if (stage === 'draft') return { th: 'ขอความยินยอมจากผู้ปกครองก่อนส่งต่อ', whyTh: 'ส่งข้อมูลส่วนบุคคลข้ามหน่วยงานไม่ได้จนกว่าจะมีความยินยอม (PDPA)', actions: ['consent'] }
    if (stage === 'needInfo') {
      const ni = [...live].reverse().find((e) => e.type === 'needInfo')
      return { th: `${toName} ขอข้อมูลเพิ่มเติม`, whyTh: ni?.note ?? 'หน่วยงานรอข้อมูลจากโรงเรียนก่อนดำเนินการต่อ', actions: ['sendInfo', 'update'] }
    }
    if (stage === 'returned') return { th: `${toName} ไม่รับเรื่อง`, whyTh: [...live].reverse().find((e) => e.type === 'returned')?.note ?? 'ส่งกลับมาที่โรงเรียน', actions: ['referMore', 'close'] }
    if (continued) return { th: `ติดตามผลกับ ${toName} ต่อ · นัดวันที่ ${continued.date ?? ''}`, whyTh: continued.note ?? 'ผลรอบแรกยังไม่พอ', actions: ['update', 'review'] }
    if (stage === 'outcome') return { th: `ได้ผลแล้ว: ${outcome?.th ?? ''}`, whyTh: 'ประเมินว่าการส่งต่อนี้ช่วยเด็กได้จริงหรือไม่ แล้วปิดหรือติดตามต่อ', actions: ['review'] }
    if (stage === 'done') return { th: `${toName} ดำเนินการเสร็จแล้ว — สอบถามผล`, whyTh: 'โทรถามผลแล้วกดอัปเดตความคืบหน้า', actions: ['update', 'contact'] }
    if (stage === 'closed') return { th: 'ปิดการส่งต่อแล้ว', whyTh: outcome ? `ผล: ${outcome.th}` : '', actions: [] }
    if (sla.clock === 'accept') {
      // ทำไปแล้วถึงระดับไหน — การติดต่อหน่วยงานหลังเกิน SLA นับเป็นระดับ 1
      const breachTs = (sentTs ?? now) + slaH * H
      const handled = Math.max(escalated, live.some((e) => (e.type === 'contacted' || e.type === 'reminded') && e.ts >= breachTs) ? 1 : 0)
      if (escalation > 0 && handled >= escalation)
        return {
          th: handled === 1 ? `ติดต่อ ${toName} แล้ว — รอหน่วยงานรับเรื่อง` : `Escalate ระดับ ${handled} แล้ว — รอ ${toName} รับเรื่อง`,
          whyTh: `หน่วยงานรับเรื่องแล้วกดอัปเดต · ถ้ายังเงียบ ยกระดับต่อหรือเปลี่ยนหน่วยงานได้`,
          actions: handled >= 2 ? ['update', 'reassign'] : ['update', 'escalate'],
        }
      if (escalation >= 3) return { th: 'ค้างเกิน 72 ชั่วโมงแล้ว — พิจารณาเปลี่ยนหน่วยงาน', whyTh: `${toName} ยังไม่รับเรื่อง — ย้ายไปหน่วยงานที่รับเร็วกว่า หรือแจ้งผู้บริหารระดับจังหวัด`, actions: ['reassign', 'escalate'] }
      if (escalation === 2) return { th: 'ค้างเกิน 48 ชั่วโมงแล้ว — Escalate ไปหัวหน้าหน่วยงาน', whyTh: `${toName} ยังไม่รับเรื่อง — แจ้งหัวหน้าหน่วยงานให้เร่งรับเรื่อง`, actions: ['escalate', 'contact'] }
      if (escalation === 1) return { th: `เกินกำหนดรับเรื่องแล้ว — โทรถาม ${toName}`, whyTh: 'ถามว่าได้รับเรื่องหรือยัง ติดขัดอะไร แล้วบันทึกการติดต่อ', actions: ['contact', 'update'] }
      return {
        th: `รอ ${toName} รับเรื่องภายใน ${fmtHours(sla.hoursLeft)}`,
        whyTh:
          sla.level === 'near'
            ? `ใกล้ครบกำหนด — โทรยืนยันกับหน่วยงาน`
            : 'เมื่อหน่วยงานรับเรื่องแล้ว (ทางโทรศัพท์ หนังสือ หรือพบตัว) กดอัปเดตความคืบหน้า',
        actions: sla.level === 'near' ? ['contact', 'update'] : ['update', 'contact'],
      }
    }
    if (stage === 'accepted' && sla.level !== 'breach')
      return { th: `${toName} รับเรื่องแล้ว${officer ? ` · ${officer}` : ''} — รอเริ่มดำเนินการ`, whyTh: 'ได้ข่าวจากหน่วยงานเมื่อไร กดอัปเดตความคืบหน้า', actions: ['update', 'followUp'] }
    if (sla.level === 'breach') return { th: `${toName} เกินกำหนดดำเนินการ`, whyTh: 'โทรถามความคืบหน้า แล้วอัปเดต หรือ Escalate ถ้ายังติดขัด', actions: ['contact', 'update', 'escalate'] }
    return { th: `${toName} กำลังดำเนินการ${officer ? ` · ${officer}` : ''}`, whyTh: 'นัดติดตามไว้ แล้วกดอัปเดตเมื่อได้ผล', actions: ['update', 'followUp'] }
  })()
  // โหมดภายใน: ครูอาจได้ข่าวจากหน่วยงานได้ทุกเมื่อ — เคสที่ยังเปิดอยู่ต้องมีปุ่มอัปเดตเสมอ
  if (['sent', 'received', 'viewed', 'accepted', 'inProgress', 'needInfo', 'done'].includes(stage) && !next.actions.includes('update'))
    next.actions = [...next.actions, 'update']

  const caseOwner = input.caseOwner
  return {
    id: l?.id ?? s!.id,
    childId: l?.childId ?? s!.childId,
    childName: l?.childName ?? s!.childName,
    provinceKey: l?.provinceKey ?? s!.provinceKey,
    need,
    needTh: NEED_LABEL[need].th,
    reason: l?.reason ?? s!.note,
    reasonCode: l?.reasonCode,
    fromName: l?.fromName ?? s!.fromName,
    toAgencyId,
    toName,
    toAgency,
    handoff: l?.handoff ?? (need === 'protection' ? 'transfer' : 'joint'),
    caseOwner,
    referralOwner: l?.referralOwner ?? caseOwner,
    officer,
    urgent,
    events: live === events ? events : events,
    stage,
    sentTs,
    acceptedTs: acc?.ts,
    sla,
    escalation,
    escalated,
    bucket,
    next,
    outcome,
    consent: input.consent,
    share: l?.share ?? (input.consent.state === 'granted' || input.consent.state === 'expiring' ? ['basic', 'summary', 'history'] : ['basic']),
    local: Boolean(l),
  }
}

export const sortRefs = (rs: RefCase[]) =>
  [...rs].sort(
    (a, b) =>
      BUCKET_META[a.bucket].rank - BUCKET_META[b.bucket].rank ||
      a.sla.hoursLeft - b.sla.hoursLeft ||
      Number(b.urgent) - Number(a.urgent),
  )

// ── ความพร้อมก่อนส่ง ─────────────────────────────────────────

export interface ReadyItem {
  key: string
  th: string
  state: 'ok' | 'warn' | 'no' | 'optional'
  detail: string
  /** ต้องทำอะไรต่อถ้ายังไม่ผ่าน */
  fix?: string
}

export function readiness(input: {
  reason: string
  student?: Student
  consent: ConsentView
  historyCount: number
}): { items: ReadyItem[]; ready: boolean } {
  const s = input.student
  const items: ReadyItem[] = [
    {
      key: 'summary',
      th: 'สรุปปัญหาเรียบร้อย',
      state: input.reason.trim().length >= 12 ? 'ok' : 'no',
      detail: input.reason.trim().length >= 12 ? 'มีเหตุผลที่หน่วยงานอ่านแล้วเข้าใจ' : 'เหตุผลสั้นเกินไป',
      fix: 'เขียนสรุปปัญหาให้หน่วยงานเข้าใจสักประโยค',
    },
    {
      key: 'parent',
      th: 'มีข้อมูลติดต่อผู้ปกครอง',
      state: !s ? 'warn' : s.parentContact === 'ok' ? 'ok' : 'warn',
      detail: !s ? 'ไม่มีระเบียนนักเรียน' : s.parentContact === 'ok' ? `ติดต่อ${s.master.parentRelationName}ได้ตามปกติ` : 'ยังติดต่อผู้ปกครองไม่ได้ตามปกติ',
      fix: 'ส่งได้ แต่หน่วยงานอาจติดต่อครอบครัวไม่ได้ — บันทึกการติดต่อก่อนจะดีกว่า',
    },
    {
      key: 'history',
      th: 'มีประวัติการช่วยเหลือที่ผ่านมา',
      state: input.historyCount > 0 ? 'ok' : 'warn',
      detail: input.historyCount > 0 ? `${input.historyCount} รายการ` : 'ยังไม่มีบันทึกการช่วยเหลือ',
      fix: 'หน่วยงานจะต้องเริ่มประเมินใหม่ทั้งหมด',
    },
    {
      key: 'data',
      th: 'มีข้อมูลที่จำเป็นสำหรับหน่วยงานผู้รับ',
      state: s ? 'ok' : 'warn',
      detail: s ? `ทะเบียนนักเรียน ปีการศึกษา ${s.master.academicYear} ครบ` : 'ไม่มีทะเบียนนักเรียน',
    },
    {
      key: 'consent',
      th: 'มีความยินยอมในการเปิดเผยข้อมูล',
      state: input.consent.state === 'granted' || input.consent.state === 'expiring' ? 'ok' : 'no',
      detail: CONSENT_META[input.consent.state].th + (input.consent.state === 'expiring' ? ` (เหลือ ${input.consent.daysLeft} วัน)` : ''),
      fix: 'ขอความยินยอมจากผู้ปกครองและบันทึกในขั้นถัดไป',
    },
    { key: 'docs', th: 'เอกสารประกอบ', state: 'optional', detail: 'ยังไม่มีเอกสารแนบ — ไม่บังคับ' },
  ]
  return { items, ready: !items.some((i) => i.state === 'no') }
}

/** ประเภทความต้องการจากสาเหตุของเด็ก — ใช้เดาเหตุผลการส่งต่อให้ครูตั้งต้น */
export function needFromStudent(s: Student | undefined): { need: ReferralNeed; code?: number; key?: Student['causeKeys'][number] } {
  const map: Record<string, ReferralNeed> = {
    poverty: 'financial', noDevice: 'financial', childLabour: 'skills', family: 'protection', health: 'physicalHealth',
    unrestAffected: 'mentalHealth', noDocuments: 'documents', stateless: 'documents', migration: 'documents',
    travel: 'transport', earlyMarriage: 'childcare',
  }
  for (const k of s?.causeKeys ?? []) if (map[k]) return { need: map[k], code: reasonFor(k)?.id, key: k }
  return { need: 'financial' }
}

// ── Timeline ข้ามหน่วยงาน ────────────────────────────────────

export interface XItem {
  ts: number
  th: string
  by: string
  who: 'school' | 'agency' | 'system'
  refId?: string
}

/** " · ทางโทรศัพท์" — บอกว่าครูรู้มาจากไหน เพราะไม่มีสัญญาณจากระบบหน่วยงาน */
const viaTx = (e: RefEvent) => (e.via ? ` · ทาง${VIA_TH[e.via]}` : '')

const EV_TH: Record<RefEventType, (e: RefEvent, r: RefCase) => string> = {
  sent: (e, r) => `ส่งต่อไป ${r.toName} — ${r.needTh}${viaTx(e)}`,
  received: (_e, r) => `${r.toName} ได้รับเรื่อง`,
  viewed: (_e, r) => `${r.toName} เปิดดูเรื่องแล้ว`,
  accepted: (e, r) => `${r.toName} รับเรื่อง${e.officer ? ` · ผู้รับผิดชอบ ${e.officer}` : ''}${viaTx(e)}`,
  started: (e, r) => `${r.toName} เริ่มดำเนินการ${e.note ? ` — ${e.note}` : ''}${viaTx(e)}`,
  needInfo: (e, r) => `${r.toName} ขอข้อมูลเพิ่ม: ${e.note ?? ''}${viaTx(e)}`,
  infoSent: (e) => `โรงเรียนส่งข้อมูลเพิ่มเติม${e.note ? `: ${e.note}` : ''}${viaTx(e)}`,
  done: (_e, r) => `${r.toName} ดำเนินการเสร็จ`,
  outcome: (e, r) => `ผลจาก ${r.toName}: ${e.note ?? ''}${viaTx(e)}`,
  closed: (e) => `ปิดการส่งต่อ${e.note ? ` — ${e.note}` : ''}`,
  returned: (e, r) => `${r.toName} ไม่รับเรื่อง${e.note ? ` — ${e.note}` : ''}${viaTx(e)}`,
  reminded: (_e, r) => `ส่งการแจ้งเตือนถึง ${r.toName}`,
  contacted: (e, r) => `ติดต่อ ${r.toName}${e.note ? ` — ${e.note}` : ''}${viaTx(e)}`,
  escalated: (e) => `Escalate ระดับ ${e.level ?? 1}${e.note ? ` — ${e.note}` : ''}`,
  reassigned: (e) => `เปลี่ยนหน่วยงานเป็น ${e.toAgencyName ?? ''}`,
  followUp: (e) => `นัดติดตามวันที่ ${e.date ?? ''}`,
}

const SCHOOL_EVENTS: RefEventType[] = ['sent', 'infoSent', 'closed', 'reminded', 'contacted', 'escalated', 'reassigned', 'followUp']

/** เหตุการณ์ของเด็กคนหนึ่งจากทุกหน่วยงานในเส้นเดียว — "ที่ผ่านมาเกิดอะไรขึ้น" */
export function crossTimeline(refs: RefCase[], entries: CaseLogEntry[], student: Student | undefined): XItem[] {
  const out: XItem[] = []
  for (const r of refs)
    for (const e of r.events)
      out.push({ ts: e.ts, th: EV_TH[e.type](e, r), by: e.by, who: e.type === 'received' ? 'system' : SCHOOL_EVENTS.includes(e.type) ? 'school' : 'agency', refId: r.id })
  // บันทึกที่เป็นเงาของการส่งต่อ (refId / referral) มีเหตุการณ์ของตัวเองอยู่แล้วด้านบน
  for (const e of entries) if (!e.referral && !e.refId) out.push({ ts: Number(e.id.split('-')[1]) || new Date(e.date).getTime(), th: e.note, by: e.by, who: 'school' })
  for (const ev of student?.timeline ?? []) {
    if (entries.some((e) => e.date === ev.date && e.note === ev.note)) continue
    out.push({ ts: new Date(ev.date).getTime() + 9 * H, th: ev.note, by: ev.by, who: 'school' })
  }
  return out.sort((a, b) => b.ts - a.ts)
}

/** ข้อมูลที่จะถูกส่งจริง — แสดงให้ครูเห็นก่อนยืนยัน ไม่ใช่แค่ชื่อหมวด */
export function sharePreview(s: Student | undefined, key: string, reason: string, historyCount: number): string {
  if (!s) return key === 'basic' ? 'ชื่อและรหัส' : '—'
  switch (key) {
    case 'basic':
      return `${s.name} · ${s.id} · ${s.gradeKey.toUpperCase()}`
    case 'summary':
      return reason
    case 'history':
      return `${historyCount} รายการ เช่น ${s.timeline[s.timeline.length - 1]?.note ?? '—'}`
    case 'family':
      return `ผู้ดูแล: ${s.master.parentRelationName} · รายได้ ${s.master.parentSalary.toLocaleString('th-TH')} บาท/เดือน`
    case 'health':
      return `ด้านสุขภาวะ ${s.wellbeingRisk}/100${s.master.disabilityName ? ` · ${s.master.disabilityName}` : ''}`
    default:
      return ''
  }
}
