// ─────────────────────────────────────────────────────────────
// AI ของเขตพื้นที่ — FILTER → PRIORITIZE → SUMMARIZE → RECOMMEND → ROUTE RESOURCES
//
// เขตไม่ต้องเห็นทุกข้อมูลพร้อมกัน แต่ต้องรู้ว่าพื้นที่ไหนต้องดูแลก่อน ทำไม และเขตควรช่วยอย่างไร
// ทุกเรื่องคำนวณจากข้อมูลในระบบ (เคส · นักเรียนที่ติดตาม · ทะเบียนเด็กนอกระบบ · การส่งต่อ ·
// คำขอจากโรงเรียน) ไม่ต้องมี API key ภาษาเป็น "อาจพิจารณา" ไม่สั่งผู้บริหารเขต
// ─────────────────────────────────────────────────────────────
import type { CaseRecord, District, OoscRecord, Referral, School, Student } from '@/types'
import { stageOf } from './areaOps'
import { FILTERS, type FollowCase } from './followOps'
import { AREA_NEED_TH, areaRequestStatus, type AreaAct, type AreaRequest, type AreaState } from './areaLog'

/** "เกิน SLA" มีสองนิยามในระบบนี้ และแต่ละที่นั่งเลือกไว้แล้วว่าใช้ตัวไหน
 *  (ดูตารางใน skill.md) — `cases.slaBreached` นับจากระเบียนเคส ส่วน `FILTERS.sla`
 *  นับจาก `FollowCase` ซึ่งรวมการส่งต่อที่เกินกำหนด และเริ่มนับใหม่เมื่อครูบันทึก
 *
 *  เขตใช้ตัวหลังทั้งหน้าแรก ป้ายเมนู และหน้าติดตามการช่วยเหลือ ถ้าการ์ดรายอำเภอ
 *  กับแถวรายโรงเรียนยังนับจาก `cases` หน้าเดียวกันจะมี KPI 81 อยู่บน แล้วการ์ด
 *  สี่ใบใต้มันรวมกันได้ 71 — ผู้ใช้บวกเลขบนจอตัวเองไม่ได้ ส่งชุด `FollowCase`
 *  เข้ามาเมื่อไร ทั้ง `overdue` และ `open` จะย้ายไปใช้ชุดนั้นพร้อมกัน (สองตัวนี้
 *  อยู่ในประโยคเดียวกันว่า "เกิน SLA x จาก y เคสที่เปิดอยู่" จึงต้องมาจากที่เดียวกัน)
 *  ไม่ส่งมา = นับแบบเดิมจาก `cases` ซึ่งเป็นชุดที่หน้าของ สพฐ. ใช้ */
const slaTest = FILTERS.find((f) => f.k === 'sla')!.test

export interface CaseTally {
  open: number
  overdue: number
}

/** นับ "เปิดอยู่ / เกิน SLA" จากชุดที่ที่นั่งนั้นใช้ — `pick` คือตัวกรองขอบเขต */
function tally(
  cases: CaseRecord[],
  follow: FollowCase[] | undefined,
  inScope: (c: CaseRecord) => boolean,
  inScopeFollow: (c: FollowCase) => boolean,
): CaseTally {
  if (follow) {
    const mine = follow.filter(inScopeFollow)
    return { open: mine.filter((c) => c.open).length, overdue: mine.filter(slaTest).length }
  }
  const mine = cases.filter(inScope)
  return { open: mine.filter((c) => stageOf(c) !== 'done').length, overdue: mine.filter((c) => c.slaBreached).length }
}

export type Tier = 'urgent' | 'follow' | 'watch' | 'ok'
export const TIER_META: Record<Tier, { th: string; dot: string; pill: string; rank: number }> = {
  urgent: { th: 'ต้องช่วยเร่งด่วน', dot: 'bg-red-600', pill: 'bg-red-50 text-red-700', rank: 0 },
  follow: { th: 'ต้องติดตาม', dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700', rank: 1 },
  watch: { th: 'เฝ้าระวัง', dot: 'bg-yellow-500', pill: 'bg-yellow-50 text-yellow-800', rank: 2 },
  ok: { th: 'ปกติ', dot: 'bg-green-600', pill: 'bg-green-50 text-green-800', rank: 3 },
}
const tierOf = (pts: number): Tier => (pts >= 4 ? 'urgent' : pts >= 3 ? 'follow' : pts >= 2 ? 'watch' : 'ok')
const r1 = (n: number) => Math.round(n * 10) / 10

// ── โรงเรียน ────────────────────────────────────────────────

export interface SchoolView {
  s: School
  tier: Tier
  /** สัดส่วนเด็กเสี่ยงสูงของโรงเรียน (%) */
  rate: number
  open: number
  overdue: number
  unassigned: number
  /** ปัญหาหลักของเคสในโรงเรียนนี้ (จากนักเรียนที่ติดตามในระบบ) */
  bottleneck?: string
  why: string[]
  /** AI หนึ่งประโยค — ทำไมต้องช่วย และช่วยด้านไหน */
  ai: string
  /** action ของเขตที่ AI เสนอ */
  suggest: AreaAct[]
}

const CAUSE_TH: Partial<Record<string, string>> = {
  travel: 'ค่าเดินทาง / ระยะทาง',
  poverty: 'ฐานะยากจน',
  absence: 'ขาดเรียนต่อเนื่อง',
  family: 'ปัญหาครอบครัว',
  health: 'สุขภาพ',
  childLabour: 'ต้องทำงานช่วยครอบครัว',
  earlyMarriage: 'แต่งงานก่อนวัย',
  migration: 'ย้ายถิ่น',
  dualSchooling: 'ภาระเรียนควบสามัญ-ศาสนา',
  grades: 'ผลการเรียนต่ำ',
}

/** ปัญหาหลักของเด็กเสี่ยงสูงในโรงเรียนนี้ พร้อม "กี่คนจากกี่คน"
 *
 *  คืนจำนวนมาด้วย ไม่ใช่แค่ชื่อปัญหา เพราะบรรทัด AI ในหน้าโรงเรียนของเขตต้อง
 *  อ้างตัวเลขของโรงเรียนนั้นจริง ๆ ไม่งั้นสองโรงเรียนที่ติดปัญหาเดียวกันจะได้
 *  ประโยคเดียวกันคำต่อคำ และอ่านเหมือนข้อความสำเร็จรูป */
function bottleneckOf(students: Student[]): { label: string; n: number; of: number } | undefined {
  const high = students.filter((x) => x.riskLevel === 'high' || x.riskLevel === 'critical')
  if (!high.length) return undefined
  const of = high.length
  const noContact = high.filter((x) => x.parentContact === 'unreachable').length
  if (noContact * 2 >= of) return { label: 'ติดต่อผู้ปกครองไม่ได้', n: noContact, of }
  const m = new Map<string, number>()
  for (const x of high) {
    const k = x.causeKeys[0]
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
  const label = top ? CAUSE_TH[top[0]] : undefined
  return label ? { label, n: top[1], of } : undefined
}

export function schoolViews(schools: School[], cases: CaseRecord[], students: Student[], follow?: FollowCase[]): SchoolView[] {
  const avgRate = schools.reduce((a, s) => a + (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100, 0) / Math.max(1, schools.length)
  const avgSuccess = schools.reduce((a, s) => a + s.interventionSuccessRate, 0) / Math.max(1, schools.length)
  return schools
    .map((s) => {
      const mine = cases.filter((c) => c.schoolKey === s.id)
      const { open, overdue } = tally(cases, follow, (c) => c.schoolKey === s.id, (c) => c.s.schoolKey === s.id)
      const unassigned = mine.filter((c) => stageOf(c) === 'unassigned').length
      const rate = (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100
      const overdueShare = open ? overdue / open : 0
      let pts = 0
      if (rate >= avgRate * 1.3) pts += 2
      else if (rate >= avgRate) pts += 1
      if (overdueShare >= 0.5 && overdue >= 3) pts += 2
      else if (overdue >= 3) pts += 1
      if (unassigned > 0) pts += 1
      if (s.interventionSuccessRate < avgSuccess - 5) pts += 1
      if (s.needsResources) pts += 1
      const bn = bottleneckOf(students.filter((x) => x.schoolKey === s.id))
      // ชื่อปัญหาล้วน ๆ ยังคงรูปเดิมไว้ให้ฝั่งอำเภอ (`mainProblem`) ใช้นับความถี่
      const bottleneck = bn?.label
      const why = [
        `เด็กเสี่ยงสูง ${s.highRiskStudents.toLocaleString('th-TH')} คน (${r1(rate)}%${rate >= avgRate * 1.3 ? ` · ${r1(rate / Math.max(0.1, avgRate))} เท่าของค่าเฉลี่ยเขต` : ''})`,
        `เคสเกิน SLA ${overdue} จาก ${open} เคสที่เปิดอยู่${unassigned ? ` · ไม่มีผู้รับผิดชอบ ${unassigned}` : ''}`,
        `อัตราช่วยสำเร็จ ${s.interventionSuccessRate}% ${s.interventionSuccessRate < avgSuccess - 5 ? 'ต่ำกว่า' : 'ใกล้หรือสูงกว่า'}ค่าเฉลี่ยเขต (${r1(avgSuccess)}%)`,
      ]
      const suggest: AreaAct[] = []
      /** ปัญหาหลักพร้อมจำนวนของโรงเรียนนี้ — ต่อท้ายได้ทุกสาขาโดยไม่ซ้ำรูปประโยค
       *
       *  **ตัวหารต้องบอกว่าเป็นกลุ่มไหน** `bottleneckOf()` นับจากเด็กที่ติดตาม
       *  อยู่ในระบบ (ประมาณ 20 คนต่อโรงเรียน) ไม่ใช่เด็กเสี่ยงสูงทั้งโรงเรียน
       *  ที่แถวเดียวกันรายงานเป็น % เขียนลอย ๆ ว่า "จาก 2 เคสเสี่ยงสูง" ข้าง
       *  "เสี่ยงสูง 15.8%" คือตัวเลขสองชุดบนแถวเดียว */
      const problem = bn ? `${bn.label} ${bn.n} จาก ${bn.of} เคสที่ติดตามอยู่` : ''
      /** ขนาดของงานตามที่โรงเรียนรายงาน — ชุดเดียวกับ `rate` และคอลัมน์ในตาราง */
      const scale = `เด็กเสี่ยงสูงทั้งโรงเรียน ${s.highRiskStudents.toLocaleString('th-TH')} คน`
      /** ทุกสาขาต้องอ้างตัวเลขของโรงเรียนนี้อย่างน้อยหนึ่งตัว ไม่ใช่ประโยคคงที่:
       *  โรงเรียนที่ติดปัญหาแบบเดียวกันเคยได้ข้อความเดียวกันคำต่อคำ เรียงติดกัน
       *  ห้าแถวแล้วอ่านเหมือนข้อความสำเร็จรูป ไม่ใช่การอ่านรายโรงเรียน
       *  ตัวเลขทุกตัวมาจากค่าที่คำนวณไว้ข้างบนชุดเดียวกับที่ `why` และแถวในหน้าใช้ */
      let ai: string
      if (bn?.label === 'ติดต่อผู้ปกครองไม่ได้') {
        // สองโรงเรียนติดปัญหาเดียวกันด้วยสัดส่วนเดียวกันได้ (เช่น 1 จาก 2) ขนาด
        // ของงานจึงต่อท้ายเสมอ — และเป็นสิ่งที่เขตใช้ตัดสินว่าจะส่งทีมไปที่ไหนก่อน
        ai = `ติดต่อผู้ปกครองไม่ได้ ${bn.n} จาก ${bn.of} เคสที่ติดตามอยู่ · ${scale} — อาจพิจารณาส่งทีมเยี่ยมบ้านจากเขตร่วมกับผู้นำชุมชน`
        suggest.push('sendTeam')
      } else if (overdueShare >= 0.5 && overdue >= 3) {
        ai = `เคสค้าง ${overdue} จาก ${open} เคสที่เปิดอยู่ (${r1(overdueShare * 100)}%)${unassigned ? ` · ยังไม่มีผู้รับผิดชอบ ${unassigned}` : ''} — น่าจะติดที่ขั้นตอนการทำงานหรือคนไม่พอ มากกว่าจำนวนเด็ก`
        suggest.push('sendTeam', 'meeting')
      } else if (s.needsResources) {
        ai = `โรงเรียนแจ้งว่าต้องการทรัพยากรเพิ่ม — ช่วยสำเร็จ ${s.interventionSuccessRate}% เทียบค่าเฉลี่ยเขต ${r1(avgSuccess)}%${problem ? ` · ${problem}` : ''}`
        suggest.push('budget')
      } else if (rate >= avgRate * 1.3) {
        // เดิมเขียนว่า "สัดส่วนเด็กเสี่ยงสูงที่สุดในเขต" ซึ่งไม่ใช่สิ่งที่เงื่อนไขนี้วัด
        // (เข้าได้หลายโรงเรียน และไม่จำเป็นต้องเป็นที่สุด) จึงบอกตามที่คำนวณจริง
        ai = `เด็กเสี่ยงสูง ${r1(rate)}% เป็น ${r1(rate / Math.max(0.1, avgRate))} เท่าของค่าเฉลี่ยเขต (${r1(avgRate)}%)${problem ? ` · ${problem}` : ''} — อาจพิจารณาจัดนักจิตวิทยาเขตช่วยเคสเสี่ยงสูง`
        suggest.push('psychologist')
      } else {
        const load = open ? `เคสเกิน SLA ${overdue} จาก ${open} เคสที่เปิดอยู่` : 'ยังไม่มีเคสที่เปิดค้างอยู่'
        ai = `${problem ? `${problem} · ` : ''}${load} — โรงเรียนยังดูแลเองได้`
        suggest.push('advise')
      }
      return { s, tier: tierOf(pts), rate, open, overdue, unassigned, bottleneck, why, ai, suggest }
    })
    .sort((a, b) => TIER_META[a.tier].rank - TIER_META[b.tier].rank || b.overdue - a.overdue || b.rate - a.rate)
}

/** AI เปรียบเทียบโรงเรียน — หาคู่ที่ "เด็กเสี่ยงน้อยกว่าแต่เคสค้างมากกว่า" ซึ่งต้องการการช่วยด้านวิธีทำงาน */
export function compareSchools(views: SchoolView[]): string | undefined {
  const byRate = [...views].sort((a, b) => b.rate - a.rate)
  const hi = byRate[0]
  const pick = views.find((v) => v !== hi && v.rate < hi.rate && v.overdue > hi.overdue && v.s.interventionSuccessRate < hi.s.interventionSuccessRate + 5)
  if (!hi || !pick) return undefined
  return `${pick.s.name} มีเด็กเสี่ยงน้อยกว่า ${hi.s.name} แต่เคสค้างมากกว่า (${pick.overdue} กับ ${hi.overdue}) — อาจพิจารณาช่วยด้านวิธีทำงานและการติดตามเคสที่ ${pick.s.name} ก่อน แม้จำนวนเด็กเสี่ยงจะน้อยกว่า`
}

// ── อำเภอ ───────────────────────────────────────────────────

export interface DistrictView {
  d: District
  tier: Tier
  schools: SchoolView[]
  overdue: number
  unassigned: number
  oosNoPlan: number
  /** สัดส่วนเด็กเสี่ยงเทียบค่าเฉลี่ยเขต */
  riskX: number
  why: string[]
  rec: string
  mainProblem?: string
}

export function districtViews(districts: District[], views: SchoolView[], cases: CaseRecord[], oosc: OoscRecord[], follow?: FollowCase[]): DistrictView[] {
  const avgRisk = districts.reduce((a, d) => a + d.riskRate, 0) / Math.max(1, districts.length)
  const totalOverdue = follow ? follow.filter(slaTest).length : cases.filter((c) => c.slaBreached).length
  return districts
    .map((d) => {
      const sv = views.filter((v) => v.s.districtKey === d.key)
      const inD = cases.filter((c) => c.districtKey === d.key)
      const { overdue } = tally(cases, follow, (c) => c.districtKey === d.key, (c) => c.s.districtKey === d.key)
      const unassigned = inD.filter((c) => stageOf(c) === 'unassigned').length
      const oosNoPlan = oosc.filter((r) => r.districtKey === d.key && !r.planId && r.status !== 'returned' && r.status !== 'working').length
      const riskX = avgRisk ? d.riskRate / avgRisk : 1
      let pts = 0
      if (riskX >= 1.25) pts += 2
      else if (riskX >= 1.05) pts += 1
      if (totalOverdue && overdue / totalOverdue >= 0.35) pts += 2
      else if (overdue >= 3) pts += 1
      if (unassigned > 0) pts += 1
      if (oosNoPlan >= 15) pts += 1
      if (!d.hasDistrictTeam) pts += 1
      const problems = sv.map((v) => v.bottleneck).filter(Boolean) as string[]
      const mainProblem = problems.sort((a, b) => problems.filter((x) => x === b).length - problems.filter((x) => x === a).length)[0]
      const affected = sv.filter((v) => v.overdue > 0).length
      const why = [
        ...(riskX >= 1.05 ? [`สัดส่วนเด็กเสี่ยงสูง ${r1(d.riskRate)}% — ${r1(riskX)} เท่าของค่าเฉลี่ยเขต`] : [`สัดส่วนเด็กเสี่ยงสูง ${r1(d.riskRate)}% ใกล้หรือต่ำกว่าค่าเฉลี่ยเขต`]),
        `เคสเกิน SLA ${overdue} เคส${affected ? ` ใน ${affected} โรงเรียน` : ''}${unassigned ? ` · ไม่มีผู้รับผิดชอบ ${unassigned}` : ''}`,
        ...(oosNoPlan ? [`เด็กนอกระบบ ${oosNoPlan} คนยังไม่มีแผน`] : []),
        ...(!d.hasDistrictTeam ? ['ยังไม่มีทีมสหวิชาชีพระดับอำเภอ (ศปก.อ.)'] : []),
      ].slice(0, 4)
      const lead = [...sv].sort((a, b) => b.overdue - a.overdue || b.rate - a.rate)[0]
      const rec = lead
        ? `อาจพิจารณาจัดทีมสนับสนุน ${lead.s.name} ก่อน เพราะ${lead.overdue ? `มีเคสเกิน SLA ${lead.overdue} เคส` : 'มีสัดส่วนเด็กเสี่ยงสูงที่สุดในอำเภอ'}${mainProblem ? ` ปัญหาหลักคือ${mainProblem}` : ''}`
        : oosNoPlan
          ? `อาจพิจารณาเร่งให้เด็กนอกระบบ ${oosNoPlan} คนมีผู้รับผิดชอบและแผน`
          : 'สถานการณ์อยู่ในเกณฑ์ ติดตามตามปกติ'
      return { d, tier: tierOf(pts), schools: sv, overdue, unassigned, oosNoPlan, riskX, why, rec, mainProblem }
    })
    .sort((a, b) => TIER_META[a.tier].rank - TIER_META[b.tier].rank || b.riskX - a.riskX)
}

// ── ปัญหาที่เกิดซ้ำหลายโรงเรียน ──────────────────────────────

export interface Pattern {
  key: string
  th: string
  schools: string[]
  /** จำนวนเด็ก/เคสที่ได้รับผลกระทบ */
  n: number
  rec: string
}

export function crossSchoolPatterns(schools: School[], students: Student[], referrals: Referral[]): Pattern[] {
  const byId = new Map(students.map((x) => [x.id, x]))
  const high = students.filter((x) => x.riskLevel === 'high' || x.riskLevel === 'critical' || x.riskLevel === 'watch')
  const name = (id: string) => schools.find((s) => s.id === id)?.name ?? id
  const group = (test: (x: Student) => boolean) => {
    const hit = high.filter(test)
    const ids = [...new Set(hit.map((x) => x.schoolKey))].filter((id) => schools.some((s) => s.id === id))
    return { schools: ids.map(name), n: hit.length }
  }
  const agency = (() => {
    const late = referrals.filter((r) => r.status === 'overdue')
    const ids = [...new Set(late.map((r) => byId.get(r.childId)?.schoolKey).filter(Boolean) as string[])].filter((id) => schools.some((s) => s.id === id))
    return { schools: ids.map(name), n: late.length }
  })()
  const rows: Pattern[] = [
    { key: 'travel', th: 'ค่าเดินทาง / ระยะทาง', ...group((x) => x.causeKeys.includes('travel')), rec: 'ปัญหาค่าเดินทางเกิดซ้ำหลายโรงเรียน อาจเหมาะกับมาตรการระดับเขต (ทุนค่าเดินทาง · รถรับส่งร่วม) มากกว่าการช่วยทีละเคส' },
    { key: 'noContact', th: 'ติดต่อผู้ปกครองไม่ได้', ...group((x) => x.parentContact === 'unreachable'), rec: 'อาจพิจารณาตกลงกับผู้นำชุมชน / อสม. ทั้งเขตให้เป็นช่องทางติดต่อครอบครัว' },
    { key: 'poverty', th: 'ฐานะยากจน', ...group((x) => x.causeKeys.includes('poverty')), rec: 'อาจพิจารณาประสาน พมจ. ทำรายการเด็กยากจนของทั้งเขตครั้งเดียว แทนการส่งต่อรายเคส' },
    { key: 'agency', th: 'รอหน่วยงานภายนอก', ...agency, rec: 'อาจพิจารณาประชุมกับหัวหน้าหน่วยงานระดับจังหวัดครั้งเดียวสำหรับทุกโรงเรียน' },
    { key: 'childLabour', th: 'ต้องทำงานช่วยครอบครัว', ...group((x) => x.causeKeys.includes('childLabour')), rec: 'อาจพิจารณาเส้นทางเรียนควบทำงาน (สกร. · ทวิภาคี) เป็นมาตรการระดับเขต' },
  ]
  return rows.filter((p) => p.schools.length >= 2).sort((a, b) => b.schools.length - a.schools.length || b.n - a.n)
}

// ── ทีมและทรัพยากรของเขต (ข้อมูลจำลอง) ─────────────────────

export interface TeamMember {
  name: string
  role: string
  capacity: number
  /** งานเดิมในมือ (จำลอง) */
  base: number
  /** act ที่คนนี้รับผิดชอบเป็นหลัก */
  acts: AreaAct[]
}

export const AREA_TEAM: TeamMember[] = [
  { name: 'นักจิตวิทยาเขต ฟาตีมะห์', role: 'นักจิตวิทยา', capacity: 16, base: 17, acts: ['psychologist'] },
  { name: 'นักสังคมสงเคราะห์เขต อับดุลเลาะ', role: 'นักสังคมสงเคราะห์', capacity: 15, base: 9, acts: ['coordinateAgency', 'budget'] },
  { name: 'ทีมเยี่ยมบ้านเขต', role: 'ทีมเยี่ยมบ้าน', capacity: 12, base: 6, acts: ['sendTeam'] },
  { name: 'ผู้ประสานหน่วยงาน ซูไฮมี', role: 'ผู้ประสานหน่วยงาน', capacity: 22, base: 18, acts: ['coordinateAgency', 'escalate'] },
  { name: 'ศึกษานิเทศก์ อารีฟีน', role: 'ศึกษานิเทศก์', capacity: 10, base: 4, acts: ['meeting', 'advise', 'measure'] },
]

export interface TeamRow extends TeamMember {
  load: number
  pct: number
}

export function teamRows(state: AreaState): TeamRow[] {
  const active = [
    ...state.requests.filter((r) => r.decision?.verdict === 'approve' && !r.done).map((r) => r.decision!.owner),
    ...state.actions.filter((a) => !a.done).map((a) => a.owner),
    ...state.measures.map((m) => m.owner),
  ]
  return AREA_TEAM.map((m) => {
    const load = m.base + active.filter((o) => o === m.name).length
    return { ...m, load, pct: Math.round((load / m.capacity) * 100) }
  })
}

/** คนในทีมเขตที่เหมาะกับ act นี้และว่างที่สุด */
export function suggestOwner(rows: TeamRow[], acts: AreaAct[]): string | undefined {
  const fit = rows.filter((r) => r.acts.some((a) => acts.includes(a)))
  return [...(fit.length ? fit : rows)].sort((a, b) => a.pct - b.pct)[0]?.name
}

// ── คำขอจากโรงเรียน ────────────────────────────────────────

const NEED_ACTS: Record<AreaRequest['need'], AreaAct[]> = {
  psych: ['psychologist'],
  agency: ['coordinateAgency', 'escalate'],
  budget: ['budget'],
  resource: ['budget', 'sendTeam'],
  complex: ['sendTeam', 'meeting'],
  people: ['sendTeam'],
}

export interface RequestBrief {
  summary: string
  acts: AreaAct[]
  owner?: string
  /** ผลที่คาดหวัง (ตั้งต้นให้ เขตแก้ได้) */
  expected: string
  waitedDays: number
  /** ข้อสังเกตเรื่องทรัพยากร */
  capacityNote?: string
  /** ปัญหาเดียวกันที่พบหลายโรงเรียน (ถ้ามี) */
  pattern?: Pattern
}

export function requestBrief(r: AreaRequest, rows: TeamRow[], patterns: Pattern[]): RequestBrief {
  const acts = NEED_ACTS[r.need]
  const owner = suggestOwner(rows, acts)
  const row = rows.find((x) => x.name === owner)
  const waitedDays = Math.floor((Date.now() - r.ts) / 86400000)
  const pattern = r.need === 'budget' || r.need === 'resource' ? patterns.find((p) => p.key === 'travel' || p.key === 'poverty') : r.need === 'agency' ? patterns.find((p) => p.key === 'agency') : undefined
  const summary = `${r.schoolName} ${AREA_NEED_TH[r.need].replace(/^ขอ/, 'ขอ')} — ${r.blocked}${pattern && pattern.schools.length >= 2 ? ` · ปัญหานี้พบใน ${pattern.schools.length} โรงเรียนของเขต อาจพิจารณาเป็นมาตรการระดับเขต` : ''}`
  return {
    summary,
    acts,
    owner,
    expected:
      r.need === 'psych'
        ? 'นักเรียนที่มีภาวะซึมเศร้าได้พบผู้เชี่ยวชาญภายใน 2 สัปดาห์'
        : r.need === 'agency'
          ? 'หน่วยงานรับเรื่องครบทุกเคสภายใน 7 วัน'
          : r.need === 'budget' || r.need === 'resource'
            ? 'นักเรียนกลุ่มนี้มาเรียนเฉลี่ยเกิน 80% ภายใน 1 เดือน'
            : 'เคสเดินต่อได้และมีผู้รับผิดชอบชัดเจนภายใน 2 สัปดาห์',
    waitedDays,
    pattern,
    capacityNote: row && row.pct >= 100 ? `${row.name} งานในมือเต็มแล้ว (${row.pct}%) — อาจพิจารณาเลื่อนงานอื่นหรือหาคนช่วย` : undefined,
  }
}

// ── AI สรุปสถานการณ์เขตวันนี้ ──────────────────────────────

export type BriefGo = { kind: 'request'; id: string } | { kind: 'district'; key: string } | { kind: 'school'; id: string } | { kind: 'pattern'; key: string } | { kind: 'team' }

export interface BriefLine {
  key: string
  tone: 'red' | 'orange' | 'yellow'
  text: string
  go: BriefGo
}

export function areaBrief(input: { districts: DistrictView[]; schools: SchoolView[]; state: AreaState; patterns: Pattern[]; team: TeamRow[]; dn: (key: string) => string }): BriefLine[] {
  const { districts, schools, state, patterns, team, dn } = input
  const out: BriefLine[] = []
  const waiting = state.requests.filter((r) => areaRequestStatus(r) === 'new')
  if (waiting.length) {
    const urgent = waiting.filter((r) => r.urgency === 'high').length
    out.push({ key: 'req', tone: 'red', text: `ผอ. ขอให้เขตช่วย ${waiting.length} เรื่อง${urgent ? ` (เร่งด่วน ${urgent})` : ''} — รอเขตตัดสินใจ`, go: { kind: 'request', id: waiting[0].id } })
  }
  const d0 = districts[0]
  if (d0 && d0.tier !== 'ok')
    out.push({ key: 'dist', tone: d0.tier === 'urgent' ? 'red' : 'orange', text: `อำเภอ${dn(d0.d.key)}${d0.tier === 'urgent' ? 'ต้องช่วยก่อน' : 'ต้องติดตาม'} — ${d0.why[0].split(' — ')[0]}`, go: { kind: 'district', key: d0.d.key } })
  const s0 = schools.filter((v) => v.tier === 'urgent' || v.tier === 'follow')
  if (s0.length) out.push({ key: 'school', tone: 'orange', text: `${s0[0].s.name} ต้องการการสนับสนุนก่อน — เกิน SLA ${s0[0].overdue} เคส${s0.length > 1 ? ` (และอีก ${s0.length - 1} โรงเรียน)` : ''}`, go: { kind: 'school', id: s0[0].s.id } })
  const p0 = patterns[0]
  if (p0) out.push({ key: 'pattern', tone: 'yellow', text: `"${p0.th}" เกิดซ้ำใน ${p0.schools.length} โรงเรียน — อาจทำเป็นมาตรการของเขต`, go: { kind: 'pattern', key: p0.key } })
  const over = team.filter((t) => t.pct > 100).sort((a, b) => b.pct - a.pct)[0]
  if (over) out.push({ key: 'team', tone: 'yellow', text: `${over.role}ของเขตรับงานเกินกำลัง (${over.pct}%)`, go: { kind: 'team' } })
  return out.slice(0, 5)
}
