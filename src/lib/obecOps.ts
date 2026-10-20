// ─────────────────────────────────────────────────────────────
// สพฐ. — อ่านพื้นที่เป็น "เขตพื้นที่การศึกษา"
//
// สพฐ. กำกับเขต เขตกำกับโรงเรียน โรงเรียนดูแลเด็ก หน้าแรกของ สพฐ. จึงต้องตอบว่า
// **เขตไหนต้องเข้าไปหนุนก่อน และเพราะอะไร** ไม่ใช่เรียงเป็นจังหวัด ซึ่งเป็นกรอบ
// ของ ศอ.บต. (หน่วยประสาน) ไม่ใช่ของสายการศึกษา — ดู skill.md
//
// กติกาเดียวกับ decision.ts และ briefing.ts: **ที่นี่คำนวณ โมเดลแค่เล่า**
// ทุกตัวเลขเป็นเลขคณิตที่ผู้บริหารไล่ซ้ำเองได้ ถอด API key ออกหน้าก็ยังใช้ได้
// ─────────────────────────────────────────────────────────────
import type { CaseRecord, District, OoscRecord, School } from '@/types'
import { ESA_BY_KEY, esaOfDistrict, type EsaArea } from '@/data/esa'
import { stageOf } from './areaOps'
import { TIER_META, type Tier } from './areaDeskOps'

const r1 = (n: number) => Math.round(n * 10) / 10
const tierOf = (pts: number): Tier => (pts >= 4 ? 'urgent' : pts >= 3 ? 'follow' : pts >= 2 ? 'watch' : 'ok')

export interface EsaView {
  esa: EsaArea
  tier: Tier
  students: number
  highRisk: number
  /** สัดส่วนเด็กเสี่ยงสูงของเขต (%) */
  riskRate: number
  /** กี่เท่าของค่าเฉลี่ยทุกเขตในขอบเขต */
  riskX: number
  districts: number
  schools: number
  schoolsToWatch: number
  openCases: number
  overdue: number
  unassigned: number
  oosNoPlan: number
  /** เหตุผลที่ต้องดูเขตนี้ — ตัวเลขล้วน ผู้บริหารไล่ซ้ำได้ */
  why: string[]
  /** สิ่งที่ สพฐ. อาจพิจารณาทำกับเขตนี้ ภาษาเป็น "อาจพิจารณา" ไม่สั่ง */
  rec: string
}

/** จัดอันดับเขตพื้นที่การศึกษาในขอบเขตของบัญชีนี้ เรียงจากเขตที่ต้องหนุนก่อน */
export function esaViews(
  districts: District[],
  schools: School[],
  cases: CaseRecord[],
  oosc: OoscRecord[],
): EsaView[] {
  // รวมอำเภอเป็นเขต — อำเภอคือแถวข้อมูลจริง เขตเป็นการจัดกลุ่ม (ดู data/esa.ts)
  const groups = new Map<string, District[]>()
  for (const d of districts) {
    const k = esaOfDistrict(d.key)
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), d])
  }

  const rows = [...groups.entries()]
    .map(([key, ds]) => {
      const esa = ESA_BY_KEY[key]
      const dk = new Set(ds.map((d) => d.key))
      const students = ds.reduce((a, d) => a + d.totalStudents, 0)
      const highRisk = ds.reduce((a, d) => a + d.highRiskStudents, 0)
      const inEsa = cases.filter((c) => dk.has(c.districtKey))
      const sv = schools.filter((s) => dk.has(s.districtKey))
      return {
        esa,
        key,
        districtKeys: dk,
        students,
        highRisk,
        riskRate: students ? (highRisk / students) * 100 : 0,
        districts: ds.length,
        schools: sv.length,
        schoolsToWatch: sv.filter((s) => s.highRiskStudents / Math.max(1, s.totalStudents) >= 0.13).length,
        openCases: inEsa.filter((c) => stageOf(c) !== 'done').length,
        overdue: inEsa.filter((c) => c.slaBreached).length,
        unassigned: inEsa.filter((c) => stageOf(c) === 'unassigned').length,
        oosNoPlan: oosc.filter(
          (r) => dk.has(r.districtKey) && !r.planId && r.status !== 'returned' && r.status !== 'working',
        ).length,
        noTeam: ds.filter((d) => !d.hasDistrictTeam).length,
      }
    })
    .filter((r) => r.esa)

  const avgRate = rows.reduce((a, r) => a + r.riskRate, 0) / Math.max(1, rows.length)

  return rows
    .map((r) => {
      const riskX = avgRate ? r.riskRate / avgRate : 1
      const overdueShare = r.openCases ? r.overdue / r.openCases : 0
      let pts = 0
      if (riskX >= 1.25) pts += 2
      else if (riskX >= 1.05) pts += 1
      if (overdueShare >= 0.5 && r.overdue >= 5) pts += 2
      else if (r.overdue >= 5) pts += 1
      if (r.unassigned > 0) pts += 1
      if (r.schoolsToWatch >= 3) pts += 1
      if (r.noTeam > 0) pts += 1

      const why = [
        riskX >= 1.05
          ? `เด็กเสี่ยงสูง ${r1(r.riskRate)}% — ${r1(riskX)} เท่าของค่าเฉลี่ยทุกเขต`
          : `เด็กเสี่ยงสูง ${r1(r.riskRate)}% ใกล้หรือต่ำกว่าค่าเฉลี่ยทุกเขต`,
        `เคสเกิน SLA ${r.overdue} จาก ${r.openCases} เคสที่เปิดอยู่${r.unassigned ? ` · ไม่มีผู้รับผิดชอบ ${r.unassigned}` : ''}`,
        ...(r.schoolsToWatch ? [`โรงเรียนที่สัดส่วนเด็กเสี่ยงเกินเกณฑ์ ${r.schoolsToWatch} จาก ${r.schools} แห่ง`] : []),
        ...(r.oosNoPlan ? [`เด็กนอกระบบ ${r.oosNoPlan} คนยังไม่มีแผน`] : []),
        ...(r.noTeam ? [`ยังไม่มีทีมสหวิชาชีพระดับอำเภอ ${r.noTeam} อำเภอ`] : []),
      ].slice(0, 4)

      /** เลือกข้อเสนอจาก "สิ่งที่ผิดปกติที่สุดของเขตนี้" ไม่ใช่ประโยคสำเร็จรูป
       *  สองเขตที่ติดคนละเรื่องจึงไม่ได้ข้อความเดียวกัน */
      const rec =
        r.unassigned > 0
          ? `เคส ${r.unassigned} เคสยังไม่มีผู้รับผิดชอบ — อาจพิจารณาให้เขตมอบหมายเจ้าของเคสให้ครบก่อน แล้วค่อยดูเรื่องอื่น`
          : overdueShare >= 0.5 && r.overdue >= 5
            ? `เคสค้างเกินครึ่งของที่เปิดอยู่ (${r.overdue} จาก ${r.openCases}) — น่าจะติดที่ขั้นตอนทำงานหรือกำลังคน มากกว่าจำนวนเด็ก อาจพิจารณาส่งทีมเขตเข้าไปทบทวนกระบวนการ`
            : r.schoolsToWatch >= 3
              ? `มี ${r.schoolsToWatch} โรงเรียนที่สัดส่วนเด็กเสี่ยงเกินเกณฑ์ — อาจพิจารณาให้เขตจัดชุดสนับสนุนลงโรงเรียนกลุ่มนี้พร้อมกัน`
              : r.oosNoPlan >= 20
                ? `เด็กนอกระบบ ${r.oosNoPlan} คนยังไม่มีแผน — อาจพิจารณาตั้งเป้าปิดช่องว่างแผนในเขตนี้เป็นรอบ`
                : r.noTeam > 0
                  ? `ยังไม่มีทีมสหวิชาชีพระดับอำเภอ ${r.noTeam} อำเภอ — อาจพิจารณาประสานตั้งทีมก่อน เพราะเคสข้ามหน่วยงานจะไปต่อไม่ได้`
                  : 'ตัวชี้วัดอยู่ในระดับที่เขตดูแลเองได้ — ติดตามตามรอบปกติ'

      return {
        esa: r.esa,
        tier: tierOf(pts),
        students: r.students,
        highRisk: r.highRisk,
        riskRate: r.riskRate,
        riskX,
        districts: r.districts,
        schools: r.schools,
        schoolsToWatch: r.schoolsToWatch,
        openCases: r.openCases,
        overdue: r.overdue,
        unassigned: r.unassigned,
        oosNoPlan: r.oosNoPlan,
        why,
        rec,
      }
    })
    .sort((a, b) => TIER_META[a.tier].rank - TIER_META[b.tier].rank || b.riskRate - a.riskRate)
}

/** ข้อสังเกตเดียวจากทุกเขต — บรรทัดที่ผู้บริหารอ่านก่อนลงไปดูรายเขต */
export function esaInsight(views: EsaView[]): string {
  if (!views.length) return 'ยังไม่มีข้อมูลเขตในขอบเขตนี้'
  const urgent = views.filter((v) => v.tier === 'urgent')
  const lead = views[0]
  const noOwner = views.reduce((a, v) => a + v.unassigned, 0)
  const parts = [
    urgent.length
      ? `${urgent.length} เขตอยู่ในระดับต้องช่วยเร่งด่วน นำโดย${lead.esa.th} (เด็กเสี่ยงสูง ${r1(lead.riskRate)}%)`
      : `ทุกเขตอยู่ในระดับที่ดูแลเองได้ เขตที่ต้องจับตาที่สุดคือ${lead.esa.th} (${r1(lead.riskRate)}%)`,
    noOwner ? `เคสที่ยังไม่มีผู้รับผิดชอบรวมทุกเขต ${noOwner} เคส` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

/** หนึ่งเรื่องใน "AI สรุปวันนี้" ของ สพฐ. */
export interface ObecBriefItem {
  key: string
  tone: 'red' | 'amber' | 'blue'
  text: string
  to: string
}

/** เรื่องที่ สพฐ. ควรดูวันนี้ เรียงตามความเร่งด่วน
 *
 *  โครงเดียวกับ "AI สรุปวันนี้" ของเขต แต่หน่วยเป็นเขต ไม่ใช่อำเภอ — ทุกข้อ
 *  ต้องพาไปที่ใดที่หนึ่งได้จริง ข้อที่พาไปไหนไม่ได้คือข้อที่ไม่ควรอยู่ตรงนี้
 */
export function esaBrief(views: EsaView[]): ObecBriefItem[] {
  const out: ObecBriefItem[] = []
  const urgent = views.filter((v) => v.tier === 'urgent')
  if (urgent.length) {
    out.push({
      key: 'urgent',
      tone: 'red',
      text: `${urgent.length} เขตอยู่ในระดับต้องช่วยเร่งด่วน — นำโดย${urgent[0].esa.th} (เด็กเสี่ยงสูง ${r1(urgent[0].riskRate)}%)`,
      to: `/area?esa=${urgent[0].esa.key}`,
    })
  }
  const noOwner = [...views].sort((a, b) => b.unassigned - a.unassigned)[0]
  if (noOwner?.unassigned) {
    const all = views.reduce((a, v) => a + v.unassigned, 0)
    out.push({
      key: 'owner',
      tone: 'red',
      text: `เคสยังไม่มีผู้รับผิดชอบ ${all} เคส — มากที่สุดที่${noOwner.esa.th} ${noOwner.unassigned} เคส`,
      to: '/intervention',
    })
  }
  const watch = views.reduce((a, v) => a + v.schoolsToWatch, 0)
  if (watch) {
    const lead = [...views].sort((a, b) => b.schoolsToWatch - a.schoolsToWatch)[0]
    out.push({
      key: 'schools',
      tone: 'amber',
      text: `โรงเรียนที่สัดส่วนเด็กเสี่ยงเกินเกณฑ์ ${watch} แห่ง — กระจุกที่${lead.esa.th} ${lead.schoolsToWatch} แห่ง`,
      to: '/school',
    })
  }
  const noPlan = views.reduce((a, v) => a + v.oosNoPlan, 0)
  if (noPlan) {
    const lead = [...views].sort((a, b) => b.oosNoPlan - a.oosNoPlan)[0]
    out.push({
      key: 'oosc',
      tone: 'amber',
      text: `เด็กนอกระบบยังไม่มีแผน ${noPlan} คน — มากที่สุดที่${lead.esa.th} ${lead.oosNoPlan} คน`,
      to: '/oosc',
    })
  }
  const overdue = views.reduce((a, v) => a + v.overdue, 0)
  if (overdue) {
    const lead = [...views].sort((a, b) => b.overdue - a.overdue)[0]
    out.push({
      key: 'sla',
      tone: 'blue',
      text: `เคสเกิน SLA ${overdue} เคสทุกเขต — มากที่สุดที่${lead.esa.th} ${lead.overdue} เคส`,
      to: '/intervention',
    })
  }
  return out
}

/** ข้อสังเกตระดับ สพฐ. สำหรับหน้าติดตามการช่วยเหลือ
 *
 *  ผู้บริหารเปิดหน้านี้มาเพื่อรู้ว่า "ทั้งประเทศในความดูแลติดอะไร และเขตไหน
 *  หนักสุด" ก่อนจะเจาะลงไปทีละเขต — ตัวเลขทุกตัวมาจาก `esaViews()` ชุดเดียว
 *  กับที่ชิปเลือกเขตใช้จัดอันดับ จึงไม่มีทางบอกคนละเรื่องกัน */
export function followInsight(views: EsaView[]): { headline: string; detail: string } {
  if (!views.length) return { headline: 'ยังไม่มีข้อมูลเคสในขอบเขตนี้', detail: '' }
  const overdue = views.reduce((a, v) => a + v.overdue, 0)
  const open = views.reduce((a, v) => a + v.openCases, 0)
  const noOwner = views.reduce((a, v) => a + v.unassigned, 0)
  const worstOverdue = [...views].sort((a, b) => b.overdue - a.overdue)[0]
  const worstOwner = [...views].sort((a, b) => b.unassigned - a.unassigned)[0]
  return {
    headline: `เคสเกิน SLA ${overdue} จาก ${open} เคสที่เปิดอยู่ทั้ง ${views.length} เขต`,
    detail: [
      worstOverdue?.overdue ? `มากที่สุดที่${worstOverdue.esa.th} ${worstOverdue.overdue} เคส` : '',
      noOwner ? `ยังไม่มีผู้รับผิดชอบรวม ${noOwner} เคส — มากที่สุดที่${worstOwner.esa.th} ${worstOwner.unassigned} เคส` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }
}
