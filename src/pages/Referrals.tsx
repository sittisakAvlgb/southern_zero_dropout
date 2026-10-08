import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Chart from 'react-apexcharts'
import type { ConsentStatus, Referral, ReferralStatus } from '@/types'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { useToast } from '@/components/ui/Toast'
import { AGENCIES, AGENCY_BY_ID, AGENCY_KIND_COLOR } from '@/data/agencies'
import { CONFERENCES, NEEDS, REFERRAL_STATUS_COLOR } from '@/data/referrals'
import { formatNumber } from '@/lib/format'
import {
  IconAgency,
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconConsent,
  IconReferral,
  IconSearch,
  IconUp,
} from '@/components/icons'

const OPEN_STATUSES: ReferralStatus[] = ['sent', 'accepted', 'inProgress', 'overdue']
const PAGE_SIZE = 10

/** Every referral sits in exactly one of these, in priority order, so the
 *  whole queue fits in a single bar. `rejected` is its own segment — folding
 *  it into "within SLA" would have quietly inflated the healthy share. */
type Health = 'overdue' | 'urgent' | 'consent' | 'onTrack' | 'completed' | 'rejected'
function healthOf(r: Referral): Health {
  if (r.status === 'completed') return 'completed'
  if (r.status === 'rejected') return 'rejected'
  if (r.status === 'overdue') return 'overdue'
  if (r.urgent) return 'urgent'
  if (r.consent !== 'granted') return 'consent'
  return 'onTrack'
}

/** Consent is what keeps a referral in draft: personal data may not cross
 *  agencies without it (PDPA), so these cases never reach an "open" status.
 *  A case that was refused is no longer waiting on consent. */
const waitingOnConsent = (r: Referral) =>
  r.consent !== 'granted' && r.status !== 'rejected' && r.status !== 'completed'

type FocusKey = 'none' | 'overdue' | 'urgent' | 'consent'

/** the only fields a case action may change in this session */
interface CaseChange {
  status?: ReferralStatus
  consent?: ConsentStatus
  toAgencyId?: string
  escalated?: boolean
}

/** what the primary button on a case should do next */
function nextAction(r: Referral): 'accept' | 'start' | 'complete' | 'escalate' | null {
  if (r.status === 'overdue') return 'escalate'
  if (r.status === 'sent' || r.status === 'draft') return 'accept'
  if (r.status === 'accepted') return 'start'
  if (r.status === 'inProgress') return 'complete'
  return null
}

export default function Referrals() {
  const { t, lang, pn, dn } = useI18n()
  const th = lang === 'th'
  const { referrals, user } = useScopedData()
  const { push } = useToast()
  const nav = useNavigate()

  const [tab, setTab] = useState<'list' | 'conference'>('list')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('open')
  const [need, setNeed] = useState('all')
  const [agency, setAgency] = useState('all')
  const [minAge, setMinAge] = useState(0)
  const [focus, setFocus] = useState<FocusKey>('none')
  const [page, setPage] = useState(1)

  // Case work done in this session, layered over the read-only mock.
  const [changes, setChanges] = useState<Record<string, CaseChange>>({})

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
      referrals.map((r) => {
        const c = changes[r.id]
        return c ? { ...r, ...c } : r
      }),
    [referrals, changes],
  )
  const escalatedIds = useMemo(
    () => new Set(Object.entries(changes).filter(([, c]) => c.escalated).map(([id]) => id)),
    [changes],
  )

  const stats = useMemo(() => {
    const byHealth = (h: Health) => records.filter((r) => healthOf(r) === h).length
    return {
      open: records.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      overdue: byHealth('overdue'),
      urgent: byHealth('urgent'),
      consent: byHealth('consent'),
      onTrack: byHealth('onTrack'),
      completed: byHealth('completed'),
      rejected: byHealth('rejected'),
      consentAll: records.filter(waitingOnConsent).length,
      urgentAll: records.filter((r) => r.urgent && r.status !== 'completed').length,
      avgDays:
        Math.round(
          (records.reduce((s, r) => s + r.openedDaysAgo, 0) / Math.max(1, records.length)) * 10,
        ) / 10,
    }
  }, [records])

  const byNeed = useMemo(
    () =>
      NEEDS.map((n) => ({
        need: n,
        label: t(`need.${n}`),
        count: records.filter((r) => r.need === n).length,
        overdue: records.filter((r) => r.need === n && r.status === 'overdue').length,
      }))
        .filter((d) => d.count > 0)
        .sort((a, b) => a.count - b.count),
    [records, t],
  )

  const flows = useMemo(() => {
    const acc = new Map<string, number>()
    for (const r of records) {
      const k = `${r.fromAgencyId}|${r.toAgencyId}`
      acc.set(k, (acc.get(k) ?? 0) + 1)
    }
    return [...acc.entries()]
      .map(([k, count]) => {
        const [from, to] = k.split('|')
        return { key: k, from: AGENCY_BY_ID[from], to: AGENCY_BY_ID[to], toId: to, count }
      })
      .filter((f) => f.from && f.to)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [records])
  const maxFlow = Math.max(...flows.map((f) => f.count), 1)

  const agencyOptions = useMemo(() => {
    const ids = Array.from(new Set(records.map((r) => r.toAgencyId)))
    return ids
      .map((id) => AGENCY_BY_ID[id])
      .filter(Boolean)
      .sort((a, b) => a.th.localeCompare(b.th, 'th'))
  }, [records])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inFocus = (r: Referral) => {
      switch (focus) {
        case 'overdue':
          return r.status === 'overdue'
        case 'urgent':
          return r.urgent && r.status !== 'completed'
        case 'consent':
          return waitingOnConsent(r)
        default:
          return true
      }
    }
    return records
      .filter(
        (r) =>
          (status === 'all' ||
            (status === 'open' ? OPEN_STATUSES.includes(r.status) : r.status === status)) &&
          (need === 'all' || r.need === need) &&
          (agency === 'all' || r.toAgencyId === agency) &&
          r.openedDaysAgo >= minAge &&
          (!q || r.childName.toLowerCase().includes(q)) &&
          inFocus(r),
      )
      .sort((a, b) => {
        const rank = (r: Referral) =>
          r.status === 'overdue' ? 0 : r.urgent ? 1 : r.consent !== 'granted' ? 2 : 3
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        return b.openedDaysAgo / b.slaDays - a.openedDaysAgo / a.slaDays
      })
  }, [records, status, need, agency, minAge, query, focus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])
  const pageStart = (safePage - 1) * PAGE_SIZE
  const rows = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  const openCase = openId ? records.find((r) => r.id === openId) ?? null : null

  /** Conferences whose child actually has referrals *in this user's scope*
   *  come first — their "see this child's cases" link is the only one that can
   *  land on results, and a link that lands on an empty list is a dead end. */
  const childrenWithCases = useMemo(
    () => new Set(records.map((r) => r.childName)),
    [records],
  )
  const conferences = useMemo(() => {
    const districts = new Set(records.map((r) => r.districtKey))
    const linked = CONFERENCES.filter((c) => childrenWithCases.has(c.childName))
    const sameArea = CONFERENCES.filter(
      (c) => districts.has(c.districtKey) && !childrenWithCases.has(c.childName),
    )
    const rows = [...linked, ...sameArea]
    return rows.length ? rows : CONFERENCES.slice(0, 6)
  }, [records, childrenWithCases])

  const activeFilters =
    (query.trim() ? 1 : 0) +
    (status !== 'open' ? 1 : 0) +
    (need !== 'all' ? 1 : 0) +
    (agency !== 'all' ? 1 : 0) +
    (minAge > 0 ? 1 : 0) +
    (focus !== 'none' ? 1 : 0)

  const clearAll = () => {
    setQuery('')
    setStatus('open')
    setNeed('all')
    setAgency('all')
    setMinAge(0)
    setFocus('none')
    setPage(1)
  }

  const toggleFocus = (f: FocusKey) => {
    const next = focus === f ? 'none' : f
    setFocus(next)
    // consent-blocked referrals sit in `draft`, which the default "open"
    // status filter hides — asking for them has to widen the status filter,
    // otherwise the chip reads 34 and the list comes back empty
    if (next === 'consent') setStatus('all')
    else if (next !== 'none') setStatus('open')
    setTab('list')
    setPage(1)
  }

  // ── actions that actually change the case ──────────────────
  const apply = (r: Referral, patch: CaseChange, msg: string) => {
    setChanges((c) => ({ ...c, [r.id]: { ...c[r.id], ...patch } }))
    push(msg)
  }

  const accept = (r: Referral) =>
    apply(r, { status: 'accepted' }, th ? `รับเคส ${r.childName} แล้ว` : `Accepted ${r.childName}`)

  const start = (r: Referral) =>
    apply(
      r,
      { status: 'inProgress' },
      th ? `เริ่มดำเนินการเคส ${r.childName} แล้ว` : `Work started on ${r.childName}`,
    )

  const complete = (r: Referral) =>
    apply(
      r,
      { status: 'completed' },
      th ? `ปิดเคส ${r.childName} เรียบร้อย` : `Case closed for ${r.childName}`,
    )

  /** hand an overdue case to the province-level administration */
  const escalate = (r: Referral) => {
    const provinceAdmin =
      AGENCIES.find((a) => a.kind === 'admin' && a.provinceKey === r.provinceKey) ??
      AGENCIES.find((a) => a.kind === 'admin')
    apply(
      r,
      { status: 'accepted', escalated: true, toAgencyId: provinceAdmin?.id ?? r.toAgencyId },
      th
        ? `ยกระดับเคส ${r.childName} ไปยัง ${provinceAdmin?.th ?? 'ระดับจังหวัด'} แล้ว`
        : `${r.childName} escalated to ${provinceAdmin?.en ?? 'province level'}`,
    )
  }

  const askConsent = (r: Referral) =>
    apply(
      r,
      { consent: 'granted' },
      th
        ? `บันทึกความยินยอมของครอบครัว ${r.childName} แล้ว`
        : `Family consent recorded for ${r.childName}`,
    )

  const runAction = (r: Referral, a: ReturnType<typeof nextAction>) => {
    if (a === 'accept') accept(r)
    else if (a === 'start') start(r)
    else if (a === 'complete') complete(r)
    else if (a === 'escalate') escalate(r)
  }

  const actionLabel = (a: ReturnType<typeof nextAction>) =>
    a === 'accept'
      ? t('ref.accept')
      : a === 'start'
        ? t('ref.start')
        : a === 'complete'
          ? t('ref.complete')
          : a === 'escalate'
            ? t('ref.escalate')
            : ''

  /** cross-page links — only offered when the role may actually open them */
  const canPlan = canAccess(user, '/plan')
  const canRegistry = canAccess(user, '/oosc')

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconReferral width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.referral')]} />}
        title={t('ref.title')}
        subtitle={t('ref.subtitle')}
        actions={
          <div className="inline-flex rounded-xl border border-surface-border bg-surface-muted p-1">
            {(['list', 'conference'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-pressed={tab === k}
                className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === k ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {tab === k && (
                  <motion.span
                    layoutId="ref-tab"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">
                  {k === 'list' ? (th ? 'รายการส่งต่อ' : 'Referrals') : t('ref.conference')}
                </span>
              </button>
            ))}
          </div>
        }
      />

      {/* ── One number to act on + where every referral stands ── */}
      <Card className="mb-4">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => toggleFocus('overdue')}
            aria-pressed={focus === 'overdue'}
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
                <AnimatedCounter value={stats.overdue} />
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink">{t('ref.overdue')}</span>
              <span className="block text-[11px] text-ink-muted">
                {th
                  ? `จากเคสที่เปิดอยู่ ${formatNumber(stats.open, lang)} เคส · กดเพื่อดูเฉพาะเคสที่เกินกำหนด`
                  : `of ${formatNumber(stats.open, lang)} open cases · tap to see only the late ones`}
              </span>
            </span>
          </button>

          <div className="hidden h-16 w-px shrink-0 bg-surface-border lg:block" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold text-ink-muted">{t('ref.health')}</p>
              <p className="text-[11px] text-ink-faint">
                {t('ref.avgDays')}{' '}
                <span className="tabular font-bold text-ink">
                  {stats.avgDays} {t('ref.days')}
                </span>
              </p>
            </div>
            <HealthTrack
              total={records.length}
              parts={[
                { key: 'overdue', label: t('ref.overdue'), value: stats.overdue, color: '#dc2626' },
                { key: 'urgent', label: t('ref.urgent'), value: stats.urgent, color: '#f97316' },
                { key: 'consent', label: t('ref.blockedConsent'), value: stats.consent, color: '#eab308' },
                { key: 'onTrack', label: t('ref.onTrack'), value: stats.onTrack, color: '#2f66f6' },
                { key: 'completed', label: t('ref.completed'), value: stats.completed, color: '#16a34a' },
                { key: 'rejected', label: t('refstatus.rejected'), value: stats.rejected, color: '#94a3b8' },
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <MiniChip
                icon={<IconClock width={12} height={12} />}
                label={t('ref.urgent')}
                value={stats.urgentAll}
                active={focus === 'urgent'}
                onClick={() => toggleFocus('urgent')}
              />
              <MiniChip
                icon={<IconConsent width={12} height={12} />}
                label={t('ref.blockedConsent')}
                value={stats.consentAll}
                active={focus === 'consent'}
                onClick={() => toggleFocus('consent')}
              />
            </div>
          </div>
        </div>
      </Card>

      {tab === 'list' ? (
        <>
          <Card>
            <CardHeader
              title={th ? 'รายการส่งต่อ' : 'Referral queue'}
              subtitle={t('consent.note')}
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
                    placeholder={t('ref.search')}
                    aria-label={t('ref.search')}
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
                  label={t('ref.ageFilter')}
                  unit={t('ref.days')}
                />

                <Select
                  value={status}
                  onChange={(v) => {
                    setStatus(v)
                    setPage(1)
                  }}
                  options={[
                    { value: 'open', label: t('ref.open') },
                    { value: 'all', label: th ? 'ทุกสถานะ' : 'All statuses' },
                    ...(['sent', 'accepted', 'inProgress', 'overdue', 'completed', 'rejected'] as ReferralStatus[]).map(
                      (s) => ({ value: s, label: t(`refstatus.${s}`) }),
                    ),
                  ]}
                  className="w-[150px]"
                />
                <Select
                  value={need}
                  onChange={(v) => {
                    setNeed(v)
                    setPage(1)
                  }}
                  options={[
                    { value: 'all', label: th ? 'ทุกประเภท' : 'All needs' },
                    ...[...byNeed].reverse().map((n) => ({ value: n.need, label: n.label })),
                  ]}
                  className="w-[165px]"
                />
                <Select
                  value={agency}
                  onChange={(v) => {
                    setAgency(v)
                    setPage(1)
                  }}
                  options={[
                    { value: 'all', label: th ? 'ทุกหน่วยงานผู้รับ' : 'All receivers' },
                    ...agencyOptions.map((a) => ({ value: a.id, label: th ? a.th : a.en })),
                  ]}
                  className="w-[185px]"
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
                        ? t('ref.overdue')
                        : focus === 'urgent'
                          ? t('ref.urgent')
                          : t('ref.blockedConsent')}
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
                      ? 'ไม่มีเคสค้างในขอบเขตของคุณ'
                      : 'No open cases in your scope'
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
                {rows.map((r, i) => (
                  <ReferralRow
                    key={r.id}
                    r={r}
                    index={i}
                    th={th}
                    t={t}
                    dn={dn}
                    escalated={escalatedIds.has(r.id)}
                    active={openId === r.id}
                    onOpen={() => setOpenId(r.id)}
                    onAction={() => runAction(r, nextAction(r))}
                    actionLabel={actionLabel(nextAction(r))}
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
                title={t('ref.byNeed')}
                subtitle={
                  th
                    ? 'ส่วนสีแดงคือเคสที่เกินกรอบเวลา — คอขวดอยู่ที่บริการ ไม่ใช่ที่คนทำงาน · กดเพื่อกรอง'
                    : 'The red part is past SLA — the bottleneck is the service, not the caseworker · tap to filter'
                }
              />
              <div className="px-2 pb-2">
                <Chart
                  type="bar"
                  height={300}
                  series={[
                    {
                      name: th ? 'อยู่ในกรอบเวลา' : 'Within SLA',
                      data: byNeed.map((d) => d.count - d.overdue),
                    },
                    { name: t('ref.overdue'), data: byNeed.map((d) => d.overdue) },
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
                          const hit = byNeed[opts?.dataPointIndex ?? -1]
                          if (hit) {
                            setNeed(need === hit.need ? 'all' : hit.need)
                            setPage(1)
                          }
                        },
                      },
                    },
                    plotOptions: { bar: { horizontal: true, barHeight: '62%', borderRadius: 4 } },
                    colors: ['#2f66f6', '#dc2626'],
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
                      categories: byNeed.map((d) => d.label),
                      labels: { style: { fontSize: '10px', colors: '#94a3b8' } },
                      axisBorder: { show: false },
                      axisTicks: { show: false },
                    },
                    yaxis: { labels: { style: { fontSize: '10px', colors: '#5b6b82' } } },
                    tooltip: { y: { formatter: (v: number) => `${formatNumber(v, lang)}` } },
                  }}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t('ref.flows')}
                subtitle={
                  th
                    ? 'ใครส่งให้ใครมากที่สุด — กดเพื่อกรองเฉพาะเคสที่ส่งถึงหน่วยงานนั้น'
                    : 'Who hands work to whom — tap to filter by the receiving agency'
                }
              />
              <div className="flex flex-col gap-2.5 px-5 pb-5 pt-3">
                {flows.map((f, i) => (
                  <motion.button
                    key={f.key}
                    type="button"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ x: 2 }}
                    onClick={() => {
                      setAgency(agency === f.toId ? 'all' : f.toId)
                      setPage(1)
                    }}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      agency === f.toId
                        ? 'border-brand-400 bg-brand-50/60'
                        : 'border-surface-border hover:bg-surface-muted'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: AGENCY_KIND_COLOR[f.from.kind] }}
                      />
                      <span className="truncate text-ink-muted">{th ? f.from.th : f.from.en}</span>
                      <IconArrowRight width={11} height={11} className="shrink-0 text-ink-faint" />
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: AGENCY_KIND_COLOR[f.to.kind] }}
                      />
                      <span className="truncate text-ink-muted">{th ? f.to.th : f.to.en}</span>
                      <span className="tabular ml-auto shrink-0 font-semibold text-ink">
                        {f.count}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full rounded-full bg-brand-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(f.count / maxFlow) * 100}%` }}
                        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 + i * 0.05 }}
                      />
                    </div>
                  </motion.button>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : (
        // ── Case conferences ────────────────────────────────
        <div className="grid gap-4 lg:grid-cols-2">
          {conferences.slice(0, 8).map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full">
                <CardHeader
                  title={c.childName}
                  subtitle={`${dn(c.districtKey)} · ${c.date} · ${t('ref.chair')}: ${c.chair}`}
                />
                <div className="px-5 pb-5 pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {t('ref.attendees')}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.attendeeAgencyIds.map((id) => {
                      const a = AGENCY_BY_ID[id]
                      if (!a) return null
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
                          style={{
                            background: `${AGENCY_KIND_COLOR[a.kind]}14`,
                            color: AGENCY_KIND_COLOR[a.kind],
                          }}
                        >
                          <IconAgency width={11} height={11} />
                          {t(`kindA.${a.kind}`)}
                        </span>
                      )
                    })}
                  </div>

                  <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {t('ref.decisions')}
                  </div>
                  <ul className="mt-1.5 space-y-1.5">
                    {c.decisions.map((d, j) => (
                      <li key={j} className="flex gap-2 text-[13px] leading-snug text-ink-muted">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                        {d}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                      {t('ref.nextReview')}{' '}
                      <span className="tabular font-semibold text-ink">
                        {c.nextReviewDays} {t('ref.days')}
                      </span>
                    </div>
                    {/* real action — offered only when it can land on results */}
                    {childrenWithCases.has(c.childName) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<IconArrowRight width={14} height={14} />}
                        onClick={() => {
                          setTab('list')
                          setQuery(c.childName)
                          setStatus('all')
                          setNeed('all')
                          setAgency('all')
                          setMinAge(0)
                          setFocus('none')
                          setPage(1)
                          push(
                            th
                              ? `กรองรายการส่งต่อของ ${c.childName}`
                              : `Filtered referrals for ${c.childName}`,
                          )
                        }}
                      >
                        {th ? 'ดูเคสส่งต่อของเด็กคนนี้' : 'See this child’s referrals'}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-ink-faint">
                        {th
                          ? 'ยังไม่มีเคสส่งต่อของเด็กคนนี้ในขอบเขตของคุณ'
                          : 'No referrals for this child in your scope'}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {user?.role === 'agency' && (
        <p className="mt-4 rounded-xl bg-purple-50 px-4 py-3 text-xs text-purple-800">
          {th
            ? `คุณกำลังใช้งานในบทบาทหน่วยงานรับส่งต่อ — เห็นเฉพาะเคสที่ส่งถึงหน่วยงานของคุณ (${formatNumber(referrals.length)} รายการ) พร้อมนาฬิกา SLA`
            : `Signed in as a receiving agency — you see only cases addressed to you (${formatNumber(referrals.length)}), each with its SLA clock.`}
        </p>
      )}

      <CaseDrawer
        r={openCase}
        closing={closing}
        onClose={closeDrawer}
        th={th}
        t={t}
        dn={dn}
        pn={pn}
        escalated={openCase ? escalatedIds.has(openCase.id) : false}
        onAction={(a) => openCase && runAction(openCase, a)}
        actionLabel={actionLabel}
        onAskConsent={() => openCase && askConsent(openCase)}
        onViewPlan={
          canPlan
            ? () => {
                closeDrawer()
                nav('/plan')
              }
            : undefined
        }
        onViewRegistry={
          canRegistry
            ? () => {
                closeDrawer()
                nav('/oosc')
              }
            : undefined
        }
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
    <div className="flex min-w-[190px] flex-col justify-center rounded-xl border border-surface-border px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-medium text-ink-muted">{label}</span>
        <span className="tabular shrink-0 text-[11px] font-bold text-brand-600">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={60}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="range-brand mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, #2f66f6 ${(value / 60) * 100}%, #eef2f7 ${(value / 60) * 100}%)`,
        }}
      />
    </div>
  )
}

/** SLA clock: how much of the allowed window is already spent */
function SlaBar({ r, wide = false }: { r: Referral; wide?: boolean }) {
  const pct = (r.openedDaysAgo / Math.max(1, r.slaDays)) * 100
  const color = pct >= 100 ? '#dc2626' : pct >= 75 ? '#f97316' : '#16a34a'
  return (
    <div className={wide ? 'w-full' : 'w-24'}>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="tabular mt-0.5 text-[10px] text-ink-faint">
        {r.openedDaysAgo}/{r.slaDays}
      </div>
    </div>
  )
}

function StatusChip({ r, t }: { r: Referral; t: (k: string) => string }) {
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: `${REFERRAL_STATUS_COLOR[r.status]}18`,
        color: REFERRAL_STATUS_COLOR[r.status],
      }}
    >
      {t(`refstatus.${r.status}`)}
    </span>
  )
}

function ReferralRow({
  r,
  index,
  th,
  t,
  dn,
  escalated,
  active,
  onOpen,
  onAction,
  actionLabel,
}: {
  r: Referral
  index: number
  th: boolean
  t: (k: string) => string
  dn: (k: string) => string
  escalated: boolean
  active: boolean
  onOpen: () => void
  onAction: () => void
  actionLabel: string
}) {
  const from = AGENCY_BY_ID[r.fromAgencyId]
  const to = AGENCY_BY_ID[r.toAgencyId]
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
        aria-label={th ? `เปิดเคสของ ${r.childName}` : `Open case for ${r.childName}`}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {r.urgent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-risk-critical" />}
          <span className="text-sm font-semibold text-ink">{r.childName}</span>
          <StatusChip r={r} t={t} />
          {escalated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
              <IconUp width={10} height={10} />
              {t('ref.escalated')}
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
          {t(`need.${r.need}`)} · {dn(r.districtKey)} ·{' '}
          <span className="text-ink-faint">{th ? from?.th : from?.en}</span>
          {' → '}
          <span className="font-medium text-ink-muted">{th ? to?.th : to?.en}</span>
        </span>
      </button>

      <span className="hidden shrink-0 sm:block">
        <SlaBar r={r} />
      </span>

      {actionLabel ? (
        <Button
          size="sm"
          variant={r.status === 'overdue' ? 'danger' : 'secondary'}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-lg bg-risk-normal/10 px-2 py-1 text-[11px] font-semibold text-risk-normal">
          <IconCheck width={12} height={12} />
          {t('ref.completed')}
        </span>
      )}

      <button
        type="button"
        onClick={onOpen}
        aria-label={th ? 'เปิดดูเคส' : 'Open the case'}
        className="shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:bg-white hover:text-brand-600"
      >
        <IconChevronRight width={18} height={18} />
      </button>
    </motion.div>
  )
}

/** Slide-over: one case, its clock, and every action that moves it */
function CaseDrawer({
  r,
  closing,
  onClose,
  th,
  t,
  dn,
  pn,
  escalated,
  onAction,
  actionLabel,
  onAskConsent,
  onViewPlan,
  onViewRegistry,
}: {
  r: Referral | null
  closing: boolean
  onClose: () => void
  th: boolean
  t: (k: string) => string
  dn: (k: string) => string
  pn: (k: string) => string
  escalated: boolean
  onAction: (a: ReturnType<typeof nextAction>) => void
  actionLabel: (a: ReturnType<typeof nextAction>) => string
  onAskConsent: () => void
  onViewPlan?: () => void
  onViewRegistry?: () => void
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

  const from = AGENCY_BY_ID[r.fromAgencyId]
  const to = AGENCY_BY_ID[r.toAgencyId]
  const action = nextAction(r)
  const stages: { key: ReferralStatus; label: string }[] = [
    { key: 'sent', label: t('refstatus.sent') },
    { key: 'accepted', label: t('refstatus.accepted') },
    { key: 'inProgress', label: t('refstatus.inProgress') },
    { key: 'completed', label: t('refstatus.completed') },
  ]
  const stageIndex = Math.max(
    0,
    stages.findIndex((s) => s.key === (r.status === 'overdue' ? 'sent' : r.status)),
  )

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
        aria-label={r.childName}
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
              <p className="text-lg font-bold leading-tight text-ink">{r.childName}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {dn(r.districtKey)} · {pn(r.provinceKey)} · {t(`need.${r.need}`)}
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
            <StatusChip r={r} t={t} />
            {r.urgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-risk-critical/12 px-2 py-0.5 text-[11px] font-semibold text-risk-critical">
                <IconAlert width={11} height={11} />
                {t('ref.urgent')}
              </span>
            )}
            {escalated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                <IconUp width={11} height={11} />
                {t('ref.escalated')}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                r.consent === 'granted'
                  ? 'bg-risk-normal/12 text-risk-normal'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              <IconConsent width={11} height={11} />
              {t(`consent.${r.consent}`)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* the hand-off */}
          <div className="rounded-xl border border-surface-border p-3">
            <p className="text-xs font-semibold text-ink-muted">
              {t('ref.from')} → {t('ref.to')}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: AGENCY_KIND_COLOR[from?.kind ?? 'admin'] }}
                  />
                  <span className="truncate text-[12px] font-medium text-ink">
                    {th ? from?.th : from?.en}
                  </span>
                </span>
              </span>
              <IconArrowRight width={14} height={14} className="shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: AGENCY_KIND_COLOR[to?.kind ?? 'social'] }}
                  />
                  <span className="truncate text-[12px] font-medium text-ink">
                    {th ? to?.th : to?.en}
                  </span>
                </span>
              </span>
            </div>
            {to?.contact && (
              <p className="mt-2 text-[11px] text-ink-faint">
                {th ? 'ติดต่อ' : 'Contact'}: {to.contact}
              </p>
            )}
          </div>

          {/* SLA */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-ink-muted">{t('ref.age')}</span>
              <span className="tabular text-sm font-bold text-ink">
                {r.openedDaysAgo} / {r.slaDays} {t('ref.days')}
              </span>
            </div>
            <div className="mt-1.5">
              <SlaBar r={r} wide />
            </div>
          </div>

          {/* stage tracker */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {th ? 'ความคืบหน้าของเคส' : 'Case progress'}
            </p>
            <div className="flex items-center gap-1">
              {stages.map((s, i) => {
                const done = i <= stageIndex && r.status !== 'overdue'
                const isNow = i === stageIndex
                return (
                  <div key={s.key} className="min-w-0 flex-1">
                    <motion.div
                      className="h-1.5 rounded-full"
                      style={{
                        backgroundColor: done ? '#2f66f6' : '#eef2f7',
                      }}
                      initial={{ scaleX: 0.2, opacity: 0.4 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ duration: 0.4, delay: i * 0.06 }}
                    />
                    <p
                      className={`mt-1 truncate text-[10px] ${
                        isNow ? 'font-semibold text-brand-600' : 'text-ink-faint'
                      }`}
                    >
                      {s.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* note */}
          {r.note && (
            <div className="rounded-xl bg-surface-muted p-3">
              <p className="text-xs font-semibold text-ink-muted">
                {th ? 'บันทึกจากผู้ส่ง' : 'Note from the sender'}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{r.note}</p>
            </div>
          )}

          {/* consent action */}
          {r.consent !== 'granted' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] leading-relaxed text-amber-800">{t('consent.note')}</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                icon={<IconConsent width={13} height={13} />}
                onClick={onAskConsent}
              >
                {t('ref.askConsent')}
              </Button>
            </div>
          )}

          {/* cross-page links that actually navigate */}
          <div className="flex flex-wrap gap-2">
            {onViewPlan && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconArrowRight width={13} height={13} />}
                onClick={onViewPlan}
              >
                {t('ref.viewPlan')}
              </Button>
            )}
            {onViewRegistry && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconArrowRight width={13} height={13} />}
                onClick={onViewRegistry}
              >
                {t('ref.viewRegistry')}
              </Button>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-surface-border bg-white/95 px-5 py-4 backdrop-blur">
          {action ? (
            <Button
              variant={action === 'escalate' ? 'danger' : 'primary'}
              className="flex-1"
              icon={
                action === 'escalate' ? (
                  <IconUp width={14} height={14} />
                ) : (
                  <IconCheck width={14} height={14} />
                )
              }
              onClick={() => onAction(action)}
            >
              {actionLabel(action)}
            </Button>
          ) : (
            <p className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-risk-normal/10 py-2.5 text-sm font-semibold text-risk-normal">
              <IconCheck width={16} height={16} />
              {t('ref.completed')}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
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
