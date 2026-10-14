import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useScopedData } from '@/auth/scope'
import { canAccess, canWorkCases } from '@/auth/roles'
import { recommendSteps, type StepAction } from '@/lib/recommend'
import { Sparkline } from '@/components/ui/Sparkline'
import { useToast } from '@/components/ui/Toast'
import { TeacherAssistant } from './TeacherAssistant'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { buildTeacherOps, matchesTask, type TaskFilter } from '@/lib/teacherOps'
import { applyLog, applyPlans, openFollowUps, useCaseLog } from '@/lib/caseLog'
import { buildSystemPrompt, localAnswer, streamAnswer } from '@/lib/ai'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { IconArrowRight, IconClose } from '@/components/icons'
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

  /** วันล่าสุดที่ครูบันทึกอะไรกับเด็กแต่ละคน — ใช้เริ่มนับกำหนดติดตามใหม่ */
  const lastLogged = useMemo(() => {
    const out: Record<string, string> = {}
    const bump = (id: string, d: string) => {
      if (!out[id] || d > out[id]) out[id] = d
    }
    for (const e of log.entries) bump(e.childId, e.date)
    // ติ๊กขั้นในแผนเสร็จก็คือการลงมือกับเด็กคนนั้น — นับเริ่มกำหนดใหม่เหมือนกัน
    for (const [stepId, m] of Object.entries(log.steps)) bump(stepId.replace(/-S\d+$/, ''), m.at)
    return out
  }, [log.entries, log.steps])

  /** เด็กคนไหนมีแผนแล้ว — รวมแผนที่ครูสร้างเองในเครื่องนี้ด้วย */
  const planned = useMemo(() => new Set(applyPlans(plans, log).map((p) => p.childId)), [plans, log])

  const ops = useMemo(
    () => buildTeacherOps({ students: roster, cases, th, lastLogged }),
    [roster, cases, th, lastLogged],
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

  /** รายชื่อทั้งหมดพับไว้โดยปริยาย และกางเองเมื่อครูกดชิปในบรรทัดภาพรวม */
  const [listOpen, setListOpen] = useState(false)

  /** คิวของเลขา — เด็กที่ควรตามวันนี้ ตามลำดับของ ops.rows (เลยกำหนดขึ้นก่อน
   *  แล้วตามคะแนนเสี่ยง) เฉพาะคนที่มีอะไรต้องทำจริง เด็กที่สบายดีอยู่แล้วไม่
   *  ต้องมาอยู่ในคิว ไม่งั้น "วันนี้มี 13 คน" จะฟังดูหนักเกินจริง */
  const queue = useMemo(() => {
    const open = ops.rows.filter((r) => r.stage !== 'returned' && r.stage !== 'resolved')
    const urgent = open.filter(
      (r) =>
        !r.closable &&
        (r.overdue ||
          r.riskDelta >= 5 ||
          r.student.parentContact !== 'ok' ||
          r.student.riskLevel === 'critical' ||
          r.student.riskLevel === 'high'),
    )
    // เคสที่เข้าเกณฑ์ปิดได้ต่อท้ายคิว — ไม่งั้นเด็กที่ดีขึ้นแล้ว (เสี่ยงต่ำ
    // ติดต่อได้ ไม่เลยกำหนด) จะไม่เคยขึ้นมาในคิวเลย และขั้น "เห็นผล → ปิด
    // เคส" จะไม่มีวันเกิดบนหน้านี้ งานที่ค้างยังมาก่อนเสมอ
    return [...urgent, ...open.filter((r) => r.closable)]
  }, [ops.rows])

  /** สิ่งที่ช่วยไปแล้วล่าสุด — บันทึกของครูมาก่อน ไม่มีค่อยใช้ timeline เดิม
   *  ครูต้องเห็นตรงนี้ ไม่งั้นจะไม่รู้ว่าทำไมคำแนะนำเปลี่ยน หรือเผลอโทรซ้ำ */
  const lastDone = (childId: string) => {
    const mine = log.entries
      .filter((e) => e.childId === childId)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    const today = new Date()
    const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    const ago = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number)
      return Math.max(0, Math.round((t0 - Date.UTC(y, (m ?? 1) - 1, d ?? 1)) / 86400000))
    }
    if (mine) {
      const what = mine.stage === 'resolved'
        ? th ? 'ปิดเคสแล้ว' : 'Case closed'
        : mine.followUpDate
          ? th ? `ตั้งนัดติดตามวันที่ ${mine.followUpDate}` : `Follow-up set for ${mine.followUpDate}`
          : mine.mode === 'visit'
            ? th ? 'เยี่ยมบ้านแล้ว' : 'Home visit made'
            : th ? 'ติดต่อผู้ปกครองแล้ว' : 'Guardian contacted'
      return { text: what, daysAgo: ago(mine.date), by: mine.by }
    }
    const seeded = roster.find((st) => st.id === childId)?.timeline
    const latest = seeded?.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
    return latest ? { text: latest.note, daysAgo: ago(latest.date), by: latest.by } : undefined
  }

  // ── วันนี้ต้องทำอะไร ──────────────────────────────────────
  const followUpRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const reveal = (el: HTMLElement | null) =>
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  /** นัดที่ถึงกำหนดแล้ว — ครูเป็นคนนัดเอง จึงเป็นงานที่ผูกกับเวลาจริงที่สุด
   *  ในหน้านี้ และเป็นเหตุผลที่มันได้เป็นปุ่มหลักเมื่อมีค้างอยู่ */
  const dueNow = useMemo(() => followUps.filter((f) => f.daysAway <= 0), [followUps])


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

  /** ปิดเคส — ระบบเสนอเมื่อเข้าเกณฑ์ (closability) แต่ครูเป็นคนกดเสมอ
   *  การปิดเคสคือการบอกว่าเด็กคนนี้ปลอดภัยแล้ว ไม่ใช่สิ่งที่ควรเป็นอัตโนมัติ */
  const closeCase = (studentId: string, name: string) => {
    if (!mayAct) return
    log.add({
      childId: studentId,
      mode: 'contact',
      date: new Date().toISOString().slice(0, 10),
      note: th ? 'ปิดเคส — เข้าเกณฑ์ครบทุกข้อ ครูตรวจแล้วยืนยัน' : 'Case closed — every criterion met, confirmed by the teacher',
      by: user?.ownerName ?? user?.name ?? (th ? 'ครูผู้รับผิดชอบ' : 'Case owner'),
      stage: 'resolved',
    })
    toast.push(th ? `ปิดเคสของ ${name} แล้ว` : `Case closed for ${name}`)
  }

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


  // ── ask ───────────────────────────────────────────────────
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
      // transform อย่างเดียว ตามกฎใน AppLayout — opacity ในขาเข้าเคยทำให้
      // หน้าค้างจางจนต้องรีเฟรชเมื่อสลับเมนูเร็ว ๆ
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-4 space-y-3"
    >
      {/* ── เลขาส่วนตัว — ตัวเอกของหน้า ───────────────────
          แทนที่หัวแผง · สามแถว "วันนี้ต้องทำอะไร" · กล่อง "เริ่มที่" · การ์ด
          สัญญาณสามใบ · และช่องถามตอบล่างสุด ทั้งห้าอย่างเป็นงานของ AI ที่เคย
          กระจายอยู่ห้าที่จนครูบอกไม่ได้ว่า AI ช่วยตรงไหน ตอนนี้รวมเป็นที่เดียว */}
      <TeacherAssistant
        queue={queue}
        name={(user?.ownerName ?? user?.name ?? '').replace(/^ครู(แนะแนว)?\s*/, '')}
        th={th}
        mayAct={mayAct}
        onAct={applyStep}
        onClose={closeCase}
        lastDone={lastDone}
        onOpen={(id) => go(`/student?id=${id}`)}
        hasPlan={(id) => planned.has(id)}
        onPlan={(id) => go(`/plan?child=${id}`)}
        onAsk={(question) => void ask(question)}
        asked={asked}
        asking={asking}
      />

      {/* ภาพรวมเหลือบรรทัดเดียว — กดแล้วกางรายชื่อที่กรองไว้ด้านล่าง */}
      {(jobs.top.length > 0 || jobs.rest.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[13px] text-ink-faint">{th ? 'ภาพรวม:' : 'Overview:'}</span>
          {[...jobs.top, ...jobs.rest].map((job) => (
            <button
              key={job.key}
              type="button"
              onClick={() => {
                setListOpen(true)
                job.onClick()
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-3 py-1.5 text-[13px] transition-colors hover:border-brand-400"
            >
              <span className="font-bold tabular" style={{ color: job.tone }}>
                {job.count}
              </span>
              <span className="text-ink-muted">{job.short}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── ดูเพิ่ม — พับไว้ทั้งหมด ไม่แย่งสายตาจากเลขา ──── */}
      <div className="overflow-hidden rounded-2xl border border-surface-border bg-white pb-5 shadow-card">
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
                    className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-bold text-white"
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
                    <span className="block truncate text-[12.5px] text-ink-faint">
                      {entry.followUpDate} · {entry.note}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => log.setFollowUpDone(entry.id, true)}
                    className="shrink-0 rounded-lg border border-surface-border px-2.5 py-1 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-600"
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

      {/* ── the caseload — พับไว้ กางเองเมื่อกดชิปในบรรทัดภาพรวม ── */}
      <details
        ref={listRef as unknown as React.RefObject<HTMLDetailsElement>}
        open={listOpen}
        onToggle={(e) => setListOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="group scroll-mt-4 px-5 pt-5"
      >
        <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
          <span className="inline-flex items-center gap-1.5">
            <IconArrowRight width={14} height={14} className="transition-transform group-open:rotate-90" />
            {th ? `รายชื่อทั้งหมด ${ops.caseload} คน` : `All ${ops.caseload} children`}
          </span>
        </summary>
      <div className="mt-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <p className="text-[12px] font-semibold text-ink-muted">
            {th ? 'นักเรียนที่ฉันรับผิดชอบ' : 'My students'}
          </p>
          <span className="text-[12.5px] text-ink-faint">
            {th
              ? `แสดง ${rows.length} จาก ${ops.caseload} คน · เรียงเคสเกินกำหนดขึ้นก่อน แล้วตามคะแนนเสี่ยง`
              : `${rows.length} of ${ops.caseload} · overdue first, then by risk score`}
          </span>
          {focusLabel && (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-100"
            >
              {th ? focusLabel.th : focusLabel.en}
              <IconClose width={11} height={11} />
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-surface-border text-[12.5px] text-ink-faint">
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
                  // ไม่มี animation ขาเข้า — แถวที่ค้างจางคือรายชื่อเด็กที่ครูมองไม่เห็น
                  onClick={() => go(`/student?id=${r.student.id}`)}
                  className="cursor-pointer border-b border-surface-border last:border-0 transition-colors hover:bg-brand-50/40"
                >
                  <td className="px-3 py-2.5">
                    <p className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-ink">
                      {r.student.name}
                      {r.urgent && (
                        <span
                          className="rounded px-1 py-px text-[12px] font-bold text-white"
                          style={{ background: RISK_COLOR.critical }}
                        >
                          {th ? 'ด่วน' : 'urgent'}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[12.5px] text-ink-faint">{r.student.id}</p>
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
                  <td className="px-3 py-2.5 text-[12.5px] text-ink-muted">
                    {r.problem ? t(`cause.${r.problem}`) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px]">
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
                  <td className="px-3 py-2.5 text-[12.5px] text-ink-muted">{t(`stage.${r.stage}`)}</td>
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
      </details>

      {/* ── what has already happened — พับไว้ ──────────────── */}
      <details className="group px-5 pt-5">
        <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
          <span className="inline-flex items-center gap-1.5">
            <IconArrowRight width={14} height={14} className="transition-transform group-open:rotate-90" />
            {th ? 'ประวัติและผลของเคส' : 'History and outcomes'}
          </span>
        </summary>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                    <span className="text-[12.5px] text-ink-faint">
                      {event.date} · {t(`stage.${event.stageKey}`)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">
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
                    <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
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
            <p className="mt-2.5 text-[12.5px] leading-snug text-ink-faint">
              {th
                ? 'สัดส่วนเคสที่ปิดสำเร็จจริง — ดูความเสี่ยงก่อน/หลังรายคนได้จากเส้นแนวโน้ม 8 สัปดาห์ในแฟ้มเด็ก'
                : 'The share of cases actually closed — each child’s before/after is on the 8-week trend in their file.'}
            </p>
          </div>
        </div>
      </div>

      </details>
      </div>
    </motion.section>
  )
}
