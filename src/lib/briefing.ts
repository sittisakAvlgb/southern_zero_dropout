// ─────────────────────────────────────────────────────────────
// The executive command centre, computed.
//
// Same split as the decision centre: everything an executive is asked to act on
// is arithmetic they could redo by hand, and the model only narrates it. That
// is what lets the panel claim "AI วิเคราะห์" without the claim being load-
// bearing — pull the API key and the briefing still stands up.
//
// Where the spec asked for figures the data cannot support — a statistical
// confidence interval, a baht-denominated impact — this file returns something
// real and says what it is instead of inventing the number. Fake precision in
// front of a committee is worse than an honest gap.
// ─────────────────────────────────────────────────────────────
import type { CauseKey, District, Province, RiskLevel, School } from '@/types'
import { ESA_BY_KEY, esaOfDistrict } from '@/data/esa'
import { rankDistricts, type RankedDistrict } from './decision'
import { hashSeed, makeRng } from './format'
import { rateToLevel } from './risk'

/** Twelve months of risk rate for one area. Deterministic from the key so the
 *  same place always draws the same line — demo data must not reshuffle
 *  between visits, or it reads as live and untrustworthy. */
export function trendFor(key: string, endRate: number): number[] {
  const rng = makeRng(hashSeed(`geo-trend-${key}`))
  const out: number[] = []
  let v = endRate * (0.82 + rng() * 0.16)
  for (let i = 0; i < 12; i++) {
    v += (rng() - 0.42) * 0.6
    out.push(Math.max(0.5, Math.round(v * 10) / 10))
  }
  // land on today's real figure so the chart and the KPI beside it agree
  out[11] = Math.round(endRate * 10) / 10
  return out
}

/** หน่วยที่ผู้บริหารคนนี้คิดเป็น
 *
 *  ศอ.บต. เป็นหน่วยประสาน จึงคิดเป็น "จังหวัด" ส่วน สพฐ. เป็นสายการศึกษา
 *  หน่วยที่มันกำกับจริงคือ **เขตพื้นที่การศึกษา** ไม่ใช่จังหวัด (ดู skill.md)
 *  การ์ดที่พาดหัวว่า "จังหวัดที่ต้องเร่งแก้" จึงเป็นกรอบของอีกหน่วยงานหนึ่ง */
export type AreaUnit = 'province' | 'esa'

export interface CriticalAlert {
  /** คีย์ของจังหวัดหรือเขต แล้วแต่ `unit` — ชื่อถูกแปลงที่ชั้น i18n ไม่ใช่ที่นี่ */
  areaKey: string
  areaKind: AreaUnit
  highRisk: number
  /** pilot schools in that area whose own high-risk share is high/critical */
  schoolsToWatch: number
  rate: number
  level: RiskLevel
}

export interface PriorityAction {
  th: string
  en: string
  to: string
  primary?: boolean
}

/** One thing worth an executive's attention, stated as problem → why → what to
 *  do. Priorities and recommendations used to be two lists of the same three
 *  subjects, which read as a wall of text saying everything twice. */
export interface Focus {
  key: string
  /** 0–100 urgency, from the same signal model the decision centre ranks with */
  score: number
  level: RiskLevel
  titleTh: string
  titleEn: string
  /** the headline figure and its unit */
  value: number
  unitTh: string
  unitEn: string
  reasonTh: string
  reasonEn: string
  /** the move this points to */
  doTh: string
  doEn: string
  /** the expected effect, always phrased as an estimate with its basis stated */
  impactTh: string
  impactEn: string
  actions: PriorityAction[]
}

export interface Forecast {
  horizonMonths: number
  /** projected change in the at-risk share, in percent of today's figure */
  changePct: number
  projectedHighRisk: number
  /** the observed series followed by the projected points */
  series: number[]
  predicted: number[]
  /** mean school data-quality score in scope — how much the input can be
   *  trusted, NOT a statistical confidence interval */
  dataQuality: number
}

export interface Briefing {
  total: number
  highRisk: number
  /** still out and not yet helped */
  dropout: number
  /** has a plan and is on the way back */
  reengaging: number
  returned: number
  /** every child the registry knows about, whatever stage they are at */
  registry: number
  riskShare: number
  successRate: number
  alert: CriticalAlert | null
  focuses: Focus[]
  /** top four, renormalised to sum 100 so the bars read as a whole */
  causes: { key: CauseKey; share: number }[]
  ranked: RankedDistrict[]
  trend: number[]
  trendDelta: number
  forecast: Forecast
}

const HIGH = new Set<RiskLevel>(['high', 'critical'])
const schoolRate = (s: School) => (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function buildBriefing(input: {
  scopeKey: string
  provinces: Province[]
  districts: District[]
  schools: School[]
  stats: {
    total: number
    highRisk: number
    /** still out and not yet helped — NOT the whole registry */
    dropout: number
    reengaging: number
    returned: number
  }
  /** Whether the reader may act on a case or only direct it — see
   *  `canWorkCases()`. An สพฐ. seat gets the same three priorities with
   *  actions that take them to where the work is, instead of a primary
   *  button inviting them to author a plan they do not own. */
  canWorkCases?: boolean
  /** หน่วยที่การ์ดแรกพูดถึง — 'esa' สำหรับ สพฐ. · 'province' สำหรับ ศอ.บต. */
  unit?: AreaUnit
}): Briefing {
  const { provinces, districts, schools, stats, scopeKey } = input
  const canWork = input.canWorkCases !== false
  const unit: AreaUnit = input.unit ?? 'province'

  // ── the area that most deserves this executive's attention ──
  // รวมอำเภอที่อยู่ในขอบเขตเป็น "พื้นที่" ตามหน่วยของบัญชี แล้วคิดสัดส่วน
  // เด็กเสี่ยงจากอำเภอจริง ๆ ไม่ใช่หยิบ riskRate ของจังหวัดมาใช้ต่อ
  const groups = new Map<string, District[]>()
  for (const d of districts) {
    const k = unit === 'esa' ? esaOfDistrict(d.key) : d.provinceKey
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  const areas = [...groups.entries()]
    .map(([key, rows]) => {
      const total = rows.reduce((a, d) => a + d.totalStudents, 0)
      const highRisk = rows.reduce((a, d) => a + d.highRiskStudents, 0)
      return {
        key,
        districtKeys: new Set(rows.map((d) => d.key)),
        highRiskStudents: highRisk,
        riskRate: total ? (highRisk / total) * 100 : 0,
      }
    })
    .sort((a, b) => b.riskRate - a.riskRate)
  const worstArea = areas[0]
  const alert: CriticalAlert | null = worstArea
    ? {
        areaKey: worstArea.key,
        areaKind: unit,
        highRisk: worstArea.highRiskStudents,
        schoolsToWatch: schools.filter(
          (s) => worstArea.districtKeys.has(s.districtKey) && HIGH.has(rateToLevel(schoolRate(s))),
        ).length,
        rate: worstArea.riskRate,
        level: rateToLevel(worstArea.riskRate),
      }
    : null

  // ── causes, weighted by how many children each province actually has ──
  const acc: Record<string, number> = {}
  for (const p of provinces)
    for (const c of p.topCauses) acc[c.key] = (acc[c.key] ?? 0) + c.value * p.highRiskStudents
  const top = Object.entries(acc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  const causeSum = top.reduce((s, [, v]) => s + v, 0)
  const causes = top.map(([key, v]) => ({
    key: key as CauseKey,
    share: causeSum ? Math.round((v / causeSum) * 1000) / 10 : 0,
  }))

  const ranked = rankDistricts(districts)
  const watchSchools = schools.filter((s) => HIGH.has(rateToLevel(schoolRate(s))))
  const worstDistrict = ranked[0]?.district
  const uncovered = districts.filter((d) => d.planCoverage < 60)

  const riskShare = stats.total ? (stats.highRisk / stats.total) * 100 : 0
  // Same denominator the dashboard's own "อัตราสำเร็จ ของทั้งทะเบียน" uses — the
  // whole registry, children mid-plan included. Dividing by only the finished
  // cases gives a healthier-looking rate that contradicts the card below it.
  const registry = stats.dropout + stats.reengaging + stats.returned
  const trend = trendFor(scopeKey, riskShare)
  const trendDelta = trend[11] - trend[0]

  // ── forecast ──────────────────────────────────────────────
  // Straight-line continuation of the last six observed months. It is a
  // projection of the trend, not a model of the world, and the UI says so —
  // "confidence" here is the quality of the data going in, which is a real
  // field on every school, rather than a statistical interval this data cannot
  // support.
  const HORIZON = 6
  const slope = (trend[11] - trend[5]) / 6
  const predicted = Array.from({ length: HORIZON }, (_, i) =>
    Math.max(0.5, Math.round((trend[11] + slope * (i + 1)) * 10) / 10),
  )
  const endRate = predicted[HORIZON - 1]
  const changePct = trend[11] ? ((endRate - trend[11]) / trend[11]) * 100 : 0

  const forecast: Forecast = {
    horizonMonths: HORIZON,
    changePct,
    projectedHighRisk: Math.round(stats.total * (endRate / 100)),
    series: trend,
    predicted,
    dataQuality: Math.round(mean(schools.map((s) => s.dataQualityScore))),
  }

  // ── the three things worth an executive's attention ───────
  // Each one carries its own "so what" and "do what" rather than being
  // repeated in a second list further down the panel.
  const focuses: Focus[] = []

  if (worstArea) {
    // urgency of an area = how its own districts score in the shared model
    const own = ranked.filter((r) => worstArea.districtKeys.has(r.district.key))
    const esa = unit === 'esa' ? ESA_BY_KEY[worstArea.key] : undefined
    const areaNameTh = esa ? esa.th : ''
    const areaNameEn = esa ? esa.en : ''
    // อำเภอที่เร่งด่วนที่สุด "ภายในพื้นที่นั้น" ไม่ใช่ของทั้งขอบเขต ไม่งั้นการ์ด
    // ชี้ไปคนละที่กับหัวเรื่องของตัวเอง
    const ownWorst = own[0]?.district ?? worstDistrict
    const toArea = esa ? `/area?esa=${worstArea.key}` : `/area?p=${worstArea.key}`
    focuses.push({
      key: unit === 'esa' ? 'esa' : 'province',
      score: Math.round(mean(own.map((r) => r.score))),
      level: rateToLevel(worstArea.riskRate),
      titleTh: unit === 'esa' ? 'เขตพื้นที่ที่ต้องเร่งแก้' : 'จังหวัดที่ต้องเร่งแก้',
      titleEn: unit === 'esa' ? 'Area office needing action' : 'Province needing action',
      value: worstArea.highRiskStudents,
      unitTh: 'เด็กเสี่ยงสูง',
      unitEn: 'at-risk children',
      reasonTh: `${areaNameTh ? `${areaNameTh} — ` : ''}สัดส่วนเด็กเสี่ยง ${worstArea.riskRate.toFixed(1)}% สูงสุดในขอบเขต แนวโน้ม 12 เดือน${trendDelta >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(trendDelta).toFixed(1)} จุด`,
      reasonEn: `${areaNameEn ? `${areaNameEn} — ` : ''}${worstArea.riskRate.toFixed(1)}% at-risk share, the highest in scope, trend ${trendDelta >= 0 ? 'up' : 'down'} ${Math.abs(trendDelta).toFixed(1)} points over 12 months`,
      doTh: ownWorst
        ? `เพิ่มมาตรการ เริ่มที่อำเภอที่เร่งด่วนที่สุด ภายใน 14 วัน`
        : `เพิ่มมาตรการช่วยเหลือใน${unit === 'esa' ? 'เขตนี้' : 'จังหวัดนี้'}`,
      doEn: ownWorst
        ? 'Reinforce, starting with the most urgent district, within 14 days'
        : `Reinforce support in this ${unit === 'esa' ? 'area office' : 'province'}`,
      impactTh: ownWorst
        ? `ครอบคลุมเด็กเสี่ยงสูง ${ownWorst.highRiskStudents.toLocaleString('th-TH')} คนในอำเภอนั้น`
        : '',
      impactEn: ownWorst
        ? `Covers ${ownWorst.highRiskStudents.toLocaleString('en-US')} at-risk children there`
        : '',
      actions: canWork
        ? [
            { th: 'ดูพื้นที่', en: 'Open the area', to: toArea },
            { th: 'สร้างแผน', en: 'Build a plan', to: '/plan', primary: true },
          ]
        : [
            // the recommendation above names one อำเภอ; the button opens it
            {
              th: ownWorst ? 'เปิดอำเภอที่เร่งด่วนที่สุด' : 'ดูพื้นที่',
              en: ownWorst ? 'Open the most urgent district' : 'Open the area',
              to: ownWorst ? `${toArea}&d=${ownWorst.key}` : toArea,
              primary: true,
            },
          ],
    })
  }

  if (watchSchools.length) {
    const worstSchool = [...watchSchools].sort((a, b) => schoolRate(b) - schoolRate(a))[0]
    // one visit reaches the children already flagged inside those schools
    const reachable = watchSchools.reduce((s, x) => s + x.highRiskStudents, 0)
    focuses.push({
      key: 'schools',
      score: Math.round(Math.min(100, schoolRate(worstSchool) * 5)),
      level: rateToLevel(schoolRate(worstSchool)),
      titleTh: 'โรงเรียนเสี่ยงสูง',
      titleEn: 'High-risk schools',
      value: watchSchools.length,
      unitTh: 'แห่ง',
      unitEn: 'schools',
      reasonTh: `สัดส่วนเด็กเสี่ยงเกินเกณฑ์เฝ้าระวัง สูงสุดที่ ${schoolRate(worstSchool).toFixed(1)}%`,
      reasonEn: `Above the watch threshold, peaking at ${schoolRate(worstSchool).toFixed(1)}%`,
      doTh: 'ส่งทีมลงพื้นที่โรงเรียนกลุ่มนี้',
      doEn: 'Send teams to these schools',
      impactTh: `เข้าถึงเด็กเสี่ยงสูงราว ${reachable.toLocaleString('th-TH')} คน`,
      impactEn: `Reaches about ${reachable.toLocaleString('en-US')} at-risk children`,
      actions: canWork
        ? [
            { th: 'ดูรายชื่อโรงเรียน', en: 'See the schools', to: '/school' },
            { th: 'สร้างแผน', en: 'Build a plan', to: '/plan', primary: true },
          ]
        : [{ th: 'ดูรายชื่อโรงเรียน', en: 'See the schools', to: '/school', primary: true }],
    })
  }

  if (stats.dropout) {
    const gap = uncovered.reduce(
      (s, d) => s + Math.round(d.oosCount * (1 - d.planCoverage / 100)),
      0,
    )
    focuses.push({
      key: 'unhelped',
      score: Math.round(registry ? (stats.dropout / registry) * 100 : 0),
      level: 'high',
      titleTh: 'เด็กที่ยังไม่ได้รับการช่วยเหลือ',
      titleEn: 'Children nobody is helping yet',
      value: stats.dropout,
      unitTh: 'คน',
      unitEn: 'children',
      reasonTh: `คิดเป็น ${registry ? ((stats.dropout / registry) * 100).toFixed(1) : '0'}% ของทะเบียน ยังไม่มีแผนและไม่มีเจ้าของเคส`,
      reasonEn: `${registry ? ((stats.dropout / registry) * 100).toFixed(1) : '0'}% of the registry, with no plan and no owner`,
      doTh: uncovered.length
        ? `ปิดช่องว่างแผนใน ${uncovered.length} อำเภอที่ครอบคลุมต่ำกว่า 60%`
        : 'มอบหมายเจ้าของเคสให้ครบ',
      doEn: uncovered.length
        ? `Close the plan gap in ${uncovered.length} districts below 60% coverage`
        : 'Assign an owner to every case',
      impactTh: gap ? `เด็ก ${gap.toLocaleString('th-TH')} คนจะเข้าสู่แผน` : '',
      impactEn: gap ? `${gap.toLocaleString('en-US')} children would get a plan` : '',
      actions: canWork
        ? [
            { th: 'ติดตามเคส', en: 'Track the cases', to: '/oosc' },
            { th: 'สร้างแผน', en: 'Build a plan', to: '/plan', primary: true },
          ]
        : [
            { th: 'ดูความครอบคลุมแผนรายอำเภอ', en: 'Plan coverage by district', to: '/area' },
            { th: 'ดูทะเบียนเด็กนอกระบบ', en: 'Open the registry', to: '/oosc', primary: true },
          ],
    })
  }

  return {
    total: stats.total,
    highRisk: stats.highRisk,
    dropout: stats.dropout,
    reengaging: stats.reengaging,
    returned: stats.returned,
    registry,
    riskShare,
    successRate: registry ? (stats.returned / registry) * 100 : 0,
    alert,
    focuses,
    causes,
    ranked,
    trend,
    trendDelta,
    forecast,
  }
}
