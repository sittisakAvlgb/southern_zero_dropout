// ─────────────────────────────────────────────────────────────
// ทะเบียนเด็กนอกระบบ ในมุม ผอ. — เด็กที่โรงเรียนแจ้งว่าหลุดจากระบบ
//
// ผอ. ไม่ได้ลงพื้นที่เอง งานของ ผอ. คือทำให้เด็กแต่ละคน "มีคนรับผิดชอบและเดินต่อได้"
// ที่นี่จึงตอบต่อเด็กหนึ่งคนว่า ติดอยู่ขั้นไหน · ทำไมต้องดูก่อน · ผอ. ต้องทำอะไร
// (มอบหมาย · เตือน · บันทึกผลที่ได้รับแจ้ง) แบบเดียวกับการ์ดบนหน้าภาพรวม
//
// สิ่งที่ ผอ. ทำเก็บในบันทึกของโรงเรียน (caseLog) ด้วยรหัสเด็ก OOS-xxxx — ไม่หายเมื่อรีโหลด
// และลงไทม์ไลน์เดียวกับเคสอื่นพร้อมป้าย "ผอ."
// ─────────────────────────────────────────────────────────────
import type { OoscRecord } from '@/types'
import type { CaseLogEntry, ConsentRecord, LocalReferral } from './caseLog'
import type { OpportunityPlan } from '@/types'

const D = 86400000

/** ขั้นของเด็กนอกระบบ — ตามลำดับที่ต้องเกิดจริง: มีคนรับผิดชอบก่อน คนนั้นจึงลงพื้นที่ได้ */
export type OoscStep = 'owner' | 'verify' | 'consent' | 'plan' | 'follow' | 'done' | 'notFound'

export const STEP_ORDER: OoscStep[] = ['owner', 'verify', 'consent', 'plan', 'follow', 'done']
export const STEP_TH: Record<OoscStep, string> = {
  owner: 'ยังไม่มีผู้รับผิดชอบ',
  verify: 'รอลงพื้นที่ยืนยันตัวตน',
  consent: 'รอความยินยอมจากครอบครัว',
  plan: 'ยังไม่มีแผนช่วยเหลือ',
  follow: 'กำลังดึงกลับตามแผน',
  done: 'กลับเข้าเรียน / มีอาชีพแล้ว',
  notFound: 'ลงพื้นที่แล้วไม่พบตัว',
}
/** ชื่อสั้นของขั้นสำหรับแถบความคืบหน้า */
export const STEP_SHORT: Record<Exclude<OoscStep, 'notFound'>, string> = {
  owner: 'ผู้รับผิดชอบ',
  verify: 'ยืนยันตัวตน',
  consent: 'ความยินยอม',
  plan: 'มีแผน',
  follow: 'ดึงกลับ',
  done: 'กลับเข้าเรียน',
}

/** เด็กหนึ่งคนตามที่โรงเรียนรู้ตอนนี้ — ระเบียนตั้งต้น + สิ่งที่บันทึกในแอป */
export interface OoscView {
  r: OoscRecord
  owner: string | null
  verified: boolean
  notFound: boolean
  consentGranted: boolean
  hasPlan: boolean
  step: OoscStep
  /** นัดลงพื้นที่ที่ ผอ. มอบหมายไว้และยังไม่ได้ทำ */
  visitDue?: { date: string; owner: string; late: boolean }
  /** ผอ. ลงมือกับเด็กคนนี้ภายใน 3 วัน (ไม่ต้องเสนอซ้ำ) */
  handled: boolean
  entries: CaseLogEntry[]
}

const isoToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function viewOosc(
  r: OoscRecord,
  log: { entries: CaseLogEntry[]; owners: Record<string, string>; consents: Record<string, ConsentRecord>; plans: Record<string, OpportunityPlan>; refs: Record<string, LocalReferral> },
): OoscView {
  const entries = log.entries.filter((e) => e.childId === r.id)
  const owner = log.owners[r.id] ?? r.ownerName
  const visits = entries.filter((e) => e.mode === 'visit')
  const lastVisit = visits[0]
  const notFound = lastVisit?.result === 'ไม่พบตัว'
  const verified = r.verified || visits.some((e) => e.homeVisited && e.result !== 'ไม่พบตัว')
  const consentGranted = r.consent === 'granted' || log.consents[r.id]?.status === 'granted' || entries.some((e) => e.consent === 'granted')
  const hasPlan = Boolean(r.planId || log.plans[r.id])
  const today = isoToday()
  const booked = entries.find((e) => e.followUpDate && !e.followUpDone && e.followUpMethod === 'เยี่ยมบ้าน')
  const since = new Date(Date.now() - 3 * D)
  const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
  const done = r.status === 'returned' || r.status === 'working'
  const step: OoscStep = done
    ? 'done'
    : !owner
      ? 'owner'
      : notFound
        ? 'notFound'
        : !verified
          ? 'verify'
          : !consentGranted
            ? 'consent'
            : !hasPlan
              ? 'plan'
              : 'follow'
  return {
    r,
    owner,
    verified,
    notFound,
    consentGranted,
    hasPlan,
    step,
    visitDue: booked ? { date: booked.followUpDate!, owner: booked.followUpOwner ?? owner ?? '', late: booked.followUpDate! < today } : undefined,
    handled: entries.some((e) => e.role === 'director' && e.date >= sinceIso),
    entries,
  }
}

/** ต้องใช้ ผอ. ไหม — ขั้นที่ ผอ. ขยับได้ (มีคน · ลงพื้นที่ · ความยินยอม · แผน · ไม่พบตัว) */
export const needsDirector = (v: OoscView) => ['owner', 'verify', 'consent', 'plan', 'notFound'].includes(v.step)

/** เด็กคนนี้อยู่ในคิว "ต้องใช้ ผอ." — ผอ. ลงมือไปแล้วใน 3 วันย้ายไป "รอผล" */
export const inOoscQueue = (v: OoscView) => needsDirector(v) && !v.handled

/** ลำดับความสำคัญ — ไม่มีคนรับผิดชอบมาก่อน แล้วข้อมูลน่าเชื่อถือสูง เด็กเล็กที่ยังอยู่วัยเรียนภาคบังคับ และออกมานาน */
export function priorityOf(v: OoscView): number {
  const stepW: Record<OoscStep, number> = { owner: 50, notFound: 35, verify: 30, consent: 20, plan: 15, follow: 0, done: -100 }
  const compulsory = v.r.ageYears <= 15 ? 10 : 0
  return stepW[v.step] + v.r.matchConfidence * 0.3 + Math.min(v.r.yearsOut, 5) * 3 + compulsory + (v.visitDue?.late ? 15 : 0)
}

export interface OoscOption {
  label: string
  effect: string
  kind: 'assign' | 'nudge' | 'visit'
  recommended?: boolean
  /** ข้อความตั้งต้นสำหรับการเตือน */
  message?: string
}

/** การ์ดของเด็กหนึ่งคน — ทำไม · AI เห็นอะไร · ผอ. ต้องเลือกอะไร (ใช้ภาษา "อาจพิจารณา" ไม่สั่ง) */
export function ooscBrief(v: OoscView, tambonName: string, suggest?: string): { why: string[]; insight?: string; question: string; options: OoscOption[] } {
  const b = briefOf(v, tambonName, suggest)
  // ทางที่ AI แนะนำขึ้นก่อนเสมอ — บนมือถือปุ่มหลักต้องอยู่บนสุด ไม่ตกขอบจอ
  return { ...b, options: [...b.options].sort((x, y) => Number(Boolean(y.recommended)) - Number(Boolean(x.recommended))) }
}

function briefOf(v: OoscView, tambonName: string, suggest?: string): { why: string[]; insight?: string; question: string; options: OoscOption[] } {
  const r = v.r
  const why = [
    `${r.ageYears} ปี${r.ageYears <= 15 ? ' (วัยเรียนภาคบังคับ)' : ''} · ${tambonName} · ออกจากระบบ ${r.yearsOut.toFixed(1)} ปี`,
    `โรงเรียนแจ้ง · ข้อมูลน่าเชื่อถือ ${r.matchConfidence}%${r.note ? ` · ${r.note}` : ''}`,
  ]
  const owner = v.owner ?? ''
  switch (v.step) {
    case 'owner':
      return {
        why: [...why, 'ยังไม่มีใครถูกมอบหมายให้ไปหาเด็กคนนี้'],
        insight: r.matchConfidence >= 80 ? 'ข้อมูลน่าเชื่อถือสูง — ลงพื้นที่ครั้งเดียวมีโอกาสพบตัวมาก คุ้มค่าที่สุดที่จะเริ่มคนนี้' : undefined,
        question: 'จะให้ใครลงพื้นที่ยืนยันตัวตน?',
        options: [{ label: suggest ? `มอบหมายให้ ${suggest}` : 'มอบหมายผู้ลงพื้นที่', effect: 'ลงพื้นที่ยืนยันภายใน 7 วัน · บันทึกในไทม์ไลน์ของเด็ก', kind: 'assign', recommended: true }],
      }
    case 'verify':
      return {
        why: [...why, v.visitDue ? `มอบหมาย ${v.visitDue.owner} ลงพื้นที่ภายใน ${v.visitDue.date}${v.visitDue.late ? ' — เลยกำหนดแล้ว' : ''}` : `ผู้รับผิดชอบ: ${owner} · ยังไม่ได้ลงพื้นที่`],
        insight: v.visitDue?.late ? 'เลยกำหนดลงพื้นที่แล้ว — อาจพิจารณาเตือนผู้รับผิดชอบ หรือเปลี่ยนคนที่ไปได้เร็วกว่า' : undefined,
        question: v.visitDue?.late ? `จะเตือน${owner} หรือเปลี่ยนคนลงพื้นที่?` : 'ได้รับแจ้งผลลงพื้นที่แล้วหรือยัง?',
        options: [
          { label: `เตือน${owner}`, effect: 'ส่งข้อความถึงผู้รับผิดชอบให้ลงพื้นที่ บันทึกในไทม์ไลน์', kind: 'nudge', recommended: Boolean(v.visitDue?.late), message: `ขอให้ลงพื้นที่ยืนยันตัวตน${r.name}ภายในสัปดาห์นี้ ติดอะไรแจ้ง ผอ. ได้` },
          { label: 'บันทึกผลลงพื้นที่', effect: 'บันทึกผลที่ผู้รับผิดชอบแจ้ง (พบตัว / ไม่พบตัว) — เด็กเดินไปขั้นถัดไป', kind: 'visit', recommended: !v.visitDue?.late },
          ...(v.visitDue?.late ? [{ label: 'เปลี่ยนผู้ลงพื้นที่', effect: 'มอบหมายคนใหม่ ลงพื้นที่ภายใน 7 วัน', kind: 'assign' as const }] : []),
        ],
      }
    case 'notFound':
      return {
        why: [...why, 'ลงพื้นที่แล้วไม่พบตัว'],
        insight: 'ครอบครัวอาจย้ายถิ่น — อาจพิจารณาให้ประสานผู้นำชุมชนหรือทะเบียนราษฎรก่อนลงพื้นที่ซ้ำ',
        question: 'จะให้ลงพื้นที่อีกครั้งพร้อมผู้นำชุมชนไหม?',
        options: [
          { label: 'มอบหมายลงพื้นที่อีกครั้ง', effect: 'ลงพื้นที่ภายใน 7 วัน พร้อมผู้นำชุมชน / อสม.', kind: 'assign', recommended: true },
          { label: 'บันทึกผลใหม่', effect: 'ได้ข่าวเพิ่มจากชุมชน — บันทึกว่าพบตัวแล้ว', kind: 'visit' },
        ],
      }
    case 'consent':
      return {
        why: [...why, `ยืนยันตัวตนแล้ว · ผู้รับผิดชอบ: ${owner}`, 'ยังไม่ได้ความยินยอม — ส่งข้อมูลให้หน่วยงานอื่นช่วยไม่ได้'],
        question: `จะให้${owner}ขอความยินยอมจากครอบครัวเมื่อไร?`,
        options: [{ label: `ให้${owner}ขอความยินยอมภายใน 7 วัน`, effect: 'ส่งข้อความถึงผู้รับผิดชอบ บันทึกในไทม์ไลน์', kind: 'nudge', recommended: true, message: `ขอให้คุยกับครอบครัวของ${r.name}และขอความยินยอมภายใน 7 วัน เพื่อเริ่มวางแผนช่วยเหลือ` }],
      }
    case 'plan':
      return {
        why: [...why, `ยืนยันตัวตนและได้ความยินยอมแล้ว · ผู้รับผิดชอบ: ${owner}`, 'ยังไม่มีแผนว่าเด็กจะกลับเข้าเรียนหรือมีอาชีพทางไหน'],
        question: `จะให้${owner}ทำแผนช่วยเหลือเมื่อไร?`,
        options: [{ label: `ให้${owner}ทำแผนภายใน 14 วัน`, effect: 'ส่งข้อความถึงผู้รับผิดชอบ บันทึกในไทม์ไลน์', kind: 'nudge', recommended: true, message: `ขอให้ทำแผนโอกาสของ${r.name}ภายใน 14 วัน — เลือกเส้นทาง (กลับโรงเรียน · สกร. · อาชีวะ) ร่วมกับครอบครัว` }],
      }
    default:
      return { why: [...why, STEP_TH[v.step]], question: 'ไม่มีเรื่องที่ต้องใช้ ผอ. ตอนนี้', options: [] }
  }
}
