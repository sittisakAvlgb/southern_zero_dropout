import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { buildTeacherOps, matchesTask, type TaskFilter } from '@/lib/teacherOps'
import { applyLog, openFollowUps, useCaseLog } from '@/lib/caseLog'
import { aiErrorMessage, buildSystemPrompt, localAnswer, streamAnswer } from '@/lib/ai'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconAI, IconArrowRight, IconClose, IconDown } from '@/components/icons'
import type { RiskLevel } from '@/types'

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[12px] font-semibold text-ink-muted">{children}</p>
}

/**
 * The workspace a ครู / ผู้จัดการรายกรณี gets in place of a dashboard.
 *
 * Everyone above this seat manages an area and reads roll-ups. A teacher works
 * a named list, so this leads with the four jobs on today's desk, and clicking
 * one filters the case list underneath rather than opening a second screen —
 * a card and the rows it stands for share one definition (`matchesTask`), so
 * "5 วิกฤต" always lists exactly five.
 *
 * The reasons under each alert are fields, not prose: attendance points lost,
 * the absence streak, the GPA move, the parent-contact status. What follows is
 * the child's own recorded next action, which is why this panel can say what to
 * do next without an API key.
 */
export function TeacherWorkspace() {
  const { lang, t } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const { user, schools, students, cases, referrals, plans } = useScopedData()

  const log = useCaseLog(user?.id)

  /** The caseload as this account has left it. Reading the raw seeded rows here
   *  meant a parent reached on the child's page was still counted under "ต้อง
   *  ติดต่อผู้ปกครอง" on this one — the same fact, two answers, one screen
   *  apart. Both surfaces now read the child through `applyLog`. */
  const roster = useMemo(() => students.map((st) => applyLog(st, log)), [students, log])

  const ops = useMemo(
    () => buildTeacherOps({ students: roster, cases, th }),
    [roster, cases, th],
  )

  /** Appointments this teacher booked while logging a parent contact. It is the
   *  only forward-looking date the platform holds — no scheduler was invented,
   *  the teacher typed it — so this is the honest version of the "calendar" a
   *  case-management product is expected to have. */
  const followUps = useMemo(() => {
    const mine = new Set(roster.map((st) => st.id))
    return openFollowUps(log).filter((f) => mine.has(f.entry.childId))
  }, [log, roster])
  const nameOf = (childId: string) =>
    roster.find((st) => st.id === childId)?.name ?? childId

  const go = (to: string) => {
    if (!user || canAccess(user, to)) nav(to)
  }

  /** which task card is driving the list — null means the whole caseload */
  const [focus, setFocus] = useState<TaskFilter | null>(null)
  const rows = useMemo(
    () => (focus ? ops.rows.filter((r) => matchesTask(r, focus)) : ops.rows),
    [ops.rows, focus],
  )
  const focusLabel = ops.tasks.find((task) => task.filter === focus)

  // ── the narrated brief ────────────────────────────────────
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'streaming' | 'live' | 'local'>('streaming')
  const ran = useRef(false)

  /** Names the child to start with and why — the cards below already carry the
   *  counts, and a summary that recites them is the thing that makes a panel
   *  feel like it is talking about itself instead of doing something. */
  const localText = useMemo(() => {
    const worst = ops.rows[0]
    if (!worst) return th ? 'ไม่มีงานค้างในเคสของคุณวันนี้' : 'Nothing outstanding in your caseload today'
    const who = `${worst.student.name} (${GRADE_LABEL(worst.student.gradeKey, th)})`
    const why = worst.overdue
      ? th
        ? `เกินกำหนดติดตามมา ${worst.updatedDaysAgo} วัน`
        : `${worst.updatedDaysAgo} days past the follow-up deadline`
      : th
        ? `คะแนนเสี่ยงสูงสุดในเคสของคุณ ${worst.student.riskScore}`
        : `the highest risk score in your caseload, ${worst.student.riskScore}`
    return th
      ? `เริ่มที่ ${who} — ${why}\n${worst.student.nextAction}`
      : `Start with ${who} — ${why}\n${worst.student.nextAction}`
  }, [ops, th])

  const run = async () => {
    setText('')
    setMode('streaming')
    const facts = `caseload ${ops.caseload} · critical ${ops.critical} · overdue ${ops.overdue} · parents to reach ${ops.needParent} · not yet visited ${ops.needVisit} · attendance ${ops.attendanceRate.toFixed(1)}%`
    try {
      let out = ''
      for await (const chunk of streamAnswer({
        system: buildSystemPrompt(user, lang),
        history: [
          {
            role: 'user',
            text: th
              ? `คุณกำลังพูดกับครูผู้รับผิดชอบเคสนักเรียน บอก 2 บรรทัดสั้นว่าควรเริ่มที่เด็กคนไหนและเพราะอะไร ห้ามขึ้นต้นด้วยคำนำ ห้ามไล่ตัวเลขทุกตัวซ้ำเพราะหน้าจอแสดงอยู่แล้ว: ${facts}`
              : `You are speaking to a teacher who case-manages students. Two short lines naming which child to start with and why. No preamble, and do not recite every figure — the screen already shows them: ${facts}`,
          },
        ],
      })) {
        out += chunk
        setText(out)
      }
      setMode('live')
    } catch (err) {
      setText(localText)
      setMode('local')
      if ((err as { status?: number })?.status !== 503)
        console.warn('[teacher] fell back to the computed brief:', aiErrorMessage(err, th))
    }
  }

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── ask ───────────────────────────────────────────────────
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState<{ text: string; to?: string; label?: string } | null>(null)
  const [asking, setAsking] = useState(false)

  const ask = async (raw: string) => {
    const question = raw.trim()
    if (!question || asking) return
    setAsking(true)
    setAsked(null)
    const fallback = localAnswer(question, user, lang)
    try {
      let out = ''
      for await (const chunk of streamAnswer({
        system: buildSystemPrompt(user, lang),
        history: [{ role: 'user', text: question }],
      })) {
        out += chunk
        setAsked({ text: out, to: fallback.action?.to, label: fallback.action?.label })
      }
    } catch {
      setAsked({ text: fallback.text, to: fallback.action?.to, label: fallback.action?.label })
    } finally {
      setAsking(false)
    }
  }

  const suggestions = th
    ? [
        'นักเรียนคนไหนต้องติดตามวันนี้',
        'ทำไมนักเรียนคนนี้มีความเสี่ยง',
        'ควรช่วยเหลือนักเรียนอย่างไร',
        'เคสไหนควรส่งต่อหน่วยงาน',
      ]
    : [
        'Who needs following up today?',
        'Why is this student at risk?',
        'What support should I give?',
        'Which case should be referred?',
      ]

  const riskTone: Record<RiskLevel, string> = RISK_COLOR
  const openReferrals = referrals.filter((r) =>
    ['sent', 'accepted', 'inProgress', 'overdue'].includes(r.status),
  ).length

  /** Standing facts about the caseload. The four action counts deliberately do
   *  NOT appear here — they live on the cards below, which are clickable, and
   *  printing them twice was the reason this screen read as noise. */
  const CONTEXT = [
    { label: th ? 'เคสที่รับผิดชอบ' : 'Caseload', value: ops.caseload },
    { label: th ? 'มีแผนโอกาสแล้ว' : 'With a plan', value: plans.length },
    { label: th ? 'ส่งต่อที่เปิดอยู่' : 'Open referrals', value: openReferrals },
    { label: th ? 'ปิดเคสสำเร็จ' : 'Closed', value: ops.resolved, color: RISK_COLOR.normal },
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-4 overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card"
    >
      {/* ── header ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-surface-border px-5 py-3.5">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center">
          {mode === 'streaming' && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-xl bg-brand-500"
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <IconAI width={18} height={18} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold text-ink">
            {user?.ownerName ?? user?.name ?? (th ? 'เคสของคุณ' : 'Your caseload')}
          </h2>
          <p className="truncate text-[12px] text-ink-faint">
            {th
              ? `นักเรียนที่คุณรับผิดชอบ ${formatNumber(ops.caseload, lang)} คน${schools[0] ? ` · ${schools[0].name}` : ''}`
              : `${formatNumber(ops.caseload, lang)} students in your care${schools[0] ? ` · ${schools[0].name}` : ''}`}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-ink-faint">
          {mode === 'streaming'
            ? th
              ? 'กำลังวิเคราะห์…'
              : 'Analysing…'
            : mode === 'local'
              ? th
                ? 'คำนวณจากข้อมูลในระบบ'
                : 'Computed'
              : th
                ? 'วิเคราะห์ด้วย AI'
                : 'AI'}
        </span>
      </div>

      {/* ── brief, with the standing numbers alongside it ──
          The line and the figures share a row so neither is stranded beside
          half a screen of white on a wide display. */}
      <div className="flex flex-col gap-4 px-5 pt-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {text ? (
            <p className="max-w-2xl text-[17px] leading-relaxed text-ink">
              {text.split('\n').map((line, i) => (
                <span key={i} className={i === 0 ? 'block font-semibold' : 'block text-ink-muted'}>
                  {line}
                </span>
              ))}
            </p>
          ) : (
            <div className="max-w-2xl space-y-2" aria-live="polite">
              <Skeleton className="h-5 w-9/12" />
              <Skeleton className="h-5 w-6/12" />
            </div>
          )}
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-7 gap-y-2 sm:flex sm:flex-wrap lg:justify-end">
          {CONTEXT.map((k) => (
            <div key={k.label}>
              <dt className="text-[11px] text-ink-faint">{k.label}</dt>
              <dd
                className="text-[20px] font-bold leading-tight tabular text-ink"
                style={k.color ? { color: k.color } : undefined}
              >
                <AnimatedCounter value={k.value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── today's desk ──────────────────────────────────── */}
      <div className="px-5 pt-5">
        <SectionLabel>{th ? 'วันนี้ต้องดำเนินการ · กดเพื่อกรองรายชื่อ' : 'On your desk today · tap to filter the list'}</SectionLabel>
        {ops.tasks.length ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {ops.tasks.map((task, i) => {
              const tone =
                task.tone === 'critical'
                  ? RISK_COLOR.critical
                  : task.tone === 'high'
                    ? RISK_COLOR.high
                    : RISK_COLOR.watch
              const on = focus === task.filter
              return (
                <motion.button
                  key={task.key}
                  type="button"
                  // the card is the filter — no second screen to get lost on
                  onClick={() => setFocus(on ? null : task.filter)}
                  aria-pressed={on}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  whileHover={{ y: -1 }}
                  className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-shadow hover:shadow-card"
                  style={{
                    borderColor: on ? tone : undefined,
                    background: on ? `${tone}0d` : undefined,
                  }}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[15px] font-bold text-white"
                    style={{ background: tone }}
                  >
                    <AnimatedCounter value={task.count} />
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-ink">
                    {th ? task.th : task.en}
                  </span>
                  <span className="sr-only">
                    {on
                      ? th
                        ? 'กำลังกรองอยู่ กดเพื่อล้าง'
                        : 'Filtering, tap to clear'
                      : th
                        ? 'ดูรายชื่อ'
                        : 'Show the list'}
                  </span>
                </motion.button>
              )
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-surface-border px-3 py-4 text-[12px] text-ink-faint">
            {th ? 'ไม่มีงานค้างในวันนี้' : 'Nothing outstanding today'}
          </p>
        )}
      </div>

      {/* ── why these children are slipping ───────────────── */}
      {ops.alerts.length > 0 && (
        <div className="px-5 pt-5">
          <SectionLabel>
            {th
              ? `สัญญาณที่ต้องอ่านก่อน — ${ops.alerts.length} คน`
              : `Read these signals first — ${ops.alerts.length} students`}
          </SectionLabel>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            {ops.alerts.map((a, i) => (
              <motion.div
                key={a.student.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i, duration: 0.3 }}
                className="flex flex-col rounded-xl border border-surface-border p-3.5"
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular text-white"
                    style={{ background: riskTone[a.student.riskLevel] }}
                  >
                    {a.student.riskScore}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {a.student.name}
                    </span>
                    <span className="block text-[11px] text-ink-faint">
                      {GRADE_LABEL(a.student.gradeKey, th)} · {t(`risk.${a.student.riskLevel}`)}
                    </span>
                  </span>
                </div>

                {/* the reasons are fields off this child's record, each with the
                    figure beside it so the teacher can check the claim */}
                <ul className="mt-2.5 space-y-1">
                  {a.signals.map((sig) => (
                    <li key={sig.th} className="flex items-baseline gap-1.5 text-[11px]">
                      <IconDown
                        width={10}
                        height={10}
                        className="shrink-0 translate-y-0.5"
                        style={{ color: RISK_COLOR.high }}
                      />
                      <span className="text-ink-muted">{th ? sig.th : sig.en}</span>
                      <span className="ml-auto shrink-0 font-bold tabular text-ink">{sig.value}</span>
                    </li>
                  ))}
                </ul>

                {/* `nextAction` is templated off the risk level, so printing it
                    here put the same sentence on two cards and in the brief
                    above. What is specific to this child — and computed — is on
                    their own page under "สิ่งที่ยังค้างอยู่กับเด็กคนนี้". */}
                <div className="mt-3 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => go(`/student?id=${a.student.id}`)}
                    className="flex-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
                  >
                    {th ? 'เปิดแฟ้มเด็ก' : 'Open the file'}
                  </button>
                  <button
                    type="button"
                    onClick={() => go('/referral')}
                    className="rounded-lg border border-surface-border px-2.5 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600"
                  >
                    {th ? 'ขอความช่วยเหลือ' : 'Ask for support'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── appointments the teacher committed to ─────────── */}
      <div className="px-5 pt-5">
        <SectionLabel>
          {t('tw.followUps')}
          {followUps.length ? ` — ${followUps.length}` : ''}
        </SectionLabel>
        {followUps.length ? (
          <ul className="divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border">
            {followUps.map(({ entry, daysAway }) => {
              const late = daysAway < 0
              const today = daysAway === 0
              const tone = late ? RISK_COLOR.critical : today ? RISK_COLOR.high : RISK_COLOR.watch
              return (
                <li key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold text-white"
                    style={{ background: tone }}
                  >
                    {late
                      ? `${t('st.overdueBy')} ${Math.abs(daysAway)} ${t('ref.days')}`
                      : today
                        ? t('st.dueToday')
                        : `${t('st.inDays')} ${daysAway} ${t('ref.days')}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => go(`/student?id=${entry.childId}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {nameOf(entry.childId)}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {entry.followUpDate} · {entry.note}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => log.setFollowUpDone(entry.id, true)}
                    className="shrink-0 rounded-lg border border-surface-border px-2.5 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600"
                  >
                    {t('st.markDone')}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-surface-border px-3 py-4 text-[12px] text-ink-faint">
            {t('tw.followUpsEmpty')}
          </p>
        )}
      </div>

      {/* ── the caseload ──────────────────────────────────── */}
      <div className="px-5 pt-5">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <p className="text-[12px] font-semibold text-ink-muted">
            {th ? 'นักเรียนที่ฉันรับผิดชอบ' : 'My students'}
          </p>
          <span className="text-[11px] text-ink-faint">
            {th
              ? `แสดง ${rows.length} จาก ${ops.caseload} คน · เรียงเคสเกินกำหนดขึ้นก่อน แล้วตามคะแนนเสี่ยง`
              : `${rows.length} of ${ops.caseload} · overdue first, then by risk score`}
          </span>
          {focusLabel && (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100"
            >
              {th ? focusLabel.th : focusLabel.en}
              <IconClose width={11} height={11} />
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-surface-border text-[11px] text-ink-faint">
                <th className="px-3 py-2 font-medium">{th ? 'นักเรียน' : 'Student'}</th>
                <th className="px-3 py-2 font-medium">{th ? 'ชั้น' : 'Grade'}</th>
                <th className="px-3 py-2 text-right font-medium">{th ? 'คะแนนเสี่ยง' : 'Risk'}</th>
                <th className="px-3 py-2 font-medium">{th ? 'ปัญหาหลัก' : 'Main problem'}</th>
                <th className="px-3 py-2 font-medium">{th ? 'อัปเดตล่าสุด' : 'Last update'}</th>
                <th className="px-3 py-2 font-medium">{th ? 'สถานะ' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={r.student.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.25 }}
                  onClick={() => go(`/student?id=${r.student.id}`)}
                  className="cursor-pointer border-b border-surface-border last:border-0 transition-colors hover:bg-brand-50/40"
                >
                  <td className="px-3 py-2.5">
                    <p className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-ink">
                      {r.student.name}
                      {r.urgent && (
                        <span
                          className="rounded px-1 py-px text-[10px] font-bold text-white"
                          style={{ background: RISK_COLOR.critical }}
                        >
                          {th ? 'ด่วน' : 'urgent'}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">{r.student.id}</p>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-muted">
                    {GRADE_LABEL(r.student.gradeKey, th)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className="inline-block rounded-md px-2 py-0.5 text-[12px] font-bold tabular text-white"
                      style={{ background: riskTone[r.student.riskLevel] }}
                    >
                      {r.student.riskScore}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-ink-muted">
                    {r.problem ? t(`cause.${r.problem}`) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[11px]">
                    {r.updatedDaysAgo === undefined ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <span
                        className={r.overdue ? 'font-semibold' : 'text-ink-muted'}
                        style={r.overdue ? { color: RISK_COLOR.critical } : undefined}
                      >
                        {r.updatedDaysAgo} {t('ref.days')}
                        {r.overdue ? (th ? ' · เกิน SLA' : ' · late') : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-ink-muted">{t(`stage.${r.stage}`)}</td>
                </motion.tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[12px] text-ink-faint">
                    {th ? 'ไม่มีนักเรียนในกลุ่มนี้' : 'No students in this group'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── what has already happened ─────────────────────── */}
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 pt-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionLabel>
            {th ? 'ประวัติการดำเนินการ (ตามวันที่บันทึก)' : 'Intervention log (by recorded date)'}
          </SectionLabel>
          <ul className="rounded-xl border border-surface-border p-3">
            {ops.feed.map(({ event, student }, i) => (
              <li key={`${student.id}-${event.date}-${i}`} className="flex gap-3">
                {/* the rail is drawn per row so the line stops at the last one */}
                <span className="flex flex-col items-center">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  {i < ops.feed.length - 1 && <span className="w-px flex-1 bg-surface-border" />}
                </span>
                <button
                  type="button"
                  onClick={() => go(`/student?id=${student.id}`)}
                  className="min-w-0 flex-1 pb-3 text-left"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12px] font-semibold text-ink">{student.name}</span>
                    <span className="text-[11px] text-ink-faint">
                      {event.date} · {t(`stage.${event.stageKey}`)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
                    {event.note}
                  </span>
                </button>
              </li>
            ))}
            {!ops.feed.length && (
              <li className="px-1 py-2 text-[12px] text-ink-faint">
                {th ? 'ยังไม่มีความเคลื่อนไหว' : 'No activity yet'}
              </li>
            )}
          </ul>
        </div>

        <div>
          <SectionLabel>{th ? 'ผลของเคสที่คุณดูแล' : 'How your cases end'}</SectionLabel>
          <div className="rounded-xl border border-surface-border p-4">
            <div className="flex items-baseline gap-2">
              <span
                className="text-[32px] font-bold leading-none tabular"
                style={{ color: RISK_COLOR.normal }}
              >
                <AnimatedCounter value={ops.resolvedPct} decimals={0} />%
              </span>
              <span className="text-[12px] text-ink-muted">
                {th
                  ? `ปิดเคสสำเร็จ ${ops.resolved} จาก ${ops.caseload} คน`
                  : `${ops.resolved} of ${ops.caseload} closed`}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {(['critical', 'high', 'watch', 'normal'] as RiskLevel[]).map((lvl) => {
                const n = ops.riskMix[lvl]
                const pct = ops.caseload ? (n / ops.caseload) * 100 : 0
                return (
                  <div key={lvl}>
                    <div className="mb-1 flex items-baseline justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-ink">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: riskTone[lvl] }}
                        />
                        {t(`risk.${lvl}`)}
                      </span>
                      <span className="font-bold tabular text-ink-muted">{n}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                        className="h-full rounded-full"
                        style={{ background: riskTone[lvl] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-ink-faint">
              {th
                ? 'ระบบเก็บคะแนนเสี่ยงล่าสุดค่าเดียว จึงเทียบ "ก่อน/หลัง" รายคนไม่ได้ — ตัวเลขนี้คือสัดส่วนเคสที่ปิดสำเร็จจริง'
                : 'The record holds one current risk score, not a history, so there is no per-student before/after — this is the share of cases actually closed.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── ask ───────────────────────────────────────────── */}
      <div className="border-t border-surface-border bg-surface-muted px-5 py-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void ask(q)
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={th ? 'ถามเกี่ยวกับนักเรียนที่คุณดูแล…' : 'Ask about your students…'}
            className="min-w-0 flex-1 rounded-xl border border-surface-border bg-white px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={asking || !q.trim()}
            className="shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {asking ? (th ? 'กำลังคิด…' : 'Thinking…') : th ? 'ถาม' : 'Ask'}
          </button>
        </form>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQ(s)
                void ask(s)
              }}
              className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600"
            >
              {s}
            </button>
          ))}
        </div>

        {asked && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2.5 rounded-xl border border-surface-border bg-white p-3"
          >
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
              {asked.text}
            </p>
            {asked.to && (
              <button
                type="button"
                onClick={() => go(asked.to!)}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline"
              >
                {asked.label}
                <IconArrowRight width={12} height={12} />
              </button>
            )}
          </motion.div>
        )}
      </div>
    </motion.section>
  )
}
