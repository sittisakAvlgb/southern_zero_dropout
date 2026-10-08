import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Select } from '@/components/ui/Select'
import { TypingText } from '@/components/ui/TypingText'
import { SkeletonKpi, SkeletonCard } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useSimulatedLoading } from '@/lib/useLoading'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber, formatPct, makeRng, hashSeed } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import type { CauseKey, CauseWeight, Province } from '@/types'
import { useScopedData } from '@/auth/scope'
import { ScopeBanner } from '@/components/auth/ScopeBanner'
import {
  IconCause,
  IconExport,
  IconAI,
  IconSparkle,
} from '@/components/icons'

// Brand-forward palette for categorical slices/series
const PALETTE = [
  '#2f66f6',
  '#0f2a6b',
  '#f97316',
  '#16a34a',
  '#eab308',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
]
const OTHER_COLOR = '#cbd5e1'
const GRID = '#eef2f8'

/** Aggregate a cause distribution over a set of provinces (weighted by high-risk pop). */
function causeDistributionFor(provs: Province[]): CauseWeight[] {
  const acc: Record<string, number> = {}
  for (const p of provs) {
    for (const c of p.topCauses) {
      acc[c.key] = (acc[c.key] ?? 0) + c.value * p.highRiskStudents
    }
  }
  const total = Object.values(acc).reduce((s, v) => s + v, 0) || 1
  return (Object.entries(acc) as [CauseKey, number][])
    .map(([key, v]) => ({ key, value: Math.round((v / total) * 1000) / 10 }))
    .sort((a, b) => b.value - a.value)
}

/** Deterministic 6-month synthetic series ending at the cause's current share. */
function synthTrend(key: CauseKey, base: number): number[] {
  const rng = makeRng(hashSeed(`cause-trend-${key}`))
  const out: number[] = []
  let v = base * (0.82 + rng() * 0.14)
  for (let i = 0; i < 5; i++) {
    v += (rng() - 0.42) * base * 0.09
    out.push(Math.max(0.5, Math.round(v * 10) / 10))
  }
  out.push(Math.round(base * 10) / 10)
  return out
}

/** The four bands `intensityColor` puts each bar into — spelled out so the
 *  colours on the ranking chart are readable rather than decorative. */
const TIERS = [
  { key: 'critical' as const, th: 'สาเหตุนำ', en: 'Leading driver' },
  { key: 'high' as const, th: 'สาเหตุหลัก', en: 'Major driver' },
  { key: 'watch' as const, th: 'สาเหตุรอง', en: 'Secondary' },
  { key: 'normal' as const, th: 'พบประปราย', en: 'Occasional' },
]

/** Concern color for a bar based on its share relative to the leader. */
function intensityColor(ratio: number): string {
  if (ratio > 0.85) return RISK_COLOR.critical
  if (ratio > 0.62) return RISK_COLOR.high
  if (ratio > 0.38) return RISK_COLOR.watch
  return RISK_COLOR.normal
}

export default function CauseAnalysis() {
  const { t, lang, pn } = useI18n()
  const th = lang === 'th'
  const toast = useToast()
  const loading = useSimulatedLoading(600)
  const [provinceKey, setProvinceKey] = useState<string>('all')

  const { provinces: scopedProvinces, user } = useScopedData()

  // The scope is three border provinces, all in one region — so the filter and
  // the comparison chart work at province level. A region filter here offered
  // "all" and "south", which are the same set.
  const scopeProvinces = useMemo(
    () =>
      provinceKey === 'all'
        ? scopedProvinces
        : scopedProvinces.filter((p) => p.key === provinceKey),
    [provinceKey, scopedProvinces],
  )

  const dist = useMemo<CauseWeight[]>(
    () => causeDistributionFor(scopeProvinces),
    [scopeProvinces],
  )

  const totalHighRisk = useMemo(
    () => scopeProvinces.reduce((s, p) => s + p.highRiskStudents, 0),
    [scopeProvinces],
  )

  const maxShare = dist.length ? dist[0].value : 1

  /** how concentrated the problem is — five causes out of eighteen */
  const topFiveShare = useMemo(
    () => dist.slice(0, 5).reduce((s, c) => s + c.value, 0),
    [dist],
  )

  // Donut: the eight named drivers plus the diffuse tail
  const pieData = useMemo(() => {
    const top8 = dist.slice(0, 8).map((c) => ({
      key: c.key as string,
      name: t(`cause.${c.key}`),
      value: c.value,
    }))
    const otherVal = dist.slice(8).reduce((s, c) => s + c.value, 0)
    if (otherVal > 0.05) {
      top8.push({
        key: 'other',
        name: th ? 'อื่นๆ' : 'Other',
        value: Math.round(otherVal * 10) / 10,
      })
    }
    return top8
  }, [dist, t, th])

  // Ranking: all 12 causes desc
  const rankingData = useMemo(
    () =>
      dist.map((c) => ({
        key: c.key,
        name: t(`cause.${c.key}`),
        value: c.value,
      })),
    [dist, t],
  )

  // Trend: top 3 causes over 6 months
  const topThree = dist.slice(0, 3)
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date(2026, 6 - (5 - i), 1)
        return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
          month: 'short',
        })
      }),
    [lang],
  )
  const trendData = useMemo(() => {
    const series = topThree.map((c) => ({
      key: c.key,
      values: synthTrend(c.key, c.value),
    }))
    return months.map((m, i) => {
      const row: Record<string, string | number> = { month: m }
      for (const s of series) row[s.key] = s.values[i]
      return row
    })
  }, [months, topThree])

  // Compare by region: scoped regions on X, scoped top-4 causes stacked
  const top4 = useMemo(
    () => causeDistributionFor(scopedProvinces).slice(0, 4).map((c) => c.key),
    [scopedProvinces],
  )
  const byProvinceData = useMemo(
    () =>
      scopedProvinces.map((p) => {
        const d = causeDistributionFor([p])
        const row: Record<string, string | number> = { area: pn(p.key) }
        for (const k of top4) row[k] = d.find((c) => c.key === k)?.value ?? 0
        return row
      }),
    [scopedProvinces, top4, pn],
  )

  /** "ทั้ง 3 จังหวัด" is only a real choice for an account without a territory.
   *  Offering it to a เขต or province seat promised data the scope filter was
   *  always going to withhold — a control that cannot do what it says. */
  const provinceOptions = [
    ...(user?.provinceKey ? [] : [{ value: 'all', label: th ? 'ทั้ง 3 จังหวัด' : 'All 3 provinces' }]),
    ...scopedProvinces.map((p) => ({ value: p.key, label: pn(p.key) })),
  ]

  const lead = dist[0]
  const aiText =
    lead === undefined
      ? ''
      : lang === 'th'
        ? `สาเหตุอันดับ 1 ที่ทำให้นักเรียนเสี่ยงหลุดจากระบบคือ “${t(`cause.${lead.key}`)}” คิดเป็น ${formatPct(lead.value)} ของกรณีเสี่ยงทั้งหมด${provinceKey === 'all' ? 'ในพื้นที่นำร่อง 3 จังหวัด' : `ใน${pn(provinceKey)}`} ควรเร่งออกแบบมาตรการช่วยเหลือที่ตรงจุด เพื่อลดโอกาสหลุดออกจากระบบการศึกษา`
        : `The leading driver of dropout risk is “${t(`cause.${lead.key}`)}”, accounting for ${formatPct(lead.value)} of at-risk cases ${provinceKey === 'all' ? 'across the three pilot provinces' : `in ${pn(provinceKey)}`}. Prioritise targeted interventions here to reduce the chance students leave the system.`

  const pctTooltip = (v: number | string) => formatPct(Number(v))

  return (
    <div>
      <ScopeBanner />
      <PageHeader
        title={t('cause.title')}
        subtitle={t('cause.sub')}
        icon={<IconCause />}
        actions={
          <Button
            variant="secondary"
            icon={<IconExport width={16} height={16} />}
            onClick={() => toast.push(t('toast.exported'))}
          >
            {t('common.export')}
          </Button>
        }
      />

      {/* Province filter */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {provinceOptions.map((o) => {
            const on = provinceKey === o.value
            return (
              <motion.button
                key={o.value}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setProvinceKey(o.value)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                    : 'border-surface-border bg-white text-ink-muted hover:border-brand-300'
                }`}
              >
                {o.label}
              </motion.button>
            )
          })}
        </div>
        <span className="text-[11px] font-medium text-ink-faint">
          {formatNumber(scopeProvinces.length, lang)} {t('common.province')} ·{' '}
          {t('cause.shareOfCases')}
        </span>
      </div>

      {/* Top-3 drivers, on one panel with the population they came from —
          separate tiles with accent bars gave four things equal weight and no
          way to compare the three shares. */}
      <Card className="mt-4">
        <div className="grid divide-y divide-surface-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <p className="text-xs font-medium text-ink-muted">{t('kpi.highrisk')}</p>
            <p
              className="tabular mt-1 text-[32px] font-bold leading-none"
              style={{ color: RISK_COLOR.high }}
            >
              <AnimatedCounter value={totalHighRisk} />
            </p>
            <p className="mt-2 text-[11px] leading-snug text-ink-faint">
              {th
                ? `ฐานที่ใช้คิดสัดส่วนสาเหตุทั้งหมดด้านขวา · ${scopeProvinces.length} จังหวัด`
                : `The base every share on the right is measured against · ${scopeProvinces.length} provinces`}
            </p>
          </div>

          <div className="p-5 lg:col-span-2">
            <p className="text-xs font-medium text-ink-muted">
              {th ? 'สาเหตุที่พบมากที่สุด 3 อันดับ' : 'Top three drivers'}
            </p>
            <div className="mt-3 space-y-3">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <SkeletonKpi key={i} />)
                : dist.slice(0, 3).map((c, r) => (
                    <motion.div
                      key={c.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + r * 0.08 }}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="tabular w-4 shrink-0 text-[11px] font-bold text-ink-faint">
                            {r + 1}
                          </span>
                          <span className="truncate text-sm font-semibold text-ink">
                            {t(`cause.${c.key}`)}
                          </span>
                        </span>
                        <span
                          className="tabular shrink-0 text-sm font-bold"
                          style={{ color: PALETTE[r] }}
                        >
                          {formatPct(c.value)}
                        </span>
                      </div>
                      {/* all three drawn against the leader, so the gaps are readable */}
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: PALETTE[r] }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(c.value / maxShare) * 100}%` }}
                          transition={{ duration: 0.7, delay: 0.15 + r * 0.08, ease: 'easeOut' }}
                        />
                      </div>
                    </motion.div>
                  ))}
            </div>
          </div>
        </div>
      </Card>

      {/* AI insight strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-4"
      >
        <Card className="overflow-hidden bg-gradient-to-br from-brand-900 to-brand-700 text-white">
          <div className="flex items-start gap-3 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
              <IconAI width={20} height={20} />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <IconSparkle width={15} height={15} /> {t('ai.title')}
              </p>
              {loading ? (
                <p className="mt-1 text-[13px] text-white/70">…</p>
              ) : (
                <TypingText
                  text={aiText}
                  speed={10}
                  className="mt-1 text-[13.5px] leading-relaxed text-white/95"
                />
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Charts */}
      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : dist.length === 0 ? (
        <div className="mt-6 grid place-items-center rounded-2xl border border-surface-border bg-white py-16">
          <p className="text-sm font-medium text-ink-muted">{t('common.empty')}</p>
          <p className="mt-1 text-xs text-ink-faint">{t('common.emptyHint')}</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Donut and ranking sit side by side; the donut card fills whatever
              height the ranking sets, so the pair always lines up. */}
          <div className="lg:col-span-5">
            <ChartCard
              title={t('cause.distribution')}
              delay={0.05}
              subtitle={th ? 'สัดส่วนของกรณีเสี่ยงทั้งหมด' : 'Share of all at-risk cases'}
              fill
            >
              <div className="relative flex min-h-[420px] flex-1 flex-col">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="46%"
                      innerRadius="52%"
                      outerRadius="78%"
                      paddingAngle={2}
                      stroke="none"
                      animationDuration={900}
                    >
                      {pieData.map((d, i) => (
                        <Cell
                          key={d.key}
                          fill={d.key === 'other' ? OTHER_COLOR : PALETTE[i % PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={pctTooltip} />
                    <Legend
                      verticalAlign="bottom"
                      height={64}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* centre figure follows the province filter, like every other number here */}
                <div className="pointer-events-none absolute inset-x-0 top-[42%] -translate-y-1/2 text-center">
                  <p className="tabular text-[24px] font-bold leading-none text-ink">
                    {formatNumber(totalHighRisk, lang)}
                  </p>
                  <p className="mt-1 text-[10.5px] font-medium text-ink-muted">
                    {t('kpi.highrisk')}
                  </p>
                </div>
              </div>
            </ChartCard>
          </div>

          <div className="lg:col-span-7">
          <ChartCard
            title={t('cause.ranking')}
            delay={0.1}
            subtitle={
              th
                ? `5 สาเหตุแรกอธิบาย ${formatPct(topFiveShare)} ของกรณีเสี่ยงทั้งหมด`
                : `The top five drivers account for ${formatPct(topFiveShare)} of all at-risk cases`
            }
            legend={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {TIERS.map((tier) => (
                  <span key={tier.key} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: RISK_COLOR[tier.key] }}
                    />
                    {th ? tier.th : tier.en}
                  </span>
                ))}
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={Math.max(340, rankingData.length * 34)}>
              <BarChart
                data={rankingData}
                layout="vertical"
                margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
                barCategoryGap={4}
              >
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  tick={{ fontSize: 11, fill: '#334155' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={pctTooltip} cursor={{ fill: '#f1f5f9' }} />
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  label={{
                    position: 'right',
                    fontSize: 10,
                    fill: '#475569',
                    formatter: (v: ReactNode) => `${v}%`,
                  }}
                >
                  {rankingData.map((d) => (
                    <Cell key={d.key} fill={intensityColor(d.value / maxShare)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          </div>

          {/* 3. Trend of top-3 causes */}
          <div className="lg:col-span-6">
          <ChartCard title={t('cause.trend')} delay={0.15} fill>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <Tooltip formatter={pctTooltip} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                {topThree.map((c, i) => (
                  <Line
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    name={t(`cause.${c.key}`)}
                    stroke={PALETTE[i]}
                    strokeWidth={2.4}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          </div>

          {/* 4. Compare by province */}
          <div className="lg:col-span-6">
          <ChartCard title={t('cause.byRegion')} delay={0.2} fill>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byProvinceData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="area"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <Tooltip formatter={pctTooltip} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {top4.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={t(`cause.${k}`)}
                    fill={PALETTE[i]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          </div>
        </div>
      )}
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  legend,
  delay,
  fill,
  children,
}: {
  title: string
  subtitle?: string
  legend?: ReactNode
  delay: number
  /** stretch to the tallest card in the row instead of hugging its content */
  fill?: boolean
  children: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={fill ? 'h-full' : undefined}
    >
      <Card className={fill ? 'flex h-full flex-col' : undefined}>
        <CardHeader title={title} subtitle={subtitle} action={legend} />
        <div className={`px-2 pb-3 pt-1 ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
          {children}
        </div>
      </Card>
    </motion.div>
  )
}

