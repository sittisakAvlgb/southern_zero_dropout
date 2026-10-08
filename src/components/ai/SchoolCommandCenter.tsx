import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import { PIPELINE } from '@/lib/areaOps'
import { GRADE_LABEL, SCORE_PARTS, buildSchoolOps } from '@/lib/schoolOps'
import { aiErrorMessage, buildSystemPrompt, localAnswer, streamAnswer } from '@/lib/ai'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconAI, IconArrowRight, IconDown, IconUp } from '@/components/icons'
import type { RiskLevel } from '@/types'

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[12px] font-semibold text-ink-muted">{children}</p>
}

const RISK_ORDER: RiskLevel[] = ['normal', 'watch', 'high', 'critical']

/**
 * The dashboard a school director gets.
 *
 * สพท. manages an area; a principal manages named children and the teachers
 * carrying them. So this panel leads with the queue — who to see this week,
 * whose caseload is overdue, which parents have not been reached — rather than
 * with area totals.
 *
 * The one number that needs care: the school record counts the whole enrolment
 * while the platform holds detailed records for a sample of it. Both appear
 * here, each labelled for what it is, because silently mixing them would make
 * "110 flagged" sit beside a list of four.
 */
export function SchoolCommandCenter() {
  const { lang, t, dn } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const { user, schools, students, cases, stats } = useScopedData()

  const ops = useMemo(
    () => buildSchoolOps({ school: schools[0], students, cases, stats }),
    [schools, students, cases, stats],
  )

  const go = (to: string) => {
    if (!user || canAccess(user, to)) nav(to)
  }

  // ── the narrated brief ────────────────────────────────────
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'streaming' | 'live' | 'local'>('streaming')
  const ran = useRef(false)

  const localText = useMemo(() => {
    const worstGrade = ops.grades[0]
    const busiest = ops.teachers[0]
    return th
      ? `นักเรียนทั้งโรงเรียน ${formatNumber(ops.enrolled, lang)} คน มีสัญญาณเสี่ยง ${formatNumber(ops.flagged, lang)} คน และกำลังติดตามรายคนอยู่ ${formatNumber(ops.tracked, lang)} คน\n${worstGrade ? `ชั้นที่ต้องดูก่อนคือ ${GRADE_LABEL(worstGrade.grade, th)} (เสี่ยงสูง ${worstGrade.atRisk} จาก ${worstGrade.tracked} คนที่ติดตาม)` : ''}${busiest && busiest.overdue ? ` · ${busiest.owner} มีเคสเกินกำหนด ${busiest.overdue} เคส` : ''}`
      : `${formatNumber(ops.enrolled, lang)} students enrolled, ${formatNumber(ops.flagged, lang)} flagged, ${formatNumber(ops.tracked, lang)} tracked case by case.\n${worstGrade ? `Watch ${GRADE_LABEL(worstGrade.grade, th)} first (${worstGrade.atRisk} of ${worstGrade.tracked} tracked at risk)` : ''}${busiest && busiest.overdue ? ` · ${busiest.owner} has ${busiest.overdue} overdue` : ''}`
  }, [ops, lang, th])

  const run = async () => {
    setText('')
    setMode('streaming')
    const facts = `enrolled ${ops.enrolled} · flagged ${ops.flagged} · tracked ${ops.tracked} · open cases ${ops.activeCases} · overdue ${ops.overdue} · attendance ${ops.attendanceRate.toFixed(1)}%`
    try {
      let out = ''
      for await (const chunk of streamAnswer({
        system: buildSystemPrompt(user, lang),
        history: [
          {
            role: 'user',
            text: th
              ? `สรุปให้ผู้อำนวยการโรงเรียนอ่านใน 30 วินาที 2 บรรทัดสั้น เน้นว่าต้องทำอะไรสัปดาห์นี้ ห้ามขึ้นต้นด้วยคำนำ ใช้เฉพาะตัวเลขเหล่านี้: ${facts}`
              : `Brief a school principal in two short lines on what this week needs, no preamble, using only these figures: ${facts}`,
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
        console.warn('[school] fell back to the computed brief:', aiErrorMessage(err, th))
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
    ? ['นักเรียนคนไหนต้องติดตามด่วน', 'ครูคนไหนมีเคสค้าง', 'ชั้นไหนเสี่ยงที่สุด', 'ควรดำเนินการอะไรต่อ']
    : [
        'Which students need urgent follow-up?',
        'Which teacher has overdue cases?',
        'Which grade is most at risk?',
        'What should we do next?',
      ]

  const riskTone: Record<RiskLevel, string> = RISK_COLOR
  const maxStage = Math.max(...PIPELINE.map((p) => ops.pipeline[p.key]), 1)
  const parentTotal = ops.parents.ok + ops.parents.delayed + ops.parents.unreachable
  const reachedPct = parentTotal ? (ops.parents.ok / parentTotal) * 100 : 0

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
            {ops.school?.name ?? (th ? 'สถานศึกษาของคุณ' : 'Your school')}
          </h2>
          <p className="text-[12px] text-ink-faint">
            {th
              ? `ติดตามนักเรียนรายคน ครูผู้รับผิดชอบ และการช่วยเหลือในโรงเรียน${ops.school ? ` · ${dn(ops.school.districtKey)}` : ''}`
              : `Students, case owners and support in your school${ops.school ? ` · ${dn(ops.school.districtKey)}` : ''}`}
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

      {/* ── brief + KPI ───────────────────────────────────── */}
      <div className="px-5 pt-4">
        {text ? (
          <p className="max-w-3xl text-[16px] leading-relaxed text-ink-muted">
            {text.split('\n').map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </p>
        ) : (
          <div className="max-w-3xl space-y-2" aria-live="polite">
            <Skeleton className="h-5 w-10/12" />
            <Skeleton className="h-5 w-8/12" />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-3 border-y border-surface-border py-3">
          {[
            { label: th ? 'นักเรียนทั้งโรงเรียน' : 'Enrolled', value: ops.enrolled, tone: '#0f2a6b' },
            { label: th ? 'มีสัญญาณเสี่ยง' : 'Flagged', value: ops.flagged, tone: RISK_COLOR.high },
            // said plainly: this is the subset with a case file, not the whole school
            { label: th ? 'ติดตามรายคน' : 'Tracked', value: ops.tracked, tone: '#0f2a6b', to: '/student' },
            { label: th ? 'เคสที่ยังไม่ปิด' : 'Open cases', value: ops.activeCases, tone: RISK_COLOR.watch, to: '/intervention' },
            { label: th ? 'เกินกำหนด' : 'Overdue', value: ops.overdue, tone: RISK_COLOR.critical, to: '/intervention?focus=overdue' },
            // computed from the tracked students, who skew at-risk — labelling
            // this "attendance" without qualification reads as a school-wide
            // 63%, which would be a crisis rather than a caseload statistic
            {
              label: th ? 'มาเรียน (กลุ่มติดตาม)' : 'Attendance (tracked)',
              value: ops.attendanceRate,
              tone: RISK_COLOR.watch,
              pct: true,
            },
          ].map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => k.to && go(k.to)}
              disabled={!k.to}
              className="text-left disabled:cursor-default"
            >
              <p className="text-[12px] text-ink-faint">{k.label}</p>
              <p className="text-[24px] font-bold leading-none tabular" style={{ color: k.tone }}>
                <AnimatedCounter value={k.value} decimals={k.pct ? 1 : 0} suffix={k.pct ? '%' : ''} />
              </p>
            </button>
          ))}
        </div>
        {/* one clause, not a paragraph — a principal needs the caveat, not a
            lecture on how the dataset is built */}
        <p className="mt-1.5 text-[11px] text-ink-faint">
          {th
            ? `ตัวเลขสองสีจากคนละฐาน — สีเทาคือทั้งโรงเรียน สีส้มคือ ${formatNumber(ops.tracked, lang)} คนที่มีแฟ้มรายบุคคล`
            : `Two bases — grey covers the whole school, orange the ${formatNumber(ops.tracked, lang)} with an individual file.`}
        </p>
      </div>

      {/* ── today's desk + the school's own score ─────────── */}
      <div className="grid grid-cols-1 gap-4 px-5 pt-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionLabel>{th ? 'งานที่ต้องดำเนินการวันนี้' : 'On your desk today'}</SectionLabel>
          {/* one row per job, so the column ends level with the score card
              beside it instead of leaving half a screen of white below */}
          {ops.tasks.length ? (
            <ul className="divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border">
              {ops.tasks.map((task, i) => {
                const tone =
                  task.tone === 'critical'
                    ? RISK_COLOR.critical
                    : task.tone === 'high'
                      ? RISK_COLOR.high
                      : RISK_COLOR.watch
                return (
                  <motion.li
                    key={task.key}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.28 }}
                  >
                    <button
                      type="button"
                      onClick={() => go(task.to)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-brand-50/50"
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[14px] font-bold text-white"
                        style={{ background: tone }}
                      >
                        {task.count}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {th ? task.th : task.en}
                      </span>
                      <span className="hidden shrink-0 items-center gap-1 text-[12px] font-medium text-brand-600 sm:inline-flex">
                        {th ? task.actionTh : task.actionEn}
                        <IconArrowRight width={12} height={12} />
                      </span>
                    </button>
                  </motion.li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-surface-border px-3 py-4 text-[12px] text-ink-faint">
              {th ? 'ไม่มีงานค้างในวันนี้' : 'Nothing outstanding today'}
            </p>
          )}
        </div>

        <div>
          <SectionLabel>{th ? 'คะแนนโรงเรียน' : 'School score'}</SectionLabel>
          <div className="rounded-xl border border-surface-border p-4">
            <div className="flex items-baseline gap-2">
              <span
                className="text-[34px] font-bold leading-none tabular"
                style={{
                  color:
                    ops.score.total >= 75
                      ? RISK_COLOR.normal
                      : ops.score.total >= 60
                        ? RISK_COLOR.watch
                        : ops.score.total >= 45
                          ? RISK_COLOR.high
                          : RISK_COLOR.critical,
                }}
              >
                <AnimatedCounter value={ops.score.total} decimals={0} />
              </span>
              <span className="text-[13px] text-ink-faint">/ 100</span>
            </div>
            <div className="mt-3 space-y-2">
              {SCORE_PARTS.map((part, i) => (
                <div key={part.key}>
                  <div className="mb-1 flex items-baseline justify-between text-[11px]">
                    <span className="text-ink">
                      {th ? part.th : part.en}
                      {/* the attendance component is measured on the tracked
                          group, so it says so here rather than in a footnote */}
                      {part.key === 'attendance' && (
                        <span className="ml-1 text-ink-faint">
                          {th ? '(กลุ่มติดตาม)' : '(tracked)'}
                        </span>
                      )}
                      <span className="ml-1 text-ink-faint">{(part.weight * 100).toFixed(0)}%</span>
                    </span>
                    <span className="font-bold tabular text-ink-muted">
                      {ops.score.parts[part.key].toFixed(0)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${ops.score.parts[part.key]}%` }}
                      transition={{ duration: 0.7, delay: 0.2 + i * 0.08 }}
                      className="h-full rounded-full bg-brand-500"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-ink-faint">
              {th
                ? 'คำนวณจากข้อมูลในระบบ ไม่ใช่คะแนนประเมินจากต้นสังกัด'
                : 'Computed from system data, not an official assessment.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── the queue ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 px-5 pt-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionLabel>
            {th ? 'นักเรียนที่ต้องติดตามเร่งด่วน' : 'Students to see first'}
          </SectionLabel>
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-surface-border text-[11px] text-ink-faint">
                  <th className="px-3 py-2 font-medium">{th ? 'นักเรียน' : 'Student'}</th>
                  <th className="px-3 py-2 font-medium">{th ? 'ชั้น' : 'Grade'}</th>
                  <th className="px-3 py-2 text-right font-medium">{th ? 'คะแนนเสี่ยง' : 'Risk'}</th>
                  <th className="px-3 py-2 font-medium">{th ? 'สาเหตุหลัก' : 'Main factor'}</th>
                  <th className="px-3 py-2 font-medium">{th ? 'ครูผู้รับผิดชอบ' : 'Owner'}</th>
                </tr>
              </thead>
              <tbody>
                {ops.priority.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                    onClick={() => go(`/student?id=${s.id}`)}
                    className="cursor-pointer border-b border-surface-border last:border-0 transition-colors hover:bg-brand-50/40"
                  >
                    <td className="px-3 py-2.5">
                      <p className="truncate text-[12px] font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-[11px] text-ink-faint">{s.id}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-muted">
                      {GRADE_LABEL(s.gradeKey, th)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className="inline-block rounded-md px-2 py-0.5 text-[12px] font-bold tabular text-white"
                        style={{ background: riskTone[s.riskLevel] }}
                      >
                        {s.riskScore}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-muted">
                      {s.causeKeys[0] ? t(`cause.${s.causeKeys[0]}`) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-muted">{s.caseOwner}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <SectionLabel>{th ? 'สัดส่วนความเสี่ยงที่ติดตาม' : 'Tracked risk mix'}</SectionLabel>
            <div className="space-y-2 rounded-xl border border-surface-border p-4">
              {RISK_ORDER.map((lvl) => {
                const n = ops.riskMix[lvl]
                const pct = ops.tracked ? (n / ops.tracked) * 100 : 0
                return (
                  <div key={lvl}>
                    <div className="mb-1 flex items-baseline justify-between text-[12px]">
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
              {ops.grades[0] && (
                <p className="pt-1 text-[11px] leading-snug text-ink-faint">
                  {th
                    ? `ชั้นที่หนักที่สุดคือ ${GRADE_LABEL(ops.grades[0].grade, th)} — เสี่ยงสูง ${ops.grades[0].atRisk} จาก ${ops.grades[0].tracked} คนที่ติดตาม`
                    : `Heaviest grade: ${GRADE_LABEL(ops.grades[0].grade, th)} — ${ops.grades[0].atRisk} of ${ops.grades[0].tracked} tracked at risk`}
                </p>
              )}
            </div>
          </div>

          <div>
            <SectionLabel>{th ? 'สถานะการช่วยเหลือ' : 'Case pipeline'}</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {PIPELINE.map((p, i) => {
                const n = ops.pipeline[p.key]
                const tone =
                  p.key === 'unassigned'
                    ? RISK_COLOR.critical
                    : p.key === 'assigned'
                      ? RISK_COLOR.watch
                      : p.key === 'working'
                        ? '#2f66f6'
                        : RISK_COLOR.normal
                return (
                  <motion.button
                    key={p.key}
                    type="button"
                    onClick={() => go(p.to)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.3 }}
                    whileHover={{ y: -2 }}
                    className="rounded-xl border border-surface-border p-3 text-left transition-shadow hover:shadow-card"
                  >
                    <p className="truncate text-[11px] font-semibold text-ink">{th ? p.th : p.en}</p>
                    <p className="mt-0.5 text-[22px] font-bold leading-none tabular" style={{ color: tone }}>
                      <AnimatedCounter value={n} />
                    </p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(n / maxStage) * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.15 + i * 0.06 }}
                        className="h-full rounded-full"
                        style={{ background: tone }}
                      />
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── who is carrying the work, and who we can reach ─── */}
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 pt-5 lg:grid-cols-2">
        <div>
          <SectionLabel>
            {th ? 'สัญญาณเตือนจากการมาเรียน' : 'Attendance early warning'}
          </SectionLabel>
          <ul className="space-y-1.5 rounded-xl border border-surface-border p-3">
            {ops.attendanceWatch.map((w) => (
              <li key={w.student.id}>
                <button
                  type="button"
                  onClick={() => go(`/student?id=${w.student.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-50/50"
                >
                  <span
                    className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-bold text-white"
                    style={{ background: w.delta < 0 ? RISK_COLOR.critical : RISK_COLOR.watch }}
                  >
                    {w.delta < 0 ? <IconDown width={10} height={10} /> : <IconUp width={10} height={10} />}
                    {Math.abs(w.delta).toFixed(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink">
                      {w.student.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {GRADE_LABEL(w.student.gradeKey, th)} ·{' '}
                      {th ? 'มาเรียนล่าสุด' : 'latest'} {w.latest.toFixed(0)}%
                      {w.streak ? ` · ${th ? 'ขาดต่อเนื่อง' : 'absent'} ${w.streak} ${th ? 'วัน' : 'd'}` : ''}
                    </span>
                  </span>
                  <IconArrowRight width={12} height={12} className="shrink-0 text-ink-faint" />
                </button>
              </li>
            ))}
            {!ops.attendanceWatch.length && (
              <li className="px-2 py-2 text-[12px] text-ink-faint">
                {th ? 'ไม่มีนักเรียนที่การมาเรียนลดลง' : 'No falling attendance'}
              </li>
            )}
          </ul>
        </div>

        <div className="space-y-4">
          <div>
            <SectionLabel>{th ? 'ภาระงานครูผู้รับผิดชอบ' : 'Case owners'}</SectionLabel>
            <ul className="space-y-1.5">
              {ops.teachers.map((tt) => (
                <li
                  key={tt.owner}
                  className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink">
                      {tt.owner}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {th ? 'ปิดแล้ว' : 'closed'} {tt.done} ({tt.completion.toFixed(0)}%) ·{' '}
                      {th ? 'เปิดเฉลี่ย' : 'avg open'} {tt.avgOpenDays.toFixed(0)}{' '}
                      {th ? 'วัน' : 'd'}
                      {tt.urgent ? ` · ${th ? 'เร่งด่วน' : 'urgent'} ${tt.urgent}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[16px] font-bold leading-none tabular text-ink">
                      {tt.cases}
                    </span>
                    <span className="block text-[10px] text-ink-faint">{th ? 'เคส' : 'cases'}</span>
                  </span>
                  {tt.overdue > 0 && (
                    <span
                      className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold text-white"
                      style={{ background: RISK_COLOR.critical }}
                    >
                      {th ? 'ค้าง' : 'late'} {tt.overdue}
                    </span>
                  )}
                </li>
              ))}
              {!ops.teachers.length && (
                <li className="rounded-xl border border-surface-border px-3 py-3 text-[12px] text-ink-faint">
                  {th ? 'ยังไม่มีเคสที่มอบหมาย' : 'No assigned cases yet'}
                </li>
              )}
            </ul>
          </div>

          <div>
            <SectionLabel>{th ? 'การติดต่อผู้ปกครอง' : 'Parent contact'}</SectionLabel>
            <div className="rounded-xl border border-surface-border p-4">
              <div className="flex items-baseline gap-3">
                <span className="text-[26px] font-bold leading-none tabular text-ink">
                  {reachedPct.toFixed(0)}%
                </span>
                <span className="text-[12px] text-ink-muted">
                  {th
                    ? `ติดต่อได้ ${ops.parents.ok} จาก ${parentTotal} ครอบครัวที่ติดตาม`
                    : `${ops.parents.ok} of ${parentTotal} families reached`}
                </span>
              </div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                {[
                  { n: ops.parents.ok, c: RISK_COLOR.normal },
                  { n: ops.parents.delayed, c: RISK_COLOR.watch },
                  { n: ops.parents.unreachable, c: RISK_COLOR.critical },
                ].map((seg, i) => (
                  <motion.span
                    key={i}
                    initial={{ width: 0 }}
                    animate={{ width: `${parentTotal ? (seg.n / parentTotal) * 100 : 0}%` }}
                    transition={{ duration: 0.7, delay: 0.2 + i * 0.08 }}
                    style={{ background: seg.c }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
                <span>
                  {th ? 'ติดต่อได้' : 'Reached'}{' '}
                  <span className="font-bold text-ink">{ops.parents.ok}</span>
                </span>
                <span>
                  {th ? 'ติดต่อช้า' : 'Delayed'}{' '}
                  <span className="font-bold text-ink">{ops.parents.delayed}</span>
                </span>
                <span>
                  {th ? 'ติดต่อไม่ได้' : 'Unreachable'}{' '}
                  <span className="font-bold text-ink">{ops.parents.unreachable}</span>
                </span>
                <span>
                  {th ? 'เยี่ยมบ้านแล้ว' : 'Home visited'}{' '}
                  <span className="font-bold text-ink">{ops.parents.visited}</span>
                </span>
              </div>
              {ops.parents.unreachable > 0 && (
                <p className="mt-2 text-[11px] leading-snug text-ink-faint">
                  {th
                    ? `ติดต่อไม่ได้ ${ops.parents.unreachable} ครอบครัว — กลุ่มนี้ควรใช้การเยี่ยมบ้านแทนการโทร`
                    : `${ops.parents.unreachable} families cannot be reached by phone — these need a home visit instead.`}
                </p>
              )}
            </div>
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
            placeholder={th ? 'ถามเกี่ยวกับนักเรียนในโรงเรียนของคุณ…' : 'Ask about your school…'}
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
              className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-600"
            >
              {s}
            </button>
          ))}
        </div>

        {asked && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2.5 rounded-xl bg-white px-3.5 py-3"
          >
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{asked.text}</p>
            {asked.to && asked.label && (
              <button
                type="button"
                onClick={() => go(asked.to!)}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-600 hover:underline"
              >
                {asked.label}
                <IconArrowRight width={13} height={13} />
              </button>
            )}
          </motion.div>
        )}
      </div>
    </motion.section>
  )
}
