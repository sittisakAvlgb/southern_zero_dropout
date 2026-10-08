import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import Chart from 'react-apexcharts'
import type { ChildStatus, OoscRecord, OoscSource } from '@/types'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { canWorkCases } from '@/auth/roles'
import { DirectOnlyNotice } from '@/components/auth/DirectOnlyNotice'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Segmented } from '@/components/ui/Segmented'
import { Button } from '@/components/ui/Button'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { useToast } from '@/components/ui/Toast'
import { formatNumber, formatPct } from '@/lib/format'
import { DISTRICT_BY_KEY as DISTRICT_GEO } from '@/data/geo'
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconConsent,
  IconPathway,
  IconRegistry,
  IconSearch,
  IconUser,
} from '@/components/icons'

const STATUS_COLOR: Record<ChildStatus, string> = {
  inSchool: '#16a34a',
  atRisk: '#eab308',
  outOfSchool: '#dc2626',
  reengaging: '#f97316',
  returned: '#16a34a',
  working: '#0ea5e9',
  unreachable: '#64748b',
}

const SOURCE_COLOR: Record<OoscSource, string> = {
  schoolReport: '#2f66f6',
  tambonSurvey: '#14b8a6',
  civilSurvey: '#f59e0b',
  religiousLeader: '#10b981',
  healthRecord: '#0ea5e9',
  civilRegistry: '#8b5cf6',
  hotline: '#ec4899',
}

/** a child the registry still owes work to */
const isOpen = (r: OoscRecord) => r.status !== 'returned' && r.status !== 'working'

type Focus = 'none' | 'needVisit' | 'unassigned' | 'consentPending' | 'noPlan'

const PAGE_SIZE = 10

export default function OoscRegistry() {
  const { t, lang, pn, dn, tn } = useI18n()
  const th = lang === 'th'
  const { oosc, schools, user } = useScopedData()
  const { push } = useToast()

  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('all')
  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [minConfidence, setMinConfidence] = useState(0)
  const [focus, setFocus] = useState<Focus>('none')
  const [view, setView] = useState<'queue' | 'all'>('queue')
  const [page, setPage] = useState(1)
  // The drawer manages its own exit: AnimatePresence cannot be trusted here
  // (StrictMode leaves the exiting child — and its click-swallowing backdrop —
  // mounted forever), so closing is a state we animate to and then unmount.
  const [openId, setOpenId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const closeDrawer = () => {
    setClosing(true)
    window.setTimeout(() => {
      setOpenId(null)
      setClosing(false)
    }, 240)
  }

  // Work done in this session, layered over the read-only mock records so an
  // action visibly changes the queue instead of only firing a toast.
  const [visited, setVisited] = useState<Set<string>>(() => new Set())
  const [assigned, setAssigned] = useState<Record<string, string>>({})

  const decorate = (r: OoscRecord): OoscRecord => ({
    ...r,
    verified: r.verified || visited.has(r.id),
    ownerName: r.ownerName ?? assigned[r.id] ?? null,
  })

  const records = useMemo(
    () => oosc.map(decorate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oosc, visited, assigned],
  )

  // Controls only exist when they can change something: a school director's
  // registry sits in one district, so an "all districts" select there is a
  // control that cannot filter.
  const districtKeys = useMemo(
    () => Array.from(new Set(records.map((r) => r.districtKey))),
    [records],
  )
  const sourceKeys = useMemo(
    () => Array.from(new Set(records.map((r) => r.source))),
    [records],
  )

  /** Inside a single district the "which district" select has one option, so
   *  the tambon takes its place — that is the unit a school actually works in.
   *
   *  The registry stays district-wide, and opens that way. A child who is out
   *  of school belongs to no school's catchment, and returners are placed
   *  across the whole อำเภอ, so a tambon default would both hide the pool a
   *  director is asked to take from and land them on a smaller number than the
   *  dashboard card they clicked. The tambon is a lens, not a fence — the one
   *  the school sits in is named in the list so it is easy to find. */
  const tambonKeys = useMemo(
    () => Array.from(new Set(records.map((r) => r.tambonKey))).sort(),
    [records],
  )
  // only a director or a teacher has a school whose tambon means anything —
  // for anyone else schools[0] is just the first row in scope
  const homeTambon =
    user?.role === 'school' || user?.role === 'teacher' ? schools[0]?.tambonKey : undefined
  const [tambon, setTambon] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inFocus = (r: OoscRecord) => {
      switch (focus) {
        case 'needVisit':
          return !r.verified && isOpen(r)
        case 'unassigned':
          return !r.ownerName && isOpen(r)
        case 'consentPending':
          return r.consent !== 'granted'
        case 'noPlan':
          return !r.planId && isOpen(r)
        default:
          return true
      }
    }
    return records.filter(
      (r) =>
        (district === 'all' || r.districtKey === district) &&
        (tambon === 'all' || r.tambonKey === tambon) &&
        (status === 'all' || r.status === status) &&
        (source === 'all' || r.source === source) &&
        r.matchConfidence >= minConfidence &&
        (!q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) &&
        inFocus(r),
    )
  }, [records, district, tambon, status, source, minConfidence, query, focus])

  /** headline counts follow the area filter only — they are what you click *from* */
  const stats = useMemo(() => {
    const base = records.filter(
      (r) =>
        (district === 'all' || r.districtKey === district) &&
        (tambon === 'all' || r.tambonKey === tambon),
    )
    const count = (p: (r: OoscRecord) => boolean) => base.filter(p).length
    return {
      total: base.length,
      needVisit: count((r) => !r.verified && isOpen(r)),
      unassigned: count((r) => !r.ownerName && isOpen(r)),
      consentPending: count((r) => r.consent !== 'granted'),
      verified: count((r) => r.verified),
      withPlan: count((r) => Boolean(r.planId)),
      outcome: count((r) => r.status === 'returned' || r.status === 'working'),
    }
  }, [records, district, tambon])

  const queue = useMemo(
    () =>
      [...filtered]
        .filter((r) => !r.verified && isOpen(r))
        .sort((a, b) => b.matchConfidence - a.matchConfidence),
    [filtered],
  )

  const rowsAll = view === 'queue' ? queue : filtered
  const totalPages = Math.max(1, Math.ceil(rowsAll.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])
  const pageStart = (safePage - 1) * PAGE_SIZE
  const rows = rowsAll.slice(pageStart, pageStart + PAGE_SIZE)

  const openRecord = openId ? records.find((r) => r.id === openId) ?? null : null

  const toggleFocus = (f: Focus, target: 'queue' | 'all') => {
    const next = focus === f ? 'none' : f
    setFocus(next)
    if (next !== 'none') setView(target)
    setPage(1)
  }

  const channels = useMemo(() => {
    const base = records.filter(
      (r) =>
        (district === 'all' || r.districtKey === district) &&
        (tambon === 'all' || r.tambonKey === tambon),
    )
    return sourceKeys
      .map((s) => {
        const rs = base.filter((r) => r.source === s)
        return {
          source: s,
          label: t(`source.${s}`),
          verified: rs.filter((r) => r.verified).length,
          pending: rs.filter((r) => !r.verified).length,
          total: rs.length,
        }
      })
      .filter((c) => c.total > 0)
      .sort((a, b) => a.total - b.total) // Apex draws the first category at the bottom
  }, [records, district, tambon, sourceKeys, t])

  const activeFilters =
    (query.trim() ? 1 : 0) +
    (district !== 'all' ? 1 : 0) +
    (tambon !== 'all' ? 1 : 0) +
    (status !== 'all' ? 1 : 0) +
    (source !== 'all' ? 1 : 0) +
    (minConfidence > 0 ? 1 : 0) +
    (focus !== 'none' ? 1 : 0)

  const clearAll = () => {
    setQuery('')
    setDistrict('all')
    setTambon('all')
    setStatus('all')
    setSource('all')
    setMinConfidence(0)
    setFocus('none')
    setPage(1)
  }

  const focusLabel: Record<Exclude<Focus, 'none'>, string> = {
    needVisit: t('oosc.needVisit'),
    unassigned: t('oosc.unassigned'),
    consentPending: t('oosc.consentPending'),
    noPlan: t('oosc.noPlan'),
  }

  /** Refused in one place rather than by hiding a dozen buttons — a hidden
   *  control cannot explain itself, and a reviewer cannot tell a withheld
   *  feature from a missing one. See `canWorkCases()`. */
  const mayAct = canWorkCases(user)
  const refuse = () => push(th ? 'บัญชีระดับกำกับดูแลดูข้อมูลได้ แต่ไม่ลงมือกับเคสรายบุคคล' : 'A supervising account can read this, but not act on an individual case')

  const openPlan = (r: OoscRecord) =>
    !mayAct
      ? refuse()
      : push(
      r.planId
        ? th
          ? `เปิดแผนโอกาสของ ${r.name}`
          : `Opening plan for ${r.name}`
        : th
          ? `สร้างแผนโอกาสให้ ${r.name} แล้ว`
          : `Opportunity plan created for ${r.name}`,
    )

  const assign = (r: OoscRecord) => {
    if (!mayAct) return refuse()
    const owner = user?.name ?? (th ? 'ผู้ใช้งานปัจจุบัน' : 'Current user')
    setAssigned((a) => ({ ...a, [r.id]: owner }))
    push(th ? `มอบหมาย ${r.name} ให้ ${owner} แล้ว` : `${r.name} assigned to ${owner}`)
  }

  /** marking a visit removes the child from the field queue — with an exit
   *  animation, so the list visibly gets shorter as work gets done */
  const markVisited = (r: OoscRecord) => {
    if (!mayAct) return refuse()
    setVisited((v) => new Set(v).add(r.id))
    push(th ? `บันทึกการลงพื้นที่ของ ${r.name} แล้ว` : `Field visit recorded for ${r.name}`)
  }

  return (
    <div className="animate-page-rise">
      <DirectOnlyNotice />
      <PageHeader
        icon={<IconRegistry width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.oosc')]} />}
        title={t('oosc.title')}
        subtitle={t('oosc.subtitle')}
      />

      {/* ── One focal number, then the registry's progress as a single bar ──
          Two side-by-side panels of numbers gave the eye nowhere to land. */}
      <Card className="mb-4">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => toggleFocus('needVisit', 'queue')}
            aria-pressed={focus === 'needVisit'}
            className="group flex shrink-0 items-center gap-4 rounded-2xl px-1 text-left"
          >
            <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-risk-high/12 text-risk-high">
              <IconAlert width={24} height={24} />
              <motion.span
                className="absolute inset-0 rounded-2xl ring-2 ring-risk-high/40"
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </span>
            <span>
              <span className="tabular block text-[40px] font-bold leading-none text-ink">
                <AnimatedCounter value={stats.needVisit} />
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink">
                {t('oosc.needVisit')}
              </span>
              <span className="block text-[11px] text-ink-muted">
                {th
                  ? `จากเด็ก ${formatNumber(stats.total, lang)} คนที่ทะเบียนนี้รู้จักแล้ว · กดเพื่อดูคิว`
                  : `of ${formatNumber(stats.total, lang)} children on record · tap to see the queue`}
              </span>
            </span>
          </button>

          <div className="hidden h-16 w-px shrink-0 bg-surface-border lg:block" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold text-ink-muted">
                {th ? 'เด็กเดินมาถึงไหนแล้ว' : 'How far the children have got'}
              </p>
              <p className="text-[11px] text-ink-faint">
                {th
                  ? `ยืนยันแล้ว ${stats.verified} · มีแผน ${stats.withPlan} · สำเร็จ ${stats.outcome}`
                  : `verified ${stats.verified} · planned ${stats.withPlan} · succeeded ${stats.outcome}`}
              </p>
            </div>
            <ProgressTrack
              total={stats.total}
              steps={[
                { label: t('oosc.verified'), value: stats.verified, color: '#2f66f6' },
                {
                  label: th ? 'มีแผนโอกาส' : 'Has a plan',
                  value: stats.withPlan,
                  color: '#14b8a6',
                },
                {
                  label: th ? 'กลับเข้าเรียน / มีอาชีพ' : 'Back in learning or work',
                  value: stats.outcome,
                  color: '#16a34a',
                },
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <MiniChip
                icon={<IconUser width={12} height={12} />}
                label={t('oosc.unassigned')}
                value={stats.unassigned}
                active={focus === 'unassigned'}
                onClick={() => toggleFocus('unassigned', 'all')}
              />
              <MiniChip
                icon={<IconConsent width={12} height={12} />}
                label={t('oosc.consentPending')}
                value={stats.consentPending}
                active={focus === 'consentPending'}
                onClick={() => toggleFocus('consentPending', 'all')}
              />
              <MiniChip
                icon={<IconPathway width={12} height={12} />}
                label={t('oosc.noPlan')}
                value={stats.total - stats.withPlan}
                active={focus === 'noPlan'}
                onClick={() => toggleFocus('noPlan', 'all')}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── The work list gets the whole width ── */}
      <Card>
        <CardHeader
          title={view === 'queue' ? t('oosc.priorityQueue') : t('oosc.registry')}
          subtitle={view === 'queue' ? t('oosc.priorityHint') : t('common.restricted')}
          action={
            <Segmented
              size="sm"
              value={view}
              onChange={(v) => {
                setView(v as 'queue' | 'all')
                setPage(1)
              }}
              options={[
                { value: 'queue', label: th ? 'คิวลงพื้นที่' : 'Field queue' },
                { value: 'all', label: th ? 'ทั้งหมด' : 'All' },
              ]}
            />
          }
        />

        <div className="flex flex-col gap-2.5 px-5 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
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
                placeholder={t('oosc.search')}
                aria-label={t('oosc.search')}
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

            {/* the slider: "only show me records worth a trip" */}
            <ConfidenceSlider
              value={minConfidence}
              onChange={(v) => {
                setMinConfidence(v)
                setPage(1)
              }}
              th={th}
              label={t('oosc.confidence')}
            />

            {districtKeys.length > 1 ? (
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
                className="w-[148px]"
              />
            ) : (
              tambonKeys.length > 1 && (
                <Select
                  value={tambon}
                  onChange={(v) => {
                    setTambon(v)
                    setPage(1)
                  }}
                  /* the widening option names the district and its size, so
                     stepping out of the neighbourhood is a stated choice */
                  options={[
                    {
                      value: 'all',
                      label: `${th ? 'ทั้ง' : 'All of '}${dn(districtKeys[0] ?? '')} (${records.length})`,
                    },
                    ...tambonKeys.map((k) => ({
                      value: k,
                      label: `${tn(k)}${
                        k === homeTambon ? (th ? ' · ที่ตั้งโรงเรียน' : ' · your school') : ''
                      } (${records.filter((r) => r.tambonKey === k).length})`,
                    })),
                  ]}
                  className="w-[190px]"
                />
              )
            )}
            <Select
              value={status}
              onChange={(v) => {
                setStatus(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: th ? 'ทุกสถานะ' : 'All statuses' },
                ...(['outOfSchool', 'reengaging', 'returned', 'working', 'unreachable'] as ChildStatus[]).map(
                  (s) => ({ value: s, label: t(`status.${s}`) }),
                ),
              ]}
              className="w-[148px]"
            />
            <Select
              value={source}
              onChange={(v) => {
                setSource(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: th ? 'ทุกช่องทาง' : 'All channels' },
                ...sourceKeys.map((s) => ({ value: s, label: t(`source.${s}`) })),
              ]}
              className="w-[165px]"
            />
          </div>

          {/* enter-only: an exiting child can get stuck under StrictMode */}
          {activeFilters > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex flex-wrap items-center gap-2 overflow-hidden text-[11px]"
              >
                {focus !== 'none' && (
                  <motion.button
                    type="button"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => setFocus('none')}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                  >
                    {focusLabel[focus]}
                    <IconClose width={11} height={11} />
                  </motion.button>
                )}
                <span className="text-ink-muted">
                  {th
                    ? `พบ ${formatNumber(rowsAll.length, lang)} คน`
                    : `${formatNumber(rowsAll.length, lang)} children match`}
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
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-risk-normal/10 text-risk-normal">
              <IconCheck width={24} height={24} />
            </span>
            <p className="text-sm font-semibold text-ink">
              {view === 'queue' && activeFilters === 0
                ? th
                  ? 'ยืนยันตัวตนครบทุกคนแล้ว'
                  : 'Every child here has been verified'
                : th
                  ? 'ไม่พบเด็กที่ตรงกับตัวกรอง'
                  : 'No children match these filters'}
            </p>
            {activeFilters > 0 && (
              <Button size="sm" variant="secondary" onClick={clearAll}>
                {th ? 'ล้างตัวกรอง' : 'Clear filters'}
              </Button>
            )}
          </div>
        ) : (
          // No AnimatePresence around these rows on purpose: under
          // React.StrictMode an exiting child can stay mounted forever, and a
          // row that will not leave after you finish its work is worse than no
          // exit animation at all.
          <div className="mt-1 flex flex-col divide-y divide-surface-border/70">
            {rows.map((r, i) => (
              <ChildRow
                key={r.id}
                r={r}
                rank={view === 'queue' ? pageStart + i + 1 : undefined}
                index={i}
                th={th}
                t={t}
                tn={tn}
                dn={dn}
                active={openId === r.id}
                onOpen={() => setOpenId(r.id)}
              />
            ))}
          </div>
        )}

        {rowsAll.length > 0 && (
          <Pager
            page={safePage}
            totalPages={totalPages}
            from={pageStart + 1}
            to={pageStart + rows.length}
            total={rowsAll.length}
            onPage={setPage}
            th={th}
          />
        )}
      </Card>

      {/* ── Secondary evidence, below the work ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('oosc.sourceMix')} subtitle={t('oosc.sourceMixHint')} />
          <div className="px-2 pb-1 pt-1">
            <Chart
              type="bar"
              height={280}
              series={[
                { name: t('oosc.verified'), data: channels.map((c) => c.verified) },
                { name: t('oosc.unverified'), data: channels.map((c) => c.pending) },
              ]}
              options={{
                chart: {
                  type: 'bar',
                  stacked: true,
                  fontFamily: 'inherit',
                  toolbar: { show: false },
                  animations: { enabled: true, easing: 'easeinout', speed: 800 },
                  events: {
                    dataPointSelection: (_e, _c, opts) => {
                      const hit = channels[opts?.dataPointIndex ?? -1]
                      if (hit) {
                        setSource(source === hit.source ? 'all' : hit.source)
                        setPage(1)
                      }
                    },
                  },
                },
                plotOptions: { bar: { horizontal: true, barHeight: '62%', borderRadius: 4 } },
                colors: ['#2f66f6', '#fcd9a8'],
                dataLabels: { enabled: false },
                stroke: { width: 0 },
                grid: { borderColor: '#eef2f7', strokeDashArray: 4 },
                legend: {
                  position: 'top',
                  horizontalAlign: 'left',
                  fontSize: '11px',
                  markers: { shape: 'circle' as const },
                  itemMargin: { horizontal: 8 },
                },
                xaxis: {
                  categories: channels.map((c) => c.label),
                  labels: { style: { fontSize: '10px', colors: '#94a3b8' } },
                  axisBorder: { show: false },
                  axisTicks: { show: false },
                },
                yaxis: { labels: { style: { fontSize: '10px', colors: '#5b6b82' } } },
                tooltip: { y: { formatter: (v: number) => `${formatNumber(v, lang)}` } },
              }}
            />
            <p className="px-3 pb-3 text-[11px] leading-relaxed text-ink-faint">
              {th
                ? 'ส่วนสีอ่อนคือเด็กที่ยังรอลงพื้นที่ยืนยัน — คลิกที่แถบเพื่อกรองเฉพาะช่องทางนั้น'
                : 'The pale part is children still awaiting a field visit — click a bar to filter by that channel.'}
            </p>
          </div>
        </Card>

        {districtKeys.length > 1 ? (
          <Card>
            <CardHeader
              title={th ? 'อำเภอที่การค้นหายังไม่ทั่วถึง' : 'Districts where the search is thinnest'}
              subtitle={
                th
                  ? 'ตัวเลขสวยเพราะยังหาไม่เจอ ก็เป็นไปได้ — กดเพื่อกรองเฉพาะอำเภอนั้น'
                  : 'A low count can mean a low search effort — tap to filter by that district'
              }
            />
            <div className="grid gap-2 px-5 pb-5 pt-3 sm:grid-cols-2">
              {Object.entries(
                filtered.reduce<Record<string, { total: number; verified: number }>>((acc, r) => {
                  acc[r.districtKey] ??= { total: 0, verified: 0 }
                  acc[r.districtKey].total++
                  if (r.verified) acc[r.districtKey].verified++
                  return acc
                }, {}),
              )
                .map(([k, v]) => ({ key: k, ...v, rate: (v.verified / v.total) * 100 }))
                .sort((a, b) => a.rate - b.rate)
                .slice(0, 6)
                .map((d) => (
                  <motion.button
                    key={d.key}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      setDistrict(district === d.key ? 'all' : d.key)
                      setPage(1)
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      district === d.key
                        ? 'border-brand-400 bg-brand-50/60'
                        : 'border-surface-border hover:bg-surface-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{dn(d.key)}</span>
                      <span className="tabular text-xs text-ink-muted">
                        {d.verified}/{d.total}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full rounded-full bg-risk-high"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(4, d.rate)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-ink-faint">
                      {t('oosc.verified')} {formatPct(d.rate, 0)} ·{' '}
                      {t(`kind.${DISTRICT_GEO[d.key]?.kind ?? 'rural'}`)}
                    </div>
                  </motion.button>
                ))}
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader
              title={th ? 'ความคืบหน้าของพื้นที่นี้' : 'Progress in this area'}
              subtitle={
                th
                  ? 'สัดส่วนงานที่ทำไปแล้วในทะเบียนที่คุณรับผิดชอบ'
                  : 'How much of your registry has been worked through'
              }
            />
            <div className="flex flex-col gap-3 px-5 pb-5 pt-3">
              <StatLine
                label={t('oosc.verified')}
                value={stats.verified}
                total={stats.total}
                color="#2f66f6"
                lang={lang}
              />
              <StatLine
                label={th ? 'มีผู้รับผิดชอบแล้ว' : 'Has a named owner'}
                value={stats.total - stats.unassigned}
                total={stats.total}
                color="#7c3aed"
                lang={lang}
              />
              <StatLine
                label={th ? 'ได้รับความยินยอมแล้ว' : 'Consent granted'}
                value={stats.total - stats.consentPending}
                total={stats.total}
                color="#14b8a6"
                lang={lang}
              />
              <StatLine
                label={th ? 'กลับเข้าเรียน / มีอาชีพ' : 'Back in learning or work'}
                value={stats.outcome}
                total={stats.total}
                color="#16a34a"
                lang={lang}
              />
            </div>
          </Card>
        )}
      </div>

      {user?.role === 'agency' && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {th
            ? 'คุณกำลังใช้งานในบทบาทหน่วยงานที่รับส่งต่อ — ระบบแสดงเฉพาะเด็กที่ถูกส่งต่อมายังหน่วยงานของคุณเท่านั้น'
            : 'You are signed in as a receiving agency — only children referred to your agency are shown.'}
        </p>
      )}

      {/* ── Slide-over detail ── */}
      <ChildDrawer
        r={openRecord}
        closing={closing}
        onClose={closeDrawer}
        th={th}
        t={t}
        tn={tn}
        dn={dn}
        pn={pn}
        mayAct={mayAct}
        onOpenPlan={openPlan}
        onAssign={assign}
        onMarkVisited={markVisited}
      />
    </div>
  )
}

/* ─────────────── pieces ─────────────── */

/** the registry's progress as one stacked track instead of four rows of bars */
function ProgressTrack({
  total,
  steps,
}: {
  total: number
  steps: { label: string; value: number; color: string }[]
}) {
  return (
    <div className="mt-2">
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-muted">
        {steps.map((s, i) => (
          <motion.div
            key={s.label}
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: s.color, zIndex: steps.length - i }}
            initial={{ width: 0 }}
            animate={{ width: `${total ? (s.value / total) * 100 : 0}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 * i }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {steps.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="tabular font-semibold text-ink">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function StatLine({
  label,
  value,
  total,
  color,
  lang,
}: {
  label: string
  value: number
  total: number
  color: string
  lang: 'th' | 'en' | 'ms'
}) {
  const pct = total ? (value / total) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-ink">{label}</span>
        <span className="tabular text-[12px] font-semibold text-ink">
          {formatNumber(value, lang)}
          <span className="ml-1.5 text-[11px] font-normal text-ink-faint">{pct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
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

function ConfidenceSlider({
  value,
  onChange,
  th,
  label,
}: {
  value: number
  onChange: (v: number) => void
  th: boolean
  label: string
}) {
  return (
    <div className="flex min-w-[190px] flex-col justify-center rounded-xl border border-surface-border px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium text-ink-muted">
          {th ? `${label} ≥` : `${label} ≥`}
        </span>
        <span className="tabular text-[11px] font-bold text-brand-600">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={95}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={th ? 'ความมั่นใจขั้นต่ำ' : 'Minimum confidence'}
        className="range-brand mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-muted"
        style={{
          background: `linear-gradient(to right, #2f66f6 ${(value / 95) * 100}%, #eef2f7 ${(value / 95) * 100}%)`,
        }}
      />
    </div>
  )
}

function StatusChip({ status, label }: { status: ChildStatus; label: string }) {
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `${STATUS_COLOR[status]}18`, color: STATUS_COLOR[status] }}
    >
      {label}
    </span>
  )
}

/** One scannable line per child — detail lives in the slide-over, not here */
function ChildRow({
  r,
  rank,
  index,
  th,
  t,
  tn,
  dn,
  active,
  onOpen,
}: {
  r: OoscRecord
  rank?: number
  index: number
  th: boolean
  t: (k: string) => string
  tn: (k: string) => string
  dn: (k: string) => string
  active: boolean
  onOpen: () => void
}) {
  const conf = r.matchConfidence
  const confColor = conf >= 80 ? '#16a34a' : conf >= 60 ? '#eab308' : '#f97316'
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.28 }}
      whileHover={{ backgroundColor: 'rgba(47,102,246,0.04)' }}
      className={`group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${
        active ? 'bg-brand-50/70' : ''
      }`}
    >
      {rank !== undefined && (
        <span className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
          {rank}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-ink">{r.name}</span>
          <StatusChip status={r.status} label={t(`status.${r.status}`)} />
          {!r.ownerName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-risk-critical/10 px-1.5 py-0.5 text-[10px] font-semibold text-risk-critical">
              <IconUser width={10} height={10} />
              {t('oosc.unassigned')}
            </span>
          )}
          {r.consent !== 'granted' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <IconConsent width={10} height={10} />
              {t(`consent.${r.consent}`)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
          {r.id} · {r.ageYears} {th ? 'ปี' : 'yrs'} · {tn(r.tambonKey)}, {dn(r.districtKey)} ·{' '}
          {th ? 'ออกจากระบบ' : 'out for'} {r.yearsOut.toFixed(1)} {t('oosc.years')} ·{' '}
          <span style={{ color: SOURCE_COLOR[r.source] }}>{t(`source.${r.source}`)}</span>
        </span>
      </span>

      <span className="hidden w-24 shrink-0 sm:block">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: confColor }}
              initial={{ width: 0 }}
              animate={{ width: `${conf}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </span>
          <span className="tabular text-[11px] font-semibold text-ink-muted">{conf}%</span>
        </span>
        <span
          className={`mt-0.5 block text-[10px] ${r.verified ? 'text-risk-normal' : 'text-amber-600'}`}
        >
          {r.verified ? t('oosc.verified') : t('oosc.unverified')}
        </span>
      </span>

      <motion.span
        className="shrink-0 text-ink-faint transition-colors group-hover:text-brand-600"
        initial={false}
        animate={{ x: active ? 3 : 0 }}
      >
        <IconChevronRight width={18} height={18} />
      </motion.span>
    </motion.button>
  )
}

/** Slide-over: everything about one child, and the actions you can take */
function ChildDrawer({
  r,
  closing,
  onClose,
  th,
  t,
  tn,
  dn,
  pn,
  onOpenPlan,
  mayAct,
  onAssign,
  onMarkVisited,
}: {
  r: OoscRecord | null
  closing: boolean
  onClose: () => void
  th: boolean
  t: (k: string) => string
  tn: (k: string) => string
  dn: (k: string) => string
  pn: (k: string) => string
  onOpenPlan: (r: OoscRecord) => void
  mayAct: boolean
  onAssign: (r: OoscRecord) => void
  onMarkVisited: (r: OoscRecord) => void
}) {
  useEffect(() => {
    if (!r) return
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
  }, [r, onClose])

  if (!r) return null

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
            aria-label={r.name}
            className="relative flex h-full w-full max-w-[430px] flex-col overflow-y-auto bg-white shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: closing ? '100%' : 0 }}
            transition={
              closing
                ? { duration: 0.22, ease: 'easeIn' }
                : { type: 'spring', stiffness: 320, damping: 34 }
            }
          >
            {/* header */}
            <div className="sticky top-0 z-10 border-b border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight text-ink">{r.name}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {r.id} · {r.ageYears} {th ? 'ปี' : 'yrs'} · {t(`grade.${r.lastGradeKey}`)}
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
                <StatusChip status={r.status} label={t(`status.${r.status}`)} />
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    r.verified
                      ? 'bg-risk-normal/12 text-risk-normal'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {r.verified ? <IconCheck width={11} height={11} /> : <IconAlert width={11} height={11} />}
                  {r.verified ? t('oosc.verified') : t('oosc.unverified')}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                  <IconConsent width={11} height={11} />
                  {t(`consent.${r.consent}`)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-4 px-5 py-4">
              {/* confidence */}
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-ink-muted">{t('oosc.confidence')}</span>
                  <span className="tabular text-sm font-bold text-ink">{r.matchConfidence}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background:
                        r.matchConfidence >= 80
                          ? '#16a34a'
                          : r.matchConfidence >= 60
                            ? '#eab308'
                            : '#f97316',
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${r.matchConfidence}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {th
                    ? 'ความมั่นใจว่าเป็นเด็กที่ยังอยู่นอกระบบจริง คำนวณจากการจับคู่ข้อมูลหลายแหล่ง'
                    : 'Confidence that this is a genuine, still-out-of-school child, from cross-matched sources'}
                </p>
              </div>

              <DrawerGrid
                items={[
                  { k: t('oosc.yearsOut'), v: `${r.yearsOut.toFixed(1)} ${t('oosc.years')}` },
                  { k: t('oosc.source'), v: t(`source.${r.source}`) },
                  { k: t('geo.tambon'), v: tn(r.tambonKey) },
                  { k: t('geo.district'), v: `${dn(r.districtKey)} · ${pn(r.provinceKey)}` },
                ]}
              />

              {/* owner */}
              <div className="rounded-xl border border-surface-border p-3">
                <p className="text-xs font-semibold text-ink-muted">{t('oosc.owner')}</p>
                {r.ownerName ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <IconUser width={14} height={14} className="text-ink-faint" />
                    {r.ownerName}
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-risk-critical">
                    {t('oosc.unassigned')}
                  </p>
                )}
                {r.consent !== 'granted' && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    {th
                      ? 'ข้อมูลจะข้ามหน่วยงานได้เมื่อได้รับความยินยอมตาม PDPA'
                      : 'Data may cross agencies only once PDPA consent is granted'}
                  </p>
                )}
              </div>

              {/* causes */}
              {r.causeKeys.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted">
                    {th ? 'สาเหตุที่บันทึกไว้' : 'Recorded causes'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.causeKeys.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-surface-muted px-2 py-1 text-[11px] font-medium text-ink-muted"
                      >
                        {t(`cause.${c}`)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* field note */}
              {r.note && (
                <div className="rounded-xl bg-surface-muted p-3">
                  <p className="text-xs font-semibold text-ink-muted">{t('oosc.note')}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">{r.note}</p>
                </div>
              )}
            </div>

            {/* actions — a supervising seat gets the record, not the levers.
                Opening an existing plan is reading, so it survives; creating
                one, taking the case and recording a visit do not. */}
            <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
              {(mayAct || r.planId) && (
                <Button variant="primary" onClick={() => onOpenPlan(r)}>
                  {r.planId ? t('common.viewPlan') : t('oosc.openPlan')}
                </Button>
              )}
              {mayAct && (
                <div className="flex gap-2">
                  {!r.ownerName && (
                    <Button variant="secondary" className="flex-1" onClick={() => onAssign(r)}>
                      {t('oosc.assignOwner')}
                    </Button>
                  )}
                  {!r.verified && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        onMarkVisited(r)
                        onClose()
                      }}
                    >
                      {th ? 'บันทึกว่าลงพื้นที่แล้ว' : 'Mark as visited'}
                    </Button>
                  )}
                </div>
              )}
              <Button variant="ghost" onClick={onClose}>
                {th ? 'ปิด' : 'Close'}
              </Button>
            </div>
          </motion.aside>
    </div>
  )
}

function DrawerGrid({ items }: { items: { k: string; v: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <div key={it.k} className="rounded-xl border border-surface-border px-3 py-2">
          <p className="text-[10px] text-ink-faint">{it.k}</p>
          <p className="mt-0.5 text-[13px] font-semibold text-ink">{it.v}</p>
        </div>
      ))}
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border px-5 py-3">
      <p className="text-xs text-ink-muted">
        {th ? `แสดง ${from}–${to} จาก ${total} คน` : `Showing ${from}–${to} of ${total}`}
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
