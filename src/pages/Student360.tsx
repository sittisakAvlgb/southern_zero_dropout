import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import Chart from 'react-apexcharts'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { RiskBadge } from '@/components/ui/RiskBadge'
import { RiskGauge } from '@/components/ui/RiskGauge'
import { useToast } from '@/components/ui/Toast'
import { useI18n } from '@/i18n/LanguageContext'
import { RISK_COLOR, RISK_BG, RISK_WEIGHTS } from '@/lib/risk'
import type { RiskInputs } from '@/lib/risk'
import type { CauseKey, InterventionEvent, RiskLevel, Student } from '@/types'
import { useScopedData } from '@/auth/scope'
import {
  applyLog,
  lastContact,
  lastVisit,
  useCaseLog,
  type ContactOutcome,
  type FamilyProfile,
  type LogMode,
  type VisitSignature,
} from '@/lib/caseLog'
import { canAccess, canWorkCases } from '@/auth/roles'
import { ScopeBanner } from '@/components/auth/ScopeBanner'
import { DirectOnlyNotice } from '@/components/auth/DirectOnlyNotice'
import {
  IconArrowRight,
  IconCause,
  IconCheck,
  IconClock,
  IconClose,
  IconConsent,
  IconExport,
  IconHome,
  IconPathway,
  IconReferral,
  IconSearch,
  IconStudent,
  IconUser,
} from '@/components/icons'

/** the six sub-scores in model order, with their weight */
const FACTORS: { key: keyof RiskInputs; weight: number; th: string; en: string }[] = [
  { key: 'attendanceRisk', weight: RISK_WEIGHTS.attendance, th: 'การมาเรียน', en: 'Attendance' },
  { key: 'academicRisk', weight: RISK_WEIGHTS.academic, th: 'การเรียน', en: 'Academic' },
  { key: 'behaviorRisk', weight: RISK_WEIGHTS.behavior, th: 'พฤติกรรม', en: 'Behavior' },
  { key: 'familyRisk', weight: RISK_WEIGHTS.family, th: 'ครอบครัว', en: 'Family' },
  { key: 'wellbeingRisk', weight: RISK_WEIGHTS.wellbeing, th: 'สุขภาวะ', en: 'Wellbeing' },
  { key: 'parentRisk', weight: RISK_WEIGHTS.parent, th: 'ผู้ปกครอง', en: 'Parent' },
]

const PARENT_META: Record<Student['parentContact'], { key: string; level: RiskLevel }> = {
  ok: { key: 'st.parent.ok', level: 'normal' },
  delayed: { key: 'st.parent.delayed', level: 'watch' },
  unreachable: { key: 'st.parent.unreachable', level: 'critical' },
}

function subScoreLevel(v: number): RiskLevel {
  if (v >= 85) return 'critical'
  if (v >= 70) return 'high'
  if (v >= 40) return 'watch'
  return 'normal'
}

type Tab = 'overview' | 'risk' | 'trend' | 'visit' | 'timeline'
type RiskFilter = 'all' | 'high' | 'watch' | 'normal'

interface LogResult {
  mode: LogMode
  date: string
  /** the timeline sentence assembled from the form */
  note: string
  /** contact outcomes also move the child's parent-contact status */
  parentContact?: Student['parentContact']
  channel?: string
  outcome?: ContactOutcome
  /** the day the teacher committed to coming back */
  followUpDate?: string
  /** visit mode only */
  attendees?: string[]
  family?: FamilyProfile
  arrivedAt?: string
  signature?: VisitSignature
  consent?: Student['consent']
}

const CHANNELS = ['phone', 'home', 'leader', 'message', 'school'] as const

const ATTENDEES = ['student', 'parent', 'guardian', 'community'] as const
const RELATIONS = ['mother', 'father', 'grandparent', 'relative', 'other'] as const
const INCOME_BANDS = ['under5k', '5to10k', '10to15k', 'over15k', 'unstable', 'unknown'] as const
const HOUSING = ['own', 'rent', 'relative', 'temporary'] as const
const STUDY_COND = ['desk', 'electricity', 'internet', 'device', 'quiet'] as const

/** What a visiting teacher can realistically observe or be told at the door.
 *  Drawn from the platform's own cause list so a visit feeds the same taxonomy
 *  `/cause` reports on, rather than a checklist invented for this form. */
const VISIT_FINDINGS: CauseKey[] = [
  'poverty',
  'travel',
  'family',
  'health',
  'childLabour',
  'migration',
  'noDevice',
  'earlyMarriage',
  'noDocuments',
  'unrestAffected',
]
const OUTCOMES: ContactOutcome[] = ['reached', 'appointment', 'noAnswer', 'wrongNumber', 'refused']

/** what each outcome means for the child's parent-contact status */
const OUTCOME_TO_STATUS: Record<ContactOutcome, Student['parentContact']> = {
  reached: 'ok',
  appointment: 'ok',
  noAnswer: 'delayed',
  wrongNumber: 'unreachable',
  refused: 'delayed',
}

export default function Student360() {
  const { t, pn, dn, lang } = useI18n()
  const th = lang === 'th'
  const toast = useToast()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { students, plans, referrals, cases, user } = useScopedData()

  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [tab, setTab] = useState<Tab>('overview')

  /** Work this account has recorded, read back from the persisted log rather
   *  than from page state — a call logged here survives a reload, which is the
   *  difference between a demo gesture and something a teacher can rely on. */
  const log = useCaseLog(user?.id)
  /** which logging form is open, if any */
  const [logMode, setLogMode] = useState<LogMode | null>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return students
      .filter((s) => {
        if (riskFilter === 'high') {
          if (s.riskLevel !== 'high' && s.riskLevel !== 'critical') return false
        } else if (riskFilter !== 'all' && s.riskLevel !== riskFilter) return false
        return !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
      })
      .sort((a, b) => b.riskScore - a.riskScore)
  }, [students, query, riskFilter])

  const idParam = params.get('id')
  const base: Student | null =
    (idParam && students.find((s) => s.id === idParam)) || list[0] || students[0] || null

  const selected: Student | null = useMemo(
    () => (base ? applyLog(base, log) : null),
    [base, log],
  )
  /** entries this account wrote for the open child, newest first — the only
   *  rows that may be deleted, because the seeded history is not ours to edit */
  const myEntries = useMemo(
    () => (base ? log.entries.filter((e) => e.childId === base.id) : []),
    [base, log.entries],
  )
  const latestContact = useMemo(
    () => (base ? lastContact(base.id, log) : undefined),
    [base, log],
  )
  const latestVisit = useMemo(() => (base ? lastVisit(base.id, log) : undefined), [base, log])
  /** The card says "newest first"; the seeded history is stored oldest-first,
   *  so it has to be sorted rather than concatenated. Own entries carry their
   *  id so the row can offer a delete — the seeded record is not ours to edit. */
  /** What is actually outstanding for the open child. Each row is a condition
   *  on their record plus the control that clears it — so "ยังไม่ได้เยี่ยมบ้าน"
   *  disappears the moment a visit is logged, rather than sitting there as a
   *  static instruction. */
  const nextActions = useMemo(() => {
    if (!selected) return [] as {
      key: string
      tone: RiskLevel
      th: string
      en: string
      doTh: string
      doEn: string
      run: () => void
    }[]
    const due = log.entries.find(
      (e) => e.childId === selected.id && e.followUpDate && !e.followUpDone,
    )
    const rows: {
      key: string
      tone: RiskLevel
      th: string
      en: string
      doTh: string
      doEn: string
      run: () => void
    }[] = []
    if (due)
      rows.push({
        key: 'followUp',
        tone: 'critical',
        th: `ถึงนัดที่คุณลงไว้ ${due.followUpDate}`,
        en: `Your follow-up is booked for ${due.followUpDate}`,
        doTh: 'บันทึกผล',
        doEn: 'Log the result',
        run: () => setLogMode('contact'),
      })
    if (selected.parentContact !== 'ok')
      rows.push({
        key: 'parent',
        tone: selected.parentContact === 'unreachable' ? 'critical' : 'high',
        th:
          selected.parentContact === 'unreachable'
            ? 'ติดต่อผู้ปกครองไม่ได้ — ควรใช้ผู้นำชุมชนหรือไปพบที่บ้าน'
            : 'ผู้ปกครองยังตอบไม่ครบ ควรติดต่อซ้ำ',
        en:
          selected.parentContact === 'unreachable'
            ? 'Parent unreachable — try a community leader or go to the house'
            : 'Parent has not answered fully — try again',
        doTh: 'บันทึกการติดต่อ',
        doEn: 'Log a contact',
        run: () => setLogMode('contact'),
      })
    if (!selected.homeVisited && (selected.riskLevel === 'high' || selected.riskLevel === 'critical'))
      rows.push({
        key: 'visit',
        tone: 'high',
        th: 'เสี่ยงสูงแต่ยังไม่มีบันทึกการเยี่ยมบ้าน',
        en: 'High risk with no home visit on record',
        doTh: 'บันทึกการเยี่ยมบ้าน',
        doEn: 'Log a visit',
        run: () => setLogMode('visit'),
      })
    if (!selected.planId && canAccess(user, '/plan'))
      rows.push({
        key: 'plan',
        tone: 'watch',
        th: 'ยังไม่มีแผนโอกาสรายบุคคล',
        en: 'No individual opportunity plan yet',
        doTh: 'เปิดหน้าแผน',
        doEn: 'Open plans',
        run: () => nav('/plan'),
      })
    if (selected.consent !== 'granted')
      rows.push({
        key: 'consent',
        tone: 'watch',
        th: 'ยังไม่ได้ความยินยอม — ข้อมูลส่งข้ามหน่วยงานไม่ได้',
        en: 'No consent yet — data cannot cross agencies',
        doTh: 'บันทึกการติดต่อ',
        doEn: 'Log a contact',
        run: () => setLogMode('contact'),
      })
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, log.entries, user])

  const timelineRows = useMemo(() => {
    const mine = myEntries.map((entry) => ({
      kind: 'mine' as const,
      key: entry.id,
      date: entry.date,
      entry,
    }))
    const seeded = (base?.timeline ?? []).map((ev, i) => ({
      kind: 'seed' as const,
      key: `seed-${i}`,
      date: ev.date,
      ev,
    }))
    return [...mine, ...seeded].sort(
      (a, b) => b.date.localeCompare(a.date) || (a.kind === 'mine' ? -1 : 1),
    )
  }, [myEntries, base])

  const selectStudent = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('id', id)
    setParams(next, { replace: true })
    setTab('overview')
  }

  // ── everything else the platform knows about this child ──
  const linked = useMemo(() => {
    if (!selected) return { plans: [], referrals: [], cases: [] }
    return {
      plans: plans.filter((p) => p.childId === selected.id),
      referrals: referrals.filter((r) => r.childId === selected.id),
      cases: cases.filter((c) => c.studentName === selected.name),
    }
  }, [selected, plans, referrals, cases])

  // ── actions that actually change the record ──
  const actorName = user?.name ?? (th ? 'ผู้ใช้งานปัจจุบัน' : 'Current user')

  /** Saved from the logging form — a contact log with no channel, outcome or
   *  note is not a record of anything, so the button opens a form instead of
   *  writing a canned sentence to the timeline. */
  /** Refused in one place rather than by hiding a dozen buttons — a hidden
   *  control cannot explain itself, and a reviewer cannot tell a withheld
   *  feature from a missing one. See `canWorkCases()`. */
  const mayAct = canWorkCases(user)
  const refuse = () => toast.push(th ? 'บัญชีระดับกำกับดูแลดูข้อมูลได้ แต่ไม่ลงมือกับเคสรายบุคคล' : 'A supervising account can read this, but not act on an individual case')

  const saveLog = (s: Student, form: LogResult) => {
    if (!mayAct) return refuse()
    log.add({
      childId: s.id,
      mode: form.mode,
      date: form.date,
      channel: form.channel,
      outcome: form.outcome,
      note: form.note,
      by: actorName,
      followUpDate: form.followUpDate || undefined,
      parentContact: form.parentContact,
      homeVisited: form.mode === 'visit' ? true : undefined,
      attendees: form.attendees,
      family: form.family,
      arrivedAt: form.arrivedAt,
      signature: form.signature,
      consent: form.consent,
    })
    setLogMode(null)
    // a visit fills in the family panel, so land there rather than on the log
    setTab(form.mode === 'visit' ? 'visit' : 'timeline')
    toast.push(
      form.mode === 'visit'
        ? th
          ? `บันทึกการเยี่ยมบ้าน ${s.name} แล้ว`
          : `Home visit recorded for ${s.name}`
        : th
          ? `บันทึกการติดต่อผู้ปกครองของ ${s.name} แล้ว`
          : `Parent contact logged for ${s.name}`,
    )
  }

  const takeCase = (s: Student) => {
    if (!mayAct) return refuse()
    log.setOwner(s.id, actorName)
    toast.push(th ? `${s.name} — มอบหมายให้ ${actorName} แล้ว` : `${s.name} assigned to ${actorName}`)
  }

  const exportChild = (s: Student) => {
    const rows: [string, string][] = [
      [th ? 'ชื่อ' : 'name', s.name],
      [th ? 'รหัส' : 'id', s.id],
      [th ? 'ระดับชั้น' : 'grade', t(`grade.${s.gradeKey}`)],
      [th ? 'พื้นที่' : 'area', `${dn(s.districtKey)} ${pn(s.provinceKey)}`],
      [th ? 'คะแนนความเสี่ยง' : 'risk score', String(s.riskScore)],
      [th ? 'ระดับความเสี่ยง' : 'risk level', t(`risk.${s.riskLevel}`)],
      ...FACTORS.map(
        (f) => [th ? f.th : f.en, String(s[f.key])] as [string, string],
      ),
      [th ? 'ขาดเรียนต่อเนื่อง(วัน)' : 'absence streak', String(s.absenceStreak)],
      [th ? 'ผู้รับผิดชอบ' : 'case owner', s.caseOwner],
      [th ? 'ขั้นตอน' : 'stage', t(`stage.${s.caseStage}`)],
      [th ? 'ความยินยอม' : 'consent', t(`consent.${s.consent}`)],
      [th ? 'สิ่งที่ต้องทำต่อ' : 'next action', s.nextAction],
    ]
    const csv = rows
      .map(([k, v]) => `"${k.replace(/"/g, '""')}","${String(v).replace(/"/g, '""')}"`)
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${s.id}-record.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.push(th ? `ส่งออกประวัติของ ${s.name} แล้ว` : `Record exported for ${s.name}`)
  }

  const canCase = canAccess(user, '/intervention')
  const canPlan = canAccess(user, '/plan')
  const canReferral = canAccess(user, '/referral')

  const riskCounts = useMemo(
    () => ({
      all: students.length,
      high: students.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical').length,
      watch: students.filter((s) => s.riskLevel === 'watch').length,
      normal: students.filter((s) => s.riskLevel === 'normal').length,
    }),
    [students],
  )

  return (
    <div className="animate-page-rise">
      <ScopeBanner />
      <DirectOnlyNotice />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
        {/* ── who else is on my list ── */}
        <Card className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden lg:sticky lg:top-4 lg:self-start">
          <div className="border-b border-surface-border p-3">
            <div className="relative">
              <IconSearch
                width={15}
                height={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('st.searchPlaceholder')}
                aria-label={t('st.searchPlaceholder')}
                className="w-full rounded-xl border border-surface-border bg-white py-2 pl-9 pr-8 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-brand-200 focus:border-brand-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={th ? 'ล้างคำค้น' : 'Clear search'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:bg-surface-muted hover:text-ink"
                >
                  <IconClose width={12} height={12} />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(
                [
                  ['all', th ? 'ทั้งหมด' : 'All'],
                  ['high', t('risk.high')],
                  ['watch', t('risk.watch')],
                  ['normal', t('risk.normal')],
                ] as [RiskFilter, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRiskFilter(k)}
                  aria-pressed={riskFilter === k}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    riskFilter === k
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-muted text-ink-muted hover:text-ink'
                  }`}
                >
                  {label} <span className="tabular">{riskCounts[k]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {list.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-ink">{t('common.empty')}</p>
                <p className="mt-1 text-xs text-ink-muted">{t('common.emptyHint')}</p>
              </div>
            ) : (
              list.map((s, i) => {
                const active = selected?.id === s.id
                return (
                  <motion.button
                    key={s.id}
                    onClick={() => selectStudent(s.id)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.25) }}
                    whileHover={{ x: 2 }}
                    className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-surface-muted'
                    }`}
                  >
                    <span
                      className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold"
                      style={{ backgroundColor: RISK_BG[s.riskLevel], color: RISK_COLOR[s.riskLevel] }}
                    >
                      {s.riskScore}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {s.name}
                      </span>
                      <span className="block truncate text-[10px] text-ink-muted">
                        {s.id} · {t(`grade.${s.gradeKey}`)}
                      </span>
                    </span>
                  </motion.button>
                )
              })
            )}
          </div>
        </Card>

        {/* ── the child ── */}
        {!selected ? (
          <Card>
            <div className="grid place-items-center gap-3 p-16 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-600">
                <IconStudent width={26} height={26} />
              </span>
              <p className="max-w-xs text-sm text-ink-muted">{t('st.pickPrompt')}</p>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {/* identity + the two things that decide today */}
            <Card>
              <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-lg font-bold text-brand-700">
                    {selected.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-bold leading-tight text-ink">{selected.name}</h1>
                      <RiskBadge level={selected.riskLevel} size="sm" />
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {selected.id} · {t(`grade.${selected.gradeKey}`)} · {dn(selected.districtKey)}{' '}
                      · {pn(selected.provinceKey)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Chip
                        icon={<IconClock width={11} height={11} />}
                        tone={selected.absenceStreak >= 10 ? 'bad' : 'muted'}
                      >
                        {t('st.absenceStreak')} {selected.absenceStreak} {t('ref.days')}
                      </Chip>
                      <Chip
                        icon={<IconConsent width={11} height={11} />}
                        tone={selected.consent === 'granted' ? 'good' : 'warn'}
                      >
                        {t(`consent.${selected.consent}`)}
                      </Chip>
                      <Chip
                        icon={<IconPathway width={11} height={11} />}
                        tone={selected.planId ? 'good' : 'warn'}
                      >
                        {selected.planId ? t('st.hasPlan') : t('st.noPlan')}
                      </Chip>
                      <Chip icon={<IconUser width={11} height={11} />} tone="muted">
                        {selected.caseOwner}
                      </Chip>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <RiskGauge score={selected.riskScore} />
                </div>
              </div>

              {/* next action — the one line this page exists for */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border bg-brand-50/50 px-5 py-3">
                <p className="flex min-w-0 items-center gap-2 text-[13px]">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
                    <IconArrowRight width={13} height={13} />
                  </span>
                  <span className="font-semibold text-brand-800">{t('st.nextAction')}:</span>
                  <span className="truncate text-ink">{selected.nextAction}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {/* when the parent was last reached, from this account's own
                      log — a caseload without it re-dials the same family twice */}
                  <span className="text-[11px] text-ink-faint">
                    {t('st.lastContact')}:{' '}
                    <span className="font-semibold text-ink-muted">
                      {latestContact ? latestContact.date : t('st.neverContacted')}
                    </span>
                  </span>
                  {mayAct && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<IconUser width={13} height={13} />}
                        onClick={() => setLogMode('contact')}
                      >
                        {t('st.logContact')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<IconHome width={13} height={13} />}
                        onClick={() => setLogMode('visit')}
                      >
                        {selected.homeVisited ? t('st.visited') : t('iv.visit')}
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconExport width={13} height={13} />}
                    onClick={() => exportChild(selected)}
                  >
                    {t('st.exportCsv')}
                  </Button>
                </div>
              </div>

              {/* Everything still open on this child, each row paired with the
                  control that closes it. */}
              {nextActions.length > 0 && (
                <div className="border-t border-surface-border px-5 py-3">
                  <p className="mb-2 text-[12px] font-semibold text-ink-muted">
                    {th ? 'สิ่งที่ยังค้างอยู่กับเด็กคนนี้' : 'Still open on this child'}
                  </p>
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {nextActions.map((a) => (
                      <li
                        key={a.key}
                        className="flex items-center gap-2.5 rounded-xl border border-surface-border px-3 py-2"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: RISK_COLOR[a.tone] }}
                        />
                        <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink">
                          {th ? a.th : a.en}
                        </span>
                        {(mayAct || a.key === 'plan') && (
                          <button
                            type="button"
                            onClick={a.run}
                            className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-600 ring-1 ring-surface-border transition-colors hover:ring-brand-400"
                          >
                            {th ? a.doTh : a.doEn}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* tabs — a 360 view without a wall of cards */}
            <div className="flex flex-wrap gap-1 rounded-xl border border-surface-border bg-surface-muted p-1">
              {(
                [
                  ['overview', t('st.tabOverview')],
                  ['risk', t('st.tabRisk')],
                  ['trend', t('st.tabTrend')],
                  ['visit', t('st.tabVisit')],
                  ['timeline', t('st.tabTimeline')],
                ] as [Tab, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  aria-pressed={tab === k}
                  className={`relative flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    tab === k ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {tab === k && (
                    <motion.span
                      layoutId="st-tab"
                      className="absolute inset-0 rounded-lg bg-white shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>

            <motion.div
              key={`${selected.id}-${tab}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex flex-col gap-4"
            >
              {tab === 'overview' && (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader
                        title={t('st.guidance')}
                        subtitle={th ? 'บันทึกจากครูแนะแนว' : 'From the guidance teacher'}
                      />
                      <div className="px-5 pb-5 pt-2">
                        <p className="text-[13px] leading-relaxed text-ink">
                          {selected.guidanceNote}
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <Fact
                            k={t('st.parentContact')}
                            v={t(PARENT_META[selected.parentContact].key)}
                            level={PARENT_META[selected.parentContact].level}
                          />
                          <Fact
                            k={t('st.homeVisit')}
                            v={selected.homeVisited ? t('st.visited') : t('st.notVisited')}
                            level={selected.homeVisited ? 'normal' : 'watch'}
                          />
                          <Fact k={t('st.caseOwner')} v={selected.caseOwner} />
                          <Fact k={th ? 'ขั้นตอนของเคส' : 'Case stage'} v={t(`stage.${selected.caseStage}`)} />
                        </div>
                        {mayAct && selected.caseOwner !== actorName && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-3"
                            icon={<IconUser width={13} height={13} />}
                            onClick={() => takeCase(selected)}
                          >
                            {t('st.assignMe')}
                          </Button>
                        )}
                      </div>
                    </Card>

                    <Card>
                      <CardHeader
                        title={t('st.linkedWork')}
                        subtitle={
                          th
                            ? 'ทุกอย่างที่ระบบรู้เกี่ยวกับเด็กคนนี้ — กดเพื่อไปหน้าที่ทำงานจริง'
                            : 'Everything the platform holds for this child — open where the work happens'
                        }
                      />
                      <div className="flex flex-col gap-2 px-5 pb-5 pt-2">
                        <LinkedRow
                          icon={<IconPathway width={14} height={14} />}
                          label={t('nav.plan')}
                          count={linked.plans.length}
                          detail={
                            linked.plans[0]
                              ? `${t(`pathway.${linked.plans[0].pathway}`)} · ${linked.plans[0].progress}%`
                              : t('st.noPlan')
                          }
                          cta={canPlan ? { label: t('st.viewPlan'), fn: () => nav('/plan') } : undefined}
                        />
                        <LinkedRow
                          icon={<IconReferral width={14} height={14} />}
                          label={t('nav.referral')}
                          count={linked.referrals.length}
                          detail={
                            linked.referrals.length
                              ? linked.referrals
                                  .slice(0, 2)
                                  .map((r) => t(`need.${r.need}`))
                                  .join(' · ')
                              : th
                                ? 'ยังไม่มีการส่งต่อ'
                                : 'No referrals yet'
                          }
                          cta={
                            canReferral && linked.referrals.length
                              ? { label: t('st.viewReferral'), fn: () => nav('/referral') }
                              : undefined
                          }
                        />
                        <LinkedRow
                          icon={<IconCheck width={14} height={14} />}
                          label={t('nav.intervention')}
                          count={linked.cases.length}
                          detail={
                            linked.cases[0]
                              ? `${t(`stage.${linked.cases[0].stage}`)}${
                                  linked.cases[0].slaBreached ? ` · ${t('common.overdue')}` : ''
                                }`
                              : t(`stage.${selected.caseStage}`)
                          }
                          cta={
                            canCase ? { label: t('st.viewCase'), fn: () => nav('/intervention') } : undefined
                          }
                        />
                      </div>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader title={t('st.riskReason')} />
                    <div className="flex flex-wrap gap-2 px-5 pb-5 pt-2">
                      {selected.causeKeys.map((k, i) => (
                        <motion.span
                          key={k}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-risk-high/10 px-3 py-1.5 text-xs font-medium text-risk-high"
                        >
                          <IconCause width={14} height={14} />
                          {t(`cause.${k}`)}
                        </motion.span>
                      ))}
                      {selected.causeKeys.length === 0 && (
                        <p className="text-sm text-ink-muted">
                          {th ? 'ยังไม่มีการบันทึกสาเหตุ' : 'No causes recorded'}
                        </p>
                      )}
                    </div>
                  </Card>
                </>
              )}

              {tab === 'risk' && <RiskTab s={selected} th={th} t={t} />}

              {tab === 'trend' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader
                      title={t('st.attendance')}
                      subtitle={th ? 'อัตราการมาเรียนรายสัปดาห์' : 'Weekly attendance rate'}
                    />
                    <div className="px-2 pb-2">
                      <Chart
                        type="area"
                        height={260}
                        series={[
                          {
                            name: t('st.attendance'),
                            data: selected.attendance.map((a) => a.rate),
                          },
                        ]}
                        options={{
                          chart: {
                            type: 'area',
                            fontFamily: 'inherit',
                            toolbar: { show: false },
                            animations: { enabled: true, easing: 'easeinout', speed: 800 },
                          },
                          colors: ['#2f66f6'],
                          dataLabels: { enabled: false },
                          stroke: { width: 2.5, curve: 'smooth' },
                          fill: {
                            type: 'gradient',
                            gradient: { opacityFrom: 0.35, opacityTo: 0, shadeIntensity: 1 },
                          },
                          grid: { borderColor: '#eef2f8', strokeDashArray: 4 },
                          xaxis: {
                            categories: selected.attendance.map((a) => a.week),
                            labels: { style: { fontSize: '10px', colors: '#94a3b8' } },
                            axisBorder: { show: false },
                            axisTicks: { show: false },
                          },
                          yaxis: {
                            min: 0,
                            max: 100,
                            tickAmount: 4,
                            labels: {
                              formatter: (v: number) => `${v.toFixed(0)}%`,
                              style: { fontSize: '10px', colors: '#94a3b8' },
                            },
                          },
                          tooltip: { y: { formatter: (v: number) => `${v}%` } },
                        }}
                      />
                    </div>
                  </Card>

                  <Card>
                    <CardHeader
                      title={t('st.gradeTrend')}
                      subtitle={th ? 'ผลการเรียนรายภาค (GPA)' : 'GPA by term'}
                    />
                    <div className="px-2 pb-2">
                      <Chart
                        type="line"
                        height={260}
                        series={[{ name: 'GPA', data: selected.grades.map((g) => g.gpa) }]}
                        options={{
                          chart: {
                            type: 'line',
                            fontFamily: 'inherit',
                            toolbar: { show: false },
                            animations: { enabled: true, easing: 'easeinout', speed: 800 },
                          },
                          colors: ['#0f2a6b'],
                          dataLabels: { enabled: false },
                          stroke: { width: 2.5, curve: 'smooth' },
                          markers: { size: 4, strokeWidth: 2, strokeColors: '#ffffff' },
                          grid: { borderColor: '#eef2f8', strokeDashArray: 4 },
                          xaxis: {
                            categories: selected.grades.map((g) => g.term),
                            labels: { style: { fontSize: '10px', colors: '#94a3b8' } },
                            axisBorder: { show: false },
                            axisTicks: { show: false },
                          },
                          yaxis: {
                            min: 0,
                            max: 4,
                            tickAmount: 4,
                            labels: {
                              formatter: (v: number) => v.toFixed(1),
                              style: { fontSize: '10px', colors: '#94a3b8' },
                            },
                          },
                          tooltip: { y: { formatter: (v: number) => v.toFixed(2) } },
                        }}
                      />
                    </div>
                  </Card>
                </div>
              )}

              {tab === 'visit' && (
                <Card>
                  <CardHeader
                    title={t('st.tabVisit')}
                    subtitle={
                      latestVisit
                        ? `${latestVisit.date} · ${t('hv.recorded')} ${latestVisit.by}`
                        : t('hv.arriveHint')
                    }
                    action={
                      mayAct ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<IconHome width={13} height={13} />}
                          onClick={() => setLogMode('visit')}
                        >
                          {t('iv.visit')}
                        </Button>
                      ) : undefined
                    }
                  />
                  <div className="p-5">
                    {latestVisit ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-2">
                          {latestVisit.arrivedAt && (
                            <Chip tone="good">
                              {t('hv.arrived')} {latestVisit.arrivedAt}
                            </Chip>
                          )}
                          {(latestVisit.attendees ?? []).map((a) => (
                            <Chip key={a}>{t(`hv.at.${a}`)}</Chip>
                          ))}
                        </div>

                        {/* the family profile, showing only what was filled in —
                            a blank row would read as a fact about the family */}
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                          {(
                            [
                              [
                                t('hv.guardian'),
                                latestVisit.family?.guardianRelation
                                  ? `${t(`hv.rel.${latestVisit.family.guardianRelation}`)}${
                                      latestVisit.family.guardianName
                                        ? ` · ${latestVisit.family.guardianName}`
                                        : ''
                                    }`
                                  : '',
                              ],
                              [t('hv.occupation'), latestVisit.family?.occupation ?? ''],
                              [
                                t('hv.income'),
                                latestVisit.family?.incomeBand
                                  ? t(`hv.inc.${latestVisit.family.incomeBand}`)
                                  : '',
                              ],
                              [
                                t('hv.members'),
                                latestVisit.family?.members ? String(latestVisit.family.members) : '',
                              ],
                              [
                                t('hv.housing'),
                                latestVisit.family?.housing
                                  ? t(`hv.ho.${latestVisit.family.housing}`)
                                  : '',
                              ],
                            ] as [string, string][]
                          )
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt className="text-[11px] text-ink-faint">{k}</dt>
                                <dd className="text-[13px] font-semibold text-ink">{v}</dd>
                              </div>
                            ))}
                        </dl>

                        {Boolean(latestVisit.family?.study.length) && (
                          <div>
                            <p className="mb-1.5 text-[11px] text-ink-faint">{t('hv.study')}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {latestVisit.family!.study.map((c) => (
                                <Chip key={c} tone="good">
                                  {t(`hv.sd.${c}`)}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        )}

                        {Boolean(latestVisit.family?.findings.length) && (
                          <div>
                            <p className="mb-1.5 text-[11px] text-ink-faint">{t('hv.findings')}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {latestVisit.family!.findings.map((f) => (
                                <Chip key={f} tone="warn">
                                  {t(`cause.${f}`)}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        )}

                        {latestVisit.signature && (
                          <div>
                            <p className="mb-1.5 text-[11px] text-ink-faint">{t('hv.viewSig')}</p>
                            <div className="inline-flex flex-col items-start gap-1 rounded-xl border border-surface-border p-3">
                              {latestVisit.signature.image && (
                                <img
                                  src={latestVisit.signature.image}
                                  alt={t('hv.viewSig')}
                                  className="h-16 w-auto max-w-[240px]"
                                />
                              )}
                              <p className="text-[12px] font-semibold text-ink">
                                {latestVisit.signature.name}
                              </p>
                              <p className="text-[11px] text-ink-faint">
                                {new Date(latestVisit.signature.at).toLocaleString(
                                  th ? 'th-TH' : 'en-GB',
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        <p className="text-[11px] leading-snug text-ink-faint">
                          {t('hv.signStorage')}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-muted text-ink-faint">
                          <IconHome width={22} height={22} />
                        </span>
                        <p className="text-sm font-semibold text-ink">{t('hv.noVisit')}</p>
                        {mayAct && (
                          <Button size="sm" variant="primary" onClick={() => setLogMode('visit')}>
                            {t('iv.visit')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {tab === 'timeline' && (
                <Card>
                  <CardHeader
                    title={t('st.ivTimeline')}
                    subtitle={
                      th
                        ? `เรียงตามวันที่ ใหม่ไปเก่า · ${t('st.savedHint')}`
                        : `Newest first by date · ${t('st.savedHint')}`
                    }
                    action={
                      mayAct ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<IconUser width={13} height={13} />}
                          onClick={() => setLogMode('contact')}
                        >
                          {t('st.logContact')}
                        </Button>
                      ) : undefined
                    }
                  />
                  <div className="p-5">
                    <ol className="relative ml-2 border-l-2 border-surface-border">
                      {timelineRows.map((row, i) => {
                        // A phone call tagged with the case's *current* stage
                        // read as if the call were a referral. Own contact
                        // entries are labelled by what actually happened.
                        const chip =
                          row.kind === 'mine' && row.entry.mode === 'contact' && row.entry.channel
                            ? t(`st.ch.${row.entry.channel}`)
                            : t(
                                `stage.${
                                  row.kind === 'mine'
                                    ? row.entry.mode === 'visit'
                                      ? 'homeVisit'
                                      : selected.caseStage
                                    : row.ev.stageKey
                                }`,
                              )
                        const note = row.kind === 'mine' ? row.entry.note : row.ev.note
                        const by = row.kind === 'mine' ? row.entry.by : row.ev.by
                        return (
                          <motion.li
                            key={row.key}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(i * 0.06, 0.4) }}
                            className="relative mb-5 pl-6 last:mb-0"
                          >
                            <span
                              className={`absolute -left-[9px] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-white ring-2 ${
                                i === 0 ? 'bg-brand-500 ring-brand-100' : 'bg-slate-300 ring-slate-100'
                              }`}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                                <IconClock width={12} height={12} />
                                {row.date}
                              </span>
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                                {chip}
                              </span>
                              {row.kind === 'mine' && (
                                <span className="rounded-full bg-risk-normal/10 px-2 py-0.5 text-[11px] font-semibold text-risk-normal">
                                  {t('st.yours')}
                                </span>
                              )}
                              {row.kind === 'mine' && row.entry.followUpDate && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    row.entry.followUpDone
                                      ? 'bg-surface-muted text-ink-faint line-through'
                                      : 'bg-risk-watch/10 text-risk-watch'
                                  }`}
                                >
                                  {t('st.followUp')} {row.entry.followUpDate}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-ink">{note}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-3">
                              <span className="text-[11px] text-ink-faint">{by}</span>
                              {row.kind === 'mine' && row.entry.followUpDate && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    log.setFollowUpDone(row.entry.id, !row.entry.followUpDone)
                                  }
                                  className="text-[11px] font-semibold text-brand-600 underline-offset-2 hover:underline"
                                >
                                  {row.entry.followUpDone ? t('st.followUpNone') : t('st.markDone')}
                                </button>
                              )}
                              {/* a typo in a field note should not be permanent */}
                              {row.kind === 'mine' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    log.remove(row.entry.id)
                                    toast.push(t('st.deleted'))
                                  }}
                                  className="text-[11px] font-semibold text-ink-faint underline-offset-2 hover:text-risk-critical hover:underline"
                                >
                                  {t('st.deleteEntry')}
                                </button>
                              )}
                            </div>
                          </motion.li>
                        )
                      })}
                    </ol>
                  </div>
                </Card>
              )}
            </motion.div>
          </div>
        )}
      </div>

      {selected && logMode && (
        <LogForm
          mode={logMode}
          student={selected}
          actor={actorName}
          onCancel={() => setLogMode(null)}
          onSave={(res) => saveLog(selected, res)}
          th={th}
          t={t}
        />
      )}
    </div>
  )
}

/* ─────────────── signature pad ─────────────── */

/**
 * A signing box that works with a finger on a phone and a mouse on a desktop.
 *
 * Pointer events cover both, and `setPointerCapture` keeps the stroke attached
 * when a finger slides past the edge of the box. The canvas is sized to its own
 * CSS box times the device pixel ratio, otherwise a signature drawn on a retina
 * phone comes back as a blurred half-size image.
 */
function SignaturePad({
  value,
  onChange,
  t,
}: {
  value: string | null
  onChange: (v: string | null) => void
  t: (k: string) => string
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  /** Whether anything has been drawn, tracked in a ref as well as in state.
   *  `end()` reads it to decide whether to emit the image, and reading the
   *  state variable there loses a stroke whose move and up land in the same
   *  task — React has not re-rendered yet, so the handler still closes over
   *  `false` and the signature is silently dropped. The state copy exists only
   *  to re-render the placeholder and the clear button. */
  const inked = useRef(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const rect = cv.getBoundingClientRect()
    cv.width = Math.round(rect.width * dpr)
    cv.height = Math.round(rect.height * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    inked.current = true
    if (!dirty) setDirty(true)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    const cv = ref.current
    if (cv && inked.current) onChange(cv.toDataURL('image/png'))
  }

  const clear = () => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (cv && ctx) ctx.clearRect(0, 0, cv.width, cv.height)
    inked.current = false
    setDirty(false)
    onChange(null)
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-dashed border-surface-border bg-white">
        <canvas
          ref={ref}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          // without this a finger drag scrolls the sheet instead of drawing
          className="h-28 w-full touch-none"
        />
        {!dirty && !value && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-[12px] text-ink-faint">
            {t('hv.signHere')}
          </p>
        )}
      </div>
      {(dirty || value) && (
        <button
          type="button"
          onClick={clear}
          className="mt-1.5 text-[11px] font-semibold text-ink-faint underline-offset-2 hover:text-risk-critical hover:underline"
        >
          {t('hv.signClear')}
        </button>
      )}
    </div>
  )
}

/* ─────────────── logging form ─────────────── */

function LogForm({
  mode,
  student,
  actor,
  onCancel,
  onSave,
  th,
  t,
}: {
  mode: LogMode
  student: Student
  actor: string
  onCancel: () => void
  onSave: (r: LogResult) => void
  th: boolean
  t: (k: string) => string
}) {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number] | null>(
    mode === 'visit' ? 'home' : null,
  )
  const [outcome, setOutcome] = useState<ContactOutcome | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [companions, setCompanions] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [closing, setClosing] = useState(false)

  // ── the home-visit record ──
  const [arrivedAt, setArrivedAt] = useState('')
  const [attendees, setAttendees] = useState<string[]>([])
  const [relation, setRelation] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [occupation, setOccupation] = useState('')
  const [income, setIncome] = useState('')
  const [members, setMembers] = useState('')
  const [housing, setHousing] = useState('')
  const [study, setStudy] = useState<string[]>([])
  const [findings, setFindings] = useState<CauseKey[]>([])
  const [signName, setSignName] = useState('')
  const [signImage, setSignImage] = useState<string | null>(null)

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const today = new Date().toISOString().slice(0, 10)

  /** How much of the visit record has been filled, counted over the six groups
   *  the form is divided into. A real fraction of real sections — it moves only
   *  because the teacher entered something. */
  const filled = [
    Boolean(arrivedAt || attendees.length || companions.trim()),
    Boolean(relation || guardianName.trim() || occupation.trim() || income || members || housing),
    study.length > 0,
    findings.length > 0,
    Boolean(note.trim() || followUpDate),
    Boolean(signName.trim()),
  ].filter(Boolean).length

  const close = () => {
    setClosing(true)
    window.setTimeout(onCancel, 200)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ready = mode === 'visit' ? Boolean(date) : Boolean(channel && outcome)

  const submit = () => {
    if (!ready) return
    if (mode === 'visit') {
      // the sentence that lands on the timeline names what was actually found,
      // so the log reads as a record rather than as "a visit happened"
      const parts = [
        th ? 'เยี่ยมบ้าน' : 'Home visit',
        companions.trim() ? `${th ? 'ร่วมกับ' : 'with'} ${companions.trim()}` : '',
        findings.length
          ? `${th ? 'พบอุปสรรค' : 'barriers'}: ${findings.map((f) => t(`cause.${f}`)).join(', ')}`
          : '',
        note.trim(),
      ].filter(Boolean)
      onSave({
        mode,
        date,
        note: parts.join(' · '),
        followUpDate,
        arrivedAt: arrivedAt || undefined,
        attendees: attendees.length ? attendees : undefined,
        family: {
          guardianRelation: relation || undefined,
          guardianName: guardianName.trim() || undefined,
          occupation: occupation.trim() || undefined,
          incomeBand: income || undefined,
          members: members ? Number(members) : undefined,
          housing: housing || undefined,
          study,
          findings,
        },
        signature: signName.trim()
          ? { name: signName.trim(), at: new Date().toISOString(), image: signImage ?? undefined }
          : undefined,
        // a signed acknowledgement is the consent artefact the platform waits on
        consent: signName.trim() ? 'granted' : undefined,
      })
      return
    }
    const parts = [
      t(`st.ch.${channel}`),
      t(`st.oc.${outcome}`),
      note.trim(),
    ].filter(Boolean)
    onSave({
      mode,
      date,
      note: parts.join(' · '),
      parentContact: outcome ? OUTCOME_TO_STATUS[outcome] : undefined,
      channel: channel ?? undefined,
      outcome: outcome ?? undefined,
      followUpDate,
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <motion.div
        className="absolute inset-0 bg-brand-950/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.18 }}
        onClick={close}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'visit' ? t('st.visitTitle') : t('st.logTitle')}
        className={`relative flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${
          mode === 'visit' ? 'sm:max-w-[520px] lg:max-w-[900px]' : 'sm:max-w-[440px]'
        }`}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={
          closing ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }
        }
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        {/* Naming the child once, with their grade and score, saves the teacher
            checking they opened the right file before writing anything down. */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-surface-border bg-white px-5 py-3.5">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
            style={{ background: RISK_COLOR[student.riskLevel] }}
          >
            {student.riskScore}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-ink">
              {mode === 'visit' ? t('st.visitTitle') : t('st.logTitle')}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              {student.name} · {t(`grade.${student.gradeKey}`)} · {student.id}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t('st.cancel')}
            className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>

        {mode === 'contact' ? (
          <div className="flex flex-col gap-4 px-5 py-4">
            <Field label={t('st.channel')} required>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => (
                  <ChoiceChip
                    key={c}
                    active={channel === c}
                    onClick={() => setChannel(c)}
                    label={t(`st.ch.${c}`)}
                  />
                ))}
              </div>
            </Field>

            <Field label={t('st.outcome')} required hint={t('st.updatesParent')}>
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map((o) => (
                  <ChoiceChip
                    key={o}
                    active={outcome === o}
                    onClick={() => setOutcome(o)}
                    label={t(`st.oc.${o}`)}
                    tone={
                      o === 'reached' || o === 'appointment'
                        ? 'good'
                        : o === 'wrongNumber'
                          ? 'bad'
                          : 'warn'
                    }
                  />
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('st.contactDate')} required>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} className={INPUT} />
              </Field>
              <Field label={t('st.followUp')}>
                <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} min={date} className={INPUT} />
              </Field>
            </div>
            <p className="-mt-2 text-[10px] text-ink-faint">{t('st.followUpHint')}</p>

            <Field label={t('st.noteLabel')}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={t('st.notePlaceholder')}
                className={`${INPUT} resize-none leading-relaxed`}
              />
            </Field>

            <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
              <IconUser width={12} height={12} />
              {t('st.by')}: {actor}
            </p>
          </div>
        ) : (
          /* A visit form is filled at somebody's door, often on a phone held in
             one hand. Six identical chip rows down a 440px column made the
             teacher scroll through a straw to find anything; on a desktop it
             also left most of the screen empty. Same fields, grouped and given
             room. */
          <div className="grid gap-x-6 gap-y-5 px-5 py-4 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <Section n={1} title={th ? 'การลงพื้นที่' : 'The visit'}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('st.contactDate')} required>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} className={INPUT} />
                  </Field>
                  <Field label={t('hv.arrive')}>
                    {arrivedAt ? (
                      <p className="flex h-[38px] items-center gap-1.5 rounded-xl border border-risk-normal/40 bg-risk-normal/5 px-3 text-sm font-semibold text-ink">
                        <IconCheck width={14} height={14} className="text-risk-normal" />
                        {arrivedAt}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setArrivedAt(
                            new Date().toLocaleTimeString(th ? 'th-TH' : 'en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          )
                        }
                        className="h-[38px] w-full rounded-xl border border-dashed border-surface-border text-sm font-semibold text-brand-600 transition-colors hover:border-brand-400 hover:bg-brand-50"
                      >
                        {th ? 'กดเมื่อถึงบ้าน' : 'Tap on arrival'}
                      </button>
                    )}
                  </Field>
                </div>
                <p className="-mt-1 text-[10px] text-ink-faint">{t('hv.arriveHint')}</p>

                <Field label={t('hv.attendees')}>
                  <div className="flex flex-wrap gap-1.5">
                    {ATTENDEES.map((a) => (
                      <ChoiceChip
                        key={a}
                        active={attendees.includes(a)}
                        onClick={() => toggle(attendees, setAttendees, a)}
                        label={t(`hv.at.${a}`)}
                      />
                    ))}
                  </div>
                </Field>

                <Field label={t('st.companions')}>
                  <input
                    value={companions}
                    onChange={(e) => setCompanions(e.target.value)}
                    placeholder={t('st.companionsPlaceholder')}
                    className={INPUT}
                  />
                </Field>
              </Section>

              <Section n={2} title={t('hv.section')}>
                <Field label={t('hv.guardian')}>
                  <div className="flex flex-wrap gap-1.5">
                    {RELATIONS.map((r) => (
                      <ChoiceChip
                        key={r}
                        active={relation === r}
                        onClick={() => setRelation(relation === r ? '' : r)}
                        label={t(`hv.rel.${r}`)}
                      />
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-[1fr_88px] gap-3">
                  <Field label={t('hv.guardianName')}>
                    <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className={INPUT} />
                  </Field>
                  <Field label={t('hv.members')}>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={members}
                      onChange={(e) => setMembers(e.target.value)}
                      className={INPUT}
                    />
                  </Field>
                </div>
                <Field label={t('hv.occupation')}>
                  <input
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder={t('hv.occupationPlaceholder')}
                    className={INPUT}
                  />
                </Field>
                <Field label={t('hv.income')}>
                  <div className="flex flex-wrap gap-1.5">
                    {INCOME_BANDS.map((b) => (
                      <ChoiceChip
                        key={b}
                        active={income === b}
                        onClick={() => setIncome(income === b ? '' : b)}
                        label={t(`hv.inc.${b}`)}
                      />
                    ))}
                  </div>
                </Field>
                <Field label={t('hv.housing')}>
                  <div className="flex flex-wrap gap-1.5">
                    {HOUSING.map((h) => (
                      <ChoiceChip
                        key={h}
                        active={housing === h}
                        onClick={() => setHousing(housing === h ? '' : h)}
                        label={t(`hv.ho.${h}`)}
                      />
                    ))}
                  </div>
                </Field>
              </Section>

              <Section n={3} title={t('hv.study')}>
                <div className="flex flex-wrap gap-1.5">
                  {STUDY_COND.map((c) => (
                    <ChoiceChip
                      key={c}
                      active={study.includes(c)}
                      onClick={() => toggle(study, setStudy, c)}
                      label={t(`hv.sd.${c}`)}
                      tone="good"
                    />
                  ))}
                </div>
              </Section>
            </div>

            <div className="flex flex-col gap-5">
              <Section n={4} title={t('hv.findings')} hint={t('hv.findingsHint')}>
                <div className="flex flex-wrap gap-1.5">
                  {VISIT_FINDINGS.map((f) => (
                    <ChoiceChip
                      key={f}
                      active={findings.includes(f)}
                      onClick={() => toggle(findings, setFindings, f)}
                      label={t(`cause.${f}`)}
                      tone="warn"
                    />
                  ))}
                </div>
              </Section>

              <Section n={5} title={t('st.noteLabel')}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={t('st.notePlaceholder')}
                  className={`${INPUT} resize-none leading-relaxed`}
                />
                <Field label={t('st.followUp')} hint={t('st.followUpHint')}>
                  <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} min={date} className={INPUT} />
                </Field>
              </Section>

              <Section n={6} title={t('hv.signature')} hint={t('hv.signSets')}>
                <input
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                  placeholder={t('hv.signName')}
                  className={INPUT}
                />
                <SignaturePad value={signImage} onChange={setSignImage} t={t} />
                <p className="text-[10px] leading-snug text-ink-faint">{t('hv.signStorage')}</p>
              </Section>

              <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                <IconUser width={12} height={12} />
                {t('st.by')}: {actor}
              </p>
            </div>
          </div>
        )}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-surface-border bg-white px-5 py-3.5">
          {mode === 'visit' ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
                <motion.div
                  className="h-full rounded-full bg-brand-500"
                  animate={{ width: `${(filled / 6) * 100}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
              <p className="hidden text-[11px] text-ink-faint sm:block">
                {th ? `กรอกแล้ว ${filled} จาก 6 หัวข้อ` : `${filled} of 6 sections filled`}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-ink-faint">{!ready && t('st.pickRequired')}</p>
          )}
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={close}>
              {t('st.cancel')}
            </Button>
            <Button
              variant="primary"
              icon={<IconCheck width={14} height={14} />}
              onClick={submit}
              className={ready ? '' : 'pointer-events-none opacity-40'}
            >
              {t('st.saveLog')}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/** One field's worth of chrome, repeated a dozen times in the visit form. */
const INPUT =
  'w-full rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-brand-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10'

/** A titled group inside the visit form.
 *
 *  Six unlabelled chip rows in a column all looked like the same question. A
 *  numbered heading tells the teacher where they are and how much is left,
 *  which is the whole difference between a form and a wall. */
function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-surface-border p-3.5">
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand-50 text-[11px] font-bold text-brand-700">
          {n}
        </span>
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
      </div>
      {hint && <p className="-mt-1.5 mb-2 text-[10px] text-ink-faint">{hint}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold text-ink">
        {label}
        {required && <span className="ml-1 text-risk-critical">*</span>}
      </p>
      {children}
      {hint && <p className="mt-1 text-[10px] text-ink-faint">{hint}</p>}
    </div>
  )
}

function ChoiceChip({
  active,
  onClick,
  label,
  tone = 'brand',
}: {
  active: boolean
  onClick: () => void
  label: string
  tone?: 'brand' | 'good' | 'warn' | 'bad'
}) {
  const on =
    tone === 'good'
      ? 'border-risk-normal bg-risk-normal/12 text-risk-normal'
      : tone === 'warn'
        ? 'border-amber-400 bg-amber-50 text-amber-700'
        : tone === 'bad'
          ? 'border-risk-critical bg-risk-critical/10 text-risk-critical'
          : 'border-brand-400 bg-brand-50 text-brand-700'
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active ? on : 'border-surface-border text-ink-muted hover:bg-surface-muted'
      }`}
    >
      {label}
    </motion.button>
  )
}

/* ─────────────── risk tab ─────────────── */

/** The old page put a gradient "AI · Risk Reasoning" panel here that typed out
 *  a sentence assembled from a template — it even read "ความเสี่ยงเสี่ยงสูง".
 *  There is no model doing that reasoning: the score is a weighted sum, so the
 *  honest version is to show the arithmetic and let it speak. */
function RiskTab({
  s,
  th,
  t,
}: {
  s: Student
  th: boolean
  t: (k: string) => string
}) {
  const rows = FACTORS.map((f) => {
    const value = s[f.key]
    return { ...f, value, points: Math.round(value * f.weight * 10) / 10 }
  }).sort((a, b) => b.points - a.points)
  const maxPoints = Math.max(...rows.map((r) => r.points), 1)
  const top = rows.slice(0, 2)

  return (
    <>
      <Card>
        <CardHeader
          title={t('st.whyRisk')}
          subtitle={t('st.whyRiskHint')}
          action={<RiskBadge level={s.riskLevel} size="sm" />}
        />
        {/* the score, built in front of you — the dial already sits in the
            header, so repeating it here only ate a column of whitespace */}
        <div className="px-5 pt-4">
          <ScoreBuildBar rows={rows} total={s.riskScore} level={s.riskLevel} th={th} />
        </div>
        <div className="p-5">
          <div className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
            {rows.map((r, i) => {
              const lvl = subScoreLevel(r.value)
              return (
                <div key={r.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-ink">
                      {th ? r.th : r.en}
                      <span className="ml-1.5 text-[10px] text-ink-faint">
                        {th ? r.en : r.th} · {th ? 'น้ำหนัก' : 'weight'} {Math.round(r.weight * 100)}%
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      <span className="tabular font-bold" style={{ color: RISK_COLOR[lvl] }}>
                        {r.value}
                      </span>
                      <span className="mx-1 text-ink-faint">×</span>
                      {Math.round(r.weight * 100)}%
                      <span className="mx-1 text-ink-faint">=</span>
                      <span className="tabular font-bold text-ink">{r.points}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: RISK_COLOR[lvl] }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.points / maxPoints) * 100}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-4 rounded-xl bg-surface-muted px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
            {th
              ? `${top
                  .map((r) => `${r.th} ${r.points} คะแนน`)
                  .join(' และ ')} คือสองด้านที่ดันคะแนนขึ้นมากที่สุด — แก้สองเรื่องนี้ได้ผลไวที่สุด`
              : `${top
                  .map((r) => `${r.en} (${r.points})`)
                  .join(' and ')} contribute most — they are where a change moves the score fastest.`}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={th ? 'สัญญาณที่ต้องจับตา' : 'Signals to watch'}
          subtitle={
            th ? 'ข้อเท็จจริงตรงจากระเบียน ไม่ใช่ข้อความสรุปอัตโนมัติ' : 'Facts from the record'
          }
        />
        <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-2 sm:grid-cols-4">
          <Fact
            k={t('st.absenceStreak')}
            v={`${s.absenceStreak} ${t('ref.days')}`}
            level={s.absenceStreak >= 10 ? 'critical' : s.absenceStreak >= 5 ? 'watch' : 'normal'}
          />
          <Fact
            k={t('st.parentContact')}
            v={t(PARENT_META[s.parentContact].key)}
            level={PARENT_META[s.parentContact].level}
          />
          <Fact
            k={th ? 'กลุ่มเปราะบาง' : 'Vulnerable group'}
            v={s.vulnerableGroup ? (th ? 'ใช่' : 'Yes') : th ? 'ไม่' : 'No'}
            level={s.vulnerableGroup ? 'watch' : 'normal'}
          />
          <Fact
            k={th ? 'สาเหตุที่บันทึก' : 'Causes recorded'}
            v={String(s.causeKeys.length)}
            level={s.causeKeys.length >= 3 ? 'high' : 'normal'}
          />
        </div>
      </Card>
    </>
  )
}

/** The 100-point scale with this child's six contributions stacked on it, so
 *  the total is something you can see being assembled rather than a lone dial. */
function ScoreBuildBar({
  rows,
  total,
  level,
  th,
}: {
  rows: { key: string; th: string; en: string; value: number; points: number }[]
  total: number
  level: RiskLevel
  th: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-ink-muted">
          {th ? 'คะแนนนี้ประกอบขึ้นจาก 6 ด้าน' : 'How the six factors build this score'}
        </p>
        <p className="text-[11px] text-ink-faint">
          <span className="tabular text-lg font-bold" style={{ color: RISK_COLOR[level] }}>
            {total}
          </span>
          <span className="ml-1">/ 100</span>
        </p>
      </div>

      <div className="relative mt-2 flex h-7 overflow-hidden rounded-xl bg-surface-muted">
        {rows.map((r, i) => (
          <motion.div
            key={r.key}
            className="group relative h-full"
            style={{ backgroundColor: FACTOR_COLOR[i % FACTOR_COLOR.length] }}
            initial={{ width: 0 }}
            animate={{ width: `${r.points}%` }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 + i * 0.07 }}
            title={`${th ? r.th : r.en} ${r.points}`}
          >
            {r.points >= 9 && (
              <span className="tabular absolute inset-0 grid place-items-center text-[10px] font-bold text-white/95">
                {r.points}
              </span>
            )}
          </motion.div>
        ))}
        {/* the level thresholds, on the same 0–100 scale */}
        {[40, 70, 85].map((v) => (
          <span
            key={v}
            className="absolute inset-y-0 w-px bg-ink/25"
            style={{ left: `${v}%` }}
            title={`${v}`}
          />
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {rows.map((r, i) => (
          <span key={r.key} className="inline-flex items-center gap-1 text-[10px] text-ink-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: FACTOR_COLOR[i % FACTOR_COLOR.length] }}
            />
            {th ? r.th : r.en}
            <span className="tabular font-semibold text-ink">{r.points}</span>
          </span>
        ))}
        <span className="ml-auto text-[10px] text-ink-faint">
          {th ? 'เส้นแบ่งคือเกณฑ์ 40 / 70 / 85' : 'lines mark the 40 / 70 / 85 thresholds'}
        </span>
      </div>
    </div>
  )
}

/** one hue per factor, ordered by contribution — never risk colours, so a
 *  factor's slice is not confused with a risk level */
const FACTOR_COLOR = ['#0f2a6b', '#2f66f6', '#7c3aed', '#0ea5e9', '#14b8a6', '#94a3b8']

/* ─────────────── small pieces ─────────────── */

function Chip({
  children,
  icon,
  tone = 'muted',
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  tone?: 'good' | 'warn' | 'bad' | 'muted'
}) {
  const cls =
    tone === 'good'
      ? 'bg-risk-normal/12 text-risk-normal'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-700'
        : tone === 'bad'
          ? 'bg-risk-critical/10 text-risk-critical'
          : 'bg-surface-muted text-ink-muted'
  return (
    <span
      className={`inline-flex max-w-[220px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {icon}
      {children}
    </span>
  )
}

function Fact({ k, v, level }: { k: string; v: string; level?: RiskLevel }) {
  return (
    <div className="rounded-xl border border-surface-border px-3 py-2">
      <p className="text-[10px] text-ink-faint">{k}</p>
      <p
        className="mt-0.5 truncate text-[13px] font-semibold"
        style={{ color: level ? RISK_COLOR[level] : undefined }}
      >
        {v}
      </p>
    </div>
  )
}

function LinkedRow({
  icon,
  label,
  count,
  detail,
  cta,
}: {
  icon: React.ReactNode
  label: string
  count: number
  detail: string
  cta?: { label: string; fn: () => void }
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          {label}
          <span className="tabular rounded-full bg-surface-muted px-1.5 text-[10px] text-ink-muted">
            {count}
          </span>
        </p>
        <p className="truncate text-[11px] text-ink-muted">{detail}</p>
      </div>
      {cta && (
        <Button size="sm" variant="ghost" icon={<IconArrowRight width={13} height={13} />} onClick={cta.fn}>
          {cta.label}
        </Button>
      )}
    </motion.div>
  )
}
