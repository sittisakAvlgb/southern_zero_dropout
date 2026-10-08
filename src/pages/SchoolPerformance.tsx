import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import Chart from 'react-apexcharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { useToast } from '@/components/ui/Toast'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'
import { useScopedData } from '@/auth/scope'
import { canWorkCases } from '@/auth/roles'
import { DirectOnlyNotice } from '@/components/auth/DirectOnlyNotice'
import { canAccess } from '@/auth/roles'
import { ScopeBanner } from '@/components/auth/ScopeBanner'
import { SCHOOLS } from '@/data/schools'
import type { School } from '@/types'
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconExport,
  IconGrid,
  IconList,
  IconSchool,
  IconSearch,
  IconShield,
  IconUsers,
} from '@/components/icons'

const LOW_DATA = 80
const LOW_SUCCESS = 50
const PAGE_SIZE = 12

/** Every school lands in exactly one bucket, worst signal first. */
type Health = 'needs' | 'lowData' | 'lowSuccess' | 'ok'
function healthOf(s: School): Health {
  if (s.needsResources) return 'needs'
  if (s.dataQualityScore < LOW_DATA) return 'lowData'
  if (s.interventionSuccessRate < LOW_SUCCESS) return 'lowSuccess'
  return 'ok'
}

type RankKey = 'dataQualityScore' | 'interventionSuccessRate' | 'responseHours' | 'highRiskStudents'
type Focus = 'none' | 'needs' | 'lowData' | 'lowSuccess'

export default function SchoolPerformance() {
  const { t, pn, dn, lang } = useI18n()
  const th = lang === 'th'
  const toast = useToast()
  const nav = useNavigate()
  const { schools: scoped, user } = useScopedData()

  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('all')
  const [focus, setFocus] = useState<Focus>('none')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [rankBy, setRankBy] = useState<RankKey>('dataQualityScore')
  const [page, setPage] = useState(1)
  const [requested, setRequested] = useState<Set<string>>(() => new Set())

  // /school?s=TOR-005 opens that school's drawer on arrival
  const [params] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(() => params.get('s'))
  const [closing, setClosing] = useState(false)
  const closeDrawer = () => {
    setClosing(true)
    window.setTimeout(() => {
      setOpenId(null)
      setClosing(false)
    }, 240)
  }

  const single = scoped.length === 1 ? scoped[0] : null

  /** benchmark across all pilot schools — aggregate figures, no child data */
  const benchmark = useMemo(() => {
    const avg = (sel: (s: School) => number) =>
      SCHOOLS.reduce((a, s) => a + sel(s), 0) / Math.max(1, SCHOOLS.length)
    return {
      count: SCHOOLS.length,
      dataQualityScore: Math.round(avg((s) => s.dataQualityScore)),
      interventionSuccessRate: Math.round(avg((s) => s.interventionSuccessRate) * 10) / 10,
      responseHours: Math.round(avg((s) => s.responseHours) * 10) / 10,
      riskShare:
        Math.round(
          (SCHOOLS.reduce((a, s) => a + s.highRiskStudents, 0) /
            Math.max(1, SCHOOLS.reduce((a, s) => a + s.totalStudents, 0))) *
            1000,
        ) / 10,
    }
  }, [])

  const stats = useMemo(() => {
    const n = (p: (s: School) => boolean) => scoped.filter(p).length
    const avg = (sel: (s: School) => number) =>
      scoped.length ? scoped.reduce((a, s) => a + sel(s), 0) / scoped.length : 0
    return {
      total: scoped.length,
      needs: n((s) => healthOf(s) === 'needs'),
      lowData: n((s) => healthOf(s) === 'lowData'),
      lowSuccess: n((s) => healthOf(s) === 'lowSuccess'),
      ok: n((s) => healthOf(s) === 'ok'),
      dataQuality: Math.round(avg((s) => s.dataQualityScore)),
      success: Math.round(avg((s) => s.interventionSuccessRate) * 10) / 10,
      overdue: scoped.reduce((a, s) => a + s.overdueCases, 0),
      highRisk: scoped.reduce((a, s) => a + s.highRiskStudents, 0),
    }
  }, [scoped])

  const districtKeys = useMemo(
    () => Array.from(new Set(scoped.map((s) => s.districtKey))),
    [scoped],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inFocus = (s: School) => (focus === 'none' ? true : healthOf(s) === focus)
    return scoped
      .filter(
        (s) =>
          (district === 'all' || s.districtKey === district) &&
          (!q || s.name.toLowerCase().includes(q) || (s.nameEn ?? '').toLowerCase().includes(q)) &&
          inFocus(s),
      )
      .sort((a, b) => {
        // schools that need support first, then by the chosen lens
        const ha = healthOf(a) === 'ok' ? 1 : 0
        const hb = healthOf(b) === 'ok' ? 1 : 0
        if (ha !== hb) return ha - hb
        return rankBy === 'responseHours'
          ? a.responseHours - b.responseHours
          : (b[rankBy] as number) - (a[rankBy] as number)
      })
  }, [scoped, district, query, focus, rankBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])
  const pageStart = (safePage - 1) * PAGE_SIZE
  const rows = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  const openSchool = openId ? scoped.find((s) => s.id === openId) ?? null : null

  const ranking = useMemo(() => {
    const rows = [...scoped].sort((a, b) =>
      rankBy === 'responseHours'
        ? a.responseHours - b.responseHours
        : (b[rankBy] as number) - (a[rankBy] as number),
    )
    return rows.slice(0, 8)
  }, [scoped, rankBy])

  const rankValue = (s: School) =>
    rankBy === 'dataQualityScore'
      ? `${s.dataQualityScore}`
      : rankBy === 'interventionSuccessRate'
        ? `${s.interventionSuccessRate}%`
        : rankBy === 'responseHours'
          ? `${s.responseHours} ${t('sch.hours')}`
          : formatNumber(s.highRiskStudents, lang)

  const rankMax = useMemo(() => {
    const vals = scoped.map((s) =>
      rankBy === 'responseHours' ? s.responseHours : (s[rankBy] as number),
    )
    return Math.max(...vals, 1)
  }, [scoped, rankBy])

  const activeFilters =
    (query.trim() ? 1 : 0) + (district !== 'all' ? 1 : 0) + (focus !== 'none' ? 1 : 0)
  const clearAll = () => {
    setQuery('')
    setDistrict('all')
    setFocus('none')
    setPage(1)
  }
  const toggleFocus = (f: Focus) => {
    setFocus((cur) => (cur === f ? 'none' : f))
    setPage(1)
  }

  // ── real actions ───────────────────────────────────────────
  /** Undefined for a seat that only reads — every button below is rendered
   *  only when a handler exists, so the rule needs stating in one place. */
  const mayAct = canWorkCases(user)

  const askSupport = (s: School) => {
    setRequested((r) => new Set(r).add(s.id))
    toast.push(
      th
        ? `ส่งคำขอสนับสนุนทรัพยากรของ ${s.name} ไปยังเขตพื้นที่แล้ว`
        : `Support request sent for ${s.name}`,
    )
  }

  const exportCsv = () => {
    const head = [
      th ? 'โรงเรียน' : 'school',
      th ? 'อำเภอ' : 'district',
      th ? 'จังหวัด' : 'province',
      th ? 'นักเรียน' : 'students',
      th ? 'เด็กเสี่ยงสูง' : 'high risk',
      th ? 'คุณภาพข้อมูล' : 'data quality',
      th ? 'อัตราช่วยสำเร็จ' : 'success rate',
      th ? 'เวลาตอบสนอง(ชม.)' : 'response hours',
      th ? 'เคสค้าง' : 'overdue cases',
      th ? 'ต้องการทรัพยากรเพิ่ม' : 'needs resources',
    ]
    const body = filtered.map((s) => [
      s.name,
      dn(s.districtKey),
      pn(s.provinceKey),
      s.totalStudents,
      s.highRiskStudents,
      s.dataQualityScore,
      s.interventionSuccessRate,
      s.responseHours,
      s.overdueCases,
      s.needsResources ? (th ? 'ใช่' : 'yes') : (th ? 'ไม่' : 'no'),
    ])
    const csv = [head, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `school-performance-${filtered.length}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.push(
      th ? `ส่งออก ${filtered.length} โรงเรียนเป็น CSV แล้ว` : `Exported ${filtered.length} schools`,
    )
  }

  const canCases = canAccess(user, '/intervention')
  const canRegistry = canAccess(user, '/oosc')

  return (
    <div className="animate-page-rise">
      <ScopeBanner />
      <DirectOnlyNotice />
      <PageHeader
        title={t('sch.title')}
        subtitle={t('sch.sub')}
        icon={<IconSchool width={22} height={22} />}
        actions={
          <Button
            variant="secondary"
            icon={<IconExport width={16} height={16} />}
            onClick={exportCsv}
          >
            {t('sch.exportCsv')}
          </Button>
        }
      />

      {single ? (
        /* ── One school in scope: a profile, not a league table ──
           Ranking five leaderboards over a single school listed the same name
           five times and called it an insight. */
        <SchoolProfile
          s={single}
          benchmark={benchmark}
          requested={requested.has(single.id)}
          onAsk={mayAct ? () => askSupport(single) : undefined}
          onCases={canCases ? () => nav('/intervention') : undefined}
          onRegistry={canRegistry ? () => nav('/oosc') : undefined}
          th={th}
          t={t}
          pn={pn}
          dn={dn}
          lang={lang}
        />
      ) : (
        <>
          {/* ── One number to act on + the shape of the whole scope ── */}
          <Card className="mb-4">
            <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
              <button
                type="button"
                onClick={() => toggleFocus('needs')}
                aria-pressed={focus === 'needs'}
                className="flex shrink-0 items-center gap-4 rounded-2xl px-1 text-left"
              >
                <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-risk-high/12 text-risk-high">
                  <IconUsers width={24} height={24} />
                  <motion.span
                    className="absolute inset-0 rounded-2xl ring-2 ring-risk-high/40"
                    animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </span>
                <span>
                  <span className="tabular block text-[40px] font-bold leading-none text-ink">
                    <AnimatedCounter value={stats.needs} />
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-ink">
                    {t('sch.needResource')}
                  </span>
                  <span className="block text-[11px] text-ink-muted">
                    {th
                      ? `จาก ${formatNumber(stats.total, lang)} โรงเรียนในขอบเขตของคุณ · กดเพื่อดูเฉพาะโรงเรียนกลุ่มนี้`
                      : `of ${formatNumber(stats.total, lang)} schools in your scope · tap to see just these`}
                  </span>
                </span>
              </button>

              <div className="hidden h-16 w-px shrink-0 bg-surface-border lg:block" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-semibold text-ink-muted">{t('sch.health')}</p>
                  <p className="text-[11px] text-ink-faint">
                    {t('common.dataQuality')}{' '}
                    <span className="tabular font-bold text-ink">{stats.dataQuality}</span> ·{' '}
                    {t('common.successRate')}{' '}
                    <span className="tabular font-bold text-ink">{stats.success}%</span>
                  </p>
                </div>
                <HealthTrack
                  total={stats.total}
                  parts={[
                    { key: 'needs', label: t('sch.needResource'), value: stats.needs, color: '#f97316' },
                    { key: 'lowData', label: t('sch.lowData'), value: stats.lowData, color: '#eab308' },
                    { key: 'lowSuccess', label: t('sch.lowSuccess'), value: stats.lowSuccess, color: '#a855f7' },
                    { key: 'ok', label: t('sch.ok'), value: stats.ok, color: '#16a34a' },
                  ]}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <MiniChip
                    icon={<IconShield width={12} height={12} />}
                    label={t('sch.lowData')}
                    value={stats.lowData}
                    active={focus === 'lowData'}
                    onClick={() => toggleFocus('lowData')}
                  />
                  <MiniChip
                    icon={<IconCheck width={12} height={12} />}
                    label={t('sch.lowSuccess')}
                    value={stats.lowSuccess}
                    active={focus === 'lowSuccess'}
                    onClick={() => toggleFocus('lowSuccess')}
                  />
                  <MiniChip
                    icon={<IconClock width={12} height={12} />}
                    label={t('common.openCases')}
                    value={stats.overdue}
                    active={false}
                    onClick={() =>
                      canCases
                        ? nav('/intervention')
                        : toast.push(th ? 'บทบาทของคุณไม่มีสิทธิ์เข้าหน้าการช่วยเหลือ' : 'Not available for your role')
                    }
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* ── The schools ── */}
          <Card>
            <CardHeader
              title={th ? 'โรงเรียนในขอบเขตของคุณ' : 'Schools in your scope'}
              subtitle={
                th
                  ? 'โรงเรียนที่ควรได้รับการสนับสนุนขึ้นก่อน — กดที่ชื่อเพื่อดูรายละเอียด'
                  : 'Schools needing support come first — open a name for detail'
              }
              action={
                <div className="inline-flex rounded-xl border border-surface-border bg-surface-muted p-1">
                  {(['list', 'grid'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        view === v ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {view === v && (
                        <motion.span
                          layoutId="sch-view"
                          className="absolute inset-0 rounded-lg bg-white shadow-sm"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        {v === 'list' ? (
                          <IconList width={15} height={15} />
                        ) : (
                          <IconGrid width={15} height={15} />
                        )}
                        {v === 'list' ? (th ? 'รายการ' : 'List') : th ? 'การ์ด' : 'Grid'}
                      </span>
                    </button>
                  ))}
                </div>
              }
            />

            <div className="flex flex-col gap-2.5 px-5 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[210px] flex-1">
                  <IconSearch
                    width={15}
                    height={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder={t('sch.search')}
                    aria-label={t('sch.search')}
                    className="w-full rounded-xl border border-surface-border bg-white py-2 pl-9 pr-8 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-brand-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label={th ? 'ล้างคำค้น' : 'Clear search'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:bg-surface-muted hover:text-ink"
                    >
                      <IconClose width={13} height={13} />
                    </button>
                  )}
                </div>
                {districtKeys.length > 1 && (
                  <Select
                    value={district}
                    onChange={(v) => {
                      setDistrict(v)
                      setPage(1)
                    }}
                    options={[
                      { value: 'all', label: t('geo.allDistricts') },
                      ...districtKeys.map((k) => ({ value: k, label: dn(k) })),
                    ]}
                    className="w-[160px]"
                  />
                )}
                <Segmented
                  size="sm"
                  value={rankBy}
                  onChange={(v) => setRankBy(v as RankKey)}
                  options={[
                    { value: 'dataQualityScore', label: t('common.dataQuality') },
                    { value: 'interventionSuccessRate', label: t('common.successRate') },
                    { value: 'responseHours', label: t('sch.responseTime') },
                    { value: 'highRiskStudents', label: t('kpi.highrisk') },
                  ]}
                />
              </div>

              {activeFilters > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex flex-wrap items-center gap-2 overflow-hidden text-[11px]"
                >
                  <span className="text-ink-muted">
                    {th
                      ? `พบ ${formatNumber(filtered.length, lang)} โรงเรียน`
                      : `${formatNumber(filtered.length, lang)} schools match`}
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="font-semibold text-ink-faint underline-offset-2 hover:text-brand-600 hover:underline"
                  >
                    {th ? 'ล้างตัวกรองทั้งหมด' : 'Clear all filters'}
                  </button>
                </motion.div>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-muted text-ink-faint">
                  <IconSchool width={24} height={24} />
                </span>
                <p className="text-sm font-semibold text-ink">
                  {th ? 'ไม่พบโรงเรียนที่ตรงกับตัวกรอง' : 'No schools match these filters'}
                </p>
                {activeFilters > 0 && (
                  <Button size="sm" variant="secondary" onClick={clearAll}>
                    {th ? 'ล้างตัวกรอง' : 'Clear filters'}
                  </Button>
                )}
              </div>
            ) : view === 'list' ? (
              // enter-only animation — see the StrictMode note in skill.md
              <div className="mt-1 flex flex-col divide-y divide-surface-border/70">
                {rows.map((s, i) => (
                  <SchoolRow
                    key={s.id}
                    s={s}
                    index={i}
                    rankBy={rankBy}
                    rankValue={rankValue(s)}
                    th={th}
                    t={t}
                    dn={dn}
                    lang={lang}
                    requested={requested.has(s.id)}
                    active={openId === s.id}
                    onOpen={() => setOpenId(s.id)}
                    onAsk={mayAct ? () => askSupport(s) : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((s, i) => (
                  <SchoolCard
                    key={s.id}
                    s={s}
                    index={i}
                    th={th}
                    t={t}
                    dn={dn}
                    lang={lang}
                    requested={requested.has(s.id)}
                    onOpen={() => setOpenId(s.id)}
                  />
                ))}
              </div>
            )}

            {filtered.length > 0 && (
              <Pager
                page={safePage}
                totalPages={totalPages}
                from={pageStart + 1}
                to={pageStart + rows.length}
                total={filtered.length}
                onPage={setPage}
                th={th}
              />
            )}
          </Card>

          {/* ── Secondary evidence ── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title={t('sch.rank')}
                subtitle={t('sch.rankHint')}
              />
              <div className="flex flex-col gap-2 px-5 pb-5 pt-3">
                {ranking.map((s, i) => {
                  const v = rankBy === 'responseHours' ? s.responseHours : (s[rankBy] as number)
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileHover={{ x: 2 }}
                      onClick={() => setOpenId(s.id)}
                      className="rounded-xl border border-surface-border px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="tabular grid h-5 w-5 shrink-0 place-items-center rounded-md bg-surface-muted text-[10px] font-bold text-ink-faint">
                            {i + 1}
                          </span>
                          <span className="truncate text-[13px] font-medium text-ink">{s.name}</span>
                        </span>
                        <span className="tabular shrink-0 text-xs font-bold text-ink">
                          {rankValue(s)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                          className="h-full rounded-full bg-brand-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(4, (v / rankMax) * 100)}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.08 + i * 0.04 }}
                        />
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </Card>

            <Card>
              <CardHeader
                title={th ? 'คุณภาพข้อมูล เทียบกับ อัตราช่วยสำเร็จ' : 'Data quality vs. success rate'}
                subtitle={
                  th
                    ? 'จุดล่างซ้ายคือโรงเรียนที่ควรเข้าไปก่อน · คลิกจุดเพื่อเปิดรายละเอียด'
                    : 'Bottom-left is where to go first · click a point to open it'
                }
              />
              <div className="px-2 pb-3">
                <Chart
                  type="scatter"
                  height={300}
                  series={[
                    {
                      name: th ? 'ทรัพยากรเพียงพอ' : 'Well resourced',
                      data: scoped.filter((s) => !s.needsResources).map((s) => ({
                        x: s.dataQualityScore,
                        y: s.interventionSuccessRate,
                      })),
                    },
                    {
                      name: t('sch.needResource'),
                      data: scoped.filter((s) => s.needsResources).map((s) => ({
                        x: s.dataQualityScore,
                        y: s.interventionSuccessRate,
                      })),
                    },
                  ]}
                  options={{
                    chart: {
                      type: 'scatter',
                      fontFamily: 'inherit',
                      toolbar: { show: false },
                      zoom: { enabled: false },
                      animations: { enabled: true, easing: 'easeinout', speed: 800 },
                      events: {
                        dataPointSelection: (_e, _c, opts) => {
                          const set =
                            opts?.seriesIndex === 1
                              ? scoped.filter((s) => s.needsResources)
                              : scoped.filter((s) => !s.needsResources)
                          const hit = set[opts?.dataPointIndex ?? -1]
                          if (hit) setOpenId(hit.id)
                        },
                      },
                    },
                    colors: ['#2f66f6', '#f97316'],
                    markers: { size: 8, strokeWidth: 2, strokeColors: '#ffffff', hover: { size: 12 } },
                    dataLabels: { enabled: false },
                    legend: {
                      position: 'top',
                      horizontalAlign: 'left',
                      fontSize: '11px',
                      markers: { shape: 'circle' as const },
                      itemMargin: { horizontal: 8 },
                    },
                    grid: { borderColor: '#eef1f6', strokeDashArray: 4 },
                    xaxis: {
                      type: 'numeric',
                      min: 55,
                      max: 100,
                      tickAmount: 5,
                      title: {
                        text: t('common.dataQuality'),
                        style: { fontSize: '11px', color: '#94a3b8', fontWeight: 500 },
                      },
                      labels: { style: { fontSize: '10px', colors: '#94a3b8' } },
                      axisBorder: { show: false },
                      axisTicks: { show: false },
                    },
                    yaxis: {
                      min: 40,
                      max: 100,
                      tickAmount: 4,
                      title: {
                        text: t('common.successRate'),
                        style: { fontSize: '11px', color: '#94a3b8', fontWeight: 500 },
                      },
                      labels: {
                        formatter: (v: number) => `${v.toFixed(0)}%`,
                        style: { fontSize: '10px', colors: '#94a3b8' },
                      },
                    },
                    annotations: {
                      xaxis: [
                        {
                          x: stats.dataQuality,
                          borderColor: '#cbd5e1',
                          strokeDashArray: 5,
                          label: {
                            text: th ? 'ค่าเฉลี่ย' : 'average',
                            position: 'top',
                            style: { fontSize: '9px', color: '#94a3b8', background: '#ffffff' },
                          },
                        },
                      ],
                      yaxis: [
                        {
                          y: stats.success,
                          borderColor: '#cbd5e1',
                          strokeDashArray: 5,
                          label: {
                            text: th ? 'ค่าเฉลี่ย' : 'average',
                            style: { fontSize: '9px', color: '#94a3b8', background: '#ffffff' },
                          },
                        },
                      ],
                    },
                  }}
                />
              </div>
            </Card>
          </div>
        </>
      )}

      <SchoolDrawer
        s={openSchool}
        closing={closing}
        onClose={closeDrawer}
        benchmark={benchmark}
        requested={openSchool ? requested.has(openSchool.id) : false}
        onAsk={mayAct ? () => openSchool && askSupport(openSchool) : undefined}
        onCases={
          canCases
            ? () => {
                closeDrawer()
                nav('/intervention')
              }
            : undefined
        }
        onRegistry={
          canRegistry
            ? () => {
                closeDrawer()
                nav('/oosc')
              }
            : undefined
        }
        th={th}
        t={t}
        pn={pn}
        dn={dn}
        lang={lang}
      />
    </div>
  )
}

/* ─────────────── single-school profile ─────────────── */

interface Benchmark {
  count: number
  dataQualityScore: number
  interventionSuccessRate: number
  responseHours: number
  riskShare: number
}

function SchoolProfile({
  s,
  benchmark,
  requested,
  onAsk,
  onCases,
  onRegistry,
  th,
  t,
  pn,
  dn,
  lang,
}: {
  s: School
  benchmark: Benchmark
  requested: boolean
  onAsk?: () => void
  onCases?: () => void
  onRegistry?: () => void
  th: boolean
  t: (k: string) => string
  pn: (k: string) => string
  dn: (k: string) => string
  lang: 'th' | 'en' | 'ms'
}) {
  const riskShare = Math.round((s.highRiskStudents / Math.max(1, s.totalStudents)) * 1000) / 10
  /** what this school should do next, derived from its own numbers */
  const todo = [
    s.overdueCases > 0 && {
      key: 'overdue',
      tone: '#dc2626',
      text: th
        ? `มีเคสค้างเกินกำหนด ${s.overdueCases} เคส — ตามให้จบก่อนเรื่องอื่น`
        : `${s.overdueCases} cases past their SLA — clear these first`,
      cta: onCases ? { label: t('sch.viewCases'), fn: onCases } : undefined,
    },
    s.dataQualityScore < LOW_DATA && {
      key: 'data',
      tone: '#eab308',
      text: th
        ? `คุณภาพข้อมูล ${s.dataQualityScore} คะแนน ต่ำกว่าค่าเฉลี่ย ${benchmark.dataQualityScore} — ข้อมูลที่ขาดทำให้ระบบมองไม่เห็นเด็กบางคน`
        : `Data quality ${s.dataQualityScore} is below the ${benchmark.dataQualityScore} average — gaps hide children from the system`,
    },
    s.interventionSuccessRate < benchmark.interventionSuccessRate && {
      key: 'success',
      tone: '#a855f7',
      text: th
        ? `อัตราช่วยสำเร็จ ${s.interventionSuccessRate}% ต่ำกว่าค่าเฉลี่ย ${benchmark.interventionSuccessRate}% — ลองทบทวนแผนที่ค้างนาน`
        : `Success rate ${s.interventionSuccessRate}% trails the ${benchmark.interventionSuccessRate}% average`,
    },
    s.needsResources && {
      key: 'resource',
      tone: '#f97316',
      text: th
        ? 'โรงเรียนนี้ถูกทำเครื่องหมายว่าต้องการทรัพยากรเพิ่ม'
        : 'This school is flagged as needing more resources',
      cta: onAsk
        ? { label: requested ? t('sch.supportAsked') : t('sch.askSupport'), fn: onAsk }
        : undefined,
    },
  ].filter(Boolean) as { key: string; tone: string; text: string; cta?: { label: string; fn: () => void } }[]

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/12 text-brand-600">
              <IconSchool width={26} height={26} />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight text-ink">{s.name}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {dn(s.districtKey)} · {pn(s.provinceKey)}
                {s.sesao ? ` · ${s.sesao}` : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                  {formatNumber(s.totalStudents, lang)} {t('common.students')}
                </span>
                <span className="rounded-full bg-risk-high/12 px-2 py-0.5 text-[11px] font-semibold text-risk-high">
                  {formatNumber(s.highRiskStudents, lang)} {t('kpi.highrisk')} ({riskShare}%)
                </span>
                {s.needsResources && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    <IconAlert width={11} height={11} />
                    {t('sch.needResource')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="hidden h-16 w-px shrink-0 bg-surface-border lg:block" />

          {/* three numbers, each against the pilot-school average */}
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
            <Benchmarked
              label={t('common.dataQuality')}
              value={s.dataQualityScore}
              avg={benchmark.dataQualityScore}
              max={100}
              suffix=""
              higherIsBetter
              avgLabel={t('sch.areaAvg')}
            />
            <Benchmarked
              label={t('common.successRate')}
              value={s.interventionSuccessRate}
              avg={benchmark.interventionSuccessRate}
              max={100}
              suffix="%"
              higherIsBetter
              avgLabel={t('sch.areaAvg')}
            />
            <Benchmarked
              label={t('sch.responseTime')}
              value={s.responseHours}
              avg={benchmark.responseHours}
              max={Math.max(s.responseHours, benchmark.responseHours) * 1.3}
              suffix={` ${t('sch.hours')}`}
              higherIsBetter={false}
              avgLabel={t('sch.areaAvg')}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('sch.whatToDo')}
            subtitle={
              th
                ? 'อ่านจากตัวเลขของโรงเรียนคุณเอง เทียบกับ 46 โรงเรียนนำร่อง'
                : `Read from your own numbers against the ${benchmark.count} pilot schools`
            }
          />
          <div className="flex flex-col gap-2 px-5 pb-5 pt-3">
            {todo.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-risk-normal/10 text-risk-normal">
                  <IconCheck width={22} height={22} />
                </span>
                <p className="text-sm font-semibold text-ink">
                  {th ? 'ทุกตัวชี้วัดอยู่เหนือค่าเฉลี่ย' : 'Every measure is above average'}
                </p>
              </div>
            ) : (
              todo.map((item, i) => (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-start gap-2.5 rounded-xl border border-surface-border px-3 py-2.5"
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: item.tone }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-ink">{item.text}</p>
                    {item.cta && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        icon={<IconArrowRight width={13} height={13} />}
                        onClick={item.cta.fn}
                      >
                        {item.cta.label}
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={th ? 'งานที่เปิดอยู่ในโรงเรียน' : 'Open work in this school'}
            subtitle={
              th ? 'ตัวเลขจากเคสจริงที่ผูกกับโรงเรียนนี้' : 'From the cases attached to this school'
            }
          />
          <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-3">
            <Fact k={t('common.openCases')} v={formatNumber(s.openCases, lang)} />
            <Fact k={t('common.overdue')} v={formatNumber(s.overdueCases, lang)} warn={s.overdueCases > 0} />
            <Fact k={t('kpi.highrisk')} v={formatNumber(s.highRiskStudents, lang)} />
            <Fact k={th ? 'ลดความเสี่ยงได้' : 'Risk reduction'} v={`${s.riskReduction}%`} />
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {onCases && (
              <Button
                size="sm"
                variant="secondary"
                icon={<IconArrowRight width={13} height={13} />}
                onClick={onCases}
              >
                {t('sch.viewCases')}
              </Button>
            )}
            {onRegistry && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconArrowRight width={13} height={13} />}
                onClick={onRegistry}
              >
                {t('sch.viewRegistry')}
              </Button>
            )}
            {onAsk && (
              <Button
                size="sm"
                variant={requested ? 'ghost' : 'primary'}
                icon={requested ? <IconCheck width={13} height={13} /> : undefined}
                onClick={onAsk}
              >
                {requested ? t('sch.supportAsked') : t('sch.askSupport')}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

function Benchmarked({
  label,
  value,
  avg,
  max,
  suffix,
  higherIsBetter,
  avgLabel,
}: {
  label: string
  value: number
  avg: number
  max: number
  suffix: string
  higherIsBetter: boolean
  avgLabel: string
}) {
  const better = higherIsBetter ? value >= avg : value <= avg
  const pct = Math.min(100, (value / Math.max(1, max)) * 100)
  const avgPct = Math.min(100, (avg / Math.max(1, max)) * 100)
  return (
    <div className="rounded-xl border border-surface-border px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <p
        className="tabular mt-0.5 text-[24px] font-bold leading-none"
        style={{ color: better ? '#16a34a' : '#f97316' }}
      >
        {value}
        {suffix}
      </p>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <motion.div
          className="h-full rounded-full"
          style={{ background: better ? '#16a34a' : '#f97316' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
        <span
          className="absolute inset-y-0 w-0.5 bg-ink/50"
          style={{ left: `${avgPct}%` }}
          title={avgLabel}
        />
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">
        {avgLabel} {avg}
        {suffix}
      </p>
    </div>
  )
}

/* ─────────────── shared pieces ─────────────── */

function HealthTrack({
  total,
  parts,
}: {
  total: number
  parts: { key: string; label: string; value: number; color: string }[]
}) {
  return (
    <div className="mt-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted">
        {parts.map((p, i) => (
          <motion.div
            key={p.key}
            style={{ backgroundColor: p.color }}
            initial={{ width: 0 }}
            animate={{ width: `${total ? (p.value / total) * 100 : 0}%` }}
            transition={{ duration: 0.75, ease: 'easeOut', delay: i * 0.07 }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.label}
            <span className="tabular font-semibold text-ink">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function MiniChip({
  icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number
  active: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'border-brand-400 bg-brand-50 text-brand-700'
          : 'border-surface-border text-ink-muted hover:bg-surface-muted'
      }`}
    >
      {icon}
      {label}
      <span className="tabular font-bold text-ink">{value}</span>
    </motion.button>
  )
}

function Fact({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-surface-border px-3 py-2">
      <p className="text-[10px] text-ink-faint">{k}</p>
      <p className={`tabular mt-0.5 text-[15px] font-bold ${warn ? 'text-risk-critical' : 'text-ink'}`}>
        {v}
      </p>
    </div>
  )
}

function SchoolRow({
  s,
  index,
  rankBy,
  rankValue,
  th,
  t,
  dn,
  lang,
  requested,
  active,
  onOpen,
  onAsk,
}: {
  s: School
  index: number
  rankBy: RankKey
  rankValue: string
  th: boolean
  t: (k: string) => string
  dn: (k: string) => string
  lang: 'th' | 'en' | 'ms'
  requested: boolean
  active: boolean
  onOpen: () => void
  onAsk?: () => void
}) {
  const h = healthOf(s)
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.28 }}
      className={`group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-500/[0.04] ${
        active ? 'bg-brand-50/70' : ''
      }`}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-ink">{s.name}</span>
          {h === 'needs' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <IconAlert width={10} height={10} />
              {t('sch.needResource')}
            </span>
          )}
          {h === 'lowData' && (
            <span className="rounded-full bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700">
              {t('sch.lowData')}
            </span>
          )}
          {s.overdueCases > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-risk-critical/10 px-1.5 py-0.5 text-[10px] font-semibold text-risk-critical">
              <IconClock width={10} height={10} />
              {s.overdueCases}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
          {dn(s.districtKey)} · {formatNumber(s.totalStudents, lang)} {t('common.students')} ·{' '}
          {t('kpi.highrisk')} {formatNumber(s.highRiskStudents, lang)} · {t('common.successRate')}{' '}
          {s.interventionSuccessRate}%
        </span>
      </button>

      <span className="hidden w-24 shrink-0 text-right sm:block">
        <span className="tabular block text-sm font-bold text-ink">{rankValue}</span>
        <span className="block text-[10px] text-ink-faint">
          {rankBy === 'dataQualityScore'
            ? t('common.dataQuality')
            : rankBy === 'interventionSuccessRate'
              ? t('common.successRate')
              : rankBy === 'responseHours'
                ? t('sch.responseTime')
                : t('kpi.highrisk')}
        </span>
      </span>

      {onAsk && s.needsResources && (
        <Button size="sm" variant={requested ? 'ghost' : 'secondary'} onClick={onAsk}>
          {requested ? t('sch.supportAsked') : t('sch.askSupport')}
        </Button>
      )}

      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('sch.openSchool')} ${s.name}`}
        className="shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:bg-white hover:text-brand-600"
      >
        <IconChevronRight width={18} height={18} />
      </button>
    </motion.div>
  )
}

function SchoolCard({
  s,
  index,
  th,
  t,
  dn,
  lang,
  requested,
  onOpen,
}: {
  s: School
  index: number
  th: boolean
  t: (k: string) => string
  dn: (k: string) => string
  lang: 'th' | 'en' | 'ms'
  requested: boolean
  onOpen: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.3 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      className="group rounded-xl border border-surface-border bg-white p-3.5 text-left transition-shadow hover:border-brand-200 hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
          <span className="block truncate text-[11px] text-ink-muted">{dn(s.districtKey)}</span>
        </span>
        {s.needsResources ? (
          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {requested ? t('sch.supportAsked') : t('sch.needResource')}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-risk-normal/12 px-2 py-0.5 text-[10px] font-semibold text-risk-normal">
            OK
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-[11px] text-ink-muted">{t('common.dataQuality')}</span>
        <span className="tabular text-base font-bold leading-none text-brand-600">
          {s.dataQualityScore}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full rounded-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${s.dataQualityScore}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <MiniStat label={t('common.students')} value={formatNumber(s.totalStudents, lang)} />
        <MiniStat label={t('kpi.highrisk')} value={formatNumber(s.highRiskStudents, lang)} tone="high" />
        <MiniStat label={t('common.successRate')} value={`${s.interventionSuccessRate}%`} tone="green" />
      </div>
      <p className="mt-2 text-right text-[11px] font-semibold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
        {t('sch.openSchool')} →
      </p>
    </motion.button>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'green' | 'high'
}) {
  const toneClass =
    tone === 'green' ? 'text-risk-normal' : tone === 'high' ? 'text-risk-high' : 'text-ink'
  return (
    <div className="rounded-lg bg-surface-muted px-1.5 py-1.5">
      <p className={`tabular text-sm font-bold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-ink-faint">{label}</p>
    </div>
  )
}

function SchoolDrawer({
  s,
  closing,
  onClose,
  benchmark,
  requested,
  onAsk,
  onCases,
  onRegistry,
  th,
  t,
  pn,
  dn,
  lang,
}: {
  s: School | null
  closing: boolean
  onClose: () => void
  benchmark: Benchmark
  requested: boolean
  onAsk?: () => void
  onCases?: () => void
  onRegistry?: () => void
  th: boolean
  t: (k: string) => string
  pn: (k: string) => string
  dn: (k: string) => string
  lang: 'th' | 'en' | 'ms'
}) {
  useEffect(() => {
    if (!s) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [s, onClose])

  if (!s) return null
  const riskShare = Math.round((s.highRiskStudents / Math.max(1, s.totalStudents)) * 1000) / 10

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        className="absolute inset-0 bg-brand-950/35 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={s.name}
        className="relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto bg-white shadow-2xl"
        initial={{ x: '100%' }}
        animate={{ x: closing ? '100%' : 0 }}
        transition={
          closing ? { duration: 0.22, ease: 'easeIn' } : { type: 'spring', stiffness: 320, damping: 34 }
        }
      >
        <div className="sticky top-0 z-10 border-b border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-ink">{s.name}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {dn(s.districtKey)} · {pn(s.provinceKey)}
                {s.sesao ? ` · ${s.sesao}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={th ? 'ปิด' : 'Close'}
              className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <IconClose width={18} height={18} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
              {formatNumber(s.totalStudents, lang)} {t('common.students')}
            </span>
            <span className="rounded-full bg-risk-high/12 px-2 py-0.5 text-[11px] font-semibold text-risk-high">
              {t('kpi.highrisk')} {formatNumber(s.highRiskStudents, lang)} ({riskShare}%)
            </span>
            {s.needsResources && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {t('sch.needResource')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Benchmarked
              label={t('common.dataQuality')}
              value={s.dataQualityScore}
              avg={benchmark.dataQualityScore}
              max={100}
              suffix=""
              higherIsBetter
              avgLabel={t('sch.areaAvg')}
            />
            <Benchmarked
              label={t('common.successRate')}
              value={s.interventionSuccessRate}
              avg={benchmark.interventionSuccessRate}
              max={100}
              suffix="%"
              higherIsBetter
              avgLabel={t('sch.areaAvg')}
            />
            <Benchmarked
              label={t('sch.responseTime')}
              value={s.responseHours}
              avg={benchmark.responseHours}
              max={Math.max(s.responseHours, benchmark.responseHours) * 1.3}
              suffix={` ${t('sch.hours')}`}
              higherIsBetter={false}
              avgLabel={t('sch.areaAvg')}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Fact k={t('common.openCases')} v={formatNumber(s.openCases, lang)} />
            <Fact
              k={t('common.overdue')}
              v={formatNumber(s.overdueCases, lang)}
              warn={s.overdueCases > 0}
            />
            <Fact k={th ? 'ลดความเสี่ยงได้' : 'Risk reduction'} v={`${s.riskReduction}%`} />
            <Fact k={th ? 'สังกัด' : 'Sector'} v={t(`sector.${s.sector}`)} />
          </div>
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
          {onAsk && (
            <Button
              variant={requested ? 'secondary' : 'primary'}
              icon={requested ? <IconCheck width={14} height={14} /> : <IconUsers width={14} height={14} />}
              onClick={onAsk}
            >
              {requested ? t('sch.supportAsked') : t('sch.askSupport')}
            </Button>
          )}
          <div className="flex gap-2">
            {onCases && (
              <Button variant="secondary" className="flex-1" onClick={onCases}>
                {t('sch.viewCases')}
              </Button>
            )}
            {onRegistry && (
              <Button variant="secondary" className="flex-1" onClick={onRegistry}>
                {t('sch.viewRegistry')}
              </Button>
            )}
          </div>
        </div>
      </motion.aside>
    </div>
  )
}

function Pager({
  page,
  totalPages,
  from,
  to,
  total,
  onPage,
  th,
}: {
  page: number
  totalPages: number
  from: number
  to: number
  total: number
  onPage: (p: number) => void
  th: boolean
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-border px-5 py-3">
      <p className="text-xs text-ink-muted">
        {th ? `แสดง ${from}–${to} จาก ${total} โรงเรียน` : `Showing ${from}–${to} of ${total}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <PagerButton
            disabled={page === 1}
            onClick={() => onPage(page - 1)}
            ariaLabel={th ? 'หน้าก่อนหน้า' : 'Previous page'}
          >
            <IconChevronLeft width={16} height={16} />
          </PagerButton>
          <span className="tabular px-2 text-xs font-semibold text-ink">
            {page} / {totalPages}
          </span>
          <PagerButton
            disabled={page === totalPages}
            onClick={() => onPage(page + 1)}
            ariaLabel={th ? 'หน้าถัดไป' : 'Next page'}
          >
            <IconChevronRight width={16} height={16} />
          </PagerButton>
        </div>
      )}
    </div>
  )
}

function PagerButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-surface-border bg-white text-ink-muted transition-colors hover:border-brand-200 hover:text-brand-600 ${
        disabled ? 'cursor-not-allowed opacity-40 hover:border-surface-border hover:text-ink-muted' : ''
      }`}
    >
      {children}
    </motion.button>
  )
}
