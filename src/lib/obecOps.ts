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
