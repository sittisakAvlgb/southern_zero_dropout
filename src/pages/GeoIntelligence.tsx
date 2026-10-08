import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Chart from 'react-apexcharts'
import { Card, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { SouthernMap, type MapMetric } from '@/components/map/SouthernMap'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { ESA_BY_KEY, esaOfDistrict } from '@/data/esa'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { formatNumber, hashSeed, makeRng } from '@/lib/format'
import { RISK_COLOR, rateToLevel } from '@/lib/risk'
import { SIGNAL_LABEL, rankDistricts } from '@/lib/decision'
import {
  IconAI,
  IconAlert,
  IconArrowRight,
  IconChevronRight,
  IconMap,
  IconSchool,
  IconStudent,
} from '@/components/icons'
import type { ChildStatus, District, GradeLevel, School } from '@/types'

type Level = 'area' | 'province' | 'esa' | 'district' | 'school'

interface Crumb {
  level: Level
  label: string
  onClick?: () => void
}

/** Twelve months of risk rate for one area. Deterministic from the area key so
 *  the same place always draws the same line — the trend is demo data, but it
 *  must not shuffle between visits or it reads as live and untrustworthy. */
function trendFor(key: string, endRate: number): number[] {
  const rng = makeRng(hashSeed(`geo-trend-${key}`))
  const out: number[] = []
  let v = endRate * (0.82 + rng() * 0.16)
  for (let i = 0; i < 12; i++) {
    v += (rng() - 0.42) * 0.6
    out.push(Math.max(0.5, Math.round(v * 10) / 10))
  }
  // land the series on today's real figure so the chart and the KPI agree
  out[11] = Math.round(endRate * 10) / 10
  return out
}

const MONTHS_TH = ['ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.']
const MONTHS_EN = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

const GRADES: GradeLevel[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']
const STATUSES: ChildStatus[] = [
  'inSchool', 'atRisk', 'outOfSchool', 'reengaging', 'returned', 'working', 'unreachable',
]
const gradeLabel = (g: GradeLevel, th: boolean) =>
  th ? `${g[0] === 'p' ? 'ป.' : 'ม.'}${g.slice(1)}` : `${g[0].toUpperCase()}${g.slice(1)}`

export default function GeoIntelligence() {
  const { lang, t, pn, dn, pick } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const loading = useSimulatedLoading()
  const { user, provinces, esas, districts, schools, students } = useScopedData()

  // ── drill path ────────────────────────────────────────────
  const [provinceKey, setProvinceKey] = useState<string | null>(null)
  const [esaKey, setEsaKey] = useState<string | null>(null)
  const [districtKey, setDistrictKey] = useState<string | null>(null)
  const [school, setSchool] = useState<School | null>(null)

  // ── layers and filters ────────────────────────────────────
  const [metric, setMetric] = useState<MapMetric>('risk')
  const [showSchools, setShowSchools] = useState(true)
  const [showStudents, setShowStudents] = useState(false)
  const [riskFilter, setRiskFilter] = useState('all')
  const [sector, setSector] = useState('all')
  const [year, setYear] = useState('2568')
  const [grade, setGrade] = useState('all')
  const [status, setStatus] = useState('all')
  const [rankTab, setRankTab] = useState<'province' | 'esa' | 'school'>('province')

  const go = (to: string) => {
    if (!user || canAccess(user, to)) nav(to)
  }

  const resetTo = (level: Level) => {
    if (level === 'area') { setProvinceKey(null); setEsaKey(null); setDistrictKey(null); setSchool(null) }
    if (level === 'province') { setEsaKey(null); setDistrictKey(null); setSchool(null) }
    if (level === 'esa') { setDistrictKey(null); setSchool(null) }
    if (level === 'district') setSchool(null)
  }

  // ── what the current drill path selects ───────────────────
  const inDrill = useMemo(() => {
    let rows = districts
    if (provinceKey) rows = rows.filter((d) => d.provinceKey === provinceKey)
    if (esaKey) rows = rows.filter((d) => esaOfDistrict(d.key) === esaKey)
    if (districtKey) rows = rows.filter((d) => d.key === districtKey)
    return rows
  }, [districts, provinceKey, esaKey, districtKey])

  const visibleDistricts = useMemo(() => {
    if (riskFilter === 'all') return inDrill
    return inDrill.filter((d) => rateToLevel(d.riskRate) === riskFilter)
  }, [inDrill, riskFilter])

  const visibleSchools = useMemo(() => {
    const keys = new Set(inDrill.map((d) => d.key))
    let rows = schools.filter((s) => keys.has(s.districtKey))
    if (sector !== 'all') rows = rows.filter((s) => s.sector === sector)
    if (riskFilter !== 'all') {
      rows = rows.filter(
        (s) => rateToLevel((s.highRiskStudents / Math.max(1, s.totalStudents)) * 100) === riskFilter,
      )
    }
    return rows
  }, [schools, inDrill, sector, riskFilter])

  /** What the account sees before drilling anywhere. */
  const rootLabel = useMemo(() => {
    if (user?.esaKey && ESA_BY_KEY[user.esaKey]) return pick(ESA_BY_KEY[user.esaKey])
    if (user?.provinceKey) return pn(user.provinceKey)
    return th ? 'พื้นที่นำร่อง จชต.' : 'SBP pilot area'
  }, [user, pick, pn, th])

  // ── aggregate for whatever is selected ────────────────────
  const focus = useMemo(() => {
    const rows = inDrill
    const sum = (sel: (d: District) => number) => rows.reduce((s, d) => s + sel(d), 0)
    const total = sum((d) => d.totalStudents)
    const highRisk = sum((d) => d.highRiskStudents)

    // The root of the drill is the account's own territory, not the whole
    // pilot area — labelling a เขต account "จชต." next to its เขต-only figures
    // reads as though the numbers cover all three provinces.
    let label = rootLabel
    let key = `root-${user?.esaKey ?? user?.provinceKey ?? 'area'}`
    if (school) { label = school.name; key = `school-${school.id}` }
    else if (districtKey) { label = dn(districtKey); key = `district-${districtKey}` }
    else if (esaKey) { label = pick(ESA_BY_KEY[esaKey]); key = `esa-${esaKey}` }
    else if (provinceKey) { label = pn(provinceKey); key = `province-${provinceKey}` }

    if (school) {
      return {
        label, key,
        total: school.totalStudents,
        highRisk: school.highRiskStudents,
        oos: school.openCases,
        returned: Math.round(school.totalStudents * (school.interventionSuccessRate / 100) * 0.04),
        riskRate: (school.highRiskStudents / Math.max(1, school.totalStudents)) * 100,
        causes: rows[0]?.topCauses ?? [],
      }
    }
    return {
      label, key, total, highRisk,
      oos: sum((d) => d.oosCount),
      returned: sum((d) => d.outcomeCount),
      riskRate: total ? (highRisk / total) * 100 : 0,
      causes: rows[0]?.topCauses ?? [],
    }
  }, [inDrill, school, districtKey, esaKey, provinceKey, rootLabel, user, dn, pn, pick])

  const trend = useMemo(() => trendFor(focus.key, focus.riskRate), [focus.key, focus.riskRate])
  const trendDelta = trend[11] - trend[0]

  // ── the AI-style recommendation, computed not generated ───
  const ranked = useMemo(() => rankDistricts(inDrill), [inDrill])
  const recommendation = useMemo(() => {
    const worst = ranked.slice(0, 3)
    if (!worst.length) return null
    const rising = trendDelta > 0
    return {
      headline: th
        ? `${rising ? 'ความเสี่ยงเพิ่มขึ้น' : 'ความเสี่ยงลดลง'} ${Math.abs(trendDelta).toFixed(1)} จุดใน 12 เดือน${worst.length > 1 ? ` — หนักที่สุดใน ${worst.length} อำเภอ` : ''}`
        : `Risk ${rising ? 'up' : 'down'} ${Math.abs(trendDelta).toFixed(1)} points over 12 months${worst.length > 1 ? ` — worst in ${worst.length} districts` : ''}`,
      areas: worst.map((r) => dn(r.district.key)),
      action: th
        ? `ควรส่งทีมช่วยเหลือเข้า ${dn(worst[0].district.key)} ภายใน 14 วัน — ${SIGNAL_LABEL[worst[0].lead.key].th}สูงสุดในขอบเขตนี้`
        : `Send a team to ${dn(worst[0].district.key)} within 14 days — highest ${SIGNAL_LABEL[worst[0].lead.key].en.toLowerCase()} in this scope`,
    }
  }, [ranked, trendDelta, dn, th])

  // ── students in scope, aggregated by district (never by home) ──
  /** Everyone inside the current drill, before the grade/status filters — the
   *  base both the filter options and the filtered list are built from. */
  const studentsHere = useMemo(() => {
    const keys = new Set(inDrill.map((d) => d.key))
    return students.filter((s) => keys.has(s.districtKey))
  }, [students, inDrill])

  /** Offer only values that actually occur here. The full GradeLevel and
   *  ChildStatus enums contain grades no pilot school teaches (the 46 TOR
   *  schools are secondary) and statuses only the out-of-school registry uses,
   *  so listing the whole enum hands the user options that always return zero. */
  const gradeOptions = useMemo(() => {
    const n: Record<string, number> = {}
    for (const s of studentsHere) n[s.gradeKey] = (n[s.gradeKey] ?? 0) + 1
    return GRADES.filter((g) => n[g]).map((g) => ({ key: g, count: n[g] }))
  }, [studentsHere])

  const statusOptions = useMemo(() => {
    const n: Record<string, number> = {}
    for (const s of studentsHere) n[s.status] = (n[s.status] ?? 0) + 1
    return STATUSES.filter((k) => n[k]).map((k) => ({ key: k, count: n[k] }))
  }, [studentsHere])

  // Drilling into a smaller area can remove the value that is selected; leaving
  // it set would show an empty list under a filter the dropdown no longer lists.
  useEffect(() => {
    if (grade !== 'all' && !gradeOptions.some((g) => g.key === grade)) setGrade('all')
    if (status !== 'all' && !statusOptions.some((s) => s.key === status)) setStatus('all')
  }, [gradeOptions, statusOptions, grade, status])

  /** With no status chosen the layer means "at-risk density", so it keeps the
   *  high/critical restriction. Pick a status and that becomes the question
   *  being asked instead — counting only high-risk children with that status
   *  would quietly answer something narrower than the filter says. */
  const studentsInScope = useMemo(
    () =>
      studentsHere.filter((s) => {
        if (grade !== 'all' && s.gradeKey !== grade) return false
        if (status !== 'all') return s.status === status
        return s.riskLevel === 'high' || s.riskLevel === 'critical'
      }),
    [studentsHere, grade, status],
  )

  const studentList = useMemo(
    () => [...studentsInScope].sort((a, b) => b.riskScore - a.riskScore),
    [studentsInScope],
  )
  const [shown, setShown] = useState(10)
  useEffect(() => setShown(10), [grade, status, inDrill])

  const schoolName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of schools) m[s.id] = th ? s.name : s.nameEn ?? s.name
    return m
  }, [schools, th])

  const studentClusters = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const s of studentsInScope) acc[s.districtKey] = (acc[s.districtKey] ?? 0) + 1
    return Object.entries(acc)
      .map(([k, n]) => ({ districtKey: k, count: n }))
      .sort((a, b) => b.count - a.count)
  }, [studentsInScope])

  const studentFilterActive = grade !== 'all' || status !== 'all'

  // ── ask, then move the map to the answer ──────────────────
  /** Every area the question could be about, with the drill it implies. The
   *  match is deterministic so the map always lands somewhere explainable —
   *  the model narrates the answer, it does not choose the destination. */
  const targets = useMemo(
    () =>
      [
        ...provinces.map((p) => ({
          label: pn(p.key), rate: p.riskRate,
          apply: () => { resetTo('area'); setProvinceKey(p.key) },
        })),
        ...esas.map((e) => ({
          label: pick(e),
          rate: (() => {
            const rows = districts.filter((d) => esaOfDistrict(d.key) === e.key)
            const tot = rows.reduce((s, d) => s + d.totalStudents, 0)
            return tot ? (rows.reduce((s, d) => s + d.highRiskStudents, 0) / tot) * 100 : 0
          })(),
          apply: () => { resetTo('area'); setProvinceKey(e.provinceKey); setEsaKey(e.key) },
        })),
        ...districts.map((d) => ({
          label: dn(d.key), rate: d.riskRate,
          apply: () => {
            setProvinceKey(d.provinceKey)
            setEsaKey(esaOfDistrict(d.key) ?? null)
            setDistrictKey(d.key)
            setSchool(null)
          },
        })),
      ].sort((a, b) => b.rate - a.rate),
    [provinces, esas, districts, pn, dn, pick],
  )

  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<{ text: string; area: string } | null>(null)

  const ask = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    const named = targets.find((tg) => text.includes(tg.label))
    const hit = named ?? targets[0]
    if (!hit) return
    hit.apply()
    setAnswer({
      area: hit.label,
      text: named
        ? th
          ? `${hit.label} มีสัดส่วนเด็กเสี่ยงสูง ${hit.rate.toFixed(1)}% — ไฮไลต์บนแผนที่แล้ว`
          : `${hit.label} sits at ${hit.rate.toFixed(1)}% high-risk share — highlighted on the map.`
        : th
          ? `พื้นที่ที่เสี่ยงสูงสุดในขอบเขตของคุณคือ ${hit.label} (${hit.rate.toFixed(1)}%) — ไฮไลต์บนแผนที่แล้ว`
          : `The highest-risk area in your scope is ${hit.label} (${hit.rate.toFixed(1)}%) — highlighted on the map.`,
    })
  }

  // ── breadcrumb ────────────────────────────────────────────
  const crumbs: Crumb[] = useMemo(() => {
    const rows: Crumb[] = [
      {
        level: 'area',
        // The map draws all of Thailand, but only the three TOR provinces carry
        // data — saying so here is cheaper than being asked where the other 74 are
        // A scoped account's drill begins at what it governs. The map still
        // draws the whole country behind it, but naming ประเทศไทย as this
        // account's top level overstates what it can open.
        label: user?.provinceKey
          ? rootLabel
          : th
            ? 'ประเทศไทย (นำร่อง จชต.)'
            : 'Thailand (SBP pilot)',
        onClick: () => resetTo('area'),
      },
    ]
    if (provinceKey) rows.push({ level: 'province', label: pn(provinceKey), onClick: () => resetTo('province') })
    if (esaKey && ESA_BY_KEY[esaKey]) rows.push({ level: 'esa', label: pick(ESA_BY_KEY[esaKey]), onClick: () => resetTo('esa') })
    if (districtKey) rows.push({ level: 'district', label: dn(districtKey), onClick: () => resetTo('district') })
    if (school) rows.push({ level: 'school', label: school.name })
    return rows
  }, [provinceKey, esaKey, districtKey, school, rootLabel, user, pn, dn, pick, th])

  // ── ranking below the map ─────────────────────────────────
  const ranking = useMemo(() => {
    if (rankTab === 'province')
      return [...provinces]
        .sort((a, b) => b.riskRate - a.riskRate)
        .map((p) => ({ key: p.key, label: pn(p.key), value: p.riskRate, sub: `${formatNumber(p.oosCount, lang)} ${th ? 'คนนอกระบบ' : 'out of school'}`, open: () => { resetTo('area'); setProvinceKey(p.key) } }))
    if (rankTab === 'esa')
      return esas
        .map((e) => {
          const rows = districts.filter((d) => esaOfDistrict(d.key) === e.key)
          const total = rows.reduce((s, d) => s + d.totalStudents, 0)
          const high = rows.reduce((s, d) => s + d.highRiskStudents, 0)
          return { key: e.key, label: pick(e), value: total ? (high / total) * 100 : 0, sub: `${rows.length} ${th ? 'อำเภอ' : 'districts'}`, open: () => { resetTo('area'); setProvinceKey(e.provinceKey); setEsaKey(e.key) } }
        })
        .sort((a, b) => b.value - a.value)
    return [...schools]
      .map((s) => ({ key: s.id, label: s.name, value: (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100, sub: `${dn(s.districtKey)} · ${formatNumber(s.totalStudents, lang)} ${th ? 'คน' : ''}`, open: () => go(`/school?s=${s.id}`) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [rankTab, provinces, esas, districts, schools, pn, dn, pick, lang, th])

  if (loading) {
    return (
      <div className="animate-page-rise space-y-4">
        <SkeletonCard className="h-16" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <SkeletonCard className="h-[560px] lg:col-span-8" />
          <SkeletonCard className="h-[560px] lg:col-span-4" />
        </div>
      </div>
    )
  }

  const kpis = [
    { label: th ? 'นักเรียนทั้งหมด' : 'Students', value: focus.total, tone: '#0f2a6b' },
    { label: th ? 'เด็กเสี่ยง' : 'At risk', value: focus.highRisk, tone: RISK_COLOR.high },
    { label: th ? 'เด็กหลุดระบบ' : 'Out of school', value: focus.oos, tone: RISK_COLOR.critical },
    { label: th ? 'กลับเข้าเรียน' : 'Returned', value: focus.returned, tone: RISK_COLOR.normal },
  ]

  return (
    <div className="animate-page-rise">
      {/* ── breadcrumb + filters ──────────────────────────── */}
      <div className="mb-3 flex flex-col gap-2.5 rounded-2xl border border-surface-border bg-white px-4 py-3 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px]">
          {crumbs.map((c, i) => (
            <span key={c.level} className="flex items-center gap-1">
              {i > 0 && <IconChevronRight width={13} height={13} className="text-ink-faint" />}
              {c.onClick && i < crumbs.length - 1 ? (
                <button
                  type="button"
                  onClick={c.onClick}
                  className="rounded px-1 py-0.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-600"
                >
                  {c.label}
                </button>
              ) : (
                <span className="px-1 py-0.5 font-semibold text-ink">{c.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={year}
            onChange={setYear}
            options={['2568', '2567', '2566'].map((y) => ({ value: y, label: th ? `ปีการศึกษา ${y}` : `AY ${y}` }))}
          />
          <Select
            value={riskFilter}
            onChange={setRiskFilter}
            options={[
              { value: 'all', label: th ? 'ทุกระดับความเสี่ยง' : 'All risk levels' },
              { value: 'critical', label: th ? 'วิกฤต' : 'Critical' },
              { value: 'high', label: th ? 'เสี่ยงสูง' : 'High' },
              { value: 'watch', label: th ? 'เฝ้าระวัง' : 'Watch' },
              { value: 'normal', label: th ? 'ปกติ' : 'Normal' },
            ]}
          />
          <Select
            value={sector}
            onChange={setSector}
            options={[
              { value: 'all', label: th ? 'ทุกประเภทสถานศึกษา' : 'All school types' },
              { value: 'obec', label: th ? 'สังกัด สพฐ.' : 'OBEC' },
              { value: 'islamicPrivate', label: th ? 'เอกชนสอนศาสนาอิสลาม' : 'Islamic private' },
              { value: 'nfe', label: th ? 'สกร.' : 'NFE' },
              { value: 'vocational', label: th ? 'อาชีวศึกษา' : 'Vocational' },
            ]}
          />
          {/* counts come along so nobody picks an option to discover it is empty */}
          <Select
            value={grade}
            onChange={setGrade}
            options={[
              { value: 'all', label: th ? `ทุกระดับชั้น (${formatNumber(studentsHere.length, lang)})` : `All grades (${formatNumber(studentsHere.length, lang)})` },
              ...gradeOptions.map((g) => ({
                value: g.key,
                label: `${gradeLabel(g.key as GradeLevel, th)} (${formatNumber(g.count, lang)})`,
              })),
            ]}
          />
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: th ? 'ทุกสถานะนักเรียน' : 'All student statuses' },
              ...statusOptions.map((o) => ({
                value: o.key,
                label: `${t(`status.${o.key}`)} (${formatNumber(o.count, lang)})`,
              })),
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ── map ─────────────────────────────────────────── */}
        <Card className="lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
            <div className="flex items-center gap-1.5">
              {(['risk', 'oos', 'coverage'] as MapMetric[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    metric === m ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted hover:bg-brand-50'
                  }`}
                >
                  {m === 'risk' ? (th ? 'สัดส่วนเสี่ยงสูง' : 'High-risk') : m === 'oos' ? (th ? 'ยังอยู่นอกระบบ' : 'Still out') : th ? 'ความครอบคลุมของแผน' : 'Coverage'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[12px]">
              {[
                { on: showSchools, set: setShowSchools, icon: <IconSchool width={13} height={13} />, label: th ? 'โรงเรียน' : 'Schools' },
                { on: showStudents, set: setShowStudents, icon: <IconStudent width={13} height={13} />, label: th ? 'นักเรียน' : 'Students' },
              ].map((l) => (
                <label key={l.label} className="flex cursor-pointer items-center gap-1.5 text-ink-muted">
                  <input
                    type="checkbox"
                    checked={l.on}
                    onChange={(e) => l.set(e.target.checked)}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                  {l.icon}
                  {l.label}
                </label>
              ))}
            </div>
          </div>

          <div className="px-2 pb-2 pt-2">
            <SouthernMap
              districts={visibleDistricts}
              provinces={provinces}
              schools={showSchools ? visibleSchools : []}
              metric={metric}
              onMetricChange={setMetric}
              showMetricSwitch={false}
              height={470}
              // the page owns the drill path, so the map follows it: picking a
              // province or a เขต from the ranking zooms the map to match
              initialFocus={provinceKey}
              selectedKey={districtKey ?? provinceKey}
              onSelectProvince={(p) => { resetTo('area'); setProvinceKey(p.key) }}
              onOpenProvince={(p) => { resetTo('area'); setProvinceKey(p.key) }}
              onSelect={(d) => {
                setProvinceKey(d.provinceKey)
                setEsaKey(esaOfDistrict(d.key) ?? null)
                setDistrictKey(d.key)
                setSchool(null)
              }}
              onSelectSchool={setSchool}
            />
          </div>

          {showStudents && (
            <div className="border-t border-surface-border px-4 py-3">
              <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-ink">
                <IconStudent width={14} height={14} />
                {studentFilterActive
                  ? th
                    ? `นักเรียน${grade !== 'all' ? gradeLabel(grade as GradeLevel, th) : ''}${status !== 'all' ? ` สถานะ “${t(`status.${status}`)}”` : ''} รายอำเภอ`
                    : `Students${grade !== 'all' ? ` in ${gradeLabel(grade as GradeLevel, th)}` : ''}${status !== 'all' ? ` with status “${t(`status.${status}`)}”` : ''} by district`
                  : th
                    ? 'ความหนาแน่นนักเรียนเสี่ยงรายอำเภอ'
                    : 'At-risk student density by district'}
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                  {formatNumber(studentsInScope.length, lang)} {th ? 'คน' : ''}
                </span>
                <span className="font-normal text-ink-faint">
                  {th ? '· รวมเป็นกลุ่มระดับอำเภอ ไม่แสดงที่อยู่รายคน (PDPA)' : '· aggregated to district, never a home address (PDPA)'}
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {studentClusters.slice(0, 12).map((c) => (
                  <button
                    key={c.districtKey}
                    type="button"
                    onClick={() => { setDistrictKey(c.districtKey); setEsaKey(esaOfDistrict(c.districtKey) ?? null) }}
                    className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    {dn(c.districtKey)}{' '}
                    <span className="font-bold text-ink">{formatNumber(c.count, lang)}</span>{' '}
                    {th ? 'คน' : ''}
                  </button>
                ))}
                {!studentClusters.length && (
                  <span className="text-[11px] text-ink-faint">
                    {th
                      ? 'ไม่มีนักเรียนที่ตรงเงื่อนไขในขอบเขตนี้'
                      : 'No students match these filters in this scope'}
                  </span>
                )}
              </div>

              {/* The names themselves. The density chips above answer "where";
                  an executive who has drilled this far needs "who". */}
              {studentList.length > 0 && (
                <div className="mt-3 border-t border-surface-border pt-3">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-[12px] font-semibold text-ink">
                      {th ? 'รายชื่อนักเรียนตามตัวกรอง' : 'Students matching the filters'}
                      <span className="ml-1.5 font-normal text-ink-faint">
                        {th ? 'เรียงตามคะแนนความเสี่ยง' : 'by risk score'}
                      </span>
                    </p>
                    <p className="shrink-0 text-[11px] text-ink-faint">
                      {th
                        ? `แสดง ${formatNumber(Math.min(shown, studentList.length), lang)} จาก ${formatNumber(studentList.length, lang)}`
                        : `${formatNumber(Math.min(shown, studentList.length), lang)} of ${formatNumber(studentList.length, lang)}`}
                    </p>
                  </div>

                  <ul className="space-y-1">
                    {studentList.slice(0, shown).map((st) => (
                      <li key={st.id}>
                        <button
                          type="button"
                          onClick={() => go(`/student?id=${st.id}`)}
                          className="flex w-full items-center gap-2.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                        >
                          <span
                            className="grid h-7 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                            style={{ background: RISK_COLOR[st.riskLevel] }}
                          >
                            {st.riskScore}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-semibold text-ink">
                              {st.name}
                            </span>
                            <span className="block truncate text-[11px] text-ink-faint">
                              {st.id} · {gradeLabel(st.gradeKey, th)} ·{' '}
                              {schoolName[st.schoolKey] ?? st.schoolKey} · {dn(st.districtKey)}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                            {t(`status.${st.status}`)}
                          </span>
                          <IconArrowRight width={13} height={13} className="shrink-0 text-ink-faint" />
                        </button>
                      </li>
                    ))}
                  </ul>

                  {/* a silent cap reads as "that is all there is" — say the number */}
                  {shown < studentList.length && (
                    <button
                      type="button"
                      onClick={() => setShown((n) => n + 20)}
                      className="mt-1.5 w-full rounded-lg border border-surface-border py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600"
                    >
                      {th
                        ? `ดูเพิ่มอีก ${formatNumber(Math.min(20, studentList.length - shown), lang)} คน`
                        : `Show ${formatNumber(Math.min(20, studentList.length - shown), lang)} more`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── intelligence panel ──────────────────────────── */}
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <div className="px-4 pt-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {th ? 'พื้นที่ที่เลือก' : 'Selected area'}
              </p>
              <h2 className="mt-0.5 text-lg font-bold leading-tight text-ink">{focus.label}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 py-3">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-xl bg-surface-muted px-3 py-2">
                  <p className="text-[11px] text-ink-faint">{k.label}</p>
                  <p className="text-lg font-bold tabular" style={{ color: k.tone }}>
                    {formatNumber(k.value, lang)}
                  </p>
                </div>
              ))}
            </div>
            {/* The KPIs roll up from area totals, which carry no grade or
                status — so the student filters get their own line rather than
                silently leaving the four numbers unchanged. */}
            {studentFilterActive && (
              <div className="mx-4 mb-3 flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2">
                <span className="min-w-0 text-[11px] leading-snug text-ink-muted">
                  {th ? 'นักเรียนที่ตรงตัวกรอง' : 'Students matching filters'}
                  {grade !== 'all' && ` · ${gradeLabel(grade as GradeLevel, th)}`}
                  {status !== 'all' && ` · ${t(`status.${status}`)}`}
                </span>
                <span className="shrink-0 text-base font-bold tabular text-brand-700">
                  {formatNumber(studentsInScope.length, lang)}
                </span>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={th ? 'แนวโน้มความเสี่ยง 12 เดือน' : 'Risk trend, 12 months'}
              subtitle={
                th
                  ? `${trendDelta >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(trendDelta).toFixed(1)} จุด`
                  : `${trendDelta >= 0 ? 'Up' : 'Down'} ${Math.abs(trendDelta).toFixed(1)} points`
              }
            />
            <div className="px-2 pb-2">
              <Chart
                type="area"
                height={150}
                series={[{ name: th ? 'สัดส่วนเสี่ยงสูง (%)' : 'High-risk share (%)', data: trend }]}
                options={{
                  chart: { toolbar: { show: false }, sparkline: { enabled: false }, animations: { easing: 'easeinout', speed: 800 } },
                  stroke: { curve: 'smooth', width: 2.5 },
                  colors: [trendDelta >= 0 ? RISK_COLOR.critical : RISK_COLOR.normal],
                  fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.02 } },
                  dataLabels: { enabled: false },
                  xaxis: { categories: th ? MONTHS_TH : MONTHS_EN, labels: { style: { fontSize: '9px' } }, tooltip: { enabled: false } },
                  yaxis: { labels: { formatter: (v: number) => `${v.toFixed(0)}%`, style: { fontSize: '10px' } } },
                  grid: { borderColor: '#e2e8f0' },
                  tooltip: { y: { formatter: (v: number) => `${v.toFixed(1)}%` } },
                }}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title={th ? 'สาเหตุหลัก' : 'Root causes'} />
            <div className="space-y-2 px-4 pb-4">
              {focus.causes.slice(0, 3).map((c, i) => (
                <div key={c.key}>
                  <div className="mb-1 flex items-baseline justify-between text-[12px]">
                    <span className="text-ink">
                      {i + 1}. {t(`cause.${c.key}`)}
                    </span>
                    <span className="font-bold tabular text-ink-muted">{c.value}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${c.value}%` }}
                      transition={{ duration: 0.7, delay: i * 0.08 }}
                      className="h-full rounded-full"
                      style={{ background: [RISK_COLOR.critical, RISK_COLOR.high, RISK_COLOR.watch][i] }}
                    />
                  </div>
                </div>
              ))}
              {!focus.causes.length && (
                <p className="text-[12px] text-ink-faint">
                  {th ? 'ไม่มีข้อมูลสาเหตุในขอบเขตนี้' : 'No cause data in this scope'}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={th ? 'ถามแล้วให้แผนที่พาไป' : 'Ask and the map follows'}
              subtitle={
                th
                  ? 'ระบุชื่อพื้นที่ หรือถามลอย ๆ ก็ได้ — แผนที่จะซูมไปยังคำตอบ'
                  : 'Name an area or just ask — the map zooms to the answer'
              }
            />
            <div className="px-4 pb-4">
              <form
                onSubmit={(e) => { e.preventDefault(); ask(q) }}
                className="flex gap-2"
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={th ? 'เช่น จังหวัดไหนเสี่ยงสูงสุด' : 'e.g. which area is at highest risk?'}
                  className="min-w-0 flex-1 rounded-xl border border-surface-border bg-white px-3 py-2 text-[13px] outline-none transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-600"
                >
                  {th ? 'ถาม' : 'Ask'}
                </button>
              </form>
              {answer && (
                <motion.p
                  key={answer.area}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-[12px] leading-relaxed text-ink"
                >
                  {answer.text}
                </motion.p>
              )}
            </div>
          </Card>

          {recommendation && (
            <Card>
              <div className="flex gap-3 p-4">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                  style={{ background: 'linear-gradient(135deg,#2f66f6,#0891b2)' }}
                >
                  <IconAI width={18} height={18} />
                </span>
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    {th ? 'ข้อเสนอเชิงปฏิบัติ' : 'Recommended action'}
                  </p>
                  <p className="text-[13px] font-semibold leading-snug text-ink">
                    {recommendation.headline}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                    {recommendation.action}
                  </p>
                  <button
                    type="button"
                    onClick={() => go('/plan')}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline"
                  >
                    {th ? 'ไปหน้าเส้นทางโอกาส' : 'Open opportunity plans'}
                    <IconArrowRight width={12} height={12} />
                  </button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── ranking ─────────────────────────────────────── */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <IconMap width={16} height={16} />
            {th ? 'พื้นที่ที่ต้องเฝ้าระวังสูงสุด' : 'Highest-risk areas'}
          </h2>
          <div className="flex gap-1">
            {([
              ['province', th ? 'จังหวัด' : 'Provinces'],
              ['esa', th ? 'เขตพื้นที่' : 'Service areas'],
              ['school', th ? 'สถานศึกษา' : 'Schools'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setRankTab(k)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  rankTab === k ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted hover:bg-brand-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-1.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {ranking.map((r, i) => {
            const tone = RISK_COLOR[rateToLevel(r.value)]
            return (
              <button
                key={r.key}
                type="button"
                onClick={r.open}
                className="flex items-center gap-2.5 rounded-xl border border-surface-border px-3 py-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white"
                  style={{ background: tone }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">{r.label}</span>
                  <span className="block truncate text-[11px] text-ink-faint">{r.sub}</span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular" style={{ color: tone }}>
                  {r.value.toFixed(1)}%
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted">
        <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
        <span>
          {th
            ? `${t('top.realtime')} — แผนที่มีรูปทรงจริงถึงระดับจังหวัด อำเภอและโรงเรียนแสดงเป็นหมุดพิกัด ยังไม่มีรูปทรงขอบเขตของเขตพื้นที่การศึกษา เขตจึงแสดงเป็นกลุ่มอำเภอ · แนวโน้ม 12 เดือนเป็นข้อมูลจำลองแบบคงที่ ไม่ใช่สถิติย้อนหลังจริง`
            : 'Demo data — real geometry exists only to province level; districts and schools are pins, and no service-area boundary geometry exists, so a เขต is shown as a group of districts. The 12-month trend is stable mock data, not real history.'}
        </span>
      </p>
    </div>
  )
}
