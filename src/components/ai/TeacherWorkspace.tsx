import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useScopedData } from '@/auth/scope'
import { canAccess, canWorkCases } from '@/auth/roles'
import { recommendSteps, type StepAction } from '@/lib/recommend'
import { Sparkline } from '@/components/ui/Sparkline'
import { useToast } from '@/components/ui/Toast'
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
  // 13px ไม่ใช่ 12px — ครูบางท่านอายุมาก ทิศทางของหน้านี้คือเพิ่มขนาด ไม่ใช่ลด
  return <p className="mb-2 text-[13px] font-semibold text-ink-muted">{children}</p>
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
  const toast = useToast()
  const { user, schools, students, cases, referrals, plans } = useScopedData()

  const log = useCaseLog(user?.id)
  /** บัญชีระดับกำกับดูแล (สพฐ. ส่วนกลาง / ศอ.บต.) อ่านคำแนะนำได้ แต่ไม่ลงมือ
   *  แทนเจ้าของเคส — AI ต้องไม่กลายเป็นทางลัดข้ามด่านสิทธิ์ */
  const mayAct = canWorkCases(user)

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

  // ── วันนี้ต้องทำอะไร ──────────────────────────────────────
  const alertsRef = useRef<HTMLDivElement>(null)
  const followUpRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const reveal = (el: HTMLElement | null) =>
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  /** นัดที่ถึงกำหนดแล้ว — ครูเป็นคนนัดเอง จึงเป็นงานที่ผูกกับเวลาจริงที่สุด
   *  ในหน้านี้ และเป็นเหตุผลที่มันได้เป็นปุ่มหลักเมื่อมีค้างอยู่ */
  const dueNow = useMemo(() => followUps.filter((f) => f.daysAway <= 0), [followUps])

  /** การมาเรียนที่ลดลงคือ "แนวโน้มแย่ลง" อย่างเดียวที่พูดได้ตามข้อมูลจริง —
   *  คะแนนเสี่ยงถูกเก็บเป็นค่าล่าสุดค่าเดียว ไม่มีประวัติให้เทียบก่อน/หลัง
   *  ส่วนการมาเรียนมี 8 สัปดาห์ย้อนหลัง ครูจึงย้อนตรวจคำกล่าวอ้างนี้ได้ */
  const falling = ops.alerts.filter((a) => a.delta < 0).length

  /** งานวันนี้ — รายการเดียว ไม่แยกเป็น "ตัวเลข" กับ "ประโยค" สองชั้น
   *
   *  รอบก่อนหน้านี้หน้าจอมีการ์ดตัวเลข 6 ใบ แล้วตามด้วยประโยค 5 บรรทัดที่
   *  พูดเลขชุดเดิมซ้ำอีกรอบ ("2 เคสเกินกำหนด" กับ "2 เคสเลยกำหนดติดตามแล้ว"
   *  คือข้อมูลเดียวกัน) ครูจึงเห็นสิบเอ็ดสิ่งที่หนักเท่ากันและไม่มีอะไรเป็น
   *  อันดับหนึ่ง — ซึ่งเป็นปัญหาที่โค้ดเดิมเคยแก้ไปแล้วและเตือนไว้ในคอมเมนต์
   *
   *  ตอนนี้ตัวเลขกับความหมายอยู่ในบรรทัดเดียวกัน เรียงตามความเร่งด่วนจริง
   *  สามอันดับแรกได้เป็นแถวใหญ่ ที่เหลือหดเป็นชิปตัวกรอง */
  const jobs = useMemo(() => {
    const all: {
      key: string
      count: number
      text: string
      short: string
      tone: string
      filter?: TaskFilter
      onClick: () => void
    }[] = []
    const toFilter = (f: TaskFilter) => () => {
      setFocus(f)
      reveal(listRef.current)
    }

    if (dueNow.length)
      all.push({
        key: 'due',
        count: dueNow.length,
        text: th ? 'นัดติดตามถึงกำหนดแล้ว' : 'follow-ups are due',
        short: th ? 'นัดถึงกำหนด' : 'Due today',
        tone: RISK_COLOR.critical,
        onClick: () => reveal(followUpRef.current),
      })
    if (ops.overdue)
      all.push({
        key: 'overdue',
        count: ops.overdue,
        text: th ? 'เคสเลยกำหนดติดตามแล้ว' : 'cases are past their deadline',
        short: th ? 'เลยกำหนด' : 'Overdue',
        tone: RISK_COLOR.critical,
        filter: 'overdue',
        onClick: toFilter('overdue'),
      })
    if (ops.critical)
      all.push({
        key: 'critical',
        count: ops.critical,
        text: th ? 'นักเรียนอยู่ระดับวิกฤต' : 'students are at critical risk',
        short: th ? 'วิกฤต' : 'Critical',
        tone: RISK_COLOR.critical,
        filter: 'critical',
        onClick: toFilter('critical'),
      })
    if (ops.rising)
      all.push({
        key: 'rising',
        count: ops.rising,
        text: th ? 'นักเรียนเสี่ยงเพิ่มขึ้นใน 8 สัปดาห์' : "students' risk has climbed over 8 weeks",
        short: th ? 'เสี่ยงเพิ่มขึ้น' : 'Rising',
        tone: RISK_COLOR.high,
        filter: 'rising',
        onClick: toFilter('rising'),
      })
    if (ops.needParent)
      all.push({
        key: 'parents',
        count: ops.needParent,
        text: th ? 'คนยังติดต่อผู้ปกครองไม่ได้' : 'guardians still not reached',
        short: th ? 'ติดต่อผู้ปกครอง' : 'Parents',
        tone: RISK_COLOR.high,
        filter: 'parents',
        onClick: toFilter('parents'),
      })
    if (ops.needVisit)
      all.push({
        key: 'visit',
        count: ops.needVisit,
        text: th ? 'คนเสี่ยงสูงและยังไม่ได้เยี่ยมบ้าน' : 'at-risk students not yet visited',
        short: th ? 'ยังไม่เยี่ยมบ้าน' : 'Not visited',
        tone: RISK_COLOR.watch,
        filter: 'visit',
        onClick: toFilter('visit'),
      })
    // ข่าวดีอยู่ท้ายเสมอ งานที่ค้างต้องมาก่อน
    if (ops.closable)
      all.push({
        key: 'closable',
        count: ops.closable,
        text: th ? 'เคสเข้าเกณฑ์ปิดได้แล้ว' : 'cases now meet the bar to close',
        short: th ? 'ปิดเคสได้' : 'Ready to close',
        tone: RISK_COLOR.normal,
        filter: 'closable',
        onClick: toFilter('closable'),
      })

    return { top: all.slice(0, 3), rest: all.slice(3) }
  }, [dueNow.length, ops.overdue, ops.critical, ops.rising, ops.needParent, ops.needVisit, ops.closable, th])

  /** ลงมือตามคำแนะนำ — เขียนลง `useCaseLog` ซึ่งเป็นกลไกเดิมที่หน้าเด็กใช้
   *  อยู่แล้ว ทั้งสองหน้าจึงเห็นตรงกันทันทีผ่าน `applyLog`
   *
   *  เจตนาคือ "AI ร่าง ครูยืนยัน" ไม่ใช่ "AI ลงมือเอง" — ทุกปุ่มคือการกระทำ
   *  ที่ครูตั้งใจกด และบันทึกไว้ในชื่อครู ไม่ใช่ชื่อระบบ */
  const applyStep = (studentId: string, name: string, act: StepAction) => {
    if (!mayAct) {
      toast.push(
        th
          ? 'บัญชีระดับกำกับดูแลดูข้อมูลได้ แต่ไม่ลงมือกับเคสรายบุคคล'
          : 'A supervising account can read this, but not act on an individual case',
        'info',
      )
      return
    }
    const today = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const by = user?.ownerName ?? user?.name ?? (th ? 'ครูผู้รับผิดชอบ' : 'Case owner')

    if (act === 'followUp') {
      const when = new Date(today)
      when.setDate(when.getDate() + 7)
      log.add({
        childId: studentId,
        mode: 'contact',
        date: iso(today),
        note: th ? 'ตั้งนัดติดตามจากคำแนะนำในหน้าแรก' : 'Follow-up set from the home-page recommendation',
        by,
        followUpDate: iso(when),
      })
      toast.push(
        th ? `นัดติดตาม ${name} วันที่ ${iso(when)} แล้ว` : `Follow-up for ${name} set for ${iso(when)}`,
      )
      return
    }

    if (act === 'visit') {
      log.add({
        childId: studentId,
        mode: 'visit',
        date: iso(today),
        note: th ? 'บันทึกการลงเยี่ยมบ้านจากคำแนะนำในหน้าแรก' : 'Home visit logged from the home-page recommendation',
        by,
        homeVisited: true,
      })
      toast.push(th ? `บันทึกการเยี่ยมบ้าน ${name} แล้ว` : `Home visit logged for ${name}`)
      return
    }

    log.add({
      childId: studentId,
      mode: 'contact',
      date: iso(today),
      outcome: 'reached',
      note: th ? 'บันทึกการติดต่อผู้ปกครองจากคำแนะนำในหน้าแรก' : 'Guardian contact logged from the home-page recommendation',
      by,
      parentContact: 'ok',
    })
    toast.push(th ? `บันทึกการติดต่อผู้ปกครองของ ${name} แล้ว` : `Guardian contact logged for ${name}`)
  }

  /** ACTION — งานเดียวที่ควรเริ่มก่อน เลือกตามสิ่งที่ผูกเวลามากที่สุด
   *  ครูที่มีเวลา 10 นาทีต่อวันไม่ควรต้องเลือกเองจากปุ่มที่หนักเท่ากันสี่ปุ่ม */
  const primary = useMemo(() => {
    if (dueNow.length)
      return {
        label: th
          ? `ดูนัดที่ถึงกำหนด ${dueNow.length} รายการ`
          : `Open ${dueNow.length} due follow-ups`,
        run: () => reveal(followUpRef.current),
      }
    if (ops.overdue)
      return {
        label: th ? `เปิดเคสที่เลยกำหนด ${ops.overdue} เคส` : `Open ${ops.overdue} overdue cases`,
        run: () => {
          setFocus('overdue')
          reveal(listRef.current)
        },
      }
    if (ops.critical)
      return {
        label: th
          ? `เปิดนักเรียนระดับวิกฤต ${ops.critical} คน`
          : `Open ${ops.critical} critical students`,
        run: () => {
          setFocus('critical')
          reveal(listRef.current)
        },
      }
    const first = ops.rows[0]
    return {
      label: first
        ? th
          ? `เริ่มที่ ${first.student.name}`
          : `Start with ${first.student.name}`
        : th
          ? 'ดูรายชื่อนักเรียนทั้งหมด'
          : 'See the full caseload',
      run: () => (first ? go(`/student?id=${first.student.id}`) : reveal(listRef.current)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueNow.length, ops.overdue, ops.critical, ops.rows, th])

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
        {/* ชื่อครูกับโรงเรียนย้ายไปอยู่หัวหน้าแล้ว เหลือไว้แต่จำนวนเคส
            ซึ่งเป็นตัวเลขที่ใช้อ่านทุกตัวเลขอื่นในแผงนี้ */}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold text-ink">
            {th
              ? `เคสที่คุณรับผิดชอบ ${formatNumber(ops.caseload, lang)} คน`
              : `${formatNumber(ops.caseload, lang)} children in your care`}
          </h2>
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

      {/* ── งานวันนี้ — ชั้นเดียว ไม่ซ้ำ ────────────────────
          สามแถวแรกคือสิ่งที่ต้องโฟกัส ตัวเลขกับความหมายอยู่บรรทัดเดียวกัน
          เรื่องที่เหลือหดเป็นชิปด้านล่าง ยังกดกรองได้เหมือนเดิมแต่ไม่แย่ง
          สายตาจากสามอันดับแรก */}
      <div className="px-5 pt-4">
        <SectionLabel>{th ? 'วันนี้ต้องทำอะไร' : 'What today needs'}</SectionLabel>

        {jobs.top.length ? (
          <ul className="overflow-hidden rounded-2xl border border-surface-border">
            {jobs.top.map((job, i) => {
              const on = job.filter ? focus === job.filter : false
              return (
                <motion.li
                  key={job.key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  className="border-b border-surface-border last:border-0"
                >
                  <button
                    type="button"
                    onClick={job.onClick}
                    aria-pressed={on}
                    className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-muted/70"
                    style={on ? { background: `${job.tone}0d` } : undefined}
                  >
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[19px] font-bold text-white"
                      style={{ background: job.tone }}
                    >
                      <AnimatedCounter value={job.count} />
                    </span>
                    <span className="min-w-0 flex-1 text-[16px] font-semibold leading-snug text-ink">
                      {job.text}
                    </span>
                    <IconArrowRight
                      width={16}
                      height={16}
                      className="shrink-0 text-ink-faint transition-colors group-hover:text-brand-600"
                    />
                  </button>
                </motion.li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-surface-border px-4 py-5 text-[15px] text-ink-muted">
            {th
              ? 'ไม่มีงานเร่งด่วนวันนี้ — ทุกเคสยังอยู่ในกำหนด'
              : 'Nothing urgent today — every case is still within its deadline'}
          </p>
        )}

        {jobs.rest.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-ink-faint">{th ? 'ดูเพิ่ม:' : 'Also:'}</span>
            {jobs.rest.map((job) => {
              const on = job.filter ? focus === job.filter : false
              return (
                <button
                  key={job.key}
                  type="button"
                  onClick={job.onClick}
                  aria-pressed={on}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                  style={{
                    borderColor: on ? job.tone : undefined,
                    background: on ? `${job.tone}14` : undefined,
                    color: job.tone,
                  }}
                >
                  <span className="font-bold tabular">{job.count}</span>
                  <span className="text-ink-muted">{job.short}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── เริ่มตรงไหน — บรรทัดเดียวจาก AI แล้วปุ่มเดียว ──── */}
      <div className="px-5 pt-4">
        <div className="rounded-2xl border border-surface-border bg-surface-muted/60 p-4">
          {text ? (
            <p className="text-[15px] leading-relaxed text-ink-muted">
              {text.split('\n').map((line, i) => (
                <span key={i} className={i === 0 ? 'block font-semibold text-ink' : 'block'}>
                  {line}
                </span>
              ))}
            </p>
          ) : (
            <div className="space-y-2" aria-live="polite">
              <Skeleton className="h-4 w-9/12" />
              <Skeleton className="h-4 w-6/12" />
            </div>
          )}
          <button
            type="button"
            onClick={primary.run}
            className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card transition-colors hover:bg-brand-600 sm:w-auto"
          >
            {primary.label}
            <IconArrowRight width={16} height={16} />
          </button>
        </div>
      </div>

      {/* ── why these children are slipping ───────────────── */}
      {ops.alerts.length > 0 && (
        <div ref={alertsRef} className="scroll-mt-4 px-5 pt-5">
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
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {a.student.name}
                    </span>
                    <span className="block text-[11.5px] text-ink-faint">
                      {GRADE_LABEL(a.student.gradeKey, th)} · {t(`risk.${a.student.riskLevel}`)}
                    </span>
                  </span>
                  {/* รู้ก่อน — 85 เฉย ๆ บอกไม่ได้ว่าเด็กกำลังแย่ลงหรือกำลังดีขึ้น
                      เส้นนี้คือ riskHistory 8 สัปดาห์ จุดท้ายคือคะแนนที่แสดงอยู่ */}
                  {(() => {
                    const hist = a.student.riskHistory
                    if (hist.length < 2) return null
                    const d = a.student.riskScore - hist[0].score
                    const worse = d > 0
                    return (
                      <span className="shrink-0 text-right">
                        <Sparkline
                          data={hist.map((p) => p.score)}
                          color={worse ? RISK_COLOR.critical : RISK_COLOR.normal}
                          width={56}
                          height={20}
                        />
                        <span
                          className="block text-[11px] font-bold tabular"
                          style={{ color: worse ? RISK_COLOR.critical : RISK_COLOR.normal }}
                        >
                          {worse ? '▲' : '▼'} {Math.abs(d)}
                        </span>
                      </span>
                    )
                  })()}
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

                {/* AI ช่วยแนะนำ → ลงมือช่วย
                    `student.nextAction` เป็นเทมเพลตสามแบบตามระดับความเสี่ยง
                    เด็กที่ยากจนกับเด็กที่ถูกให้แต่งงานเร็วจึงเคยได้ประโยค
                    เดียวกัน ที่นี่อ่าน causeKeys ของเด็กคนนี้จริง และทุกข้อ
                    มี "เพราะอะไร" ที่ครูย้อนตรวจได้ */}
                {(() => {
                  const steps = recommendSteps(a.student, th).slice(0, 2)
                  return (
                    <div className="mt-3 rounded-lg bg-surface-muted/70 p-2.5">
                      <p className="mb-1.5 text-[11.5px] font-semibold text-ink-muted">
                        {th ? 'ควรเริ่มช่วยอย่างไร' : 'Where to start'}
                      </p>
                      <ul className="space-y-2">
                        {steps.map((step) => (
                          <li key={step.key}>
                            <p className="text-[12.5px] font-medium leading-snug text-ink">
                              {th ? step.th : step.en}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
                              {th ? step.whyTh : step.whyEn}
                            </p>
                            {step.action && mayAct && (
                              <button
                                type="button"
                                onClick={() =>
                                  applyStep(a.student.id, a.student.name, step.action!)
                                }
                                className="mt-1.5 rounded-lg border border-brand-300 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-50"
                              >
                                {step.action === 'followUp'
                                  ? th
                                    ? 'ตั้งนัดติดตาม'
                                    : 'Set the follow-up'
                                  : step.action === 'visit'
                                    ? th
                                      ? 'บันทึกว่าเยี่ยมบ้านแล้ว'
                                      : 'Log the home visit'
                                    : th
                                      ? 'บันทึกว่าติดต่อแล้ว'
                                      : 'Log the contact'}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}

                <div className="mt-3 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => go(`/student?id=${a.student.id}`)}
                    className="flex-1 rounded-lg bg-brand-500 px-2.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-600"
                  >
                    {th ? 'เปิดแฟ้มเด็ก' : 'Open the file'}
                  </button>
                  <button
                    type="button"
                    onClick={() => go('/referral')}
                    className="rounded-lg border border-surface-border px-2.5 py-2 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600"
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
      <div ref={followUpRef} className="scroll-mt-4 px-5 pt-5">
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
      <div ref={listRef} className="scroll-mt-4 px-5 pt-5">
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
          {/* ตัวเลขประจำตัวเคสโหลด เป็น DETAIL ไม่ใช่ NUMBER ของวันนี้ จึงย้าย
              ลงมาจากหัวหน้าจอ ไม่ให้แย่งความสนใจไปจากงานที่ต้องทำวันนี้ */}
          <SectionLabel>{th ? 'ภาพรวมเคสของคุณ' : 'Your caseload at a glance'}</SectionLabel>
          <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-surface-border p-4">
            {CONTEXT.map((k) => (
              <div key={k.label}>
                <dt className="text-[12px] text-ink-faint">{k.label}</dt>
                <dd
                  className="text-[22px] font-bold leading-tight tabular text-ink"
                  style={k.color ? { color: k.color } : undefined}
                >
                  <AnimatedCounter value={k.value} />
                </dd>
              </div>
            ))}
          </dl>

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
