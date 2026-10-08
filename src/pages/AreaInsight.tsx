import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { ESA_BY_KEY } from '@/data/esa'
import { canAccess } from '@/auth/roles'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import Chart from 'react-apexcharts'
import { Card, CardHeader } from '@/components/ui/Card'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Select } from '@/components/ui/Select'
import { SouthernMap } from '@/components/map/SouthernMap'
import { DISTRICT_BY_KEY as DISTRICT_GEO } from '@/data/geo'
import { formatNumber, formatPct } from '@/lib/format'
import { oosSplit } from '@/lib/oos'
import { RISK_COLOR } from '@/lib/risk'
import { IconChevronRight, IconProvince, IconSchool } from '@/components/icons'

/** Shared Apex defaults — app typography and a visible but calm entry animation. */
const CHART_BASE = {
  fontFamily: 'inherit',
  toolbar: { show: false },
  animations: {
    enabled: true,
    easing: 'easeinout' as const,
    speed: 800,
    animateGradually: { enabled: true, delay: 110 },
    dynamicAnimation: { enabled: true, speed: 400 },
  },
}

export default function AreaInsight() {
  const { t, lang, pn, dn, tn, pick } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const { provinces, districts, tambons, schools, user } = useScopedData()
  /** set only for a สพท. account — the เขต it governs */
  const ownEsa = user?.esaKey ? ESA_BY_KEY[user.esaKey] : undefined

  /** only offer a drill-down the role may actually follow */
  const can = (path: string) => (user ? canAccess(user, path) : true)

  // Search results deep-link straight into an area: /area?p=pattani&d=saiburi
  const [params] = useSearchParams()
  const [provinceKey, setProvinceKey] = useState(
    () => params.get('p') ?? provinces[0]?.key ?? '',
  )
  const [districtKey, setDistrictKey] = useState<string>(() => params.get('d') ?? 'all')

  useEffect(() => {
    if (!provinces.some((p) => p.key === provinceKey)) {
      setProvinceKey(provinces[0]?.key ?? '')
      setDistrictKey('all')
    }
  }, [provinces, provinceKey])

  const province = provinces.find((p) => p.key === provinceKey) ?? provinces[0]

  const provDistricts = useMemo(
    () => districts.filter((d) => d.provinceKey === province?.key),
    [districts, province],
  )

  const district = districtKey === 'all' ? null : provDistricts.find((d) => d.key === districtKey)

  const scopeDistricts = district ? [district] : provDistricts

  const totals = useMemo(() => {
    const sum = (sel: (d: (typeof scopeDistricts)[number]) => number) =>
      scopeDistricts.reduce((s, d) => s + sel(d), 0)
    const total = sum((d) => d.totalStudents)
    const highRisk = sum((d) => d.highRiskStudents)
    const split = oosSplit(scopeDistricts)
    return {
      total,
      highRisk,
      split,
      referrals: sum((d) => d.openReferrals),
      schools: sum((d) => d.schools),
      riskRate: total ? (highRisk / total) * 100 : 0,
    }
  }, [scopeDistricts])

  /** the five headline numbers as one chain, each step carrying the rate that
   *  produced it — the relationship is the point, not the individual totals */
  const funnelSteps = useMemo(
    () => [
      {
        label: t('kpi.total'),
        value: totals.total,
        color: '#5b6b82',
        conv: 100,
        to: '/school',
        hint: th ? 'เด็กทั้งหมดที่ระบบมองเห็น' : 'Every child the system can see',
      },
      {
        label: t('kpi.highrisk'),
        value: totals.highRisk,
        color: RISK_COLOR.high,
        conv: totals.riskRate,
        to: '/risk-map',
        hint: th ? 'ของนักเรียนทั้งหมด' : 'of all students',
      },
      {
        // the whole known group; its bar is a composition of that group, so the
        // next card's green slice can be read as a part of this whole
        label: t('kpi.oosKnown'),
        value: totals.split.known,
        color: RISK_COLOR.critical,
        conv: totals.highRisk ? (totals.split.known / totals.highRisk) * 100 : 0,
        to: '/oosc',
        hint: th ? 'ของเด็กเสี่ยงสูง' : 'of high-risk children',
        segments: [
          { key: 'out', value: totals.split.stillOut, color: RISK_COLOR.critical },
          { key: 'eng', value: totals.split.reengaging, color: '#f97316' },
          { key: 'done', value: totals.split.succeeded, color: RISK_COLOR.normal },
        ],
        split: th
          ? `ยังอยู่นอกระบบ ${formatNumber(totals.split.stillOut)} · กำลังดึงกลับ ${formatNumber(totals.split.reengaging)} · สำเร็จ ${formatNumber(totals.split.succeeded)}`
          : `still out ${totals.split.stillOut} · re-engaging ${totals.split.reengaging} · succeeded ${totals.split.succeeded}`,
      },
      {
        label: t('kpi.outcome'),
        value: totals.split.succeeded,
        color: RISK_COLOR.normal,
        // was plan coverage (56.4%) sitting under a "of known out-of-school
        // children" label next to the success count — two different measures
        conv: totals.split.successRate,
        to: '/intervention',
        hint: th ? 'ของเด็กนอกระบบในทะเบียน' : 'of the children on the registry',
        // Same track as the card before it, with everything that has *not*
        // reached an outcome faded out. Without this the green bar was longer
        // than the red one it came out of, which read as growth.
        segments: [
          { key: 'done', value: totals.split.succeeded, color: RISK_COLOR.normal },
          { key: 'eng', value: totals.split.reengaging, color: '#f97316', dim: true },
          { key: 'out', value: totals.split.stillOut, color: RISK_COLOR.critical, dim: true },
        ],
        // what the reader actually wants next: how many are left, and in what state
        split: th
          ? `ยังไม่ถึงปลายทาง ${formatNumber(totals.split.known - totals.split.succeeded)} คน — มีแผนแล้ว ${formatNumber(totals.split.reengaging)} · ยังไม่มีอะไรขับเคลื่อน ${formatNumber(totals.split.stillOut)}`
          : `${formatNumber(totals.split.known - totals.split.succeeded)} not there yet — ${formatNumber(totals.split.reengaging)} on a plan · ${formatNumber(totals.split.stillOut)} with nothing moving`,
      },
    ],
    [totals, t, th],
  )

  const districtChart = useMemo(
    () =>
      [...provDistricts]
        .sort((a, b) => b.riskRate - a.riskRate)
        .map((d) => ({
          key: d.key,
          name: dn(d.key),
          risk: d.riskRate,
          coverage: d.planCoverage,
          oos: d.oosCount,
        })),
    [provDistricts, dn],
  )

  /** quadrant lines for the scatter — the district-weighted average of each axis */
  const avgRisk = useMemo(() => {
    const total = provDistricts.reduce((s, d) => s + d.totalStudents, 0)
    return total
      ? provDistricts.reduce((s, d) => s + d.riskRate * d.totalStudents, 0) / total
      : 0
  }, [provDistricts])
  const avgCoverage = useMemo(() => {
    const total = provDistricts.reduce((s, d) => s + d.totalStudents, 0)
    return total
      ? provDistricts.reduce((s, d) => s + d.planCoverage * d.totalStudents, 0) / total
      : 0
  }, [provDistricts])

  /** each cause for the selected area, paired with the whole-area average */
  const causeRadar = useMemo(() => {
    const src = district ? district.topCauses : (province?.topCauses ?? [])
    const areaAvg = new Map<string, { sum: number; n: number }>()
    for (const p of provinces) {
      for (const c of p.topCauses) {
        const row = areaAvg.get(c.key) ?? { sum: 0, n: 0 }
        row.sum += c.value
        row.n += 1
        areaAvg.set(c.key, row)
      }
    }
    return src.slice(0, 8).map((c) => {
      const a = areaAvg.get(c.key)
      return {
        cause: t(`cause.${c.key}`),
        value: Math.round(c.value * 10) / 10,
        avg: a && a.n ? Math.round((a.sum / a.n) * 10) / 10 : 0,
      }
    })
  }, [district, province, provinces, t])

  const tambonRows = useMemo(() => {
    const rows = tambons.filter((x) =>
      district ? x.districtKey === district.key : x.provinceKey === province?.key,
    )
    return [...rows].sort((a, b) => a.planCoverage - b.planCoverage).slice(0, 10)
  }, [tambons, district, province])

  /** the pilot schools inside the current selection, worst high-risk share first */
  const areaSchools = useMemo(() => {
    const rows = schools.filter((s) =>
      district ? s.districtKey === district.key : s.provinceKey === province?.key,
    )
    return rows
      .map((s) => ({
        ...s,
        riskShare: (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100,
      }))
      .sort((a, b) => b.riskShare - a.riskShare)
  }, [schools, district, province])

  if (!province) {
    return (
      <Card>
        <div className="grid h-64 place-items-center text-sm text-ink-faint">
          {t('common.noData')}
        </div>
      </Card>
    )
  }

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconProvince width={22} height={22} />}
        breadcrumb={
          <Breadcrumb
            items={[
              t('app.areaShort'),
              // an เขต account governs part of a province, so the chain has to
              // say which part — otherwise the page reads as the whole จังหวัด
              ...(ownEsa ? [pn(province.key), pick(ownEsa)] : [pn(province.key)]),
              ...(district ? [dn(district.key)] : []),
            ]}
          />
        }
        title={district ? dn(district.key) : ownEsa ? pick(ownEsa) : pn(province.key)}
        subtitle={
          district
            ? `${t(`kind.${district.kind}`)} · ${district.tambons} ${t('geo.tambons')} · ${formatNumber(district.schools)} ${th ? 'สถานศึกษา' : 'providers'}`
            // counted from the rows this account can actually see. Reading the
            // province record's own totals printed "12 อำเภอ · 115 ตำบล" above
            // figures covering four of them.
            : `${formatNumber(districts.length)} ${t('geo.districts')} · ${formatNumber(tambons.length)} ${t('geo.tambons')} · ${formatNumber(schools.length)} ${th ? 'โรงเรียนนำร่อง' : 'pilot schools'}${province.partial && !ownEsa ? ` · ${t('geo.partialProvince')}` : ''}`
        }
        actions={
          <div className="flex gap-2">
            <Select
              value={provinceKey}
              onChange={(v) => {
                setProvinceKey(v)
                setDistrictKey('all')
              }}
              options={provinces.map((p) => ({ value: p.key, label: pn(p.key) }))}
            />
            <Select
              value={districtKey}
              onChange={setDistrictKey}
              options={[
                { value: 'all', label: t('geo.allDistricts') },
                ...provDistricts.map((d) => ({ value: d.key, label: dn(d.key) })),
              ]}
            />
          </div>
        }
      />

      {/* Each stage is a card you can act on, and the bar under it is that
          stage as a share of the one before — so the collapse from 118,383 to
          345 is something you see, not something you have to work out. */}
      <div className="mb-5 flex flex-col gap-2 xl:flex-row xl:items-stretch">
        {funnelSteps.map((step, i) => {
          const clickable = can(step.to)
          return (
            <div key={step.label} className="flex flex-1 items-center gap-2">
              {i > 0 && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.18 + i * 0.1 }}
                  className="hidden shrink-0 text-ink-faint xl:block"
                >
                  <IconChevronRight width={18} height={18} />
                </motion.span>
              )}
              <motion.button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && nav(step.to)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.09, type: 'spring', stiffness: 260, damping: 24 }}
                whileHover={clickable ? { y: -4 } : undefined}
                whileTap={clickable ? { scale: 0.985 } : undefined}
                className={`group min-w-0 flex-1 rounded-2xl border p-4 text-left transition-shadow ${
                  clickable
                    ? 'cursor-pointer border-surface-border bg-white shadow-card hover:shadow-card-hover'
                    : 'cursor-default border-surface-border bg-white shadow-card'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-medium text-ink-muted">{step.label}</p>
                  {i > 0 && (
                    <span
                      className="tabular shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: `${step.color}18`, color: step.color }}
                    >
                      {formatPct(step.conv)}
                    </span>
                  )}
                </div>

                <p
                  className="tabular mt-1 text-[30px] font-bold leading-none"
                  style={{ color: step.color }}
                >
                  <AnimatedCounter value={step.value} />
                </p>

                {/* Registry cards get the composition of the registry group;
                 *  the two upstream cards get their share of the stage above. */}
                {'segments' in step && step.segments ? (
                  <div className="mt-2.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full">
                    {step.segments.map((sg, k) => (
                      <motion.div
                        key={sg.key}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{
                          background: sg.color,
                          opacity: 'dim' in sg && sg.dim ? 0.22 : 1,
                        }}
                        initial={{ flexGrow: 0.0001 }}
                        animate={{
                          flexGrow: Math.max(
                            0.0001,
                            (sg.value / Math.max(1, totals.split.known)) * 100,
                          ),
                        }}
                        transition={{
                          duration: 0.7,
                          delay: 0.15 + i * 0.09 + k * 0.06,
                          ease: 'easeOut',
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: step.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, step.conv)}%` }}
                      transition={{ duration: 0.7, delay: 0.15 + i * 0.09, ease: 'easeOut' }}
                    />
                  </div>
                )}
                <p className="mt-1.5 truncate text-[11px] text-ink-faint">
                  {i === 0 ? step.hint : `${formatPct(step.conv)} ${step.hint}`}
                </p>
                {'split' in step && step.split && (
                  <p className="mt-0.5 text-[10px] leading-snug text-ink-faint">{step.split}</p>
                )}
              </motion.button>
            </div>
          )
        })}

        {/* work in flight — not a stage of the chain, so it stands apart */}
        <motion.button
          type="button"
          disabled={!can('/referral')}
          onClick={() => can('/referral') && nav('/referral')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 24 }}
          whileHover={can('/referral') ? { y: -4 } : undefined}
          whileTap={can('/referral') ? { scale: 0.985 } : undefined}
          className={`min-w-0 rounded-2xl border border-dashed border-surface-border bg-surface-muted/60 p-4 text-left transition-shadow xl:w-[190px] ${
            can('/referral') ? 'cursor-pointer hover:shadow-card' : 'cursor-default'
          }`}
        >
          <p className="truncate text-xs font-medium text-ink-muted">{t('kpi.referrals')}</p>
          <p className="tabular mt-1 text-[30px] font-bold leading-none text-ink">
            <AnimatedCounter value={totals.referrals} />
          </p>
          <p className="mt-2.5 text-[11px] leading-snug text-ink-faint">
            {th ? 'กำลังรอหน่วยงานปลายทางรับเรื่อง' : 'Waiting on a receiving agency'}
          </p>
        </motion.button>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Risk against coverage — the pair the subtitle actually asks about,
            plotted so the answer is a position rather than two bar lengths. */}
        <Card className="xl:col-span-7">
          <CardHeader
            title={th ? 'อำเภอไหนควรลงพื้นที่ก่อน' : 'Which district to visit first'}
            subtitle={
              th
                ? 'แกนตั้ง = สัดส่วนความเสี่ยง · แกนนอน = ความครอบคลุมของแผน — อำเภอที่เสี่ยงสูงแต่ครอบคลุมต่ำจะอยู่มุมซ้ายบน คือกลุ่มที่ควรลงพื้นที่ก่อน · คลิกจุดเพื่อเลือกอำเภอ'
                : 'Vertical is risk, horizontal is plan coverage — high risk with low coverage lands top-left, and that is where to go first · click a point to select a district'
            }
          />
          <div className="px-2 pb-4 pt-2">
            <Chart
              type="scatter"
              height={330}
              series={[
                {
                  name: th ? 'อำเภอ' : 'District',
                  data: districtChart.map((d) => ({ x: d.coverage, y: d.risk })),
                },
              ]}
              options={{
                chart: {
                  ...CHART_BASE,
                  type: 'scatter',
                  zoom: { enabled: false },
                  events: {
                    dataPointSelection: (_e, _c, opts) => {
                      const hit = districtChart[opts?.dataPointIndex ?? -1]
                      if (hit) setDistrictKey(hit.key)
                    },
                  },
                },
                colors: ['#2f66f6'],
                markers: {
                  size: 9,
                  strokeWidth: 2,
                  strokeColors: '#ffffff',
                  hover: { size: 13 },
                },
                dataLabels: {
                  enabled: true,
                  formatter: (_v, opts) => districtChart[opts?.dataPointIndex ?? 0]?.name ?? '',
                  offsetY: -12,
                  style: { fontSize: '10px', fontWeight: 600, colors: ['#5b6b82'] },
                  background: { enabled: false },
                },
                grid: { borderColor: '#eef1f6', strokeDashArray: 4 },
                xaxis: {
                  title: { text: t('tambon.coverage'), style: { fontSize: '11px', color: '#94a3b8', fontWeight: 500 } },
                  tickAmount: 6,
                  labels: {
                    formatter: (v: string) => `${Number(v).toFixed(0)}%`,
                    style: { fontSize: '10px', colors: '#94a3b8' },
                  },
                  axisBorder: { show: false },
                  axisTicks: { show: false },
                },
                yaxis: {
                  title: { text: t('risk.rate'), style: { fontSize: '11px', color: '#94a3b8', fontWeight: 500 } },
                  tickAmount: 5,
                  labels: {
                    formatter: (v: number) => `${v.toFixed(0)}%`,
                    style: { fontSize: '10px', colors: '#94a3b8' },
                  },
                },
                annotations: {
                  xaxis: [
                    {
                      x: avgCoverage,
                      borderColor: '#cbd5e1',
                      strokeDashArray: 5,
                      label: {
                        text: th ? 'ครอบคลุมเฉลี่ย' : 'avg coverage',
                        position: 'top',
                        style: { fontSize: '9px', color: '#94a3b8', background: '#ffffff' },
                      },
                    },
                  ],
                  yaxis: [
                    {
                      y: avgRisk,
                      borderColor: '#cbd5e1',
                      strokeDashArray: 5,
                      label: {
                        text: th ? 'เสี่ยงเฉลี่ย' : 'avg risk',
                        style: { fontSize: '9px', color: '#94a3b8', background: '#ffffff' },
                      },
                    },
                  ],
                },
                tooltip: {
                  custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
                    const d = districtChart[dataPointIndex]
                    if (!d) return ''
                    return `<div style="padding:8px 10px;font-size:12px">
                      <div style="font-weight:700">${d.name}</div>
                      <div style="margin-top:4px">${t('risk.rate')} <b>${d.risk.toFixed(1)}%</b></div>
                      <div>${t('tambon.coverage')} <b>${d.coverage.toFixed(1)}%</b></div>
                      <div>${t('kpi.stillOut')} <b>${formatNumber(d.oos)}</b></div>
                    </div>`
                  },
                },
              }}
            />
          </div>
        </Card>

        {/* Causes, against the area average — otherwise "differs from average"
            is a claim the chart never shows. */}
        <Card className="xl:col-span-5">
          <CardHeader
            title={th ? 'โครงสร้างสาเหตุ' : 'Cause structure'}
            subtitle={
              th
                ? 'เทียบกับค่าเฉลี่ยทั้งพื้นที่ — ตรงไหนโป่งออกคือสิ่งที่พื้นที่นี้ต่างจากที่อื่น'
                : 'Against the area average — where the shape bulges is what makes this place different'
            }
          />
          <div className="px-2 pb-4 pt-2">
            <Chart
              type="bar"
              height={330}
              series={[
                {
                  name: district ? dn(district.key) : pn(province.key),
                  data: causeRadar.map((c) => c.value),
                },
                { name: th ? 'ค่าเฉลี่ยพื้นที่' : 'Area average', data: causeRadar.map((c) => c.avg) },
              ]}
              options={{
                chart: { ...CHART_BASE, type: 'bar' },
                colors: ['#2f66f6', '#cbd5e1'],
                plotOptions: {
                  bar: { horizontal: true, barHeight: '76%', borderRadius: 3 },
                },
                dataLabels: { enabled: false },
                states: { hover: { filter: { type: 'darken', value: 0.9 } } },
                legend: {
                  position: 'top',
                  horizontalAlign: 'left',
                  fontSize: '11px',
                  markers: { shape: 'circle' as const },
                  itemMargin: { horizontal: 8 },
                },
                grid: { borderColor: '#eef1f6', padding: { left: 0, right: 8, top: -6 } },
                xaxis: {
                  categories: causeRadar.map((c) => c.cause),
                  labels: {
                    formatter: (v: string) => `${Number(v).toFixed(0)}%`,
                    style: { fontSize: '10px', colors: '#94a3b8' },
                  },
                  axisBorder: { show: false },
                  axisTicks: { show: false },
                },
                yaxis: { labels: { style: { fontSize: '10px', colors: '#5b6b82' }, maxWidth: 160 } },
                tooltip: { shared: true, intersect: false, y: { formatter: (v: number) => `${v.toFixed(1)}%` } },
              }}
            />
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader
            title={t('tambon.coldSpots')}
            subtitle={t('tambon.coldSpotsHint')}
          />
          <div className="space-y-1.5 px-3 pb-5 pt-3">
            {tambonRows.map((x) => (
              <button
                key={x.key}
                onClick={() => nav('/tambon')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{tn(x.key)}</div>
                  <div className="text-[11px] text-ink-faint">
                    {dn(x.districtKey)} · {t('kpi.stillOut')} {formatNumber(x.oosCount)} ·{' '}
                    {t('tambon.volunteers')} {x.volunteers}
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(3, x.planCoverage)}%`,
                        background:
                          RISK_COLOR[
                            x.planCoverage < 40 ? 'critical' : x.planCoverage < 55 ? 'high' : x.planCoverage < 70 ? 'watch' : 'normal'
                          ],
                      }}
                    />
                  </div>
                  <div className="tabular mt-0.5 text-right text-[10px] text-ink-faint">
                    {formatPct(x.planCoverage, 0)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* School level — the last step of the drill-down, and the unit the
            TOR actually funds. */}
        <Card className="xl:col-span-5">
          <CardHeader
            title={th ? 'โรงเรียนนำร่องในพื้นที่นี้' : 'Pilot schools here'}
            subtitle={
              th
                ? 'เรียงตามสัดส่วนเด็กเสี่ยงสูงในโรงเรียน — คลิกเพื่อเปิดผลการดำเนินงาน'
                : 'Ranked by each school’s high-risk share — click to open its performance'
            }
            action={
              <span className="tabular text-xs font-semibold text-ink-muted">
                {formatNumber(areaSchools.length)} {th ? 'โรง' : 'schools'}
              </span>
            }
          />
          <div className="max-h-[520px] space-y-1 overflow-y-auto px-3 pb-5 pt-3">
            {areaSchools.length === 0 && (
              <p className="px-3 py-10 text-center text-xs text-ink-muted">
                {th ? 'ไม่มีโรงเรียนนำร่องในอำเภอนี้' : 'No pilot school in this district'}
              </p>
            )}
            {areaSchools.map((s, i) => {
              const level =
                s.riskShare >= 14 ? 'critical' : s.riskShare >= 11 ? 'high' : s.riskShare >= 8 ? 'watch' : 'normal'
              return (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.04 }}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => nav('/school')}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                    style={{ background: RISK_COLOR[level] }}
                  >
                    <IconSchool width={15} height={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {th ? s.name : (s.nameEn ?? s.name)}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {dn(s.districtKey)} · {t('kpi.total')} {formatNumber(s.totalStudents)} ·{' '}
                      {t('kpi.highrisk')} {formatNumber(s.highRiskStudents)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className="tabular block text-sm font-bold"
                      style={{ color: RISK_COLOR[level] }}
                    >
                      {formatPct(s.riskShare)}
                    </span>
                    <span className="block text-[10px] text-ink-faint">
                      {th ? 'คุณภาพข้อมูล' : 'data'} {s.dataQualityScore}
                    </span>
                  </span>
                </motion.button>
              )
            })}
          </div>
        </Card>

        <Card className="xl:col-span-12">
          <CardHeader
            title={th ? 'ตำแหน่งบนแผนที่' : 'On the map'}
            subtitle={
              district
                ? `${dn(district.key)} — ${t(`kind.${DISTRICT_GEO[district.key]?.kind ?? 'rural'}`)}`
                : pn(province.key)
            }
          />
          <div className="px-5 pb-5 pt-4">
            <SouthernMap
              districts={district ? [district] : provDistricts}
              provinces={[province]}
              schools={schools}
              showFilters={false}
              selectedKey={district?.key ?? null}
              initialFocus={province.key}
              onSelect={(d) => setDistrictKey(d.key)}
              height={400}
              showMetricSwitch
            />
          </div>
        </Card>

        <Card className="xl:col-span-12">
          <CardHeader title={th ? 'แนวโน้มความเสี่ยงรายจังหวัด' : 'Provincial risk trend'} />
          <div className="px-3 pb-5 pt-3">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={(th
                  ? ['ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.']
                  : ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
                ).map((m, i) => {
                  const row: Record<string, string | number> = { month: m }
                  for (const p of provinces) row[p.key] = p.trend[i] ?? p.riskRate
                  return row
                })}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis unit="%" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6ebf3', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => pn(String(v))} />
                {provinces.map((p, i) => (
                  <Line
                    key={p.key}
                    type="monotone"
                    dataKey={p.key}
                    stroke={['#2f66f6', '#f97316', '#8b5cf6', '#16a34a'][i % 4]}
                    strokeWidth={p.key === province.key ? 2.6 : 1.4}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
