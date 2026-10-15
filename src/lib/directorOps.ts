// ─────────────────────────────────────────────────────────────
// งานของ ผอ. — ผู้ปลดอุปสรรค ไม่ใช่ผู้ทำแทนครู
//
// ครู = คนดูแลและลงมือช่วยเด็ก · AI = ผู้ช่วยสรุปและเสนอทางเลือก
// ผอ. = ผู้สนับสนุน ตัดสินใจ จัดคน จัดทรัพยากร และประสานระดับที่สูงกว่าครู
//
// ผอ. ไม่ต้องเปิดทุกเคส ที่นี่จึงตอบแค่ว่า "เรื่องไหนต้องใช้ ผอ." — คำขอที่ครูส่งขึ้นมา
// และเรื่องที่ระบบเห็นว่าไม่มีใครขยับได้นอกจาก ผอ. (เคสไม่มีเจ้าของ · ค้างนานมาก)
// ทุกตัวเลขอ่านจาก FollowCase ชุดเดียวกับที่ครูเห็น ครูกับ ผอ. จึงไม่มีวันเห็นคนละเลข
// ─────────────────────────────────────────────────────────────
import type { FollowCase } from './followOps'
import { LEVEL_TH } from './followOps'
import {
  DIRECTOR_ACT_TH,
  isScheduleOnly,
  requestStatus,
  waitsOnDirector,
  type CaseLogEntry,
  type DirectorAct,
  type SupportReason,
  type SupportRequest,
} from './caseLog'
import { needsAgency } from './recommend'

const D = 86400000
export const isoIn = (days: number) => {
  const d = new Date(Date.now() + days * D)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const fmtDay = (isoDate: string) => {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${d} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][(m ?? 1) - 1]}`
}

// ── ฝั่งครู: เตรียมคำขอ ───────────────────────────────────────

/** สิ่งที่ครูทำแล้ว — สรุปจากบันทึกจริง ครูไม่ต้องพิมพ์ซ้ำ (ติ๊กออกหรือเพิ่มเองได้) */
export function triedFrom(entries: CaseLogEntry[], c: FollowCase): string[] {
  const work = entries.filter((e) => !isScheduleOnly(e) && !e.requestId)
  const out: string[] = []
  const contacts = work.filter((e) => e.mode === 'contact')
  if (contacts.length) {
    const failed = contacts.filter((e) => e.outcome === 'noAnswer' || e.outcome === 'wrongNumber' || e.parentContact === 'unreachable').length
    out.push(`ติดต่อผู้ปกครอง ${contacts.length} ครั้ง${failed ? ` (ไม่สำเร็จ ${failed} ครั้ง)` : ''}`)
  }
  if (work.some((e) => e.mode === 'talk')) out.push('พูดคุยกับนักเรียนแล้ว')
  const visits = work.filter((e) => e.mode === 'visit')
  if (visits.length) out.push(`เยี่ยมบ้าน ${visits.length} ครั้ง`)
  const booked = entries.filter((e) => e.followUpDate && !e.followUpDone)
  if (booked.length) out.push(`นัดติดตามไว้ ${booked.length} นัด`)
  if (c.hasPlan) out.push('มีแผนช่วยเหลือแล้ว')
  if (c.refs.length) out.push(`ส่งต่อหน่วยงานแล้ว ${c.refs.length} เรื่อง (${c.refs.map((r) => r.toName).slice(0, 2).join(', ')})`)
  // ไม่มีบันทึกในแอปเลย — ใช้ไทม์ไลน์เดิมของโรงเรียนแทน ดีกว่าบอก ผอ. ว่าไม่เคยทำอะไร
  if (!out.length) for (const ev of c.s.timeline.slice(-2)) out.push(ev.note)
  return out
}

/** เหตุผลที่น่าจะใช่ — ติ๊กให้ก่อน ครูแก้ได้ */
export function suggestReasons(c: FollowCase): SupportReason[] {
  const r: SupportReason[] = []
  if (c.s.parentContact !== 'ok') r.push('parent')
  if (c.sla.level === 'breach') r.push('sla')
  if (needsAgency(c.s) && !c.refs.length) r.push('referral')
  return r.length ? r : ['people']
}

/** สิ่งที่ครูน่าจะต้องการ — ประโยคตั้งต้น ครูแก้ได้ */
export function suggestAsk(reasons: SupportReason[]): string {
  const parts: string[] = []
  if (reasons.includes('parent')) parts.push('ช่วยประสานผู้นำชุมชนและอนุมัติทีมเยี่ยมบ้าน')
  if (reasons.includes('people')) parts.push('เพิ่มคนช่วยในทีม')
  if (reasons.includes('resource')) parts.push('อนุมัติทรัพยากรช่วยเหลือ')
  if (reasons.includes('referral')) parts.push('อนุมัติการส่งต่อหน่วยงาน')
  if (reasons.includes('meeting')) parts.push('เรียกประชุมทีมช่วยเหลือ')
  if (reasons.includes('sla')) parts.push('ช่วยตัดสินใจทางที่จะไปต่อ')
  return parts.length ? `ขอให้ ผอ. ${parts.join(' และ')}` : ''
}

export function caseSummaryLine(c: FollowCase): string {
  const bits = [
    c.s.absenceStreak >= 3 && `ขาดเรียนต่อเนื่อง ${c.s.absenceStreak} วัน`,
    c.s.parentContact === 'unreachable' ? 'ติดต่อผู้ปกครองไม่ได้' : c.s.parentContact === 'delayed' ? 'ผู้ปกครองตอบช้า' : '',
    c.riskDelta >= 5 && `ความเสี่ยงเพิ่ม ${c.riskDelta} คะแนน`,
    c.sla.level === 'breach' && c.sla.text,
  ].filter(Boolean)
  return bits.length ? bits.join(' + ') : `ความเสี่ยงระดับ${LEVEL_TH[c.s.riskLevel]} ${c.s.riskScore}/100`
}

// ── ฝั่ง ผอ.: AI สรุปมุมบริหาร ────────────────────────────────

export interface ExecOption {
  act: DirectorAct
  th: string
  why: string
}

/** AI ไม่สั่ง ผอ. — ใช้ "อาจพิจารณา" และอ้างข้อมูลล่าสุดเสมอ */
export function execSummary(c: FollowCase, req?: SupportRequest): { headline: string; options: ExecOption[] } {
  const s = c.s
  const tried = req?.tried.length ?? 0
  const silentDays = c.updatedDaysAgo
  const blocker =
    s.parentContact === 'unreachable'
      ? 'ยังติดต่อผู้ปกครองไม่ได้'
      : c.refs.some((r) => r.bucket === 'breach')
        ? 'หน่วยงานภายนอกยังไม่ตอบรับ'
        : c.riskDelta >= 5
          ? `ความเสี่ยงยังเพิ่มขึ้น (${c.riskDelta > 0 ? '+' : ''}${c.riskDelta})`
          : c.sla.level === 'breach'
            ? `ไม่มีความคืบหน้า ${silentDays} วัน`
            : 'ยังไม่เห็นผลที่ชัดเจน'
  const headline = `จากข้อมูลล่าสุด เคสนี้ความเสี่ยงระดับ${LEVEL_TH[s.riskLevel]} (${s.riskScore}/100)${tried ? ` ครูดำเนินการแล้ว ${tried} วิธี` : ''} แต่${blocker}`

  const options: ExecOption[] = []
  const want = new Set(req?.reasons ?? [])
  const push = (act: DirectorAct, why: string) => {
    if (!options.some((o) => o.act === act)) options.push({ act, th: DIRECTOR_ACT_TH[act], why })
  }
  if (s.parentContact !== 'ok' || want.has('parent')) {
    push('community', 'ครอบครัวไม่ตอบรับทางโทรศัพท์ — คนในพื้นที่ช่วยเป็นตัวกลางได้')
    push('homeVisitTeam', `หากยังไม่สำเร็จภายใน 3 วัน การไปพบที่บ้านพร้อมทีมเป็นทางที่เหลือ`)
  }
  if (want.has('people') || want.has('complex') || s.riskLevel === 'high' || s.riskLevel === 'critical') push('addGuidance', 'เด็กอาจเล่าปัญหากับครูแนะแนวได้ง่ายกว่า')
  if (want.has('resource')) push('resource', 'ครูระบุว่าต้องใช้ทรัพยากรที่อยู่นอกอำนาจครู')
  if (want.has('referral') || (needsAgency(s) && !c.refs.length)) push('referral', 'สาเหตุอยู่นอกอำนาจโรงเรียน ต้องมีหน่วยงานรับผิดชอบ')
  if (want.has('meeting') || want.has('complex')) push('meeting', 'หลายฝ่ายต้องตกลงผู้รับผิดชอบหลักและ next action ร่วมกัน')
  if (c.refs.some((r) => r.bucket === 'breach')) push('escalate', 'หน่วยงานปลายทางเกินกำหนดตอบรับ')
  if (!s.caseOwner) push('owner', 'เคสยังไม่มีครูผู้รับผิดชอบ')
  return { headline, options: options.slice(0, 4) }
}

/** action ที่กลับไปหาครูตามสิ่งที่ ผอ. เลือก — เป็นค่าตั้งต้นให้ ผอ. แก้ได้ */
export function directiveFor(acts: DirectorAct[], extra: { meetingDate?: string; resource?: string; newOwner?: string }): { th: string; support: string[]; dueDays: number } {
  const th: string[] = []
  const support = new Set<string>()
  let dueDays = 7
  if (acts.includes('homeVisitTeam')) {
    th.push('นัดหมายทีมเยี่ยมบ้านภายใน 3 วัน')
    support.add('ฝ่ายปกครอง')
    dueDays = Math.min(dueDays, 3)
  }
  if (acts.includes('community')) {
    th.push('ประสานผู้นำชุมชน / อสม. ที่ ผอ. ติดต่อไว้ให้')
    support.add('ผู้นำชุมชน / อสม.')
    dueDays = Math.min(dueDays, 3)
  }
  if (acts.includes('addGuidance')) {
    th.push('นัดครูแนะแนวพูดคุยกับนักเรียน')
    support.add('ครูแนะแนว')
  }
  if (acts.includes('coordinator')) support.add('ผู้ประสานที่ ผอ. มอบหมาย')
  if (acts.includes('resource')) {
    th.push(`ดำเนินการ${extra.resource ? extra.resource : 'ความช่วยเหลือ'}ตามที่อนุมัติ และแจ้งครอบครัว`)
    support.add('งานทุน / สวัสดิการ')
    dueDays = Math.min(dueDays, 5)
  }
  if (acts.includes('referral')) th.push('ส่งต่อหน่วยงานตามที่ ผอ. อนุมัติ')
  if (acts.includes('meeting')) {
    th.push(`เตรียมข้อมูลเคสสำหรับประชุมทีม${extra.meetingDate ? ` ${fmtDay(extra.meetingDate)}` : ''}`)
    support.add('ทีมช่วยเหลือนักเรียน')
  }
  if (acts.includes('owner') && extra.newOwner) th.push(`ส่งมอบรายละเอียดเคสให้ ${extra.newOwner}`)
  if (acts.includes('escalate')) th.push('แจ้งความคืบหน้าให้ ผอ. ทราบหลังเขตพื้นที่/อำเภอตอบรับ')
  return { th: th.join(' · ') || 'ดำเนินการตามคำแนะนำของ ผอ.', support: [...support], dueDays }
}

// ── กล่องเรื่องที่ต้องการการตัดสินใจ ──────────────────────────

export type InboxKind = 'request' | 'noOwner' | 'stuck'
export interface InboxItem {
  kind: InboxKind
  c: FollowCase
  req?: SupportRequest
  /** ทำไมเรื่องนี้มาถึง ผอ. */
  why: string
  /** วันนี้ต้องตัดสินใจ */
  today: boolean
  waitedDays: number
}

/** เคสที่ค้างนานจนครูขยับเองไม่ได้แล้ว แม้ครูยังไม่ได้ขอ — ระบบเตือน ผอ. ได้ แต่ไม่ยกเคสไปจากครู */
const STUCK_DAYS = 14

export function directorInbox(cases: FollowCase[], requests: SupportRequest[]): InboxItem[] {
  const byChild = new Map(cases.map((c) => [c.s.id, c]))
  const out: InboxItem[] = []
  const now = Date.now()
  for (const r of requests) {
    if (!waitsOnDirector(r)) continue
    const c = byChild.get(r.childId)
    if (!c) continue
    const st = requestStatus(r)
    const waitedDays = Math.floor((now - (st === 'answered' ? r.replies.at(-1)!.ts : r.ts)) / D)
    out.push({ kind: 'request', c, req: r, why: st === 'answered' ? 'ครูตอบข้อมูลที่ขอแล้ว รอ ผอ. ตัดสินใจ' : `ครูขอ: ${r.ask}`, today: true, waitedDays })
  }
  const asked = new Set(out.map((x) => x.c.s.id))
  for (const c of cases) {
    if (!c.open || asked.has(c.s.id) || (c.support && !['done', 'rejected'].includes(c.support.status))) continue
    const high = c.s.riskLevel === 'high' || c.s.riskLevel === 'critical'
    if (!c.s.caseOwner) out.push({ kind: 'noOwner', c, why: high ? 'นักเรียนเสี่ยงสูงแต่ยังไม่มีครูผู้รับผิดชอบ' : 'ยังไม่มีครูผู้รับผิดชอบ', today: high, waitedDays: c.updatedDaysAgo })
    else if (c.updatedDaysAgo >= STUCK_DAYS && high) out.push({ kind: 'stuck', c, why: `เสี่ยงสูงและไม่มีความคืบหน้า ${c.updatedDaysAgo} วัน — ${c.s.caseOwner}`, today: false, waitedDays: c.updatedDaysAgo })
  }
  const rank: Record<InboxKind, number> = { request: 0, noOwner: 1, stuck: 2 }
  return out.sort((a, b) => Number(b.today) - Number(a.today) || rank[a.kind] - rank[b.kind] || b.c.s.riskScore - a.c.s.riskScore)
}

// ── ภาพรวมของ ผอ. ───────────────────────────────────────────

export interface TeamRow {
  owner: string
  open: number
  high: number
  sla: number
  closed: number
}

/** ภาระงานจากเคสชุดเดียวกับที่ครูเห็น (ผู้รับผิดชอบของเด็ก + การเปลี่ยนผู้รับผิดชอบในแอป) */
export function teamLoad(cases: FollowCase[]): { rows: TeamRow[]; insight?: { owner: string; text: string } } {
  const m = new Map<string, TeamRow>()
  for (const c of cases) {
    const owner = c.s.caseOwner
    if (!owner) continue
    const r = m.get(owner) ?? { owner, open: 0, high: 0, sla: 0, closed: 0 }
    if (c.open) {
      r.open += 1
      if (c.s.riskLevel === 'high' || c.s.riskLevel === 'critical') r.high += 1
      if (c.sla.level === 'breach') r.sla += 1
    } else r.closed += 1
    m.set(owner, r)
  }
  const rows = [...m.values()].sort((a, b) => b.open - a.open)
  const avgHigh = rows.length ? rows.reduce((a, r) => a + r.high, 0) / rows.length : 0
  const top = rows.find((r) => r.high >= 2 && r.high >= avgHigh * 2)
  return {
    rows,
    insight: top ? { owner: top.owner, text: `${top.owner} ดูแลเคสเสี่ยงสูง ${top.high} เคส มากกว่าค่าเฉลี่ยของทีม (${avgHigh.toFixed(1)}) ราว ${(top.high / Math.max(0.1, avgHigh)).toFixed(1)} เท่า` } : undefined,
  }
}

export type BottleneckKey = 'parent' | 'agency' | 'noPlan' | 'noOwner' | 'resource'
export const BOTTLENECK_TH: Record<BottleneckKey, string> = {
  parent: 'ติดต่อผู้ปกครองไม่ได้',
  agency: 'รอหน่วยงานภายนอก',
  noPlan: 'เสี่ยงสูงแต่ยังไม่มีแผน',
  noOwner: 'ยังไม่มีครูผู้รับผิดชอบ',
  resource: 'ขาดทรัพยากรช่วยเหลือ',
}

/** ปัญหาที่ทำให้เคสค้าง — นับเฉพาะเคสที่ยังเปิดและค้างจริง (เกิน SLA หรือไม่ขยับ 5 วันขึ้นไป) */
export function bottlenecks(cases: FollowCase[], requests: SupportRequest[]): { key: BottleneckKey; n: number; ids: string[] }[] {
  const stuck = cases.filter((c) => c.open && (c.sla.level === 'breach' || c.updatedDaysAgo >= 5))
  const pick = (key: BottleneckKey, test: (c: FollowCase) => boolean) => {
    const ids = stuck.filter(test).map((c) => c.s.id)
    return { key, n: ids.length, ids }
  }
  const wantsResource = new Set(requests.filter((r) => r.reasons.includes('resource')).map((r) => r.childId))
  return [
    pick('parent', (c) => c.s.parentContact === 'unreachable' || c.s.parentContact === 'delayed'),
    pick('agency', (c) => c.refs.some((r) => ['breach', 'near', 'awaiting'].includes(r.bucket))),
    pick('noPlan', (c) => (c.s.riskLevel === 'high' || c.s.riskLevel === 'critical') && !c.hasPlan),
    pick('noOwner', (c) => !c.s.caseOwner),
    pick('resource', (c) => wantsResource.has(c.s.id)),
  ]
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
}

/** ผลลัพธ์ ไม่ใช่จำนวนครั้งที่ลงมือ */
export function outcomes(cases: FollowCase[]) {
  const avg4 = (c: FollowCase) => {
    const r = c.s.attendance.slice(-4)
    return r.length ? r.reduce((a, p) => a + p.rate, 0) / r.length : 0
  }
  return {
    /** เคสที่เปิดอยู่และมีการลงมือภายในกำหนดติดตาม (ไม่เกิน SLA) — นับทุกเคสที่ "เคยมีบันทึก" จะได้ทุกคนเสมอ ไม่บอกอะไร */
    helped: cases.filter((c) => c.open && c.sla.level !== 'breach').length,
    riskDown: cases.filter((c) => c.riskDelta <= -8).length,
    attending: cases.filter((c) => avg4(c) >= 80 && c.s.absenceStreak <= 2).length,
    closed: cases.filter((c) => !c.open && !c.relapse).length,
    relapse: cases.filter((c) => c.relapse).length,
  }
}
