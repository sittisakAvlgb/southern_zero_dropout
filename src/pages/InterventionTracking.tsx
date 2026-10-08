import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { RiskBadge } from '@/components/ui/RiskBadge'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'
import { STAGE_SEQUENCE, levelRank, pipelineCounts } from '@/data/cases'
import { useToast } from '@/components/ui/Toast'
import { useScopedData } from '@/auth/scope'
import { canAccess, canWorkCases } from '@/auth/roles'
import { ScopeBanner } from '@/components/auth/ScopeBanner'
import { DirectOnlyNotice } from '@/components/auth/DirectOnlyNotice'
import type { CaseRecord, CaseStage, RiskLevel } from '@/types'
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconExport,
  IconHome,
  IconIntervention,
  IconSearch,
  IconUsers,
} from '@/components/icons'

/* blue → green ramp across the eight stages */
const PIPE_FROM: [number, number, number] = [47, 102, 246]
const PIPE_TO: [number, number, number] = [22, 163, 74]
function stageColor(i: number, n = STAGE_SEQUENCE.length): string {
  const r = n > 1 ? i / (n - 1) : 0
  const c = PIPE_FROM.map((f, k) => Math.round(f + (PIPE_TO[k] - f) * r))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

const RISK_LEVELS: RiskLevel[] = ['critical', 'high', 'watch', 'normal']
const PAGE_SIZE = 10
type Focus = 'none' | 'overdue' | 'urgent' | 'unassigned'

export default function InterventionTracking() {
  const { t, pn, lang } = useI18n()
  const th = lang === 'th'
  const toast = useToast()
  const nav = useNavigate()
  const { cases: scopedCases, user } = useScopedData()

  /** Seeded from the URL so the area dashboard's pipeline cards can link
   *  straight to the cases they count — "9 ยังไม่มีเจ้าของเคส" that opened the
   *  full unfiltered list was a promise the card did not keep.
   *  Declared before the state that reads it: React runs a lazy initialiser
   *  during the first render, so a later `const` would throw on load — and
   *  TypeScript does not catch it inside the arrow function. */
  const [params] = useSearchParams()

  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<string>(() => params.get('stage') ?? 'all')
  const [riskFilter, setRiskFilter] = useState<string>('all')
  const [minAge, setMinAge] = useState(0)
  const [focus, setFocus] = useState<Focus>(() => {
    const f = params.get('focus')
    return f === 'overdue' || f === 'urgent' || f === 'unassigned' ? f : 'none'
  })
  const [page, setPage] = useState(1)

  // Case work done in this session, layered over the read-only mock records.
  const [changes, setChanges] = useState<Record<string, Partial<CaseRecord>>>({})
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
    () => scopedCases.map((c) => (changes[c.id] ? { ...c, ...changes[c.id] } : c)),
    [scopedCases, changes],
  )

  const counts = useMemo(() => pipelineCounts(records), [records])

  const stats = useMemo(() => {
    const n = (p: (c: CaseRecord) => boolean) => records.filter(p).length
    return {
      total: records.length,
      overdue: n((c) => c.slaBreached),
      urgent: n((c) => c.urgent && c.stage !== 'resolved'),
      unassigned: n((c) => !c.owner && c.stage !== 'resolved'),
      resolved: n((c) => c.stage === 'resolved' || c.stage === 'returned'),
    }
  }, [records])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inFocus = (c: CaseRecord) => {
      switch (focus) {
        case 'overdue':
          return c.slaBreached
        case 'urgent':
          return c.urgent && c.stage !== 'resolved'
        case 'unassigned':
          return !c.owner && c.stage !== 'resolved'
        default:
          return true
      }
    }
    return records
      .filter(
        (c) =>
          (stageFilter === 'all' || c.stage === stageFilter) &&
          (riskFilter === 'all' || c.riskLevel === riskFilter) &&
          c.openedDaysAgo >= minAge &&
          (!q || c.studentName.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) &&
          inFocus(c),
      )
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
        if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1
        const lr = levelRank(a.riskLevel) - levelRank(b.riskLevel)
        if (lr !== 0) return lr
        return b.openedDaysAgo - a.openedDaysAgo
      })
  }, [records, stageFilter, riskFilter, minAge, query, focus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])
  const pageStart = (safePage - 1) * PAGE_SIZE
  const rows = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  const openCase = openId ? records.find((c) => c.id === openId) ?? null : null

  const activeFilters =
    (query.trim() ? 1 : 0) +
    (stageFilter !== 'all' ? 1 : 0) +
    (riskFilter !== 'all' ? 1 : 0) +
    (minAge > 0 ? 1 : 0) +
    (focus !== 'none' ? 1 : 0)

  const clearAll = () => {
    setQuery('')
    setStageFilter('all')
    setRiskFilter('all')
    setMinAge(0)
    setFocus('none')
    setPage(1)
  }

  const toggleFocus = (f: Focus) => {
    setFocus((cur) => (cur === f ? 'none' : f))
    setPage(1)
  }

  // ── actions that actually change the case ──────────────────
  /** Refused in one place rather than by hiding a dozen buttons — a hidden
   *  control cannot explain itself, and a reviewer cannot tell a withheld
   *  feature from a missing one. See `canWorkCases()`. */
  const mayAct = canWorkCases(user)

  const patch = (c: CaseRecord, p: Partial<CaseRecord>, msg: string) => {
    if (!mayAct) {
      toast.push(th ? 'บัญชีระดับกำกับดูแลดูข้อมูลได้ แต่ไม่ลงมือกับเคสรายบุคคล' : 'A supervising account can read this, but not act on an individual case')
      return
    }
    setChanges((m) => ({ ...m, [c.id]: { ...m[c.id], ...p } }))
    toast.push(msg)
  }

  const takeCase = (c: CaseRecord) => {
    const owner = user?.name ?? (th ? 'ผู้ใช้งานปัจจุบัน' : 'Current user')
    patch(
      c,
      { owner },
      th ? `${c.studentName} — มอบหมายให้ ${owner} แล้ว` : `${c.studentName} assigned to ${owner}`,
    )
  }

  const advance = (c: CaseRecord) => {
    const i = STAGE_SEQUENCE.indexOf(c.stage)
    const next = STAGE_SEQUENCE[Math.min(i + 1, STAGE_SEQUENCE.length - 1)]
    patch(
      c,
      { stage: next, slaBreached: false, openedDaysAgo: 0 },
      th
        ? `${c.studentName} — บันทึกขั้นตอน “${t(`stage.${next}`)}” แล้ว`
        : `${c.studentName} moved to “${t(`stage.${next}`)}”`,
    )
  }

  const recordVisit = (c: CaseRecord) =>
    patch(
      c,
      { stage: 'homeVisit', slaBreached: false, openedDaysAgo: 0 },
      th ? `บันทึกการเยี่ยมบ้าน ${c.studentName} แล้ว` : `Home visit recorded for ${c.studentName}`,
    )

  const resolve = (c: CaseRecord) =>
    patch(
      c,
      { stage: 'resolved', slaBreached: false, urgent: false },
      th ? `ปิดเคส ${c.studentName} สำเร็จ` : `Case closed for ${c.studentName}`,
    )

  /** real export: the rows you are looking at, as a CSV file */
  const exportCsv = () => {
    const head = [
      'id',
      th ? 'นักเรียน' : 'student',
      th ? 'จังหวัด' : 'province',
      th ? 'ระดับความเสี่ยง' : 'risk',
      th ? 'ขั้นตอน' : 'stage',
      th ? 'ผู้รับผิดชอบ' : 'owner',
      th ? 'เปิดมาแล้ว(วัน)' : 'days open',
      'SLA',
    ]
    const body = filtered.map((c) => [
      c.id,
      c.studentName,
      pn(c.provinceKey),
      t(`risk.${c.riskLevel}`),
      t(`stage.${c.stage}`),
      c.owner ?? (th ? 'ยังไม่มีเจ้าของ' : 'unassigned'),
      String(c.openedDaysAgo),
      c.slaBreached ? (th ? 'เกินกำหนด' : 'breached') : 'ok',
    ])
    const csv = [head, ...body]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `intervention-cases-${filtered.length}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.push(
      th ? `ส่งออก ${filtered.length} เคสเป็นไฟล์ CSV แล้ว` : `Exported ${filtered.length} cases as CSV`,
    )
  }

  const canStudent = canAccess(user, '/student')
  const canPlan = canAccess(user, '/plan')
  const canReferral = canAccess(user, '/referral')

  return (
    <div className="animate-page-rise">
      <ScopeBanner />
      <DirectOnlyNotice />
      <PageHeader
        title={t('iv.title')}
        subtitle={t('iv.sub')}
        icon={<IconIntervention />}
        actions={
          <Button
            variant="secondary"
            icon={<IconExport width={16} height={16} />}
            onClick={exportCsv}
          >
            {t('iv.exportCsv')}
          </Button>
        }
      />

      {/* ── One number to act on, then the pipeline as one bar ── */}
      <Card className="mb-4">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => toggleFocus('overdue')}
            aria-pressed={focus === 'overdue'}
            className="flex shrink-0 items-center gap-4 rounded-2xl px-1 text-left"
          >
            <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-risk-high/12 text-risk-high">
              <IconClock width={24} height={24} />
              <motion.span
                className="absolute inset-0 rounded-2xl ring-2 ring-risk-high/40"
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </span>
            <span>
              <span className="tabular block text-[40px] font-bold leading-none text-ink">
                <AnimatedCounter value={stats.overdue} />
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink">
                {t('iv.overdueCases')}
              </span>
              <span className="block text-[11px] text-ink-muted">
                {th
                  ? `จากเคสทั้งหมด ${formatNumber(stats.total, lang)} เคสในขอบเขตของคุณ · กดเพื่อดูเฉพาะเคสที่เกินกำหนด`
                  : `of ${formatNumber(stats.total, lang)} cases in your scope · tap to see only the late ones`}
              </span>
            </span>
          </button>

          <div className="hidden h-16 w-px shrink-0 bg-surface-border lg:block" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold text-ink-muted">{t('iv.pipeline')}</p>
              <p className="text-[11px] text-ink-faint">{t('iv.pipelineHint')}</p>
            </div>
            <StageTrack
              counts={counts}
              total={stats.total}
              active={stageFilter}
              onPick={(s) => {
                setStageFilter(stageFilter === s ? 'all' : s)
                setPage(1)
              }}
              labelFor={(s) => t(`stage.${s}`)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <MiniChip
                icon={<IconAlert width={12} height={12} />}
                label={t('iv.urgentCases')}
                value={stats.urgent}
                active={focus === 'urgent'}
                onClick={() => toggleFocus('urgent')}
              />
              <MiniChip
                icon={<IconUsers width={12} height={12} />}
                label={t('iv.unassigned')}
                value={stats.unassigned}
                active={focus === 'unassigned'}
                onClick={() => toggleFocus('unassigned')}
              />
              <MiniChip
                icon={<IconCheck width={12} height={12} />}
                label={t('iv.resolved')}
                value={stats.resolved}
                active={false}
                onClick={() => {
                  setStageFilter(stageFilter === 'resolved' ? 'all' : 'resolved')
                  setPage(1)
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── The caseload ── */}
      <Card>
        <CardHeader
          title={t('iv.caseList')}
          subtitle={
            th
              ? 'เรียงตามเร่งด่วน เกินกำหนด และระดับความเสี่ยง — กดที่ชื่อเพื่อเปิดเคส'
              : 'Ordered by urgency, SLA and risk — open a name for the full case'
          }
        />

        <div className="flex flex-col gap-2.5 px-5 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
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
                placeholder={t('iv.search')}
                aria-label={t('iv.search')}
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

            <AgeSlider
              value={minAge}
              onChange={(v) => {
                setMinAge(v)
                setPage(1)
              }}
              label={t('iv.ageFilter')}
              unit={t('ref.days')}
            />

            <Select
              value={stageFilter}
              onChange={(v) => {
                setStageFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: th ? 'ทุกขั้นตอน' : 'All steps' },
                ...STAGE_SEQUENCE.map((s) => ({ value: s, label: t(`stage.${s}`) })),
              ]}
              className="w-[165px]"
            />
            <Select
              value={riskFilter}
              onChange={(v) => {
                setRiskFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: th ? 'ทุกระดับความเสี่ยง' : 'All risk levels' },
                ...RISK_LEVELS.map((l) => ({ value: l, label: t(`risk.${l}`) })),
              ]}
              className="w-[165px]"
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
                  {focus === 'overdue'
                    ? t('iv.overdueCases')
                    : focus === 'urgent'
                      ? t('iv.urgentCases')
                      : t('iv.unassigned')}
                  <IconClose width={11} height={11} />
                </motion.button>
              )}
              <span className="text-ink-muted">
                {th
                  ? `พบ ${formatNumber(filtered.length, lang)} เคส`
                  : `${formatNumber(filtered.length, lang)} cases match`}
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
                  ? 'ไม่มีเคสในขอบเขตของคุณ'
                  : 'No cases in your scope'
                : th
                  ? 'ไม่พบเคสที่ตรงกับตัวกรอง'
                  : 'No cases match these filters'}
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
            {rows.map((c, i) => (
              <CaseRow
                key={c.id}
                c={c}
                index={i}
                th={th}
                t={t}
                pn={pn}
                active={openId === c.id}
                onOpen={() => setOpenId(c.id)}
                mayAct={mayAct}
                onPrimary={() => (c.owner ? advance(c) : takeCase(c))}
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

      <CaseDrawer
        c={openCase}
        closing={closing}
        onClose={closeDrawer}
        th={th}
        t={t}
        pn={pn}
        mayAct={mayAct}
        onTake={() => openCase && takeCase(openCase)}
        onAdvance={() => openCase && advance(openCase)}
        onVisit={() => openCase && recordVisit(openCase)}
        onResolve={() => openCase && resolve(openCase)}
        onViewStudent={
          canStudent
            ? () => {
                closeDrawer()
                nav('/student')
              }
            : undefined
        }
        onViewPlan={
          canPlan
            ? () => {
                closeDrawer()
                nav('/plan')
              }
            : undefined
        }
        onViewReferral={
          canReferral
            ? () => {
                closeDrawer()
                nav('/referral')
              }
            : undefined
        }
      />
    </div>
  )
}

/* ─────────────── pieces ─────────────── */

/** The eight stages as one clickable track — the numbered circles with
 *  gradient connectors looked like a diagram of a process, not a filter over
 *  real cases, and stages holding zero cases got the same visual weight. */
function StageTrack({
  counts,
  total,
  active,
  onPick,
  labelFor,
}: {
  counts: Record<CaseStage, number>
  total: number
  active: string
  onPick: (s: CaseStage) => void
  labelFor: (s: CaseStage) => string
}) {
  return (
    <div className="mt-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted">
        {STAGE_SEQUENCE.map((s, i) => (
          <motion.button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            aria-label={`${labelFor(s)} ${counts[s]}`}
            title={`${labelFor(s)} · ${counts[s]}`}
            style={{ backgroundColor: stageColor(i) }}
            initial={{ width: 0 }}
            animate={{
              width: `${total ? (counts[s] / total) * 100 : 0}%`,
              opacity: active === 'all' || active === s ? 1 : 0.45,
            }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 }}
            className="h-full"
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGE_SEQUENCE.map((s, i) => {
          const on = active === s
          return (
            <motion.button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              aria-pressed={on}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                on ? 'border-brand-400 bg-brand-50' : 'border-transparent hover:bg-surface-muted'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: stageColor(i) }}
              />
              <span className={on ? 'font-semibold text-brand-700' : 'text-ink-muted'}>
                {labelFor(s)}
              </span>
              <span className="tabular font-semibold text-ink">{counts[s]}</span>
            </motion.button>
          )
        })}
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

function AgeSlider({
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
    <div className="flex min-w-[195px] flex-col justify-center rounded-xl border border-surface-border px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-medium text-ink-muted">{label}</span>
        <span className="tabular shrink-0 text-[11px] font-bold text-brand-600">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={25}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="range-brand mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, #2f66f6 ${(value / 25) * 100}%, #eef2f7 ${(value / 25) * 100}%)`,
        }}
      />
    </div>
  )
}

function StageChip({ stage, label }: { stage: CaseStage; label: string }) {
  const i = Math.max(0, STAGE_SEQUENCE.indexOf(stage))
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-muted">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stageColor(i) }} />
      {label}
    </span>
  )
}

function CaseRow({
  c,
  index,
  th,
  t,
  pn,
  active,
  onOpen,
  mayAct,
  onPrimary,
}: {
  c: CaseRecord
  index: number
  th: boolean
  t: (k: string) => string
  pn: (k: string) => string
  active: boolean
  onOpen: () => void
  mayAct: boolean
  onPrimary: () => void
}) {
  const done = c.stage === 'resolved'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.28 }}
      className={`group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-500/[0.04] ${
        active ? 'bg-brand-50/70' : ''
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
        aria-label={`${t('iv.openCase')} ${c.studentName}`}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {c.urgent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-risk-critical" />}
          <span className="text-sm font-semibold text-ink">{c.studentName}</span>
          <RiskBadge level={c.riskLevel} size="sm" />
          {c.slaBreached && (
            <span className="inline-flex items-center gap-1 rounded-full bg-risk-critical/10 px-1.5 py-0.5 text-[10px] font-semibold text-risk-critical">
              <IconClock width={10} height={10} />
              {t('common.overdue')}
            </span>
          )}
          {!c.owner && !done && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <IconUsers width={10} height={10} />
              {t('common.unassigned')}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
          <StageChip stage={c.stage} label={t(`stage.${c.stage}`)} />
          <span className="text-ink-faint">·</span>
          <span>
            {pn(c.provinceKey)} · {t(`grade.${c.gradeKey}`)}
          </span>
          <span className="text-ink-faint">·</span>
          <span>
            {th ? 'อัปเดตล่าสุด' : 'updated'} {c.openedDaysAgo} {t('ref.days')}
          </span>
          {c.owner && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="truncate">{c.owner}</span>
            </>
          )}
        </span>
      </button>

      {done ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-risk-normal/10 px-2 py-1 text-[11px] font-semibold text-risk-normal">
          <IconCheck width={12} height={12} />
          {t('stage.resolved')}
        </span>
      ) : (
        mayAct && (
          <Button size="sm" variant={c.owner ? 'secondary' : 'primary'} onClick={onPrimary}>
            {c.owner ? t('iv.advance') : t('iv.assign')}
          </Button>
        )
      )}

      <button
        type="button"
        onClick={onOpen}
        aria-label={t('iv.openCase')}
        className="shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:bg-white hover:text-brand-600"
      >
        <IconChevronRight width={18} height={18} />
      </button>
    </motion.div>
  )
}

/** Slide-over: one case, where it stands in the eight steps, and what to do */
function CaseDrawer({
  c,
  closing,
  onClose,
  th,
  t,
  pn,
  mayAct,
  onTake,
  onAdvance,
  onVisit,
  onResolve,
  onViewStudent,
  onViewPlan,
  onViewReferral,
}: {
  c: CaseRecord | null
  closing: boolean
  onClose: () => void
  th: boolean
  t: (k: string) => string
  pn: (k: string) => string
  mayAct: boolean
  onTake: () => void
  onAdvance: () => void
  onVisit: () => void
  onResolve: () => void
  onViewStudent?: () => void
  onViewPlan?: () => void
  onViewReferral?: () => void
}) {
  useEffect(() => {
    if (!c) return
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
  }, [c, onClose])

  if (!c) return null
  const idx = Math.max(0, STAGE_SEQUENCE.indexOf(c.stage))
  const done = c.stage === 'resolved'

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
        aria-label={c.studentName}
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
              <p className="text-lg font-bold leading-tight text-ink">{c.studentName}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {c.id} · {pn(c.provinceKey)} · {t(`grade.${c.gradeKey}`)}
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RiskBadge level={c.riskLevel} size="sm" />
            {c.urgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-risk-critical/12 px-2 py-0.5 text-[11px] font-semibold text-risk-critical">
                <IconAlert width={11} height={11} />
                {t('iv.urgentCases')}
              </span>
            )}
            {c.slaBreached && (
              <span className="inline-flex items-center gap-1 rounded-full bg-risk-high/12 px-2 py-0.5 text-[11px] font-semibold text-risk-high">
                <IconClock width={11} height={11} />
                {t('common.overdue')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <Fact k={t('common.owner')} v={c.owner ?? t('common.unassigned')} warn={!c.owner} />
            <Fact
              k={th ? 'อัปเดตล่าสุด' : 'Last update'}
              v={`${c.openedDaysAgo} ${t('ref.days')}`}
              warn={c.slaBreached}
            />
            <Fact k={t('common.province')} v={pn(c.provinceKey)} />
            <Fact
              k={th ? 'การส่งต่อที่ผูกกับเคส' : 'Linked referrals'}
              v={String(c.referralCount)}
            />
          </div>

          {/* the eight steps, with this case's position */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {t('iv.pipeline')}
            </p>
            <ol className="relative space-y-2.5 border-l border-surface-border pl-5">
              {STAGE_SEQUENCE.map((s, i) => {
                const passed = i < idx
                const now = i === idx
                return (
                  <li key={s} className="relative">
                    <motion.span
                      className="absolute -left-[26px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full ring-4"
                      style={{
                        background: passed || now ? stageColor(i) : '#cbd5e1',
                        boxShadow: now ? `0 0 0 4px ${stageColor(i)}22` : undefined,
                      }}
                      initial={false}
                      animate={{ scale: now ? [1, 1.3, 1] : 1 }}
                      transition={{ duration: 0.45 }}
                    />
                    <p
                      className={`text-[13px] leading-snug ${
                        now
                          ? 'font-semibold text-ink'
                          : passed
                            ? 'text-ink-muted line-through'
                            : 'text-ink-faint'
                      }`}
                    >
                      <span className="mr-1.5 text-[10px] text-ink-faint">
                        {t('iv.stageOf')} {i + 1}
                      </span>
                      {t(`stage.${s}`)}
                    </p>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* cross-page links that actually navigate */}
          <div className="flex flex-wrap gap-2">
            {onViewStudent && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconArrowRight width={13} height={13} />}
                onClick={onViewStudent}
              >
                {t('iv.viewStudent')}
              </Button>
            )}
            {onViewPlan && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconArrowRight width={13} height={13} />}
                onClick={onViewPlan}
              >
                {t('iv.viewPlan')}
              </Button>
            )}
            {onViewReferral && c.referralCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconArrowRight width={13} height={13} />}
                onClick={onViewReferral}
              >
                {t('iv.viewReferral')} ({c.referralCount})
              </Button>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
          {done ? (
            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-risk-normal/10 py-2.5 text-sm font-semibold text-risk-normal">
              <IconCheck width={16} height={16} />
              {t('stage.resolved')}
            </p>
          ) : !mayAct ? null : (
            <>
              {!c.owner ? (
                <Button
                  variant="primary"
                  icon={<IconUsers width={14} height={14} />}
                  onClick={onTake}
                >
                  {t('iv.takeCase')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<IconArrowRight width={14} height={14} />}
                  onClick={onAdvance}
                >
                  {t('iv.advance')} — {t(`stage.${STAGE_SEQUENCE[Math.min(idx + 1, STAGE_SEQUENCE.length - 1)]}`)}
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  icon={<IconHome width={14} height={14} />}
                  onClick={onVisit}
                >
                  {t('iv.visit')}
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  icon={<IconCheck width={14} height={14} />}
                  onClick={onResolve}
                >
                  {t('iv.resolve')}
                </Button>
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </div>
  )
}

function Fact({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-surface-border px-3 py-2">
      <p className="text-[10px] text-ink-faint">{k}</p>
      <p
        className={`mt-0.5 truncate text-[13px] font-semibold ${
          warn ? 'text-risk-critical' : 'text-ink'
        }`}
      >
        {v}
      </p>
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
        {th ? `แสดง ${from}–${to} จาก ${total} เคส` : `Showing ${from}–${to} of ${total}`}
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
