import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import Chart from 'react-apexcharts'
import type { OpportunityPlan, Pathway, PlanStepStatus } from '@/types'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { canWorkCases } from '@/auth/roles'
import { DirectOnlyNotice } from '@/components/auth/DirectOnlyNotice'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { useToast } from '@/components/ui/Toast'
import { PATHWAY_COLOR } from '@/data/plans'
import { AGENCY_BY_ID, AGENCY_KIND_COLOR } from '@/data/agencies'
import { formatNumber } from '@/lib/format'
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconPathway,
  IconSearch,
  IconUsers,
} from '@/components/icons'

const STEP_STYLE: Record<PlanStepStatus, { dot: string; text: string; ring: string }> = {
  done: { dot: '#16a34a', text: 'text-risk-normal', ring: 'ring-risk-normal/30' },
  active: { dot: '#2f66f6', text: 'text-brand-600', ring: 'ring-brand-500/30' },
  blocked: { dot: '#dc2626', text: 'text-risk-critical', ring: 'ring-risk-critical/30' },
  pending: { dot: '#cbd5e1', text: 'text-ink-faint', ring: 'ring-slate-200' },
}

const STALE_DAYS = 45
const PAGE_SIZE = 10

const isBlocked = (p: OpportunityPlan) => p.steps.some((s) => s.status === 'blocked')

/** Four states every plan falls into, in priority order — they sum to the
 *  whole caseload, so one stacked bar can carry the lot. */
type Health = 'blocked' | 'stale' | 'nearDone' | 'moving'
function healthOf(p: OpportunityPlan): Health {
  if (isBlocked(p)) return 'blocked'
  if (p.reviewedDaysAgo > STALE_DAYS) return 'stale'
  if (p.progress >= 80) return 'nearDone'
  return 'moving'
}

type FocusKey = 'none' | 'blocked' | 'stale' | 'notAgreed'

export default function OpportunityPlans() {
  const { t, lang } = useI18n()
  const th = lang === 'th'
  const { plans, user } = useScopedData()
  const { push } = useToast()

  const [query, setQuery] = useState('')
  const [pathway, setPathway] = useState('all')
  const [barrier, setBarrier] = useState('all')
  const [sort, setSort] = useState('attention')
  const [minStale, setMinStale] = useState(0)
  const [focus, setFocus] = useState<FocusKey>('none')
  const [page, setPage] = useState(1)

  // Steps ticked off during this session, layered over the read-only mock so
  // finishing a step visibly moves the plan instead of only firing a toast.
  const [extraDone, setExtraDone] = useState<Record<string, string[]>>({})

  const [openId, setOpenId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const closeDrawer = () => {
    setClosing(true)
    window.setTimeout(() => {
      setOpenId(null)
      setClosing(false)
    }, 240)
  }

  const records = useMemo(
    () =>
      plans.map((p) => {
        const extra = extraDone[p.id]
        if (!extra?.length) return p
        const steps = p.steps.map((s) =>
          extra.includes(s.id) ? { ...s, status: 'done' as PlanStepStatus } : s,
        )
        const progress = Math.round(
          (steps.filter((s) => s.status === 'done').length / Math.max(1, steps.length)) * 100,
        )
        return { ...p, steps, progress, reviewedDaysAgo: 0 }
      }),
    [plans, extraDone],
  )

  const stats = useMemo(() => {
    const count = (p: (x: OpportunityPlan) => boolean) => records.filter(p).length
    const byHealth = (h: Health) => records.filter((p) => healthOf(p) === h).length
    return {
      total: records.length,
      avgProgress:
        Math.round(
          (records.reduce((s, p) => s + p.progress, 0) / Math.max(1, records.length)) * 10,
        ) / 10,
      blocked: byHealth('blocked'),
      stale: byHealth('stale'),
      nearDone: byHealth('nearDone'),
      moving: byHealth('moving'),
      staleAll: count((p) => p.reviewedDaysAgo > STALE_DAYS),
      notAgreed: count((p) => !p.agreedByFamily),
    }
  }, [records])

  const mix = useMemo(() => {
    const acc = new Map<Pathway, number>()
    for (const p of records) acc.set(p.pathway, (acc.get(p.pathway) ?? 0) + 1)
    return [...acc.entries()]
      .map(([k, v]) => ({ pathway: k, name: t(`pathway.${k}`), value: v }))
      .sort((a, b) => b.value - a.value)
  }, [records, t])

  const barrierMix = useMemo(() => {
    const acc = new Map<string, number>()
    for (const p of records) for (const b of p.barriers) acc.set(b, (acc.get(b) ?? 0) + 1)
    return [...acc.entries()]
      .map(([k, v]) => ({ key: k, label: t(`need.${k}`), value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [records, t])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inFocus = (p: OpportunityPlan) => {
      switch (focus) {
        case 'blocked':
          return isBlocked(p)
        case 'stale':
          return p.reviewedDaysAgo > STALE_DAYS
        case 'notAgreed':
          return !p.agreedByFamily
        default:
          return true
      }
    }
    const rows = records.filter(
      (p) =>
        (pathway === 'all' || p.pathway === pathway) &&
        (barrier === 'all' || p.barriers.includes(barrier as never)) &&
        p.reviewedDaysAgo >= minStale &&
        (!q || p.childName.toLowerCase().includes(q)) &&
        inFocus(p),
    )
    return [...rows].sort((a, b) => {
      if (sort === 'progress') return b.progress - a.progress
      if (sort === 'stale') return b.reviewedDaysAgo - a.reviewedDaysAgo
      const ba = isBlocked(a) ? 1 : 0
      const bb = isBlocked(b) ? 1 : 0
      if (ba !== bb) return bb - ba
      if (a.progress !== b.progress) return a.progress - b.progress
      return b.reviewedDaysAgo - a.reviewedDaysAgo
    })
  }, [records, pathway, barrier, minStale, query, focus, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])
  const pageStart = (safePage - 1) * PAGE_SIZE
  const rows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const openPlan = openId ? records.find((p) => p.id === openId) ?? null : null

  const toggleFocus = (f: FocusKey) => {
    setFocus((cur) => (cur === f ? 'none' : f))
    setPage(1)
  }

  const activeFilters =
    (query.trim() ? 1 : 0) +
    (pathway !== 'all' ? 1 : 0) +
    (barrier !== 'all' ? 1 : 0) +
    (minStale > 0 ? 1 : 0) +
    (focus !== 'none' ? 1 : 0)

  const clearAll = () => {
    setQuery('')
    setPathway('all')
    setBarrier('all')
    setMinStale(0)
    setFocus('none')
    setPage(1)
  }

  const focusLabel: Record<Exclude<FocusKey, 'none'>, string> = {
    blocked: t('plan.blockedPlans'),
    stale: t('plan.needsReview'),
    notAgreed: t('plan.notAgreed'),
  }

  /** Refused in one place rather than by hiding a dozen buttons — a hidden
   *  control cannot explain itself, and a reviewer cannot tell a withheld
   *  feature from a missing one. See `canWorkCases()`. */
  const mayAct = canWorkCases(user)
  const refuse = () => push(th ? 'บัญชีระดับกำกับดูแลดูข้อมูลได้ แต่ไม่ลงมือกับเคสรายบุคคล' : 'A supervising account can read this, but not act on an individual case')

  const completeStep = (p: OpportunityPlan, stepId: string) => {
    if (!mayAct) return refuse()
    setExtraDone((m) => ({ ...m, [p.id]: [...(m[p.id] ?? []), stepId] }))
    push(th ? `บันทึกขั้นตอนของ ${p.childName} แล้ว` : `Step completed for ${p.childName}`)
  }

  const tableConference = (p: OpportunityPlan) =>
    !mayAct
      ? refuse()
      : push(
      th
        ? `นัดทบทวนแผนของ ${p.childName} ในที่ประชุมทีมสหวิชาชีพอำเภอแล้ว`
        : `${p.childName} tabled for the district case conference`,
    )

  return (
    <div className="animate-page-rise">
      <DirectOnlyNotice />
      <PageHeader
        icon={<IconPathway width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.plan')]} />}
        title={t('plan.title')}
        subtitle={t('plan.subtitle')}
      />

      {/* ── One number to act on, then the health of every plan in one bar ── */}
      <Card className="mb-4">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => toggleFocus('blocked')}
            aria-pressed={focus === 'blocked'}
            className="flex shrink-0 items-center gap-4 rounded-2xl px-1 text-left"
          >
            <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-risk-critical/12 text-risk-critical">
              <IconAlert width={24} height={24} />
              <motion.span
                className="absolute inset-0 rounded-2xl ring-2 ring-risk-critical/40"
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </span>
            <span>
              <span className="tabular block text-[40px] font-bold leading-none text-ink">
                <AnimatedCounter value={stats.blocked} />
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink">
                {t('plan.blockedPlans')}
              </span>
              <span className="block text-[11px] text-ink-muted">
                {th
                  ? `จากแผนทั้งหมด ${formatNumber(stats.total, lang)} แผน · กดเพื่อดูเฉพาะแผนที่ติดขัด`
                  : `of ${formatNumber(stats.total, lang)} plans · tap to see only the blocked ones`}
              </span>
            </span>
          </button>

          <div className="hidden h-16 w-px shrink-0 bg-surface-border lg:block" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold text-ink-muted">{t('plan.health')}</p>
              <p className="text-[11px] text-ink-faint">
                {t('plan.avgProgress')}{' '}
                <span className="tabular font-bold text-ink">{stats.avgProgress}%</span>
              </p>
            </div>
            <HealthTrack
              total={stats.total}
              parts={[
                { key: 'blocked', label: t('plan.blocked'), value: stats.blocked, color: '#dc2626' },
                { key: 'stale', label: t('plan.needsReview'), value: stats.stale, color: '#f97316' },
                { key: 'moving', label: t('plan.moving'), value: stats.moving, color: '#2f66f6' },
                { key: 'nearDone', label: t('plan.nearDone'), value: stats.nearDone, color: '#16a34a' },
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <MiniChip
                icon={<IconClock width={12} height={12} />}
                label={t('plan.needsReview')}
                value={stats.staleAll}
                active={focus === 'stale'}
                onClick={() => toggleFocus('stale')}
              />
              <MiniChip
                icon={<IconUsers width={12} height={12} />}
                label={t('plan.notAgreed')}
                value={stats.notAgreed}
                active={focus === 'notAgreed'}
                onClick={() => toggleFocus('notAgreed')}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── The caseload, full width ── */}
      <Card>
        <CardHeader
          title={th ? 'เด็กที่มีแผนแล้ว' : 'Children with a plan'}
          subtitle={
            th
              ? 'เรียงตามที่ต้องดูก่อน — กดที่ชื่อเพื่อเปิดแผนทั้งฉบับ'
              : 'Ordered by what needs attention — open a name for the full plan'
          }
          action={
            <Select
              value={sort}
              onChange={(v) => {
                setSort(v)
                setPage(1)
              }}
              options={[
                { value: 'attention', label: th ? 'ต้องดูก่อน' : 'Needs attention' },
                { value: 'progress', label: t('plan.progress') },
                { value: 'stale', label: t('plan.reviewed') },
              ]}
              className="w-[150px]"
            />
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
                placeholder={t('plan.search')}
                aria-label={t('plan.search')}
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

            {/* slider: how long a plan has been left alone */}
            <StaleSlider
              value={minStale}
              onChange={(v) => {
                setMinStale(v)
                setPage(1)
              }}
              label={t('plan.staleFilter')}
              unit={t('ref.days')}
            />

            <Select
              value={pathway}
              onChange={(v) => {
                setPathway(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: th ? 'ทุกเส้นทาง' : 'All pathways' },
                ...mix.map((m) => ({ value: m.pathway, label: m.name })),
              ]}
              className="w-[190px]"
            />
            <Select
              value={barrier}
              onChange={(v) => {
                setBarrier(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: th ? 'ทุกอุปสรรค' : 'All barriers' },
                ...barrierMix.map((b) => ({ value: b.key, label: b.label })),
              ]}
              className="w-[170px]"
            />
          </div>

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
                  ? `พบ ${formatNumber(filtered.length, lang)} แผน`
                  : `${formatNumber(filtered.length, lang)} plans match`}
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
              {activeFilters === 0
                ? th
                  ? 'ยังไม่มีแผนในขอบเขตของคุณ'
                  : 'No plans in your scope yet'
                : th
                  ? 'ไม่พบแผนที่ตรงกับตัวกรอง'
                  : 'No plans match these filters'}
            </p>
            {activeFilters > 0 && (
              <Button size="sm" variant="secondary" onClick={clearAll}>
                {th ? 'ล้างตัวกรอง' : 'Clear filters'}
              </Button>
            )}
          </div>
        ) : (
          // enter-only animation on purpose — see the StrictMode note in skill.md
          <div className="mt-1 flex flex-col divide-y divide-surface-border/70">
            {rows.map((p, i) => (
              <PlanRow
                key={p.id}
                p={p}
                index={i}
                th={th}
                t={t}
                active={openId === p.id}
                onOpen={() => setOpenId(p.id)}
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
          <CardHeader title={t('plan.mix')} subtitle={t('plan.mixHint')} />
          <div className="px-2 pb-2">
            <Chart
              type="donut"
              height={300}
              series={mix.map((m) => m.value)}
              options={{
                chart: {
                  type: 'donut',
                  fontFamily: 'inherit',
                  animations: { enabled: true, easing: 'easeinout', speed: 900 },
                  events: {
                    dataPointSelection: (_e, _c, opts) => {
                      const hit = mix[opts?.dataPointIndex ?? -1]
                      if (hit) {
                        setPathway(pathway === hit.pathway ? 'all' : hit.pathway)
                        setPage(1)
                      }
                    },
                  },
                },
                labels: mix.map((m) => m.name),
                colors: mix.map((m) => PATHWAY_COLOR[m.pathway]),
                stroke: { width: 2, colors: ['#ffffff'] },
                dataLabels: { enabled: false },
                legend: {
                  position: 'bottom',
                  fontSize: '11px',
                  markers: { shape: 'circle' as const },
                  itemMargin: { horizontal: 6, vertical: 2 },
                },
                plotOptions: {
                  pie: {
                    donut: {
                      size: '62%',
                      labels: {
                        show: true,
                        total: {
                          show: true,
                          label: th ? 'แผนทั้งหมด' : 'plans',
                          fontSize: '11px',
                          color: '#94a3b8',
                          formatter: () => `${stats.total}`,
                        },
                        value: { fontSize: '20px', fontWeight: 700, color: '#0f172a' },
                      },
                    },
                  },
                },
                tooltip: { y: { formatter: (v: number) => `${v}` } },
              }}
            />
            <p className="px-3 pb-2 text-[11px] text-ink-faint">
              {th
                ? 'คลิกที่วงเพื่อกรองรายชื่อเฉพาะเส้นทางนั้น'
                : 'Click a slice to filter the caseload by that pathway'}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('plan.commonBarriers')}
            subtitle={
              th
                ? 'สิ่งที่ขวางแผนอยู่จริง — แก้ที่ต้นทางได้ทีละหลายแผน กดเพื่อกรอง'
                : 'What is actually blocking plans — fixing one clears many; tap to filter'
            }
          />
          <div className="flex flex-col gap-2 px-5 pb-5 pt-3">
            {barrierMix.map((b, i) => (
              <motion.button
                key={b.key}
                type="button"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ x: 2 }}
                onClick={() => {
                  setBarrier(barrier === b.key ? 'all' : b.key)
                  setPage(1)
                }}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  barrier === b.key
                    ? 'border-brand-400 bg-brand-50/60'
                    : 'border-surface-border hover:bg-surface-muted'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{b.label}</span>
                  <span className="tabular shrink-0 text-xs font-bold text-ink">
                    {b.value}
                    <span className="ml-1 font-normal text-ink-faint">
                      {th ? 'แผน' : 'plans'}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    className="h-full rounded-full bg-amber-400"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(b.value / Math.max(1, barrierMix[0]?.value ?? 1)) * 100}%`,
                    }}
                    transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 + i * 0.05 }}
                  />
                </div>
              </motion.button>
            ))}
            {barrierMix.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-faint">
                {th ? 'ไม่มีอุปสรรคค้างอยู่' : 'No barriers recorded'}
              </p>
            )}
          </div>
        </Card>
      </div>

      <PlanDrawer
        p={openPlan}
        closing={closing}
        onClose={closeDrawer}
        th={th}
        t={t}
        mayAct={mayAct}
        onCompleteStep={completeStep}
        onConference={tableConference}
      />
    </div>
  )
}

/* ─────────────── pieces ─────────────── */

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
            transition={{ duration: 0.75, ease: 'easeOut', delay: i * 0.08 }}
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

function StaleSlider({
  value,
  onChange,
  label,
  unit,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  unit: string
}) {
  return (
    <div className="flex min-w-[200px] flex-col justify-center rounded-xl border border-surface-border px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-medium text-ink-muted">{label}</span>
        <span className="tabular shrink-0 text-[11px] font-bold text-brand-600">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={90}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="range-brand mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, #2f66f6 ${(value / 90) * 100}%, #eef2f7 ${(value / 90) * 100}%)`,
        }}
      />
    </div>
  )
}

function PlanRow({
  p,
  index,
  th,
  t,
  active,
  onOpen,
}: {
  p: OpportunityPlan
  index: number
  th: boolean
  t: (k: string) => string
  active: boolean
  onOpen: () => void
}) {
  const blocked = isBlocked(p)
  const nextStep = p.steps.find((s) => s.status === 'blocked') ?? p.steps.find((s) => s.status === 'active')
  const agency = nextStep ? AGENCY_BY_ID[nextStep.ownerAgencyId] : undefined
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
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-ink">{p.childName}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: `${PATHWAY_COLOR[p.pathway]}18`,
              color: PATHWAY_COLOR[p.pathway],
            }}
          >
            {t(`pathway.${p.pathway}`)}
          </span>
          {blocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-risk-critical/10 px-1.5 py-0.5 text-[10px] font-semibold text-risk-critical">
              <IconAlert width={10} height={10} />
              {t('plan.blocked')}
            </span>
          )}
          {!p.agreedByFamily && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <IconUsers width={10} height={10} />
              {th ? 'รอครอบครัวเห็นชอบ' : 'Awaiting family'}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
          {t('plan.reviewed')} {p.reviewedDaysAgo} {t('ref.days')} · {t('plan.target')}{' '}
          {p.targetMonth}
          {nextStep && (
            <>
              {' · '}
              <span className="text-ink-faint">{th ? 'ขั้นถัดไป' : 'next'}:</span>{' '}
              {th ? nextStep.titleTh : nextStep.titleEn}
              {agency && <span className="text-ink-faint"> — {th ? agency.th : agency.en}</span>}
            </>
          )}
        </span>
      </span>

      <span className="hidden w-24 shrink-0 sm:block">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: PATHWAY_COLOR[p.pathway] }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(3, p.progress)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </span>
          <span className="tabular text-[11px] font-semibold text-ink">{p.progress}%</span>
        </span>
        <span className="mt-0.5 block text-[10px] text-ink-faint">{t('plan.progress')}</span>
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

function ProgressRing({ value, size = 76 }: { value: number; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={7} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#2f66f6"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * value) / 100 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-ink text-[13px] font-bold"
        style={{ transformOrigin: 'center' }}
      >
        {value}%
      </text>
    </svg>
  )
}

/** Slide-over: the whole plan for one child, and the steps you can close */
function PlanDrawer({
  p,
  closing,
  onClose,
  th,
  t,
  mayAct,
  onCompleteStep,
  onConference,
}: {
  p: OpportunityPlan | null
  closing: boolean
  onClose: () => void
  th: boolean
  t: (k: string) => string
  mayAct: boolean
  onCompleteStep: (p: OpportunityPlan, stepId: string) => void
  onConference: (p: OpportunityPlan) => void
}) {
  useEffect(() => {
    if (!p) return
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
  }, [p, onClose])

  if (!p) return null

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
        aria-label={p.childName}
        className="relative flex h-full w-full max-w-[460px] flex-col overflow-y-auto bg-white shadow-2xl"
        initial={{ x: '100%' }}
        animate={{ x: closing ? '100%' : 0 }}
        transition={
          closing ? { duration: 0.22, ease: 'easeIn' } : { type: 'spring', stiffness: 320, damping: 34 }
        }
      >
        <div className="sticky top-0 z-10 border-b border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-ink">{p.childName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    background: `${PATHWAY_COLOR[p.pathway]}18`,
                    color: PATHWAY_COLOR[p.pathway],
                  }}
                >
                  {t(`pathway.${p.pathway}`)}
                </span>
                <span className="text-[11px] text-ink-faint">
                  {t('plan.target')} {p.targetMonth} · {t('plan.reviewed')} {p.reviewedDaysAgo}{' '}
                  {t('ref.days')}
                </span>
              </div>
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
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-center gap-4 rounded-xl border border-surface-border p-3">
            <ProgressRing value={p.progress} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-muted">{t('plan.progress')}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink">
                {th
                  ? `ทำไปแล้ว ${p.steps.filter((s) => s.status === 'done').length} จาก ${p.steps.length} ขั้นตอน`
                  : `${p.steps.filter((s) => s.status === 'done').length} of ${p.steps.length} steps done`}
              </p>
              <p
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  p.agreedByFamily
                    ? 'bg-risk-normal/12 text-risk-normal'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                <IconUsers width={11} height={11} />
                {p.agreedByFamily ? t('plan.agreed') : t('plan.notAgreed')}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-surface-muted px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {t('plan.rationale')}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {th ? p.rationaleTh : p.rationaleEn}
            </p>
          </div>

          {p.barriers.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {t('plan.barriers')}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {p.barriers.map((b) => (
                  <span
                    key={b}
                    className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700"
                  >
                    {t(`need.${b}`)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* steps — each open one can be closed from here */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {t('plan.steps')}
            </p>
            <ol className="relative space-y-3 border-l border-surface-border pl-5">
              {p.steps.map((s) => {
                const style = STEP_STYLE[s.status]
                const agency = AGENCY_BY_ID[s.ownerAgencyId]
                const label =
                  s.status === 'done'
                    ? t('plan.stepDone')
                    : s.status === 'active'
                      ? t('plan.stepActive')
                      : s.status === 'blocked'
                        ? t('plan.stepBlocked')
                        : t('plan.stepPending')
                return (
                  <li key={s.id} className="relative">
                    <motion.span
                      layout
                      className={`absolute -left-[26px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ${style.ring}`}
                      style={{ background: style.dot }}
                      initial={false}
                      animate={{ scale: s.status === 'done' ? [1, 1.35, 1] : 1 }}
                      transition={{ duration: 0.4 }}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-[13px] leading-snug ${
                          s.status === 'done' ? 'text-ink-muted line-through' : 'text-ink'
                        }`}
                      >
                        {th ? s.titleTh : s.titleEn}
                      </p>
                      <span className={`shrink-0 text-[10px] font-semibold ${style.text}`}>
                        {label}
                      </span>
                    </div>
                    {agency && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: AGENCY_KIND_COLOR[agency.kind] }}
                        />
                        <span className="text-[11px] text-ink-muted">{th ? agency.th : agency.en}</span>
                        <span className="text-[11px] text-ink-faint">
                          · {t('plan.due')} D+{s.dueInDays}
                        </span>
                      </div>
                    )}
                    {mayAct && (s.status === 'active' || s.status === 'blocked') && (
                      <button
                        type="button"
                        onClick={() => onCompleteStep(p, s.id)}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-surface-border px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-risk-normal/40 hover:bg-risk-normal/10 hover:text-risk-normal"
                      >
                        <IconCheck width={12} height={12} />
                        {th ? 'ทำขั้นตอนนี้เสร็จแล้ว' : 'Mark this step done'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
          {mayAct && (
            <Button
              variant="primary"
              className="flex-1"
              icon={<IconArrowRight width={14} height={14} />}
              onClick={() => onConference(p)}
            >
              {t('ref.conference')}
            </Button>
          )}
          <Button variant="secondary" className={mayAct ? '' : 'flex-1'} onClick={onClose}>
            {th ? 'ปิด' : 'Close'}
          </Button>
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border px-5 py-3">
      <p className="text-xs text-ink-muted">
        {th ? `แสดง ${from}–${to} จาก ${total} แผน` : `Showing ${from}–${to} of ${total}`}
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
