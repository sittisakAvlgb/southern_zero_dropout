import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { District } from '@/types'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { ROLE_META, canAccess } from '@/auth/roles'
import Chart from 'react-apexcharts'
import { Card, CardHeader } from '@/components/ui/Card'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { SouthernMap, type MapMetric } from '@/components/map/SouthernMap'
import { AGENCY_BY_ID } from '@/data/agencies'
import { REGION_DELTAS } from '@/data/places'
import { formatNumber, formatPct } from '@/lib/format'
import { oosSplit } from '@/lib/oos'
import { RISK_COLOR } from '@/lib/risk'
import { rankDistricts } from '@/lib/decision'
import { ESA_BY_KEY } from '@/data/esa'
import { IconArrowRight, IconDown, IconUp } from '@/components/icons'
import { ExecutiveBriefing } from '@/components/ai/ExecutiveBriefing'
import { AreaCommandCenter } from '@/components/ai/AreaCommandCenter'
import { SchoolCommandCenter } from '@/components/ai/SchoolCommandCenter'
import { TeacherWorkspace } from '@/components/ai/TeacherWorkspace'

/** Shared Apex defaults — the app's type and a visible but calm entry animation. */
const CHART_BASE = {
  fontFamily: 'inherit',
  toolbar: { show: false },
  animations: {
    enabled: true,
    easing: 'easeinout' as const,
    speed: 900,
    animateGradually: { enabled: true, delay: 120 },
    dynamicAnimation: { enabled: true, speed: 420 },
  },
}

/** Headline number with its delta — the top third of every metric card. */
function MetricHead({
  label,
  value,
  deltaPct,
  goodDirection,
  color,
  note,
}: {
  label: string
  value: number
  deltaPct: number
  goodDirection: 'up' | 'down'
  color: string
  note: string
}) {
  const { t } = useI18n()
  const isUp = deltaPct >= 0
  const isGood = goodDirection === 'up' ? isUp : !isUp
  return (
    <>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="tabular text-[32px] font-bold leading-none" style={{ color }}>
          <AnimatedCounter value={value} />
        </span>
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold ${
            isGood ? 'text-risk-normal' : 'text-risk-critical'
          }`}
        >
          {isUp ? <IconUp width={13} height={13} /> : <IconDown width={13} height={13} />}
          {Math.abs(deltaPct).toFixed(1)}%
          <span className="ml-0.5 font-normal text-ink-faint">{t('kpi.vsLastMonth')}</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{note}</p>
    </>
  )
}

/** Supporting figure — label left, number right, so the column scans vertically. */
function Line({
  label,
  value,
  deltaPct,
  goodDirection = 'up',
  note,
  noteTone,
}: {
  label: string
  value: string
  deltaPct?: number
  goodDirection?: 'up' | 'down'
  note?: string
  noteTone?: 'warn'
}) {
  const isUp = (deltaPct ?? 0) >= 0
  const isGood = goodDirection === 'up' ? isUp : !isUp
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-ink-muted">
        {label}
        {note && (
          <span
            className={`ml-1.5 text-[11px] ${
              noteTone === 'warn' ? 'text-risk-critical' : 'text-ink-faint'
            }`}
          >
            {note}
          </span>
        )}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="tabular text-lg font-bold text-ink">{value}</span>
        {deltaPct !== undefined && (
          <span
            className={`text-[11px] font-semibold ${
              isGood ? 'text-risk-normal' : 'text-risk-critical'
            }`}
          >
            {isUp ? '▲' : '▼'}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  )
}

export default function SouthernOverview() {
  const { t, lang, pn, dn, pick } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const { provinces, districts, tambons, schools, stats, referrals, plans, user, isExecutive } =
    useScopedData()

  const [metric, setMetric] = useState<MapMetric>('risk')

  const meta = ROLE_META[user?.role ?? 'exec']

  const openReferrals = useMemo(
    () =>
      referrals.filter((r) =>
        ['sent', 'accepted', 'inProgress', 'overdue'].includes(r.status),
      ).length,
    [referrals],
  )
  const overdueReferrals = useMemo(
    () => referrals.filter((r) => r.status === 'overdue').length,
    [referrals],
  )

  const trend = useMemo(() => {
    const months = th
      ? ['ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.']
      : ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
    return months.map((m, i) => {
      const rate =
        provinces.reduce((s, p) => s + (p.trend[i] ?? p.riskRate), 0) /
        Math.max(1, provinces.length)
      return {
        month: m,
        risk: Math.round(rate * 10) / 10,
        outcome: Math.round((stats.returned / 6) * (i + 1)),
      }
    })
  }, [provinces, stats.returned, th])

  /** Ranked with `rankDistricts()` — the same model the briefing above uses.
   *  Sorting by riskRate alone put a different อำเภอ in first place than the
   *  briefing card in the same scroll, which is the fastest way to lose an
   *  executive's trust in both. */
  /** What "the area" means for this account, not for the platform. */
  const scopeNote = useMemo(() => {
    // a director's "area" is their school, not the province it stands in
    if (user?.schoolKey) return schools[0]?.name ?? pn(user.provinceKey ?? '')
    if (user?.esaKey && ESA_BY_KEY[user.esaKey]) return pick(ESA_BY_KEY[user.esaKey])
    if (user?.provinceKey) return pn(user.provinceKey)
    return t('app.scopeNote')
  }, [user, schools, pick, pn, t])

  const topDistricts = useMemo(
    () => rankDistricts(districts).slice(0, 6).map((r) => r.district),
    [districts],
  )

  /** where the out-of-school number actually sits, so the total leads somewhere.
   *  Counted on the *known* group so the bars add up to the card's headline. */
  const topOos = useMemo(
    () =>
      [...districts]
        .map((d) => ({ key: d.key, name: dn(d.key), value: oosSplit(d).known }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 4),
    [districts, dn],
  )

  /** the one out-of-school split every panel on this page reads from */
  const oosTotals = useMemo(
    () =>
      oosSplit({
        oosCount: stats.dropout,
        reengagedCount: stats.reengaging,
        outcomeCount: stats.returned,
      }),
    [stats],
  )

  /** Share of known out-of-school children with a plan behind them, through the
   *  one shared definition. Owners of individual rows get coverage of their own
   *  registry — a district-wide percentage beside a school-sized headline reads
   *  as a lie; everyone else gets it counted over the districts in scope. */
  const planCoverage = useMemo(
    () => (stats.studentLevel ? oosTotals.planCoverage : oosSplit(districts).planCoverage),
    [districts, stats.studentLevel, oosTotals.planCoverage],
  )

  /** The two upstream populations, stated as plain numbers. They are *not* drawn
   *  as bars: enrolled students and registry children are different groups, and
   *  a shared axis between them is what made the old funnel unreadable. */
  const upstream = useMemo(
    () => [
      {
        // a teacher's or an agency's total is the children they hold rows for,
        // not an enrolment figure, so it must not be called "all students"
        label:
          user?.role === 'teacher' || user?.role === 'agency'
            ? th
              ? 'เด็กที่ติดตามอยู่'
              : 'Children you follow'
            : t('kpi.total'),
        count: stats.total,
        note:
          user?.role === 'teacher' || user?.role === 'agency'
            ? th
              ? 'มีข้อมูลรายคนในมือคุณ'
              : 'Individual records in your hands'
            : th
              ? 'นักเรียนในระบบทั้งหมด'
              : 'All enrolled students',
      },
      {
        label: t('kpi.highrisk'),
        count: stats.highRisk,
        note: th
          ? `${formatPct((stats.highRisk / Math.max(1, stats.total)) * 100)} ของนักเรียน · ยังอยู่ในระบบแต่มีสัญญาณเสี่ยง`
          : `${formatPct((stats.highRisk / Math.max(1, stats.total)) * 100)} of students · still enrolled, showing risk`,
      },
    ],
    [stats.total, stats.highRisk, t, th, user?.role],
  )

  /** The three states of the registry group — one denominator, so the segment
   *  widths of the bar below can be compared against each other honestly. */
  const oosStates = useMemo(() => {
    const pct = (n: number) => (n / Math.max(1, oosTotals.known)) * 100
    return [
      {
        key: 'stillOut',
        label: t('kpi.stillOut'),
        count: oosTotals.stillOut,
        pct: pct(oosTotals.stillOut),
        color: RISK_COLOR.critical,
        hint: th ? 'ยังไม่มีแผน ไม่มีใครรับผิดชอบ' : 'No plan, nobody accountable yet',
        cta: th ? 'เปิดคิวลงพื้นที่' : 'Open the outreach queue',
        to: '/oosc',
      },
      {
        key: 'reengaging',
        label: t('kpi.reengaging'),
        count: oosTotals.reengaging,
        pct: pct(oosTotals.reengaging),
        color: '#f97316',
        hint: th ? 'มีแผนโอกาสแล้ว กำลังเดินตามแผน' : 'On an opportunity plan and moving',
        cta: th ? 'ดูเส้นทางรายบุคคล' : 'See individual pathways',
        to: '/plan',
      },
      {
        key: 'succeeded',
        label: t('kpi.outcome'),
        count: oosTotals.succeeded,
        pct: pct(oosTotals.succeeded),
        color: RISK_COLOR.normal,
        hint: th ? 'กลับเข้าสู่การเรียนรู้ หรือมีอาชีพมั่นคง' : 'Back in learning, or in decent work',
        cta: th ? 'ดูรายงานผลลัพธ์' : 'Open the outcome report',
        to: '/reports',
      },
    ]
  }, [oosTotals, t, th])

  /** Who is actually receiving the work — the question this section asks.
   *  Education is separated out because "cross-agency" only means anything
   *  if the load lands somewhere other than schools. */
  const agencyLoad = useMemo(() => {
    const byKind: Record<string, { open: number; overdue: number; done: number }> = {}
    for (const r of referrals) {
      const kind = AGENCY_BY_ID[r.toAgencyId]?.kind
      if (!kind) continue
      const row = (byKind[kind] ??= { open: 0, overdue: 0, done: 0 })
      if (r.status === 'overdue') row.overdue++
      else if (r.status === 'completed') row.done++
      else if (['sent', 'accepted', 'inProgress'].includes(r.status)) row.open++
    }
    return Object.entries(byKind)
      .map(([kind, v]) => ({ kind, ...v, total: v.open + v.overdue + v.done }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [referrals])

  /** Did the receiving agency actually take the case, or is it still sitting in
   *  their inbox? This is the claim the section makes, so it is the headline. */
  const pickupRate = useMemo(() => {
    const routed = referrals.filter((r) => r.status !== 'draft')
    if (!routed.length) return { pct: 0, taken: 0, waiting: 0, total: 0 }
    const taken = routed.filter((r) =>
      ['accepted', 'inProgress', 'completed'].includes(r.status),
    ).length
    return {
      pct: (taken / routed.length) * 100,
      taken,
      waiting: routed.length - taken,
      total: routed.length,
    }
  }, [referrals])

  const months = useMemo(() => trend.map((p) => p.month), [trend])
  /** high-risk headcount per month, from the same weighted risk trend as the chart */
  const highRiskSeries = useMemo(
    () => trend.map((p) => Math.round((p.risk / 100) * stats.total)),
    [trend, stats.total],
  )

  const openDistrict = (d: District) => {
    nav('/area')
  }

  /** Drill-downs are only offered where the role may actually follow them —
   *  otherwise the route guard silently bounces the user back here. */
  const can = (path: string) => (user ? canAccess(user, path) : true)
  const go = (path: string) => { if (can(path)) nav(path) }

  return (
    <div className="animate-page-rise">
      {/* Header — title, who is looking, and what "the area" covers, in one block */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink md:text-2xl">{t('app.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {/* naming all three provinces beside counts covering four อำเภอ of
                one เขต is the contradiction an area account reads first */}
            {scopeNote} ·{' '}
            <span className="tabular">
              {stats.districtsCount} {t('geo.districts')} · {stats.tambonsCount} {t('geo.tambons')} ·{' '}
              {formatNumber(schools.length)} {th ? 'โรงเรียนนำร่อง' : 'pilot schools'}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span
            className="rounded-full px-3 py-1.5 font-medium text-white"
            style={{ background: meta.color }}
          >
            {pick({ th: meta.th, en: meta.en, ms: meta.ms })} ·{' '}
            {pick({ th: meta.scopeTh, en: meta.scopeEn })}
          </span>
        </div>
      </div>

      {/* Each seat gets the panel that matches its job: สพฐ. and ศอ.บต. decide
          policy across provinces, an area office runs a เขต's caseload, a
          principal runs a school, and a teacher works a named list. */}
      {user?.role === 'esa' ? (
        <AreaCommandCenter />
      ) : user?.role === 'school' ? (
        <SchoolCommandCenter />
      ) : user?.role === 'teacher' ? (
        <TeacherWorkspace />
      ) : (
        isExecutive && <ExecutiveBriefing />
      )}

      {/* A teacher's page ends here. Everything below is the area read — a
          จชต. map, a province comparison, a registry funnel of 117 children
          they cannot open and were never asked to work. Leaving it on gave a
          guidance teacher two different totals under one label and a row of
          drill-downs their own menu bounces. */}

      {user?.role !== 'teacher' && (
        <>
      {/* Three questions, in order: how bad, where, and what are we doing. */}
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        {/* 1 — how bad, and which way is it moving */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="h-full">
            <div className="flex h-full flex-col p-5">
              <MetricHead
                label={t('kpi.highrisk')}
                value={stats.highRisk}
                deltaPct={REGION_DELTAS.highRiskStudents}
                goodDirection="down"
                color={RISK_COLOR.high}
                note={
                  th
                    ? `${formatPct((stats.highRisk / Math.max(1, stats.total)) * 100)} ของนักเรียน ${formatNumber(stats.total)} คนในพื้นที่`
                    : `${formatPct((stats.highRisk / Math.max(1, stats.total)) * 100)} of ${formatNumber(stats.total)} students`
                }
              />
              <div className="-mx-2 mt-auto pt-3">
                <Chart
                  type="area"
                  height={104}
                  series={[{ name: t('kpi.highrisk'), data: highRiskSeries }]}
                  options={{
                    chart: { ...CHART_BASE, sparkline: { enabled: true } },
                    colors: [RISK_COLOR.high],
                    stroke: { curve: 'smooth', width: 2.5 },
                    fill: {
                      type: 'gradient',
                      gradient: { shadeIntensity: 1, opacityFrom: 0.38, opacityTo: 0.02, stops: [0, 100] },
                    },
                    markers: { size: 0, hover: { size: 5 } },
                    xaxis: { categories: months },
                    tooltip: {
                      x: { show: true },
                      y: { formatter: (v: number) => formatNumber(v) },
                    },
                  }}
                />
              </div>
            </div>
          </Card>
        </motion.div>

        {/* 2 — where it sits, and a way in */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <Card className="h-full">
            <div className="flex h-full flex-col p-5">
              <MetricHead
                label={t('kpi.oosKnown')}
                value={oosTotals.known}
                deltaPct={REGION_DELTAS.oosCount}
                goodDirection="down"
                color={RISK_COLOR.critical}
                note={
                  stats.studentLevel
                    ? th
                      ? `${
                          user?.role === 'agency'
                            ? 'ทุกคนที่หน่วยงานของคุณรับดูแล'
                            : 'ทุกคนที่อยู่ในทะเบียนของคุณ'
                        } — แยกตามสถานะด้านล่าง`
                      : `${
                          user?.role === 'agency'
                            ? 'Everyone your agency has taken on'
                            : 'Everyone on your registry'
                        } — split by status below`
                    : th
                      ? `${t('ov.concentratedIn')} — คลิกแท่งเพื่อเปิดพื้นที่นั้น`
                      : `${t('ov.concentratedIn')} — click a bar to open that area`
                }
              />
              {/* A district bar chart under a school-sized headline would compare
               *  two different populations, so owners of individual rows get the
               *  status split of their own registry instead. */}
              {stats.studentLevel ? (
                <div className="mt-auto space-y-2 pt-3">
                  {[
                    {
                      label: th ? 'ยังอยู่นอกระบบ' : 'Still out',
                      value: oosTotals.stillOut,
                      color: RISK_COLOR.critical,
                    },
                    {
                      label: th ? 'กำลังดึงกลับตามแผน' : 'Being re-engaged',
                      value: oosTotals.reengaging,
                      color: '#f97316',
                    },
                    {
                      label: th ? 'กลับเข้าเรียน / มีอาชีพ' : 'Back in learning',
                      value: oosTotals.succeeded,
                      color: RISK_COLOR.normal,
                    },
                  ].map((row, i) => (
                    <div key={row.label}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-ink-muted">{row.label}</span>
                        <span className="font-semibold text-ink">
                          {formatNumber(row.value, lang)}
                          <span className="ml-1 font-normal text-ink-faint">
                            {formatPct((row.value / Math.max(1, oosTotals.known)) * 100)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: row.color }}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(row.value / Math.max(1, oosTotals.known)) * 100}%`,
                          }}
                          transition={{ duration: 0.7, delay: 0.15 + i * 0.09, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="-mx-1 mt-auto pt-2">
                <Chart
                  type="bar"
                  height={128}
                  series={[{ name: t('kpi.oosKnown'), data: topOos.map((d) => d.value) }]}
                  options={{
                    chart: {
                      ...CHART_BASE,
                      events: {
                        dataPointSelection: (_e, _chart, opts) => {
                          const hit = topOos[opts?.dataPointIndex ?? -1]
                          if (hit) nav('/area')
                        },
                      },
                    },
                    colors: [RISK_COLOR.critical],
                    plotOptions: {
                      bar: {
                        horizontal: true,
                        barHeight: '58%',
                        borderRadius: 4,
                        dataLabels: { position: 'center' },
                      },
                    },
                    states: { hover: { filter: { type: 'darken', value: 0.88 } } },
                    dataLabels: {
                      enabled: true,
                      formatter: (v: number) => formatNumber(v),
                      // sits inside the bar, so it stays legible at any card width
                      style: { fontSize: '11px', fontWeight: 700, colors: ['#ffffff'] },
                      dropShadow: { enabled: false },
                    },
                    grid: { show: false, padding: { left: 0, right: 8, top: -12, bottom: -8 } },
                    xaxis: {
                      categories: topOos.map((d) => d.name),
                      labels: { show: false },
                      axisBorder: { show: false },
                      axisTicks: { show: false },
                    },
                    yaxis: {
                      labels: {
                        style: { fontSize: '11px', colors: '#5b6b82' },
                        maxWidth: 130,
                      },
                    },
                    tooltip: { y: { formatter: (v: number) => formatNumber(v) } },
                  }}
                />
              </div>
              )}
              {can('/oosc') && (
                <button
                  onClick={() => go('/oosc')}
                  className="mt-1 inline-flex items-center gap-1 self-start text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
                >
                  {th ? 'ดูทะเบียนเด็กนอกระบบ' : 'Open the OOSC registry'}
                  <IconArrowRight width={13} height={13} />
                </button>
              )}
            </div>
          </Card>
        </motion.div>

        {/* 3 — what we are doing about it */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16 }}
        >
          <Card className="h-full">
            <div className="flex h-full flex-col p-5">
              <p className="text-sm font-medium text-ink-muted">
                {th ? 'การตอบสนอง' : 'Response'}
              </p>
              <div className="-mt-2">
                <Chart
                  type="radialBar"
                  height={188}
                  series={[Math.round(planCoverage * 10) / 10]}
                  options={{
                    chart: CHART_BASE,
                    colors: ['#2f66f6'],
                    plotOptions: {
                      radialBar: {
                        hollow: { size: '64%' },
                        track: { background: '#eef1f6', strokeWidth: '100%' },
                        dataLabels: {
                          name: {
                            offsetY: 22,
                            fontSize: '11px',
                            color: '#94a3b8',
                          },
                          value: {
                            offsetY: -12,
                            fontSize: '26px',
                            fontWeight: 700,
                            color: '#0f1b2d',
                            formatter: (v: number) => `${v}%`,
                          },
                        },
                      },
                    },
                    stroke: { lineCap: 'round' },
                    labels: [t('kpi.planCoverage')],
                  }}
                />
              </div>
              <div className="mt-auto space-y-2.5 border-t border-surface-border pt-3">
                <Line
                  label={t('kpi.outcome')}
                  value={formatNumber(stats.returned)}
                  deltaPct={REGION_DELTAS.outcomeCount}
                  goodDirection="up"
                />
                <Line
                  label={t('kpi.referrals')}
                  value={formatNumber(openReferrals)}
                  note={
                    overdueReferrals
                      ? th
                        ? `เกินกำหนด ${formatNumber(overdueReferrals)}`
                        : `${formatNumber(overdueReferrals)} overdue`
                      : undefined
                  }
                  noteTone="warn"
                />
              </div>
            </div>
          </Card>
        </motion.div>
      </div>


      <div className="grid gap-4 xl:grid-cols-12">
        {/* Map */}
        <Card className="xl:col-span-8">
          <CardHeader
            title={th ? 'แผนที่ระดับอำเภอ' : 'District-level map'}
            subtitle={
              th
                ? 'ขนาดหมุด = จำนวนเด็ก · สี = ตัวชี้วัดที่เลือก · เส้นประ = ยังไม่มีทีมสหวิชาชีพอำเภอ'
                : 'Pin size = number of children · colour = selected metric · dashed ring = no district team'
            }
          />
          <div className="px-5 pb-5 pt-4">
            <SouthernMap
              districts={districts}
              provinces={provinces}
              schools={schools}
              metric={metric}
              onMetricChange={setMetric}
              onOpen={openDistrict}
              onOpenProvince={() => nav('/area')}
              height={450}
            />
          </div>
        </Card>

        {/* Where the registry group stands */}
        <Card className="xl:col-span-4">
          <CardHeader
            title={t('ov.funnel')}
            subtitle={
              th
                ? `แถบเดียว = เด็กนอกระบบในทะเบียน ${formatNumber(oosTotals.known, lang)} คน แบ่งตามสถานะ — คลิกส่วนไหนก็เข้าไปทำงานกับกลุ่มนั้นได้`
                : `One bar = the ${formatNumber(oosTotals.known, lang)} children on the registry, split by state — click a segment to work on that group`
            }
          />
          <div className="space-y-3 px-5 pb-5 pt-4">
            {/* Context, as numbers rather than bars — see the `upstream` memo */}
            <div className="grid grid-cols-2 gap-2">
              {upstream.map((u, i) => (
                <motion.div
                  key={u.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.06 }}
                  className="rounded-xl bg-surface-muted px-3 py-2.5"
                >
                  <div className="text-[11px] text-ink-muted">{u.label}</div>
                  <div className="tabular mt-0.5 text-lg font-bold leading-none text-ink">
                    <AnimatedCounter value={u.count} />
                  </div>
                  <div className="mt-1 text-[10px] leading-snug text-ink-faint">{u.note}</div>
                </motion.div>
              ))}
            </div>

            {/* The registry group itself — headline, then one bar of 100% */}
            <div className="pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{t('kpi.oosKnown')}</span>
                <span
                  className="tabular text-2xl font-bold leading-none"
                  style={{ color: RISK_COLOR.critical }}
                >
                  <AnimatedCounter value={oosTotals.known} />
                </span>
              </div>

              <div className="mt-2.5 flex h-9 w-full gap-[3px] overflow-hidden rounded-lg">
                {oosStates.map((s, i) => (
                  <motion.button
                    key={s.key}
                    type="button"
                    onClick={() => go(can(s.to) ? s.to : '/area')}
                    title={`${s.label} ${formatNumber(s.count, lang)} ${th ? 'คน' : ''} · ${formatPct(s.pct)}`}
                    className="group relative flex min-w-[8px] items-center justify-center overflow-hidden first:rounded-l-lg last:rounded-r-lg"
                    style={{ background: s.color }}
                    initial={{ flexGrow: 0.0001, opacity: 0.35 }}
                    animate={{ flexGrow: Math.max(0.0001, s.pct), opacity: 1 }}
                    transition={{ duration: 0.75, delay: 0.12 + i * 0.1, ease: 'easeOut' }}
                    whileHover={{ filter: 'brightness(1.08)' }}
                    whileTap={{ scale: 0.985 }}
                  >
                    {/* as much as the segment has room for, and nothing more */}
                    {s.pct >= 12 && (
                      <span className="tabular whitespace-nowrap px-1 text-[11px] font-bold text-white">
                        {s.pct >= 24 && `${formatNumber(s.count, lang)} · `}
                        {formatPct(s.pct)}
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Same three states as rows, each one a way in */}
            <ul className="space-y-1">
              {oosStates.map((s, i) => (
                <motion.li
                  key={s.key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.28 + i * 0.08 }}
                >
                  <button
                    type="button"
                    onClick={() => go(can(s.to) ? s.to : '/area')}
                    className="group flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-ink">{s.label}</span>
                        <span className="tabular shrink-0 text-xs font-bold text-ink">
                          {formatNumber(s.count, lang)}
                          <span className="ml-1 font-normal text-ink-faint">
                            {formatPct(s.pct)}
                          </span>
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] leading-snug text-ink-faint">
                        {s.hint}
                        <span className="inline-flex items-center gap-0.5 font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                          · {s.cta}
                          <IconArrowRight width={10} height={10} />
                        </span>
                      </span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between gap-2 rounded-xl border border-surface-border px-3.5 py-2.5">
              <span className="text-xs text-ink-muted">
                {th ? 'อัตราสำเร็จ' : 'Success rate'}
                <span className="ml-1 text-[10px] text-ink-faint">
                  {th ? 'ของทั้งทะเบียน' : 'of the whole registry'}
                </span>
              </span>
              <span
                className="tabular text-lg font-bold"
                style={{ color: RISK_COLOR.normal }}
              >
                {formatPct(oosTotals.successRate)}
              </span>
            </div>


            <div className="rounded-xl bg-surface-muted px-3.5 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {t('ov.everyChild')}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                {th
                  ? `ทะเบียนมีเด็กนอกระบบ ${formatNumber(oosTotals.known, lang)} คน — ${formatNumber(oosTotals.stillOut, lang)} คนยังไม่มีอะไรขับเคลื่อน คือช่องว่างที่ต้องปิดก่อน · ${formatNumber(oosTotals.reengaging, lang)} คนกำลังเดินตามแผน · และ ${formatNumber(oosTotals.succeeded, lang)} คนถึงปลายทางแล้ว`
                  : `The registry holds ${formatNumber(oosTotals.known, lang)} out-of-school children — ${formatNumber(oosTotals.stillOut, lang)} with nothing moving yet, the gap to close first; ${formatNumber(oosTotals.reengaging, lang)} on a plan; and ${formatNumber(oosTotals.succeeded, lang)} who reached an outcome.`}
              </p>
            </div>
          </div>
        </Card>

        {/* Provinces */}
        <Card className="xl:col-span-7">
          <CardHeader
            title={th ? 'ภาพรวมรายจังหวัด' : 'By province'}
            subtitle={
              th
                ? 'ความยาวแท่ง = เด็กนอกระบบในทะเบียนทั้งหมดของจังหวัดนั้น แบ่งเป็นสามสถานะ — คลิกแท่งเพื่อเข้าดูจังหวัดนั้น'
                : 'Bar length is every out-of-school child on that province’s registry, split by state — click a bar to open it'
            }
          />
          <div className="px-3 pb-5 pt-3">
            <Chart
              type="bar"
              height={210}
              // same order as the composition bar in the card above: the state
              // that needs work first sits on the left in both places
              series={[
                { name: t('kpi.stillOut'), data: provinces.map((p) => p.oosCount) },
                { name: t('kpi.reengaging'), data: provinces.map((p) => p.reengagedCount) },
                { name: t('kpi.outcome'), data: provinces.map((p) => p.outcomeCount) },
              ]}
              options={{
                chart: {
                  ...CHART_BASE,
                  type: 'bar',
                  // one bar per province whose total is the known group, so the
                  // split reads as parts of a whole instead of rival totals
                  stacked: true,
                  events: {
                    dataPointSelection: () => go('/area'),
                  },
                },
                colors: [RISK_COLOR.critical, '#f97316', RISK_COLOR.normal],
                plotOptions: {
                  bar: { horizontal: true, barHeight: '62%', borderRadius: 4 },
                },
                dataLabels: {
                  enabled: true,
                  formatter: (v: number) => (v > 40 ? formatNumber(v) : ''),
                  style: { fontSize: '11px', fontWeight: 700, colors: ['#ffffff'] },
                  dropShadow: { enabled: false },
                },
                states: { hover: { filter: { type: 'darken', value: 0.9 } } },
                legend: {
                  position: 'top',
                  horizontalAlign: 'left',
                  fontSize: '12px',
                  markers: { shape: 'circle' as const },
                  itemMargin: { horizontal: 10 },
                },
                grid: { borderColor: '#eef1f6', padding: { left: 0, right: 12, top: -8 } },
                xaxis: {
                  categories: provinces.map((p) => pn(p.key)),
                  labels: { style: { fontSize: '10px', colors: '#94a3b8' } },
                  axisBorder: { show: false },
                  axisTicks: { show: false },
                },
                yaxis: { labels: { style: { fontSize: '12px', colors: '#0f1b2d' } } },
                tooltip: { shared: true, intersect: false },
              }}
            />

            {/* risk share per province — the rate the counts do not show */}
            <div className="mt-2 grid gap-2 px-2 sm:grid-cols-3">
              {provinces.map((p, i) => {
                const level = p.riskRate >= 13 ? 'critical' : p.riskRate >= 10 ? 'high' : 'watch'
                return (
                  <motion.button
                    key={p.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.06 }}
                    whileHover={{ y: -2 }}
                    onClick={() => nav('/area')}
                    className="flex items-center justify-between gap-2 rounded-xl border border-surface-border px-3 py-2 text-left transition hover:border-brand-300"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-ink">
                        {pn(p.key)}
                      </span>
                      <span className="block text-[10px] text-ink-faint">
                        {p.districts} {t('geo.districts')} · {formatNumber(p.totalStudents)}{' '}
                        {t('kpi.total')}
                      </span>
                    </span>
                    <span
                      className="tabular shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
                      style={{
                        background: `${RISK_COLOR[level]}18`,
                        color: RISK_COLOR[level],
                      }}
                    >
                      {formatPct(p.riskRate)}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </Card>

        {/* Districts needing attention */}
        <Card className="xl:col-span-5">
          <CardHeader
            title={t('ov.districtRank')}
            subtitle={
              th
                ? `เรียงตามคะแนนความเร่งด่วนรวม 4 สัญญาณ${can('/tambon') ? ' — คลิกแท่งเพื่อเข้าดูพื้นที่' : ''}`
                : `Ranked by the combined four-signal urgency score${can('/tambon') ? ' — click a bar to open the area' : ''}`
            }
          />
          <div className="px-3 pb-4 pt-3">
            <Chart
              type="bar"
              height={232}
              series={[{ name: t('risk.rate'), data: topDistricts.map((d) => d.riskRate) }]}
              options={{
                chart: {
                  ...CHART_BASE,
                  type: 'bar',
                  events: { dataPointSelection: () => go('/tambon') },
                },
                colors: topDistricts.map(
                  (d) => RISK_COLOR[d.riskRate >= 16 ? 'critical' : 'high'],
                ),
                plotOptions: {
                  bar: {
                    horizontal: true,
                    distributed: true,
                    barHeight: '62%',
                    borderRadius: 4,
                    dataLabels: { position: 'top' },
                  },
                },
                legend: { show: false },
                dataLabels: {
                  enabled: true,
                  textAnchor: 'start',
                  offsetX: 6,
                  formatter: (v: number) => `${v.toFixed(1)}%`,
                  style: { fontSize: '11px', fontWeight: 700, colors: ['#0f1b2d'] },
                  dropShadow: { enabled: false },
                },
                states: { hover: { filter: { type: 'darken', value: 0.9 } } },
                grid: { borderColor: '#eef1f6', padding: { left: 0, right: 16, top: -18, bottom: -8 } },
                xaxis: {
                  categories: topDistricts.map((d) => dn(d.key)),
                  // zoomed to the spread — every district here is already high,
                  // so a 0-based axis would make all six bars look identical
                  min: Math.floor(Math.min(...topDistricts.map((d) => d.riskRate)) - 1),
                  max: Math.ceil(Math.max(...topDistricts.map((d) => d.riskRate)) + 0.8),
                  tickAmount: 4,
                  labels: {
                    formatter: (v: string) => `${Number(v).toFixed(0)}%`,
                    style: { fontSize: '10px', colors: '#94a3b8' },
                  },
                  axisBorder: { show: false },
                  axisTicks: { show: false },
                },
                yaxis: { labels: { style: { fontSize: '12px', colors: '#0f1b2d' } } },
                tooltip: {
                  custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
                    const d = topDistricts[dataPointIndex]
                    if (!d) return ''
                    return `<div style="padding:8px 10px;font-size:12px">
                      <div style="font-weight:700">${dn(d.key)}</div>
                      <div style="color:#5b6b82">${pn(d.provinceKey)} · ${t(`kind.${d.kind}`)}</div>
                      <div style="margin-top:4px">${t('risk.rate')} <b>${d.riskRate.toFixed(1)}%</b></div>
                      <div>${t('kpi.stillOut')} <b>${formatNumber(d.oosCount)}</b></div>
                    </div>`
                  },
                },
              }}
            />
            <p className="px-2 text-[10px] text-ink-faint">
              {th
                ? 'แกนเริ่มที่ค่าต่ำสุดของกลุ่ม เพื่อให้เห็นความต่างระหว่างอำเภอ'
                : 'Axis starts at the group minimum so the gaps between districts are visible'}
            </p>
          </div>
        </Card>

        {/* Trend */}
        <Card className="xl:col-span-12">
          <CardHeader
            title={th ? 'แนวโน้ม 6 เดือน' : 'Six-month trend'}
            subtitle={
              th
                ? 'สัดส่วนความเสี่ยงควรลง และจำนวนเด็กที่กลับเข้าเรียนหรือมีอาชีพควรขึ้น — สองเส้นนี้ต้องเคลื่อนสวนทางกัน'
                : 'Risk share should fall while children reaching an outcome rises — the two lines must diverge'
            }
          />
          <div className="px-3 pb-4 pt-3">
            <Chart
              type="line"
              height={250}
              series={[
                { name: t('risk.rate'), type: 'area', data: trend.map((p) => p.risk) },
                { name: t('kpi.outcome'), type: 'line', data: trend.map((p) => p.outcome) },
              ]}
              options={{
                chart: { ...CHART_BASE, type: 'line', zoom: { enabled: false } },
                colors: [RISK_COLOR.high, RISK_COLOR.normal],
                stroke: { curve: 'smooth', width: [2.5, 3], dashArray: [0, 0] },
                fill: {
                  type: ['gradient', 'solid'],
                  gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.02, stops: [0, 100] },
                },
                markers: { size: 0, strokeWidth: 2, hover: { size: 6 } },
                dataLabels: { enabled: false },
                legend: {
                  position: 'top',
                  horizontalAlign: 'left',
                  fontSize: '12px',
                  markers: { shape: 'circle' as const },
                  itemMargin: { horizontal: 10 },
                },
                grid: { borderColor: '#eef1f6', strokeDashArray: 4, padding: { left: 4, right: 4 } },
                xaxis: {
                  categories: months,
                  labels: { style: { fontSize: '11px', colors: '#94a3b8' } },
                  axisBorder: { show: false },
                  axisTicks: { show: false },
                  crosshairs: { stroke: { color: '#cbd5e1', dashArray: 4 } },
                },
                yaxis: [
                  {
                    seriesName: t('risk.rate'),
                    labels: {
                      formatter: (v: number) => `${v.toFixed(0)}%`,
                      style: { fontSize: '11px', colors: '#94a3b8' },
                    },
                    title: { text: t('risk.rate'), style: { fontSize: '11px', color: '#94a3b8', fontWeight: 500 } },
                  },
                  {
                    seriesName: t('kpi.outcome'),
                    opposite: true,
                    labels: {
                      formatter: (v: number) => formatNumber(Math.round(v)),
                      style: { fontSize: '11px', colors: '#94a3b8' },
                    },
                    title: { text: t('kpi.outcome'), style: { fontSize: '11px', color: '#94a3b8', fontWeight: 500 } },
                  },
                ],
                tooltip: {
                  shared: true,
                  intersect: false,
                  y: {
                    formatter: (v: number, opts) =>
                      opts?.seriesIndex === 0 ? `${v}%` : formatNumber(Math.round(v)),
                  },
                },
              }}
            />
          </div>
        </Card>
      </div>

      {/* Cross-agency pulse */}
      <Card className="mt-4">
        <CardHeader
          title={th ? 'ชีพจรความร่วมมือข้ามหน่วยงาน' : 'Cross-agency pulse'}
          subtitle={
            th
              ? 'แพลตฟอร์มนี้จะได้ผลก็ต่อเมื่อหน่วยงานอื่นนอกการศึกษาเข้ามารับงานจริง'
              : 'The platform only works if agencies outside education actually pick the work up'
          }
        />
        <div className="grid gap-4 px-5 pb-5 pt-4 lg:grid-cols-12">
          {/* The answer to the subtitle, as one number */}
          <div className="lg:col-span-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-surface-border p-4"
            >
              <p className="text-xs text-ink-muted">
                {th ? 'หน่วยงานปลายทางรับเคสแล้ว' : 'Referrals actually picked up'}
              </p>
              <p className="tabular mt-1 text-[34px] font-bold leading-none text-brand-600">
                <AnimatedCounter value={pickupRate.pct} decimals={1} suffix="%" />
              </p>
              <p className="mt-2 text-[11px] leading-snug text-ink-muted">
                {th
                  ? `${formatNumber(pickupRate.taken)} จาก ${formatNumber(pickupRate.total)} เคส — อีก ${formatNumber(pickupRate.waiting)} ยังค้างอยู่ที่ปลายทาง`
                  : `${formatNumber(pickupRate.taken)} of ${formatNumber(pickupRate.total)} — ${formatNumber(pickupRate.waiting)} still sitting with the receiver`}
              </p>

              <div className="mt-4 space-y-2.5 border-t border-surface-border pt-3">
                <div>
                  <Line
                    label={t('ov.openReferrals')}
                    value={formatNumber(openReferrals)}
                    note={
                      openReferrals
                        ? th
                          ? `เกินกำหนด ${formatPct((overdueReferrals / openReferrals) * 100)}`
                          : `${formatPct((overdueReferrals / openReferrals) * 100)} overdue`
                        : undefined
                    }
                    noteTone="warn"
                  />
                  {/* overdue shown as a slice of the open load, not as a peer number */}
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <motion.div
                      className="h-full rounded-full bg-risk-critical"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${openReferrals ? Math.min(100, (overdueReferrals / openReferrals) * 100) : 0}%`,
                      }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-ink-faint">
                    {th
                      ? `${formatNumber(overdueReferrals)} เคสต้องยกระดับไปที่อำเภอ/จังหวัด`
                      : `${formatNumber(overdueReferrals)} cases need escalation`}
                  </p>
                </div>
                <Line label={t('plan.title')} value={formatNumber(plans.length)} />
                <Line
                  label={th ? 'ตำบลที่มีคณะทำงานคุ้มครองเด็ก' : 'Tambons with a child protection team'}
                  value={`${formatNumber(tambons.filter((x) => x.hasChildProtectionCommittee).length)} / ${formatNumber(tambons.length)}`}
                />
              </div>
            </motion.div>
          </div>

          {/* Who is receiving it, and who is stuck */}
          <div className="lg:col-span-8">
            <Chart
              type="bar"
              height={290}
              series={[
                { name: t('ref.open'), data: agencyLoad.map((r) => r.open) },
                { name: t('ref.overdue'), data: agencyLoad.map((r) => r.overdue) },
                { name: t('ref.completed'), data: agencyLoad.map((r) => r.done) },
              ]}
              options={{
                chart: {
                  ...CHART_BASE,
                  type: 'bar',
                  stacked: true,
                  stackType: '100%',
                  events: { dataPointSelection: () => go('/referral') },
                },
                colors: ['#2f66f6', RISK_COLOR.critical, RISK_COLOR.normal],
                plotOptions: { bar: { horizontal: true, barHeight: '64%', borderRadius: 3 } },
                dataLabels: {
                  enabled: true,
                  formatter: (v: number) => (v >= 8 ? `${Math.round(v)}%` : ''),
                  style: { fontSize: '10px', fontWeight: 700, colors: ['#ffffff'] },
                  dropShadow: { enabled: false },
                },
                states: { hover: { filter: { type: 'darken', value: 0.9 } } },
                legend: {
                  position: 'top',
                  horizontalAlign: 'left',
                  fontSize: '12px',
                  markers: { shape: 'circle' as const },
                  itemMargin: { horizontal: 10 },
                },
                grid: { borderColor: '#eef1f6', padding: { left: 0, right: 8, top: -8 } },
                xaxis: {
                  categories: agencyLoad.map((r) => t(`kindA.${r.kind}`)),
                  labels: { formatter: (v: string) => `${Math.round(Number(v))}%`, style: { fontSize: '10px', colors: '#94a3b8' } },
                  axisBorder: { show: false },
                  axisTicks: { show: false },
                },
                yaxis: { labels: { style: { fontSize: '11px', colors: '#0f1b2d' }, maxWidth: 150 } },
                tooltip: {
                  shared: true,
                  intersect: false,
                  y: {
                    formatter: (_v: number, opts) => {
                      const row = agencyLoad[opts?.dataPointIndex ?? 0]
                      const raw = [row?.open, row?.overdue, row?.done][opts?.seriesIndex ?? 0] ?? 0
                      return `${formatNumber(raw)} ${th ? 'เคส' : 'cases'}`
                    },
                  },
                },
              }}
            />
            <p className="px-2 text-[10px] text-ink-faint">
              {th
                ? `สัดส่วนสถานะเคสของหน่วยงานแต่ละประเภท เรียงตามปริมาณงานที่รับ${can('/referral') ? ' — คลิกเพื่อเปิดหน้าส่งต่อ' : ''}`
                : `Case status mix per agency type, ordered by volume received${can('/referral') ? ' — click to open referrals' : ''}`}
            </p>
          </div>
        </div>
      </Card>

      {!isExecutive && (
        <p className="mt-4 rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted">
          {t('common.restricted')} — {pick({ th: meta.descTh, en: meta.descEn })}
        </p>
      )}
        </>
      )}
    </div>
  )
}
