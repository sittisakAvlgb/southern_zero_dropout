// ─────────────────────────────────────────────────────────────
// Place-level mock data, generated BOTTOM-UP: ตำบล → อำเภอ → จังหวัด.
//
// Building upward matters for the demo: when an executive drills from the
// province card into an อำเภอ and then a ตำบล, the numbers add up exactly.
// Everything is deterministic (seeded on the real place key), so a reload —
// or a second person on a different laptop — sees identical figures.
// ─────────────────────────────────────────────────────────────
import type {
  AreaKind,
  CauseKey,
  CauseWeight,
  District,
  Province,
  Tambon,
} from '@/types'
import {
  DISTRICTS_GEO,
  PROVINCES_GEO,
  type DistrictGeo,
} from './geo'
import { hashSeed, makeRng, randInt } from '@/lib/format'
import { oosSplit } from '@/lib/oos'
import { OOSC_BY_TAMBON } from './oosc'

const ALL_CAUSES: CauseKey[] = [
  'absence', 'grades', 'failing', 'noExam', 'poverty', 'migration',
  'family', 'health', 'travel', 'noContact', 'noDevice', 'transition',
  'earlyMarriage', 'childLabour', 'dualSchooling', 'unrestAffected',
  'noDocuments', 'stateless',
]

/** Student population band per tambon, by district character. */
const POP_BAND: Record<AreaKind, [number, number]> = {
  urban: [900, 3200],
  coastal: [420, 1500],
  rural: [380, 1350],
  border: [350, 1500],
  remote: [180, 780],
}

/** Baseline high-risk share (%) before per-place jitter. */
const RISK_BASE: Record<AreaKind, number> = {
  urban: 8.5,
  coastal: 11.5,
  rural: 10.5,
  border: 14.0,
  remote: 15.5,
}

/** Districts with a mature multi-agency team run visibly better. */
const STRONG_DISTRICTS = new Set([
  'mueangPattani', 'mueangYala', 'mueangNarathiwat', 'betong',
  'sungaikolok', 'saiburi', 'raman',
])

function causeProfile(
  rng: () => number,
  kind: AreaKind,
  provinceKey: string,
): CauseWeight[] {
  const w: Record<CauseKey, number> = {} as Record<CauseKey, number>
  for (const c of ALL_CAUSES) w[c] = randInt(rng, 2, 11)

  // Structural drivers in the southern border provinces
  w.poverty += 20
  w.absence += 16
  w.dualSchooling += 14 // เรียนสายสามัญ + ศาสนา ภาระเวลาสูง
  w.family += 9
  w.earlyMarriage += 8

  if (kind === 'remote') { w.travel += 16; w.noDevice += 10; w.noContact += 6 }
  if (kind === 'border') { w.migration += 18; w.noDocuments += 10; w.childLabour += 8 }
  if (kind === 'coastal') { w.childLabour += 13; w.migration += 6 }
  if (kind === 'urban') { w.grades += 10; w.transition += 8; w.health += 6 }
  if (kind === 'rural') { w.poverty += 6; w.transition += 5 }

  // Province colouring — keeps the three cards visibly distinct
  if (provinceKey === 'narathiwat') { w.migration += 10; w.noDocuments += 6 }
  if (provinceKey === 'yala') { w.travel += 8; w.unrestAffected += 7 }
  if (provinceKey === 'pattani') { w.childLabour += 7; w.earlyMarriage += 6 }

  const total = ALL_CAUSES.reduce((s, c) => s + w[c], 0)
  return ALL_CAUSES.map((c) => ({
    key: c,
    value: Math.round((w[c] / total) * 1000) / 10,
  })).sort((a, b) => b.value - a.value)
}

function mergeCauses(list: CauseWeight[][], weights: number[]): CauseWeight[] {
  const acc: Record<string, number> = {}
  list.forEach((cw, i) => {
    for (const c of cw) acc[c.key] = (acc[c.key] ?? 0) + c.value * weights[i]
  })
  const total = Object.values(acc).reduce((s, v) => s + v, 0) || 1
  return Object.entries(acc)
    .map(([key, v]) => ({
      key: key as CauseKey,
      value: Math.round((v / total) * 1000) / 10,
    }))
    .sort((a, b) => b.value - a.value)
}

// ── ตำบล ─────────────────────────────────────────────────────
function buildTambon(geoD: DistrictGeo, tKey: string): Tambon {
  const rng = makeRng(hashSeed(`tambon::${tKey}`))
  const [lo, hi] = POP_BAND[geoD.kind]
  const totalStudents = randInt(rng, lo, hi)

  const strong = STRONG_DISTRICTS.has(geoD.key)
  const riskRate =
    Math.round(
      Math.max(3.5, RISK_BASE[geoD.kind] + rng() * 6 - 3 - (strong ? 1.4 : 0)) * 10,
    ) / 10
  const highRiskStudents = Math.round((totalStudents * riskRate) / 100)

  // Out-of-school figures are COUNTED from the registry, never invented here:
  // an executive who drills into "82 children" must find 82 named records.
  const reg = OOSC_BY_TAMBON[tKey] ?? { out: 0, engaged: 0, outcome: 0 }
  const reengagedCount = reg.engaged
  // Share of *known* out-of-school children who have a plan behind them —
  // a child who already reached an outcome had one, so they count. The old
  // formula (engaged ÷ (engaged + out)) left the successes out of both sides,
  // so this label disagreed with the same label on the overview page.
  const planCoverage = oosSplit({
    oosCount: reg.out,
    reengagedCount,
    outcomeCount: reg.outcome,
  }).planCoverage

  return {
    key: tKey,
    districtKey: geoD.key,
    provinceKey: geoD.provinceKey,
    totalStudents,
    highRiskStudents,
    oosCount: reg.out,
    reengagedCount,
    outcomeCount: reg.outcome,
    planCoverage,
    schools: Math.max(1, Math.round(totalStudents / 380)),
    volunteers: randInt(rng, 4, 34),
    lastSurveyDaysAgo: randInt(rng, 3, 210),
    riskRate,
    hasChildProtectionCommittee: rng() > (strong ? 0.22 : 0.48),
  }
}

export const TAMBONS: Tambon[] = DISTRICTS_GEO.flatMap((d) =>
  d.tambons.map((t) => buildTambon(d, t.key)),
)

export const TAMBON_BY_KEY: Record<string, Tambon> = Object.fromEntries(
  TAMBONS.map((t) => [t.key, t]),
)

export const tambonsOf = (districtKey: string): Tambon[] =>
  TAMBONS.filter((t) => t.districtKey === districtKey)

// ── อำเภอ ────────────────────────────────────────────────────
function buildDistrict(geoD: DistrictGeo): District {
  const rng = makeRng(hashSeed(`district::${geoD.key}`))
  const ts = TAMBONS.filter((t) => t.districtKey === geoD.key)
  const sum = (sel: (t: Tambon) => number) => ts.reduce((s, t) => s + sel(t), 0)

  const totalStudents = sum((t) => t.totalStudents)
  const highRiskStudents = sum((t) => t.highRiskStudents)
  const oosCount = sum((t) => t.oosCount)
  const reengagedCount = sum((t) => t.reengagedCount)
  const outcomeCount = sum((t) => t.outcomeCount)
  const strong = STRONG_DISTRICTS.has(geoD.key)

  const openCases = Math.round(highRiskStudents * (0.46 + rng() * 0.3))
  const overdueCases = Math.round(openCases * ((strong ? 0.06 : 0.13) + rng() * 0.12))
  const openReferrals = Math.round(openCases * (0.22 + rng() * 0.26))

  const causes = ts.map(() => causeProfile(rng, geoD.kind, geoD.provinceKey))

  return {
    key: geoD.key,
    provinceKey: geoD.provinceKey,
    kind: geoD.kind,
    lon: geoD.lon,
    lat: geoD.lat,
    totalStudents,
    highRiskStudents,
    oosCount,
    reengagedCount,
    outcomeCount,
    openCases,
    overdueCases,
    openReferrals,
    schools: sum((t) => t.schools),
    tambons: ts.length,
    riskRate: Math.round((highRiskStudents / Math.max(1, totalStudents)) * 1000) / 10,
    // same definition as the tambon above and the overview page
    planCoverage: oosSplit({ oosCount, reengagedCount, outcomeCount }).planCoverage,
    interventionSuccessRate:
      Math.round(((strong ? 68 : 52) + rng() * 28) * 10) / 10,
    topCauses: mergeCauses(causes, ts.map((t) => t.highRiskStudents || 1)),
    hasDistrictTeam: strong || rng() > 0.35,
  }
}

export const DISTRICTS: District[] = DISTRICTS_GEO.map(buildDistrict)

export const DISTRICT_BY_KEY: Record<string, District> = Object.fromEntries(
  DISTRICTS.map((d) => [d.key, d]),
)

export const districtsOfProvince = (provinceKey: string): District[] =>
  DISTRICTS.filter((d) => d.provinceKey === provinceKey)

// ── จังหวัด ──────────────────────────────────────────────────
function buildProvince(geo: (typeof PROVINCES_GEO)[number]): Province {
  const rng = makeRng(hashSeed(`province::${geo.key}`))
  const ds = DISTRICTS.filter((d) => d.provinceKey === geo.key)
  const sum = (sel: (d: District) => number) => ds.reduce((s, d) => s + sel(d), 0)

  const totalStudents = sum((d) => d.totalStudents)
  const highRiskStudents = sum((d) => d.highRiskStudents)
  const oosCount = sum((d) => d.oosCount)
  const outcomeCount = sum((d) => d.outcomeCount)
  const engagedCount = sum((d) => d.reengagedCount)
  const riskRate =
    Math.round((highRiskStudents / Math.max(1, totalStudents)) * 1000) / 10

  const watchlistStudents = Math.round(highRiskStudents * (1.5 + rng() * 0.6))
  const dropoutStudents = oosCount
  // this used to hold engagedCount, so "returned" actually carried the
  // *re-engaging* group — two different children counted under one name
  const returnedStudents = outcomeCount
  const normalStudents =
    totalStudents - watchlistStudents - highRiskStudents

  const trend: number[] = []
  let v = riskRate + rng() * 2.4
  for (let i = 0; i < 6; i++) {
    v -= rng() * 0.9 - 0.35
    trend.push(Math.max(2, Math.round(v * 10) / 10))
  }
  trend[5] = riskRate

  return {
    id: geo.id,
    key: geo.key,
    region: geo.region,
    x: geo.x,
    y: geo.y,
    partial: geo.partial,
    totalStudents,
    normalStudents,
    watchlistStudents,
    highRiskStudents,
    dropoutStudents,
    returnedStudents,
    oosCount,
    reengagedCount: engagedCount,
    outcomeCount,
    riskRate,
    topCauses: mergeCauses(
      ds.map((d) => d.topCauses),
      ds.map((d) => d.highRiskStudents || 1),
    ),
    openCases: sum((d) => d.openCases),
    overdueCases: sum((d) => d.overdueCases),
    unassignedCases: Math.round(sum((d) => d.openCases) * (0.05 + rng() * 0.08)),
    openReferrals: sum((d) => d.openReferrals),
    interventionSuccessRate:
      Math.round(
        (ds.reduce((s, d) => s + d.interventionSuccessRate, 0) / Math.max(1, ds.length)) *
          10,
      ) / 10,
    dataQualityScore: Math.round(64 + rng() * 30),
    schools: sum((d) => d.schools),
    districts: ds.length,
    tambons: sum((d) => d.tambons),
    trend,
  }
}

export const PROVINCES: Province[] = PROVINCES_GEO.map(buildProvince)

export const PROVINCE_BY_KEY: Record<string, Province> = Object.fromEntries(
  PROVINCES.map((p) => [p.key, p]),
)

// ── Region-wide aggregate (จชต. rather than "national") ──────
function total(sel: (p: Province) => number): number {
  return PROVINCES.reduce((s, p) => s + sel(p), 0)
}

export const REGION_TOTALS = {
  totalStudents: total((p) => p.totalStudents),
  normalStudents: total((p) => p.normalStudents),
  watchlistStudents: total((p) => p.watchlistStudents),
  highRiskStudents: total((p) => p.highRiskStudents),
  dropoutStudents: total((p) => p.dropoutStudents),
  returnedStudents: total((p) => p.returnedStudents),
  oosCount: total((p) => p.oosCount),
  outcomeCount: total((p) => p.outcomeCount),
  openCases: total((p) => p.openCases),
  overdueCases: total((p) => p.overdueCases),
  unassignedCases: total((p) => p.unassignedCases),
  openReferrals: total((p) => p.openReferrals),
  schools: total((p) => p.schools),
  districts: total((p) => p.districts),
  tambons: total((p) => p.tambons),
}

/** Month-over-month deltas (scenario values, %) */
export const REGION_DELTAS = {
  totalStudents: 0.2,
  normalStudents: 0.9,
  watchlistStudents: -1.8,
  highRiskStudents: -3.4,
  dropoutStudents: -5.1,
  returnedStudents: 11.7,
  oosCount: -5.1,
  outcomeCount: 11.7,
}

export const topRiskProvinces = (n = 4): Province[] =>
  [...PROVINCES].sort((a, b) => b.riskRate - a.riskRate).slice(0, n)

export const topSuccessProvinces = (n = 4): Province[] =>
  [...PROVINCES]
    .sort((a, b) => b.interventionSuccessRate - a.interventionSuccessRate)
    .slice(0, n)

export const topRiskDistricts = (n = 10): District[] =>
  [...DISTRICTS].sort((a, b) => b.riskRate - a.riskRate).slice(0, n)

export const coldestSpots = (n = 8): Tambon[] =>
  [...TAMBONS].sort((a, b) => a.planCoverage - b.planCoverage).slice(0, n)

/** Aggregate cause distribution across the whole จชต. area */
export function regionCauseDistribution(): CauseWeight[] {
  return mergeCauses(
    PROVINCES.map((p) => p.topCauses),
    PROVINCES.map((p) => p.highRiskStudents || 1),
  )
}
