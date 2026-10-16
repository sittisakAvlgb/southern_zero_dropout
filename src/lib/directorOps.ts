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
/** `heavy` = ครูที่ภาระงานล้น (จาก teamLoad) — ถ้าเป็นเจ้าของเคสนี้ ทางแรกที่เสนอคือย้ายผู้รับผิดชอบ
 *  ตรรกะเดียวกับการ์ดหลักบนหน้าแรก ผอ. จึงไม่ได้คำแนะนำสองแบบสำหรับเด็กคนเดียวกัน */
export function execSummary(c: FollowCase, req?: SupportRequest, heavy?: string): { headline: string; options: ExecOption[] } {
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
  if (s.caseOwner && s.caseOwner === heavy) push('owner', `${s.caseOwner} รับเคสเสี่ยงสูงมากกว่าค่าเฉลี่ยทีมหลายเท่า — ย้ายเคสนี้ให้ครูที่ว่างกว่า`)
  if (s.parentContact !== 'ok' || want.has('parent')) {
    push('community', 'ครอบครัวไม่ตอบรับทางโทรศัพท์ — คนในพื้นที่ช่วยเป็นตัวกลางได้')
    push('homeVisitTeam', `หากยังไม่สำเร็จภายใน 3 วัน การไปพบที่บ้านพร้อมทีมเป็นทางที่เหลือ`)
  }
  // ไม่เสนอเพิ่มครูแนะแนวให้เคสที่ครูแนะแนวดูแลอยู่แล้ว
  if (!/แนะแนว/.test(s.caseOwner) && (want.has('people') || want.has('complex') || s.riskLevel === 'high' || s.riskLevel === 'critical')) push('addGuidance', 'เด็กอาจเล่าปัญหากับครูแนะแนวได้ง่ายกว่า')
  if (want.has('resource')) push('resource', 'ครูระบุว่าต้องใช้ทรัพยากรที่อยู่นอกอำนาจครู')
  if (want.has('referral') || (needsAgency(s) && !c.refs.length)) push('referral', 'สาเหตุอยู่นอกอำนาจโรงเรียน ต้องมีหน่วยงานรับผิดชอบ')
  if (want.has('meeting') || want.has('complex')) push('meeting', 'หลายฝ่ายต้องตกลงผู้รับผิดชอบหลักและ next action ร่วมกัน')
  if (c.refs.some((r) => r.bucket === 'breach')) push('escalate', 'หน่วยงานปลายทางเกินกำหนดตอบรับ')
  if (!s.caseOwner) push('owner', 'เคสยังไม่มีครูผู้รับผิดชอบ')
  return { headline, options: options.slice(0, 4) }
}

/** action ที่กลับไปหาครูตามสิ่งที่ ผอ. เลือก — เป็นค่าตั้งต้นให้ ผอ. แก้ได้ */
/** ACTS ตามลำดับที่แสดง — ใช้เรียงสิ่งที่ติ๊กไว้ให้ */
const ACT_ORDER: DirectorAct[] = ['homeVisitTeam', 'addGuidance', 'community', 'coordinator', 'resource', 'referral', 'meeting', 'owner', 'escalate']

/** คำในคำขอของครู → สิ่งที่ ผอ. ทำให้ */
const ASK_WORDS: [RegExp, DirectorAct][] = [
  [/เยี่ยมบ้าน/, 'homeVisitTeam'],
  [/ผู้นำชุมชน|อสม|ชุมชน|อิหม่าม/, 'community'],
  [/ครูแนะแนว|นักจิตวิทยา|คนช่วย/, 'addGuidance'],
  [/ผู้ประสาน/, 'coordinator'],
  [/ทรัพยากร|งบ|ทุน|ค่าเดินทาง|อุปกรณ์/, 'resource'],
  [/ส่งต่อ|หน่วยงาน/, 'referral'],
  [/ประชุม/, 'meeting'],
  [/เขตพื้นที่|ยกระดับ|อำเภอ/, 'escalate'],
  [/เปลี่ยนผู้รับผิดชอบ|ย้ายเคส|เปลี่ยนครู/, 'owner'],
]
const REASON_ACT: Partial<Record<SupportRequest['reasons'][number], DirectorAct>> = {
  parent: 'community',
  people: 'addGuidance',
  resource: 'resource',
  referral: 'referral',
  meeting: 'meeting',
  complex: 'meeting',
}

/**
 * สิ่งที่ติ๊กไว้ให้ ผอ. ในใบตัดสินใจ — ตามที่ครูขอก่อน (คำในคำขอ + เหตุผลที่ครูเลือก)
 * ไม่ติ๊ก "เปลี่ยนผู้รับผิดชอบหลัก" ให้เอง เว้นแต่ครูขอ: ครูมาขอความช่วยเหลือ ไม่ได้ขอให้ย้ายเคสออกจากตัวเอง
 * ถ้าคำขอไม่บอกอะไรเลย จึงใช้ทางที่ AI เสนอ (ยกเว้นการย้ายผู้รับผิดชอบ)
 */
export function actsFromRequest(req: SupportRequest, aiActs: DirectorAct[]): DirectorAct[] {
  const want = new Set<DirectorAct>()
  for (const [re, act] of ASK_WORDS) if (re.test(req.ask)) want.add(act)
  for (const r of req.reasons) {
    const a = REASON_ACT[r]
    if (a) want.add(a)
  }
  if (!want.size) for (const a of aiActs.filter((x) => x !== 'owner').slice(0, 2)) want.add(a)
  return ACT_ORDER.filter((a) => want.has(a))
}

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

// ── AI Executive Brief ──────────────────────────────────────
//
// FILTER → PRIORITIZE → SUMMARIZE → RECOMMEND
// ผอ. ไม่ต้องตีความตัวเลขเอง: ที่นี่เลือก 3–5 เรื่อง จัดระดับ บอกเหตุผล และบอกว่า ผอ. ต้องทำอะไร
// ทุกเรื่องมาจากข้อมูลจริงในระบบ คำนวณล้วน ไม่ต้องมี API key (ใช้ได้บนเว็บ static)

export type Tier = 'now' | 'soon' | 'watch' | 'ok'
export const TIER_META: Record<Tier, { th: string; dot: string; rank: number }> = {
  now: { th: 'ต้องตัดสินใจวันนี้', dot: '#dc2626', rank: 0 },
  soon: { th: 'ควรจัดการเร็ว ๆ นี้', dot: '#ea580c', rank: 1 },
  watch: { th: 'เฝ้าติดตาม', dot: '#ca8a04', rank: 2 },
  ok: { th: 'สถานการณ์ปกติ', dot: '#16a34a', rank: 3 },
}

/** สิ่งที่ปุ่มของ ผอ. ทำ — เปิดเคสพร้อมขั้นที่ตรงเรื่อง ไม่ใช่ "ดูรายละเอียด" */
export type DirectorGo =
  | { kind: 'case'; id: string; start: 'decide' | 'assign' | 'nudge' | 'escalate'; owner?: string }
  | { kind: 'team'; owner: string }
  | { kind: 'focus'; key: BottleneckKey }

export interface BriefOption {
  label: string
  /** เลือกแล้วจะเกิดอะไร — ผอ. ต้องเห็นผลก่อนกด */
  effect: string
  go: DirectorGo
  /** ทางที่ AI แนะนำจากข้อมูลล่าสุด (มีได้ทางเดียว) */
  recommended?: boolean
}

export interface BriefItem {
  key: string
  tier: Tier
  /** ใคร + เกิดอะไร — ชื่อคนหรือชื่อเรื่องมาก่อน ไม่ใช่ "นักเรียน N คน" */
  title: string
  /** ข้อเท็จจริงที่ทำให้เรื่องนี้สำคัญ (ไม่เกินสามข้อ) */
  why: string[]
  /** สาเหตุต้นทาง ถ้า AI เห็น — เช่น เคสค้างเพราะครูรับงานเกินกำลัง */
  rootCause?: string
  /** สิ่งที่ ผอ. ต้องตัดสินใจ เป็นคำถาม */
  question: string
  options: BriefOption[]
  /** ข้อมูลที่ใช้ประกอบ (ไม่ใช่สูตร) */
  source: string
  /** ทางที่ AI แนะนำ — ใช้ในคำตอบของ "ถาม AI" */
  action: { label: string; go: DirectorGo }
  ids: string[]
}

const names = (cs: FollowCase[], n = 2) =>
  cs.slice(0, n).map((c) => c.s.name.split(' ')[0]).join(', ') + (cs.length > n ? ` และอีก ${cs.length - n} คน` : '')
const isHigh = (c: FollowCase) => c.s.riskLevel === 'high' || c.s.riskLevel === 'critical'
/** "ครูนูรียะ" แทน "ครูแนะแนว นูรียะ" ในประโยค — ครูคนอื่นในทีม (อสม. · นักจิตวิทยา) คงตำแหน่งไว้ */
const short = (owner: string) => (/^ครู/.test(owner) ? `ครู${owner.replace(/^(ครูแนะแนว|ครูประจำชั้น|ครู)\s*/, '')}` : owner)
/** ข้อเท็จจริงที่ยังไม่ได้พูดถึงในบรรทัดความเสี่ยง — การมาเรียนกับผู้ปกครองเท่านั้น ไม่ซ้ำคะแนนหรือ SLA */
const lifeLine = (c: FollowCase) =>
  [c.s.absenceStreak >= 3 && `ขาดเรียนต่อเนื่อง ${c.s.absenceStreak} วัน`, c.s.parentContact === 'unreachable' ? 'ติดต่อผู้ปกครองไม่ได้' : c.s.parentContact === 'delayed' ? 'ผู้ปกครองตอบช้า' : '']
    .filter(Boolean)
    .join(' · ') || `มาเรียนสัปดาห์นี้ ${Math.round(c.s.attendance.at(-1)?.rate ?? 0)}%`
const childLine = (c: FollowCase, grade: (g: string) => string) => `${c.s.name} (${grade(c.s.gradeKey)})`

/** ทำ item ให้ครบ — action = ทางที่ AI แนะนำ (หรือทางแรก) */
function item(x: Omit<BriefItem, 'action'>): BriefItem {
  const rec = x.options.find((o) => o.recommended) ?? x.options[0]
  return { ...x, action: { label: rec.label, go: rec.go } }
}

/**
 * `handled` = เด็กที่ ผอ. เพิ่งลงมือไปแล้ว (เตือน · มอบหมาย · Escalate ภายใน 3 วัน)
 * เรื่องเหล่านี้ไม่ต้องเสนอซ้ำจนกว่าจะค้างต่ออีก — ไม่งั้นการ์ดเดิมจะกลับมาบอกให้เตือนทุกวัน
 *
 * แต่ละเรื่องตอบสี่ข้อ: ใคร/อะไร · ทำไมสำคัญ · สาเหตุต้นทาง · ผอ. ต้องเลือกอะไร (พร้อมผลของแต่ละทาง)
 */
export function dailyBrief(
  cases: FollowCase[],
  requests: SupportRequest[],
  handled: Set<string> = new Set(),
  grade: (g: string) => string = (g) => g,
): BriefItem[] {
  const open = cases.filter((c) => c.open && !handled.has(c.s.id))
  const active = new Set(requests.filter((r) => !['done', 'rejected'].includes(requestStatus(r))).map((r) => r.childId))
  const out: BriefItem[] = []
  const today = isoIn(0)
  const team = teamLoad(cases)
  const heavy = team.insight?.owner
  // ครูที่ว่างที่สุด (ไม่นับคนที่งานล้น) — ใช้เป็นข้อเสนอเวลาต้องย้ายเคส
  const lightest = [...team.rows].filter((r) => r.owner !== heavy).sort((a, b) => a.high - b.high || a.open - b.open)[0]?.owner

  // 1) ครูขอการสนับสนุน — ตัดสินใจตามคำขอ
  const waiting = requests.filter(waitsOnDirector).sort((a, b) => a.ts - b.ts)
  if (waiting.length) {
    const r = waiting[0]
    const c = cases.find((x) => x.s.id === r.childId)
    out.push(
      item({
        key: 'requests',
        tier: 'now',
        title: `${c ? childLine(c, grade) : r.childName} — ${short(r.by)}ขอให้ ผอ. ช่วย`,
        why: [`“${r.ask}”`, r.summary, ...(waiting.length > 1 ? [`มีคำขออื่นรออีก ${waiting.length - 1} เรื่อง`] : [])].slice(0, 3),
        question: 'จะอนุมัติตามที่ครูขอไหม?',
        options: [{ label: 'พิจารณาคำขอ', effect: 'เห็นสิ่งที่ครูทำแล้วและทางเลือกที่ AI เสนอ แล้วตัดสินใจ — งานกลับไปที่ครูทันที', go: { kind: 'case', id: r.childId, start: 'decide' }, recommended: true }],
        source: 'คำขอจากครูในแฟ้มเด็ก',
        ids: waiting.map((x) => x.childId),
      }),
    )
  }

  // 2) ไม่มีผู้รับผิดชอบ — ต้องมีคนดูแลวันนี้
  const noOwner = open.filter((c) => !c.s.caseOwner).sort((a, b) => b.s.riskScore - a.s.riskScore)
  if (noOwner.length) {
    const c = noOwner[0]
    out.push(
      item({
        key: 'noOwner',
        tier: noOwner.some(isHigh) ? 'now' : 'soon',
        title: `${childLine(c, grade)} ยังไม่มีครูรับผิดชอบ${noOwner.length > 1 ? ` (และอีก ${noOwner.length - 1} คน)` : ''}`,
        why: [`ความเสี่ยง${LEVEL_TH[c.s.riskLevel]} ${c.s.riskScore}/100`, lifeLine(c), 'ไม่มีใครถูกนับว่าต้องตามเด็กคนนี้'],
        question: 'จะให้ครูคนไหนดูแล?',
        options: [{ label: lightest ? `มอบหมายให้ ${lightest}` : 'มอบหมายครู', effect: lightest ? `AI เสนอ ${lightest} เพราะมีเคสเสี่ยงสูงน้อยที่สุดในทีม — เปลี่ยนคนได้ในขั้นถัดไป` : 'เลือกครูจากทีม เคสจะขึ้นในงานวันนี้ของครูคนนั้น', go: { kind: 'case', id: c.s.id, start: 'assign', owner: lightest }, recommended: true }],
        source: 'ผู้รับผิดชอบในแฟ้มเด็ก · ภาระงานของทีม',
        ids: noOwner.map((x) => x.s.id),
      }),
    )
  }

  // 3) เสี่ยงสูงและไม่ขยับ — ครูยังไม่ได้ขอ แต่ไม่มีใครขยับได้นอกจาก ผอ.
  const stuck = open
    .filter((c) => isHigh(c) && c.updatedDaysAgo >= 14 && !active.has(c.s.id) && c.s.caseOwner)
    .sort((a, b) => b.riskDelta - a.riskDelta || b.updatedDaysAgo - a.updatedDaysAgo)
  if (stuck.length) {
    const c = stuck[0]
    const ownerHeavy = c.s.caseOwner === heavy
    const row = team.rows.find((r) => r.owner === c.s.caseOwner)
    out.push(
      item({
        key: 'stuck',
        tier: stuck.some((x) => x.riskDelta >= 5) ? 'now' : 'soon',
        title: `${childLine(c, grade)} ไม่มีใครขยับเคสมา ${c.updatedDaysAgo} วัน${stuck.length > 1 ? ` (และอีก ${stuck.length - 1} คน)` : ''}`,
        why: [
          c.riskDelta >= 5 ? `ความเสี่ยงเพิ่ม +${c.riskDelta} (${c.s.riskScore - c.riskDelta} → ${c.s.riskScore})` : `ความเสี่ยง${LEVEL_TH[c.s.riskLevel]} ${c.s.riskScore}/100`,
          lifeLine(c),
          `ผู้รับผิดชอบ: ${c.s.caseOwner} · ${c.sla.text}`,
        ],
        rootCause: ownerHeavy && row ? `${short(c.s.caseOwner)} ดูแลเคสเสี่ยงสูง ${row.high} เคส และเกิน SLA ${row.sla} เคส — เคสนี้น่าจะค้างเพราะงานล้นมือ ไม่ใช่เพราะไม่ใส่ใจ` : undefined,
        question: ownerHeavy ? `จะให้${short(c.s.caseOwner)}เร่งเคสนี้ หรือย้ายให้ครูคนอื่น?` : `จะให้${short(c.s.caseOwner)}เร่งเคสนี้อย่างไร?`,
        options: [
          ...(ownerHeavy && lightest
            ? [{ label: `ย้ายให้ ${lightest}`, effect: `ลดงานของ${short(c.s.caseOwner)} เคสขึ้นในงานวันนี้ของ ${lightest} ทันที`, go: { kind: 'case' as const, id: c.s.id, start: 'assign' as const, owner: lightest }, recommended: true }]
            : []),
          { label: `เตือน${short(c.s.caseOwner)}`, effect: 'ส่งข้อความถึงครูผู้รับผิดชอบ บันทึกในไทม์ไลน์ของเด็ก — ครูยังดูแลเคสต่อ', go: { kind: 'case', id: c.s.id, start: 'nudge' }, recommended: !ownerHeavy || !lightest },
        ],
        source: 'วันที่อัปเดตล่าสุด · คะแนนเสี่ยง 8 สัปดาห์ · ภาระงานของทีม',
        ids: stuck.map((x) => x.s.id),
      }),
    )
  }

  // 4) หน่วยงานภายนอกเกินกำหนด — ที่ ผอ. เพิ่ง Escalate (72 ชม.) ไม่ต้องให้กดซ้ำ
  const escalatedRecently = (r: FollowCase['refs'][number]) => r.events.some((e) => e.type === 'escalated' && Date.now() - e.ts < 72 * 3600_000)
  const agency = open.filter((c) => c.refs.some((r) => r.bucket === 'breach' && !escalatedRecently(r)))
  if (agency.length) {
    const c = agency[0]
    const ref = c.refs.find((r) => r.bucket === 'breach' && !escalatedRecently(r))!
    out.push(
      item({
        key: 'agency',
        tier: 'soon',
        title: `${ref.toName} ยังไม่รับเรื่องของ${c.s.name}${agency.length > 1 ? ` (และอีก ${agency.length - 1} เคส)` : ''}`,
        why: [`${ref.needTh} · ${ref.sla.text}`, lifeLine(c), 'ครูทวงเองแล้วยังไม่ตอบรับ'],
        question: 'จะยกระดับเรื่องนี้ถึงหัวหน้าหน่วยงานไหม?',
        options: [
          { label: 'Escalate ถึงหัวหน้าหน่วยงาน', effect: 'บันทึกการยกระดับบนการส่งต่อ — หน่วยงานเห็นว่า ผอ. ติดตามเอง', go: { kind: 'case', id: c.s.id, start: 'escalate' }, recommended: true },
          { label: 'ให้ครูทวงอีกครั้ง', effect: 'ส่งข้อความถึงครูผู้รับผิดชอบ ยังไม่ยกระดับ', go: { kind: 'case', id: c.s.id, start: 'nudge' } },
        ],
        source: 'นาฬิกา SLA ของการส่งต่อ',
        ids: agency.map((x) => x.s.id),
      }),
    )
  }

  // 5) ภาระงานครู — ต้นเหตุของเคสค้างหลายเคส
  if (team.insight) {
    const row = team.rows.find((r) => r.owner === team.insight!.owner)!
    const stale = open.filter((c) => c.s.caseOwner === row.owner && c.updatedDaysAgo >= 7).length
    const avg = team.rows.reduce((a, r) => a + r.high, 0) / Math.max(1, team.rows.length)
    out.push(
      item({
        key: 'load',
        tier: 'soon',
        title: `${row.owner} รับงานเกินกำลัง`,
        why: [`เคสเสี่ยงสูง ${row.high} เคส มากกว่าค่าเฉลี่ยทีม ${(row.high / Math.max(0.1, avg)).toFixed(1)} เท่า`, `เกิน SLA ${row.sla} เคส · ไม่ขยับเกิน 7 วัน ${stale} เคส`],
        question: `จะลดภาระของ${short(row.owner)}อย่างไร?`,
        options: [
          { label: 'กระจายเคส', effect: `เลือกเคสที่จะย้ายให้ครูคนอื่น${lightest ? ` (AI เสนอ ${lightest})` : ''}`, go: { kind: 'team', owner: row.owner }, recommended: true },
          { label: 'เพิ่มผู้ช่วย', effect: `${short(row.owner)}ยังเป็นผู้รับผิดชอบหลัก มีคนช่วยในเคสเสี่ยงสูง`, go: { kind: 'team', owner: row.owner } },
        ],
        source: 'เคสที่เปิดอยู่ของครูแต่ละคน',
        ids: [],
      }),
    )
  }

  // 6) งานที่ ผอ. ส่งกลับไปแล้วเลยกำหนด
  const overdue = requests.filter((r) => requestStatus(r) === 'withTeacher' && (r.decisions.at(-1)?.next?.due ?? '9') < today)
  if (overdue.length) {
    const r = overdue[0]
    const d = r.decisions.at(-1)!.next!
    out.push(
      item({
        key: 'overdue',
        tier: 'soon',
        title: `${r.childName} — งานที่ ผอ. อนุมัติเลยกำหนดแล้ว`,
        why: [`${d.owner}: ${d.th}`, `กำหนด ${fmtDay(d.due)}`],
        question: 'จะติดตามกับครูไหม?',
        options: [{ label: `ติดตามกับ${short(d.owner)}`, effect: 'ส่งข้อความถึงครู บันทึกในไทม์ไลน์ของเด็ก', go: { kind: 'case', id: r.childId, start: 'nudge' }, recommended: true }],
        source: 'การตัดสินใจของ ผอ. และผลที่ครูบันทึก',
        ids: overdue.map((x) => x.childId),
      }),
    )
  }

  // 7) เสี่ยงสูงยังไม่มีแผน
  const noPlan = open.filter((c) => isHigh(c) && !c.hasPlan)
  if (noPlan.length)
    out.push(
      item({
        key: 'noPlan',
        tier: 'watch',
        title: `เด็กเสี่ยงสูง ${noPlan.length} คนยังไม่มีแผนช่วยเหลือ`,
        why: [names(noPlan), 'ยังไม่มีใครรู้ว่าใครต้องทำอะไรเมื่อไร'],
        question: 'จะให้ครูทำแผนให้ครบเมื่อไร?',
        options: [{ label: 'ดูรายชื่อและเตือนครู', effect: 'เปิดรายชื่อเด็กที่ยังไม่มีแผน เตือนครูผู้รับผิดชอบทีละคน', go: { kind: 'focus', key: 'noPlan' }, recommended: true }],
        source: 'แผนโอกาสรายบุคคล',
        ids: noPlan.map((x) => x.s.id),
      }),
    )

  const sorted = out.sort((a, b) => TIER_META[a.tier].rank - TIER_META[b.tier].rank)
  return sorted.slice(0, 5)
}

/** "หากมีเวลา 10 นาที" — เรื่องระดับวันนี้ก่อน ไม่เกินสองเรื่อง */
export function tenMinutePick(items: BriefItem[]): number[] {
  const now = items.map((x, i) => (x.tier === 'now' ? i : -1)).filter((i) => i >= 0)
  return (now.length ? now : items.map((_, i) => i)).slice(0, 2)
}

// ── เทียบกับสัปดาห์ก่อน ─────────────────────────────────────
// ใช้เฉพาะสิ่งที่ย้อนดูได้จริงจากข้อมูล: คะแนนเสี่ยงรายสัปดาห์ · อัตรามาเรียนรายสัปดาห์
// · SLA ที่ย้อนได้จากวันอัปเดตล่าสุด (เคสที่วันนี้ไม่ขยับ 15 วัน เมื่อ 7 วันก่อนก็ไม่ขยับ 8 วัน)

export interface WeekRow {
  th: string
  before: number
  now: number
  /** ค่าที่มากขึ้นดีหรือแย่ */
  better: 'up' | 'down'
  unit?: string
}

export function weekCompare(cases: FollowCase[]): { rows: WeekRow[]; summary: string } {
  const high = (score: number) => score >= 70
  const before = cases.filter((c) => high(c.s.riskHistory.at(-2)?.score ?? c.s.riskScore)).length
  const now = cases.filter((c) => high(c.s.riskScore)).length
  const slaNow = cases.filter((c) => c.open && c.sla.level === 'breach').length
  const slaBefore = cases.filter((c) => c.open && c.sla.level === 'breach' && c.updatedDaysAgo - 7 > 7).length
  const att = (pick: (c: FollowCase) => number | undefined) => {
    const xs = cases.map(pick).filter((x): x is number => typeof x === 'number')
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0
  }
  const attNow = att((c) => c.s.attendance.at(-1)?.rate)
  const attBefore = att((c) => c.s.attendance.at(-2)?.rate)
  const rows: WeekRow[] = [
    { th: 'นักเรียนเสี่ยงสูง (ในแฟ้ม)', before, now, better: 'down' },
    { th: 'เคสเกิน SLA', before: slaBefore, now: slaNow, better: 'down' },
    { th: 'มาเรียนเฉลี่ย (กลุ่มติดตาม)', before: attBefore, now: attNow, better: 'up', unit: '%' },
  ]
  const riskBetter = now < before
  const slaWorse = slaNow > slaBefore
  const summary =
    riskBetter && slaWorse
      ? 'จำนวนเด็กเสี่ยงสูงลดลง แต่เคสค้างเพิ่มขึ้น — สัปดาห์นี้อาจพิจารณาโฟกัสการติดตามเคสเดิมมากกว่าการค้นหาเคสใหม่'
      : !riskBetter && slaWorse
        ? 'เด็กเสี่ยงสูงไม่ลดลงและเคสค้างเพิ่มขึ้น — อาจพิจารณาเพิ่มคนช่วยในทีมก่อนเรื่องอื่น'
        : riskBetter
          ? 'ทิศทางดีขึ้นทั้งความเสี่ยงและการติดตาม — รักษาจังหวะเดิมไว้'
          : 'เคสค้างไม่เพิ่ม แต่จำนวนเด็กเสี่ยงสูงยังไม่ลด — อาจพิจารณาดูเคสที่ความเสี่ยงเพิ่มขึ้น'
  return { rows, summary }
}

// ── ถาม AI เกี่ยวกับสถานการณ์โรงเรียน ─────────────────────────
// ไม่ใช่แชตบอต: คำถามสำเร็จรูป ตอบจากข้อมูลในระบบ และลิงก์กลับไปที่เคสจริงเสมอ

export interface DirectorAnswer {
  lines: string[]
  links: { label: string; go: DirectorGo }[]
}

export const DIRECTOR_QUESTIONS = [
  { k: 'decide', th: 'วันนี้มีอะไรที่ผมต้องตัดสินใจ?' },
  { k: 'riskiest', th: 'เคสไหนเสี่ยงที่สุด?' },
  { k: 'load', th: 'ครูคนไหนมีภาระงานมากที่สุด?' },
  { k: 'why', th: 'ทำไมเคสถึงค้าง?' },
  { k: 'grade', th: 'ระดับชั้นไหนความเสี่ยงเพิ่มขึ้น?' },
  { k: 'refer', th: 'มีเคสไหนที่ควรส่งต่อ?' },
  { k: 'fifteen', th: 'ถ้ามีเวลาแค่ 15 นาที ควรจัดการอะไร?' },
] as const
export type DirectorQ = (typeof DIRECTOR_QUESTIONS)[number]['k']

export function askDirector(k: DirectorQ, cases: FollowCase[], requests: SupportRequest[], gradeLabel: (g: string) => string): DirectorAnswer {
  const open = cases.filter((c) => c.open)
  const brief = dailyBrief(cases, requests)
  const caseGo = (c: FollowCase): DirectorGo => ({ kind: 'case', id: c.s.id, start: c.s.caseOwner ? 'nudge' : 'assign' })
  switch (k) {
    case 'decide': {
      const now = brief.filter((b) => b.tier === 'now')
      return now.length
        ? { lines: now.map((b, i) => `${i + 1}. ${b.title} — ${b.why[0]}`), links: now.map((b) => ({ label: b.action.label, go: b.action.go })) }
        : {
            lines: ['จากข้อมูลล่าสุด วันนี้ไม่มีเรื่องที่ต้องตัดสินใจเร่งด่วน', ...(brief[0] ? [`เรื่องที่ควรจัดการเร็ว ๆ นี้: ${brief[0].title}`] : [])],
            links: brief[0] ? [{ label: brief[0].action.label, go: brief[0].action.go }] : [],
          }
    }
    case 'riskiest': {
      const top = [...open].sort((a, b) => b.s.riskScore - a.s.riskScore).slice(0, 3)
      return {
        lines: top.map((c) => `${c.s.name} (${gradeLabel(c.s.gradeKey)}) ${c.s.riskScore}/100 · ${caseSummaryLine(c)} · ${c.s.caseOwner || 'ไม่มีผู้รับผิดชอบ'}`),
        links: top.map((c) => ({ label: `เปิดเคส ${c.s.name.split(' ')[0]}`, go: caseGo(c) })),
      }
    }
    case 'load': {
      const t = teamLoad(cases)
      const top = t.rows[0]
      return top
        ? {
            lines: [...t.rows.slice(0, 3).map((r) => `${r.owner}: เปิดอยู่ ${r.open} เคส · เสี่ยงสูง ${r.high} · เกิน SLA ${r.sla}`), ...(t.insight ? [t.insight.text] : [])],
            links: [{ label: `กระจายเคสของ ${top.owner}`, go: { kind: 'team', owner: top.owner } }],
          }
        : { lines: ['ยังไม่มีเคสที่มีผู้รับผิดชอบ'], links: [] }
    }
    case 'why': {
      const j = bottlenecks(cases, requests)
      return j.length
        ? {
            lines: [`เคสค้างส่วนใหญ่ติดที่${BOTTLENECK_TH[j[0].key]} (${j[0].n} เคส)`, ...j.slice(1, 3).map((x) => `รองลงมา: ${BOTTLENECK_TH[x.key]} (${x.n} เคส)`)],
            links: j.slice(0, 2).map((x) => ({ label: `ดู ${x.n} เคส · ${BOTTLENECK_TH[x.key]}`, go: { kind: 'focus' as const, key: x.key } })),
          }
        : { lines: ['ไม่มีเคสค้าง — ทุกเคสมีความคืบหน้าใน 5 วัน'], links: [] }
    }
    case 'grade': {
      const m = new Map<string, number[]>()
      for (const c of cases) m.set(c.s.gradeKey, [...(m.get(c.s.gradeKey) ?? []), c.riskDelta])
      const rows = [...m.entries()].map(([g, ds]) => ({ g, d: ds.reduce((a, b) => a + b, 0) / ds.length, n: ds.length })).sort((a, b) => b.d - a.d)
      const up = rows.filter((r) => r.d > 0).slice(0, 2)
      return up.length
        ? { lines: up.map((r) => `${gradeLabel(r.g)}: ความเสี่ยงเฉลี่ยเพิ่ม ${r.d.toFixed(1)} คะแนนใน 8 สัปดาห์ (${r.n} คนที่ติดตาม)`), links: [] }
        : { lines: ['ไม่มีระดับชั้นที่ความเสี่ยงเฉลี่ยเพิ่มขึ้นใน 8 สัปดาห์'], links: [] }
    }
    case 'refer': {
      const need = open.filter((c) => isHigh(c) && needsAgency(c.s) && !c.refs.length)
      return need.length
        ? { lines: [`${need.length} เคสเสี่ยงสูงที่สาเหตุอยู่นอกอำนาจโรงเรียนแต่ยังไม่ได้ส่งต่อ`, names(need, 3)], links: need.slice(0, 2).map((c) => ({ label: `เปิดเคส ${c.s.name.split(' ')[0]}`, go: caseGo(c) })) }
        : { lines: ['เคสเสี่ยงสูงที่ต้องใช้หน่วยงานภายนอกถูกส่งต่อแล้วทั้งหมด'], links: [] }
    }
    case 'fifteen': {
      // 15 นาทีพอสำหรับสามเรื่องแรกตามลำดับความสำคัญ (10 นาทีในหน้าแรกเลือกแค่เรื่องระดับวันนี้)
      const pick = brief.slice(0, 3).map((_, i) => i)
      return pick.length
        ? { lines: pick.map((i, n) => `${n + 1}. ${brief[i].action.label} — ${brief[i].title}`), links: pick.map((i) => ({ label: brief[i].action.label, go: brief[i].action.go })) }
        : { lines: ['วันนี้ไม่มีเรื่องเร่งด่วน — ใช้เวลาดูแนวโน้มรายสัปดาห์ได้'], links: [] }
    }
  }
}
