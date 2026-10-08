// ─────────────────────────────────────────────────────────────
// Row-level scoping. Every page asks useScopedData() rather than importing
// the raw datasets, so a นายอำเภอ and an อาสาสมัคร looking at the same screen
// see different rows — enforced in one place instead of in twelve pages.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import type {
  CaseRecord,
  District,
  OoscRecord,
  OpportunityPlan,
  Province,
  Referral,
  School,
  Student,
  Tambon,
} from '@/types'
import { DISTRICTS, PROVINCES, PROVINCE_BY_KEY, TAMBONS } from '@/data/places'
import { ESA_AREAS, esaOfDistrict, type EsaArea } from '@/data/esa'
import { STUDENTS } from '@/data/students'
import { SCHOOLS } from '@/data/schools'
import { CASES } from '@/data/cases'
import { OOSC } from '@/data/oosc'
import { PLANS } from '@/data/plans'
import { REFERRALS } from '@/data/referrals'
import { useAuth } from './AuthContext'
import { canAccess, isAreaWide, type Role, type User } from './roles'

// ── helpers ──────────────────────────────────────────────────
type Geo = { provinceKey: string; districtKey?: string; tambonKey?: string }

/** Does a geo-tagged row fall inside the user's territory?
 *  Driven by the keys on the account, not by the role name: an executive with
 *  no keys covers the whole area, one with a provinceKey covers that province,
 *  and so on down. `esaKey` sits between province and district — rows carry an
 *  อำเภอ, never a เขต, so it is resolved through the district (data/esa.ts). */
function inTerritory(user: User | null, row: Geo): boolean {
  if (!user) return true
  if (user.provinceKey && row.provinceKey !== user.provinceKey) return false
  if (user.esaKey && row.districtKey && esaOfDistrict(row.districtKey) !== user.esaKey) {
    return false
  }
  if (user.districtKey && row.districtKey && row.districtKey !== user.districtKey) {
    return false
  }
  if (user.tambonKey && row.tambonKey && row.tambonKey !== user.tambonKey) return false
  return true
}

/** Never return an empty screen in a demo — fall back to a stable sample. */
function orSample<T>(rows: T[], all: T[], n = 8): T[] {
  return rows.length ? rows : all.slice(0, n)
}

// ── places ───────────────────────────────────────────────────
/** A province record narrowed to the districts this account actually governs.
 *
 *  A สพท. seat owns four of ปัตตานี's twelve อำเภอ, but the province record
 *  carries the whole province's totals — handing it straight back reported
 *  11,544 at-risk children to an account whose real scope is 1,840, a 6× over-
 *  count on every page that reads a province field directly. `overviewStats()`
 *  already summed districts for these accounts; this makes the province object
 *  agree with it instead of contradicting it one card away.
 *
 *  Counts that exist on the district record are summed exactly. The few that do
 *  not (`watchlistStudents`, `dropoutStudents`, `returnedStudents`,
 *  `unassignedCases`) are apportioned by the scope's share of students — an
 *  estimate, but a far smaller error than reporting the whole province. */
function narrowToScope(p: Province, rows: District[]): Province {
  const sum = (sel: (d: District) => number) => rows.reduce((a, d) => a + sel(d), 0)
  const totalStudents = sum((d) => d.totalStudents)
  const highRiskStudents = sum((d) => d.highRiskStudents)
  const share = p.totalStudents ? totalStudents / p.totalStudents : 0
  const part = (n: number) => Math.round(n * share)

  return {
    ...p,
    totalStudents,
    highRiskStudents,
    watchlistStudents: part(p.watchlistStudents),
    normalStudents: Math.max(0, totalStudents - highRiskStudents - part(p.watchlistStudents)),
    dropoutStudents: part(p.dropoutStudents),
    returnedStudents: part(p.returnedStudents),
    unassignedCases: part(p.unassignedCases),
    oosCount: sum((d) => d.oosCount),
    reengagedCount: sum((d) => d.reengagedCount),
    outcomeCount: sum((d) => d.outcomeCount),
    openCases: sum((d) => d.openCases),
    overdueCases: sum((d) => d.overdueCases),
    openReferrals: sum((d) => d.openReferrals),
    districts: rows.length,
    tambons: sum((d) => d.tambons),
    schools: sum((d) => d.schools),
    riskRate: totalStudents ? (highRiskStudents / totalStudents) * 100 : 0,
    interventionSuccessRate: totalStudents
      ? sum((d) => d.interventionSuccessRate * d.totalStudents) / totalStudents
      : p.interventionSuccessRate,
  }
}

export function scopedProvinces(user: User | null): Province[] {
  const p = user?.provinceKey ? PROVINCE_BY_KEY[user.provinceKey] : undefined
  if (!p) return PROVINCES
  // only narrow when the account governs part of the province, not all of it
  const partial = Boolean(user?.esaKey || user?.districtKey || user?.tambonKey)
  return [partial ? narrowToScope(p, scopedDistricts(user)) : p]
}

// District and Tambon identify themselves by `key`, not by `districtKey` /
// `tambonKey`, so they need their own filter rather than inTerritory().
export function scopedDistricts(user: User | null): District[] {
  if (!user) return DISTRICTS
  let rows = DISTRICTS
  if (user.provinceKey) rows = rows.filter((d) => d.provinceKey === user.provinceKey)
  if (user.esaKey) rows = rows.filter((d) => esaOfDistrict(d.key) === user.esaKey)
  if (user.districtKey) rows = rows.filter((d) => d.key === user.districtKey)
  return orSample(rows, DISTRICTS)
}

/** เขตพื้นที่การศึกษา in scope — one row for an ESA account, the province's
 *  three for anyone scoped to a province, all nine area-wide. */
export function scopedEsas(user: User | null): EsaArea[] {
  if (!user) return ESA_AREAS
  let rows = ESA_AREAS
  if (user.provinceKey) rows = rows.filter((e) => e.provinceKey === user.provinceKey)
  if (user.esaKey) rows = rows.filter((e) => e.key === user.esaKey)
  return rows.length ? rows : ESA_AREAS
}

export function scopedTambons(user: User | null): Tambon[] {
  if (!user) return TAMBONS
  let rows = TAMBONS
  if (user.provinceKey) rows = rows.filter((t) => t.provinceKey === user.provinceKey)
  if (user.esaKey) rows = rows.filter((t) => esaOfDistrict(t.districtKey) === user.esaKey)
  if (user.districtKey) rows = rows.filter((t) => t.districtKey === user.districtKey)
  if (user.tambonKey) rows = rows.filter((t) => t.key === user.tambonKey)
  return orSample(rows, TAMBONS, 12)
}

// ── children ─────────────────────────────────────────────────
export function scopedStudents(user: User | null): Student[] {
  if (!user) return STUDENTS
  switch (user.role) {
    case 'teacher': {
      // A caseload is bounded by the school the teacher works in. Filtering on
      // the owner name alone let one teacher "own" children in all three
      // provinces, because owner names repeat across the dataset.
      const atSchool = user.schoolKey
        ? STUDENTS.filter((s) => s.schoolKey === user.schoolKey)
        : STUDENTS.filter((s) => inTerritory(user, s))
      const mine = atSchool.filter((s) => s.caseOwner === user.ownerName)
      return mine.length ? mine : atSchool
    }
    case 'school': {
      // the director's own school, joined on the real pilot-school id
      const atSchool = user.schoolKey
        ? STUDENTS.filter((s) => s.schoolKey === user.schoolKey)
        : []
      return atSchool.length ? atSchool : STUDENTS.filter((s) => inTerritory(user, s))
    }
    case 'agency': {
      // an agency only sees children actually referred to it
      const ids = new Set(
        REFERRALS.filter((r) => r.toAgencyId === user.agencyId).map((r) => r.childId),
      )
      const rows = STUDENTS.filter((s) => ids.has(s.id))
      return orSample(rows, STUDENTS, 6)
    }
    default:
      return orSample(STUDENTS.filter((s) => inTerritory(user, s)), STUDENTS, 12)
  }
}

export function scopedOosc(user: User | null): OoscRecord[] {
  if (!user) return OOSC
  if (user.role === 'agency') {
    const ids = new Set(
      REFERRALS.filter((r) => r.toAgencyId === user.agencyId).map((r) => r.childId),
    )
    const rows = OOSC.filter((r) => ids.has(r.id))
    return orSample(rows, OOSC, 10)
  }
  return orSample(OOSC.filter((r) => inTerritory(user, r)), OOSC, 14)
}

export function scopedSchools(user: User | null): School[] {
  if (!user) return SCHOOLS
  // a director or teacher gets *their* school, matched by id — not whichever
  // school happened to come first in their district
  if (user.role === 'school' || user.role === 'teacher') {
    const own = SCHOOLS.filter((s) => s.id === user.schoolKey)
    if (own.length) return own
    return SCHOOLS.filter((s) => inTerritory(user, s)).slice(0, 1)
  }
  return orSample(SCHOOLS.filter((s) => inTerritory(user, s)), SCHOOLS, 10)
}

export function scopedCases(user: User | null): CaseRecord[] {
  if (!user) return CASES
  if (user.role === 'teacher') {
    // own caseload, inside own school (see scopedStudents)
    const atSchool = user.schoolKey
      ? CASES.filter((c) => c.schoolKey === user.schoolKey)
      : CASES.filter((c) => inTerritory(user, c))
    const mine = atSchool.filter((c) => c.owner === user.ownerName)
    return mine.length ? mine : atSchool
  }
  if (user.role === 'school') {
    const atSchool = user.schoolKey ? CASES.filter((c) => c.schoolKey === user.schoolKey) : []
    return atSchool.length ? atSchool : CASES.filter((c) => inTerritory(user, c))
  }
  if (user.role === 'agency') {
    // an agency's world is the children referred to it, not a territory
    const names = new Set(
      REFERRALS.filter((r) => r.toAgencyId === user.agencyId).map((r) => r.childName),
    )
    const rows = CASES.filter((c) => names.has(c.studentName))
    return rows.length ? rows : CASES.filter((c) => inTerritory(user, c))
  }
  return orSample(CASES.filter((c) => inTerritory(user, c)), CASES, 12)
}

// ── cross-agency work ────────────────────────────────────────
export function scopedReferrals(user: User | null): Referral[] {
  if (!user) return REFERRALS
  if (user.role === 'agency') {
    const rows = REFERRALS.filter(
      (r) => r.toAgencyId === user.agencyId || r.fromAgencyId === user.agencyId,
    )
    return orSample(rows, REFERRALS, 10)
  }
  // A referral belongs to a child, so a seat that works children rather than
  // an area follows the child. Falling through to inTerritory() handed a
  // guidance teacher every referral in สายบุรี — 116 of them, for children at
  // other schools they have no relationship with and no way to help.
  if (user.role === 'school' || user.role === 'teacher') {
    const mine = new Set([
      ...scopedStudents(user).map((s) => s.id),
      // same rule as the plans below: registry children only for an account
      // whose menu actually contains the registry
      ...(canAccess(user, '/oosc') ? scopedOosc(user).map((r) => r.id) : []),
    ])
    return REFERRALS.filter((r) => mine.has(r.childId))
  }
  return orSample(REFERRALS.filter((r) => inTerritory(user, r)), REFERRALS, 14)
}

export function scopedPlans(user: User | null): OpportunityPlan[] {
  if (!user) return PLANS
  const childIds = new Set([
    ...scopedStudents(user).map((s) => s.id),
    // Registry children only for accounts that may open the registry. A
    // teacher has no `/oosc` in their menu, yet this line was giving them the
    // opportunity plans of all 117 out-of-school children in the district —
    // the record hidden by the menu, handed over by the data layer.
    ...(canAccess(user, '/oosc') ? scopedOosc(user).map((r) => r.id) : []),
  ])
  const rows = PLANS.filter((p) => childIds.has(p.childId))
  // A caseload-sized account gets exactly its own plans; padding a short list
  // with a sample would put other people's children back on the page.
  if (user.role === 'school' || user.role === 'teacher') return rows
  return orSample(rows, PLANS, 10)
}

// ── headline stats ───────────────────────────────────────────
export interface OverviewStats {
  total: number
  normal: number
  watchlist: number
  highRisk: number
  /** children currently out of the system, nothing working yet */
  dropout: number
  /** children with an active plan, on the way back */
  reengaging: number
  /** children who reached a durable outcome */
  returned: number
  provincesCount: number
  districtsCount: number
  tambonsCount: number
  schoolsCount: number
  openReferrals: number
  /** true when stats come from an individual roll-up rather than aggregates */
  studentLevel: boolean
}

export function overviewStats(user: User | null): OverviewStats {
  const role: Role = user?.role ?? 'exec'

  // Executives read rolled-up figures. Which roll-up depends on the account's
  // territory: a district seat sums districts, everyone above sums provinces.
  // สพฐ. and the เขต office belong here too — they supervise whole areas, so
  // the headline is the area roll-up, not the length of the student sample.
  if (role === 'exec' || role === 'obec' || role === 'esa') {
    const provs = scopedProvinces(user)
    const dists = scopedDistricts(user)
    // an เขต is a set of districts, so it sums districts for the same reason a
    // district seat does — summing its province would report the whole จังหวัด
    const useDistricts = Boolean(user?.districtKey || user?.esaKey)
    const sumP = (sel: (p: Province) => number) => provs.reduce((s, p) => s + sel(p), 0)
    const sumD = (sel: (d: District) => number) => dists.reduce((s, d) => s + sel(d), 0)

    return {
      total: useDistricts ? sumD((d) => d.totalStudents) : sumP((p) => p.totalStudents),
      normal: useDistricts
        ? sumD((d) => d.totalStudents - d.highRiskStudents)
        : sumP((p) => p.normalStudents),
      watchlist: useDistricts
        ? Math.round(sumD((d) => d.highRiskStudents) * 1.7)
        : sumP((p) => p.watchlistStudents),
      highRisk: useDistricts ? sumD((d) => d.highRiskStudents) : sumP((p) => p.highRiskStudents),
      dropout: useDistricts ? sumD((d) => d.oosCount) : sumP((p) => p.oosCount),
      reengaging: useDistricts
        ? sumD((d) => d.reengagedCount)
        : sumP((p) => p.reengagedCount),
      returned: useDistricts ? sumD((d) => d.outcomeCount) : sumP((p) => p.outcomeCount),
      provincesCount: provs.length,
      districtsCount: dists.length,
      tambonsCount: scopedTambons(user).length,
      schoolsCount: useDistricts ? sumD((d) => d.schools) : sumP((p) => p.schools),
      openReferrals: useDistricts
        ? sumD((d) => d.openReferrals)
        : sumP((p) => p.openReferrals),
      studentLevel: false,
    }
  }

  // school / teacher / agency — roll up from the individual rows they own
  const st = scopedStudents(user)
  const oos = scopedOosc(user)
  const count = (pred: (s: Student) => boolean) => st.filter(pred).length
  // A director's headline is their school's enrolment, which the school record
  // holds; the individual student rows are the detailed sample sitting inside
  // it. Adding registry children to that total mixed two populations, and the
  // high-risk share then divided a school-wide count by the mixed one.
  const ownSchool = role === 'school' ? scopedSchools(user)[0] : undefined
  return {
    total: ownSchool?.totalStudents ?? st.length,
    normal: count((s) => s.riskLevel === 'normal'),
    watchlist: count((s) => s.riskLevel === 'watch'),
    highRisk:
      ownSchool?.highRiskStudents ??
      count((s) => s.riskLevel === 'high' || s.riskLevel === 'critical'),
    dropout: oos.filter((r) => r.status === 'outOfSchool' || r.status === 'unreachable').length,
    reengaging: oos.filter((r) => r.status === 'reengaging').length,
    // Counted off the out-of-school registry only, exactly like the roll-ups
    // above it. Enrolled students carrying a 'returned' flag came back before
    // this registry existed, so folding them in here made the known total on
    // the overview larger than the registry page it links to.
    returned: oos.filter((r) => r.status === 'returned' || r.status === 'working').length,
    provincesCount: 1,
    districtsCount: 1,
    tambonsCount: new Set(st.map((s) => s.tambonKey)).size,
    schoolsCount: role === 'school' ? 1 : 0,
    openReferrals: scopedReferrals(user).filter((r) =>
      ['sent', 'accepted', 'inProgress', 'overdue'].includes(r.status),
    ).length,
    studentLevel: true,
  }
}

export function topRiskScoped(user: User | null, n = 10): Province[] {
  return [...scopedProvinces(user)].sort((a, b) => b.riskRate - a.riskRate).slice(0, n)
}

export function topSuccessScoped(user: User | null, n = 10): Province[] {
  return [...scopedProvinces(user)]
    .sort((a, b) => b.interventionSuccessRate - a.interventionSuccessRate)
    .slice(0, n)
}

export function topRiskDistrictsScoped(user: User | null, n = 8): District[] {
  return [...scopedDistricts(user)].sort((a, b) => b.riskRate - a.riskRate).slice(0, n)
}

// ── React hook: everything a page needs, memoized on the user ──
export function useScopedData() {
  const { user } = useAuth()
  return useMemo(
    () => ({
      user,
      provinces: scopedProvinces(user),
      esas: scopedEsas(user),
      districts: scopedDistricts(user),
      tambons: scopedTambons(user),
      students: scopedStudents(user),
      oosc: scopedOosc(user),
      schools: scopedSchools(user),
      cases: scopedCases(user),
      referrals: scopedReferrals(user),
      plans: scopedPlans(user),
      stats: overviewStats(user),
      /** the ศอ.บต. seat — an executive with no territory of their own */
      isRegional: isAreaWide(user),
      /** executives work with rolled-up figures, not named children */
      isExecutive: ['exec', 'obec', 'esa'].includes(user?.role ?? 'exec'),
    }),
    [user],
  )
}
