import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { RiskBadge } from '@/components/ui/RiskBadge'
import { Segmented } from '@/components/ui/Segmented'
import Chart from 'react-apexcharts'
import { SouthernMap } from '@/components/map/SouthernMap'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useSimulatedLoading } from '@/lib/useLoading'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber, formatPct } from '@/lib/format'
import { rateToLevel, RISK_COLOR } from '@/lib/risk'
import { PROVINCE_BY_KEY } from '@/data/provinces'
import { useScopedData } from '@/auth/scope'
import { ScopeBanner } from '@/components/auth/ScopeBanner'
import type { Province } from '@/types'
import {
  IconMap,
  IconExport,
  IconArrowRight,
  IconChevronRight,
  IconAlert,
  IconUsers,
  IconClock,
} from '@/components/icons'

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

export default function RiskHeatmap() {
  const { t, pn, lang } = useI18n()
  const { provinces: scopedProvinces, districts, schools } = useScopedData()
  const nav = useNavigate()
  const toast = useToast()
  const loading = useSimulatedLoading(600)

  const [selected, setSelected] = useState<string | null>(null)

  // Province, district and school filtering lives inside the map's own search
  // control — a second set of dropdowns above it only split the same job in two.
  const filtered = scopedProvinces
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.riskRate - a.riskRate),
    [filtered],
  )

  const selectedProvince: Province | null = selected ? PROVINCE_BY_KEY[selected] ?? null : null

  /** enrolment-weighted risk rate across the area — the line every province is read against */
  const areaAverage = useMemo(() => {
    const total = filtered.reduce((s, p) => s + p.totalStudents, 0)
    return total
      ? filtered.reduce((s, p) => s + p.riskRate * p.totalStudents, 0) / total
      : 0
  }, [filtered])

  return (
    <div>
      <ScopeBanner />
      <PageHeader
        title={t('heat.title')}
        subtitle={t('heat.sub')}
        icon={<IconMap />}
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

      {/* Map + province panel */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <Card>
            <CardHeader
              title={t('ov.heatTitle')}
              subtitle={t('heat.legend')}
              action={
                <span className="tabular text-xs font-semibold text-ink-muted">
                  {formatNumber(filtered.length)} {t('common.province')}
                </span>
              }
            />
            <div className="px-2 pb-3">
              {loading ? (
                <div className="p-3">
                  <SkeletonCard />
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState t={t} />
              ) : (
                <SouthernMap
                  provinces={filtered}
                  districts={districts.filter((d) =>
                    filtered.some((p) => p.key === d.provinceKey),
                  )}
                  schools={schools}
                  selectedKey={selected}
                  onSelect={(d) => setSelected(d.provinceKey)}
                  onSelectProvince={(p) => setSelected(p.key)}
                  onOpen={() => nav('/area')}
                  onOpenProvince={() => nav('/area')}
                  height={560}
                  showCard
                />
              )}
            </div>
          </Card>
        </motion.div>

        {/* Slide-in province panel */}
        <div className="lg:col-span-1">
          <AnimatePresence mode="wait">
            {selectedProvince ? (
              <motion.div
                key={selectedProvince.key}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              >
                <ProvincePanel
                  province={selectedProvince}
                  average={areaAverage}
                  onBack={() => setSelected(null)}
                  onOpen={() => nav('/area')}
                />
              </motion.div>
            ) : (
              <motion.div
                key="ranking"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              >
                <ProvinceRanking
                  provinces={sorted}
                  average={areaAverage}
                  selected={selected}
                  onSelect={(k) => setSelected(k)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  )
}

/**
 * Default state of the side panel.
 *
 * Ranking by rate alone is misleading here: Narathiwat leads on rate (11.2%)
 * while Pattani carries far more children (11,544 vs 7,722). The toggle lets
 * the reader ask both questions, and on the rate view the bars are drawn
 * against the area average so three numbers within 1.5 points still separate.
 */
function ProvinceRanking({
  provinces,
  average: avg,
  selected,
  onSelect,
}: {
  provinces: Province[]
  average: number
  selected: string | null
  onSelect: (key: string) => void
}) {
  const { t, pn, lang } = useI18n()
  const th = lang === 'th'
  const [mode, setMode] = useState<'rate' | 'count'>('rate')

  const rows = useMemo(
    () =>
      [...provinces].sort((a, b) =>
        mode === 'rate' ? b.riskRate - a.riskRate : b.highRiskStudents - a.highRiskStudents,
      ),
    [provinces, mode],
  )

  const series = rows.map((p) => (mode === 'rate' ? p.riskRate : p.highRiskStudents))
  const min = Math.min(...series)
  const max = Math.max(...series)

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={th ? 'จังหวัดไหนหนักที่สุด' : 'Which province is worst hit'}
        subtitle={
          mode === 'rate'
            ? th
              ? `เทียบกับค่าเฉลี่ยพื้นที่ ${formatPct(avg)}`
              : `Against the area average of ${formatPct(avg)}`
            : th
              ? 'จำนวนเด็กเสี่ยงสูง — ที่ที่ต้องใช้คนมากที่สุด'
              : 'High-risk headcount — where the workload actually is'
        }
        action={
          <Segmented
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as 'rate' | 'count')}
            options={[
              { value: 'rate', label: th ? 'อัตรา' : 'Rate' },
              { value: 'count', label: th ? 'จำนวน' : 'Count' },
            ]}
          />
        }
      />

      <div className="px-1 pb-2">
        <Chart
          type="bar"
          height={168}
          series={[{ name: mode === 'rate' ? t('risk.rate') : t('kpi.highrisk'), data: series }]}
          options={{
            chart: {
              ...CHART_BASE,
              type: 'bar',
              events: {
                dataPointSelection: (_e, _c, opts) => {
                  const hit = rows[opts?.dataPointIndex ?? -1]
                  if (hit) onSelect(hit.key)
                },
              },
            },
            colors: rows.map((p) =>
              p.key === selected ? '#1a4fe0' : RISK_COLOR[rateToLevel(p.riskRate)],
            ),
            plotOptions: {
              bar: {
                horizontal: true,
                distributed: true,
                barHeight: '56%',
                borderRadius: 4,
                dataLabels: { position: 'top' },
              },
            },
            legend: { show: false },
            dataLabels: {
              enabled: true,
              textAnchor: 'start',
              offsetX: 6,
              formatter: (v: number) =>
                mode === 'rate' ? `${v.toFixed(1)}%` : formatNumber(v),
              style: { fontSize: '11px', fontWeight: 700, colors: ['#0f1b2d'] },
              dropShadow: { enabled: false },
            },
            states: { hover: { filter: { type: 'darken', value: 0.9 } } },
            grid: {
              borderColor: '#eef1f6',
              padding: { left: 0, right: 24, top: -20, bottom: -8 },
            },
            xaxis: {
              categories: rows.map((p) => pn(p.key)),
              // rate: zoom to the spread around the average; count: honest 0 base
              min: mode === 'rate' ? Math.floor(Math.min(min, avg) - 1) : 0,
              max: mode === 'rate' ? Math.ceil(Math.max(max, avg) + 0.8) : Math.ceil(max * 1.25),
              tickAmount: 4,
              labels: {
                formatter: (v: string) =>
                  mode === 'rate' ? `${Number(v).toFixed(0)}%` : formatNumber(Math.round(Number(v))),
                style: { fontSize: '10px', colors: '#94a3b8' },
              },
              axisBorder: { show: false },
              axisTicks: { show: false },
            },
            yaxis: { labels: { style: { fontSize: '12px', colors: '#0f1b2d' } } },
            annotations:
              mode === 'rate'
                ? {
                    xaxis: [
                      {
                        x: Math.round(avg * 10) / 10,
                        borderColor: '#94a3b8',
                        strokeDashArray: 4,
                        label: {
                          text: th ? 'ค่าเฉลี่ยพื้นที่' : 'Area average',
                          orientation: 'horizontal',
                          position: 'top',
                          offsetY: -2,
                          style: {
                            fontSize: '9px',
                            color: '#5b6b82',
                            background: '#f6f8fc',
                          },
                        },
                      },
                    ],
                  }
                : // an empty object leaves Apex's previous annotation on screen;
                  // an empty list is what actually clears it
                  { xaxis: [] },
            tooltip: {
              custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
                const p = rows[dataPointIndex]
                if (!p) return ''
                const diff = p.riskRate - avg
                return `<div style="padding:8px 10px;font-size:12px">
                  <div style="font-weight:700">${pn(p.key)}</div>
                  <div style="margin-top:4px">${t('risk.rate')} <b>${p.riskRate.toFixed(1)}%</b>
                    <span style="color:${diff >= 0 ? '#dc2626' : '#16a34a'}">
                      (${diff >= 0 ? '+' : ''}${diff.toFixed(1)} ${th ? 'จุด' : 'pts'})</span></div>
                  <div>${t('kpi.highrisk')} <b>${formatNumber(p.highRiskStudents)}</b></div>
                  <div>${t('kpi.stillOut')} <b>${formatNumber(p.oosCount)}</b></div>
                </div>`
              },
            },
          }}
        />
      </div>

      <div className="flex flex-col gap-1 px-3 pb-4">
        {rows.map((p, i) => {
          const active = p.key === selected
          const diff = p.riskRate - avg
          return (
            <motion.button
              key={p.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.06 }}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(p.key)}
              className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                active ? 'bg-brand-500/8 ring-1 ring-brand-200' : 'hover:bg-surface-muted'
              }`}
            >
              <span className="tabular w-4 shrink-0 text-[11px] font-bold text-ink-faint">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{pn(p.key)}</span>
                <span className="block text-[11px] text-ink-faint">
                  {t('kpi.highrisk')} {formatNumber(p.highRiskStudents)} · {t('kpi.stillOut')}{' '}
                  {formatNumber(p.oosCount)}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                  diff >= 0 ? 'bg-risk-critical/10 text-risk-critical' : 'bg-risk-normal/10 text-risk-normal'
                }`}
              >
                {diff >= 0 ? '+' : ''}
                {diff.toFixed(1)}
              </span>
              <IconChevronRight
                width={13}
                height={13}
                className="shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
              />
            </motion.button>
          )
        })}
      </div>
    </Card>
  )
}



/** Detail for one province: how bad, how well we respond, and what is stuck. */
function ProvincePanel({
  province,
  average,
  onOpen,
  onBack,
}: {
  province: Province
  average: number
  onOpen: () => void
  onBack: () => void
}) {
  const { t, pn, lang } = useI18n()
  const th = lang === 'th'
  const level = rateToLevel(province.riskRate)
  const diff = province.riskRate - average
  const topCauses = province.topCauses.slice(0, 4)

  const backlog = [
    {
      label: t('common.unassigned'),
      value: province.unassignedCases,
      icon: <IconUsers width={14} height={14} />,
      hint: th ? 'ยังไม่มีใครรับผิดชอบ' : 'Nobody owns these yet',
    },
    {
      label: t('common.overdue'),
      value: province.overdueCases,
      icon: <IconClock width={14} height={14} />,
      hint: th ? 'เลยกรอบเวลาที่ตกลงกันไว้' : 'Past the agreed SLA',
    },
  ]

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <button
            onClick={onBack}
            className="mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-faint transition-colors hover:text-brand-600"
          >
            <IconChevronRight width={12} height={12} className="rotate-180" />
            {t('common.back')}
          </button>
          <p className="text-lg font-bold text-ink">{pn(province.key)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {province.districts} {t('geo.districts')} · {formatNumber(province.totalStudents)}{' '}
            {t('kpi.total')}
          </p>
        </div>
        <RiskBadge level={level} pulse />
      </div>

      {/* The two rates, each with the comparison that makes it mean something */}
      <div className="mx-5 mt-3 grid grid-cols-2 gap-3 rounded-xl bg-surface-muted p-4">
        <div>
          <p className="text-[11px] font-medium text-ink-muted">{t('risk.rate')}</p>
          <p className="tabular text-2xl font-bold" style={{ color: RISK_COLOR[level] }}>
            {formatPct(province.riskRate)}
          </p>
          <p
            className={`mt-0.5 text-[11px] font-semibold ${
              diff >= 0 ? 'text-risk-critical' : 'text-risk-normal'
            }`}
          >
            {diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}{' '}
            <span className="font-normal text-ink-faint">
              {th ? 'จุด จากค่าเฉลี่ยพื้นที่' : 'pts vs area average'}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-ink-muted">{t('common.successRate')}</p>
          <p className="tabular text-2xl font-bold text-risk-normal">
            {formatPct(province.interventionSuccessRate)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {th
              ? `จากเด็กเสี่ยงสูง ${formatNumber(province.highRiskStudents)} คน`
              : `of ${formatNumber(province.highRiskStudents)} high-risk children`}
          </p>
        </div>
      </div>

      {/* Backlog — these are problems, so they are coloured like problems */}
      <div className="mt-3 px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          {th ? 'งานที่ค้างอยู่' : 'Stuck work'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {backlog.map((b, i) => {
            const bad = b.value > 0
            return (
              <motion.div
                key={b.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className={`rounded-xl border p-3 ${
                  bad ? 'border-risk-critical/25 bg-risk-critical/5' : 'border-surface-border'
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 ${
                    bad ? 'text-risk-critical' : 'text-ink-faint'
                  }`}
                >
                  {b.icon}
                  <span className="text-[11px] font-medium">{b.label}</span>
                </div>
                <p
                  className={`tabular mt-1 text-lg font-bold ${
                    bad ? 'text-risk-critical' : 'text-ink'
                  }`}
                >
                  {formatNumber(b.value)}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-ink-faint">{b.hint}</p>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Causes — a chart, so the gaps between them are actually comparable */}
      <div className="mt-3 px-2">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          {t('prov.mainCauses')}
        </p>
        <Chart
          type="bar"
          height={150}
          series={[{ name: t('prov.mainCauses'), data: topCauses.map((c) => c.value) }]}
          options={{
            chart: { ...CHART_BASE, type: 'bar' },
            colors: [RISK_COLOR[level]],
            plotOptions: {
              bar: {
                horizontal: true,
                barHeight: '54%',
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
            grid: { show: false, padding: { left: 0, right: 26, top: -14, bottom: -14 } },
            xaxis: {
              categories: topCauses.map((c) => t(`cause.${c.key}`)),
              max: Math.ceil(Math.max(...topCauses.map((c) => c.value), 1) * 1.3),
              labels: { show: false },
              axisBorder: { show: false },
              axisTicks: { show: false },
            },
            yaxis: { labels: { style: { fontSize: '11px', colors: '#5b6b82' }, maxWidth: 150 } },
            tooltip: {
              y: {
                formatter: (v: number) =>
                  th ? `${v.toFixed(1)}% ของเด็กเสี่ยงในจังหวัดนี้` : `${v.toFixed(1)}% of at-risk children here`,
              },
            },
          }}
        />
      </div>

      <div className="mt-auto p-5 pt-3">
        <Button
          variant="primary"
          className="w-full justify-center"
          icon={<IconArrowRight width={16} height={16} />}
          onClick={onOpen}
        >
          {t('heat.openInsight')}
        </Button>
      </div>
    </Card>
  )
}

function EmptyState({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-muted text-ink-faint">
        <IconMap width={24} height={24} />
      </span>
      <p className="text-sm font-semibold text-ink">{t('common.empty')}</p>
      <p className="text-xs text-ink-muted">{t('common.emptyHint')}</p>
    </div>
  )
}
