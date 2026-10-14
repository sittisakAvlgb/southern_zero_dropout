import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { agencyOwners, closability, recommendSteps, type StepAction } from '@/lib/recommend'
import type { CaseRow } from '@/lib/teacherOps'
import { Sparkline } from '@/components/ui/Sparkline'
import { IconArrowRight } from '@/components/icons'
import { assetUrl } from '@/lib/asset'

const MASCOT = assetUrl('ChatBot.png')

/**
 * เลขาส่วนตัวของครู — พาทำทีละคน ไม่ใช่โยนแดชบอร์ดให้อ่าน
 *
 * หน้าครูเคยมี AI กระจายอยู่ห้าที่ (ป้ายหัวแผง · กล่อง "เริ่มที่" · บล็อก
 * "ควรเริ่มช่วยอย่างไร" ในการ์ดสามใบ · ช่องถามตอบล่างสุด · ไอคอนลอย) และไม่มี
 * ที่ไหนหน้าตาเหมือน AI ครูจึงบอกว่า "ไม่รู้ว่า AI จะช่วยตรงไหน" แถมกล่อง
 * "เริ่มที่" ยังบอกชื่อเด็กหนึ่งคนแต่ปุ่มใต้มันเปิดแปดเคส — คำสั่งขัดกันเอง
 *
 * ที่นี่ AI คือตัวเอก มีหน้าตา (มาสคอตตัวเดียวกับผู้ช่วยมุมจอ) ทักก่อน เลือก
 * เด็กให้ทีละคน บอกเหตุผลสามบรรทัด แนะนำหนึ่งอย่าง ครูกดครั้งเดียว แล้วไปคน
 * ถัดไป ครูที่มีเวลาสิบนาทีไม่ต้องตัดสินใจว่าจะเริ่มตรงไหนเอง
 *
 * ทุกอย่างคำนวณจากข้อมูลในระบบ ทำงานได้โดยไม่ต้องมี API key
 */
export function TeacherAssistant({
  queue,
  name,
  th,
  mayAct,
  onAct,
  onOpen,
  onAsk,
  asked,
  asking,
}: {
  /** เด็กที่ต้องตามวันนี้ เรียงจากเร่งที่สุด */
  queue: CaseRow[]
  /** ชื่อครู ใช้ทักทาย */
  name: string
  th: boolean
  mayAct: boolean
  onAct: (studentId: string, studentName: string, act: StepAction) => void
  onOpen: (studentId: string) => void
  onAsk: (q: string) => void
  asked: { text: string; to?: string; label?: string } | null
  asking: boolean
}) {
  const [i, setI] = useState(0)
  const [done, setDone] = useState<string[]>([])
  const [q, setQ] = useState('')
  /** คำตอบของคำถามเฉพาะเด็กคนนี้ — คำนวณเอง ไม่ส่งไปโมเดล เพราะข้อมูลอยู่ใน
   *  มือครบแล้ว และคำตอบต้องถูกเสมอแม้ไม่มี API key */
  const [local, setLocal] = useState<{ q: string; lines: string[] } | null>(null)

  const pending = queue.filter((r) => !done.includes(r.student.id))
  const row = pending[Math.min(i, Math.max(0, pending.length - 1))]
  const s = row?.student
  const first = s?.name.split(' ')[0] ?? ''

  const steps = useMemo(() => (s ? recommendSteps(s, th) : []), [s, th])
  // ข้อแนะนำแรกที่กดลงมือได้จริง ถ้าไม่มีเลยก็ใช้ข้อแรก
  const pick = steps.find((x) => x.action) ?? steps[0]

  /** เหตุผลสามบรรทัด เป็นภาษาคน ไม่ใช่ตัวเลขดิบ เลือกเฉพาะที่เป็นจริงกับเด็ก
   *  คนนี้ และเรียงจากที่เร่งที่สุด */
  const why = useMemo(() => {
    if (!row || !s) return []
    const out: string[] = []
    if (row.overdue && row.updatedDaysAgo !== undefined)
      out.push(th ? `เลยกำหนดติดตามมา ${row.updatedDaysAgo} วัน` : `${row.updatedDaysAgo} days past follow-up`)
    if (s.absenceStreak >= 3)
      out.push(th ? `ขาดเรียนติดกัน ${s.absenceStreak} วัน` : `${s.absenceStreak} days absent in a row`)
    if (row.riskDelta >= 5)
      out.push(th ? `ความเสี่ยงเพิ่มขึ้น ${row.riskDelta} คะแนนใน 8 สัปดาห์` : `Risk up ${row.riskDelta} points in 8 weeks`)
    if (s.parentContact !== 'ok')
      out.push(th ? 'ยังติดต่อผู้ปกครองไม่ได้' : 'Guardian not yet reached')
    if (s.master.parentSalary <= 5000)
      out.push(
        th
          ? `รายได้ครอบครัว ${s.master.parentSalary.toLocaleString('th-TH')} บาท/เดือน`
          : `Household income ฿${s.master.parentSalary.toLocaleString('en-US')}/month`,
      )
    return out.slice(0, 3)
  }, [row, s, th])

  const next = () => {
    setLocal(null)
    setI((v) => (v + 1 >= pending.length ? 0 : v + 1))
  }

  const act = () => {
    if (!s || !pick?.action) return
    onAct(s.id, s.name, pick.action)
    setDone((d) => [...d, s.id])
    setLocal(null)
    // index เดิมชี้ไปที่คนถัดไปอยู่แล้ว เพราะคนนี้หลุดออกจาก pending
    setI((v) => (v >= pending.length - 1 ? 0 : v))
  }

  /** คำถามสำเร็จรูปที่มีชื่อเด็กอยู่ในนั้น — ครูอายุมากไม่ต้องคิดคำถามเอง */
  const ask = (kind: 'why' | 'how' | 'who' | 'close') => {
    if (!s) return
    if (kind === 'why')
      setLocal({
        q: th ? `ทำไม${first}ถึงเสี่ยง` : `Why is ${first} at risk`,
        lines: [
          th
            ? `คะแนนเสี่ยง ${s.riskScore}/100 (${row!.riskDelta >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(row!.riskDelta)} คะแนนใน 8 สัปดาห์)`
            : `Risk ${s.riskScore}/100 (${row!.riskDelta >= 0 ? 'up' : 'down'} ${Math.abs(row!.riskDelta)} in 8 weeks)`,
          th ? `การมาเรียน ${Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)}% · ขาดติดกัน ${s.absenceStreak} วัน` : `Attendance ${Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)}%, ${s.absenceStreak} days absent`,
          th ? `ครอบครัว ${s.familyRisk}/100 · รายได้ ${s.master.parentSalary.toLocaleString('th-TH')} บาท · ผู้ดูแลคือ${s.master.parentRelationName}` : `Family ${s.familyRisk}/100, income ฿${s.master.parentSalary}, cared for by ${s.master.parentRelationName}`,
          th ? `เดินทางมาโรงเรียน ${s.master.timeDt} นาที (${s.master.journeyTypeName})` : `${s.master.timeDt} minutes to school (${s.master.journeyTypeName})`,
        ],
      })
    if (kind === 'how')
      setLocal({
        q: th ? `ควรช่วย${first}อย่างไร` : `How should I help ${first}`,
        lines: steps.map((x, n) => `${n + 1}. ${th ? x.th : x.en}`),
      })
    if (kind === 'who') {
      const owners = agencyOwners(s)
      setLocal({
        q: th ? `ใครควรรับเรื่อง${first}ต่อ` : `Who should take ${first}'s case on`,
        lines: owners.length
          ? owners.map((o) => (th ? `• ${o}` : `• ${o}`))
          : [th ? 'สาเหตุของเด็กคนนี้อยู่ในมือโรงเรียน ยังไม่ต้องส่งต่อ' : 'This is within the school’s reach — no referral yet'],
      })
    }
    if (kind === 'close') {
      const c = closability(s)
      setLocal({
        q: th ? `ปิดเคส${first}ได้หรือยัง` : `Can ${first}'s case be closed`,
        lines: c.ready
          ? [th ? '✓ เข้าเกณฑ์ปิดเคสแล้ว' : '✓ Meets the bar to close', ...(th ? c.metTh : c.metEn)]
          : [th ? 'ยังไม่ได้ — ยังขาด:' : 'Not yet — still missing:', ...(th ? c.missingTh : c.missingEn).map((m) => `• ${m}`)],
      })
    }
  }

  const tone = s ? RISK_COLOR[s.riskLevel] : RISK_COLOR.normal
  const hist = s?.riskHistory ?? []
  const up = (row?.riskDelta ?? 0) > 0

  return (
    <div className="rounded-3xl border-2 border-brand-200 bg-gradient-to-b from-brand-50/80 to-white p-4 sm:p-5">
      {/* ── เลขาทักก่อน ───────────────────────────────── */}
      <div className="flex items-start gap-3">
        <img
          src={MASCOT}
          alt=""
          className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-card"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">
            {th ? 'ผู้ช่วย AI ของคุณ' : 'Your AI assistant'}
          </p>
          <p className="mt-0.5 text-[17px] font-semibold leading-snug text-ink">
            {pending.length
              ? th
                ? `สวัสดีครับครู${name} วันนี้มี ${pending.length} คนที่ควรตาม — เริ่มคนแรกกันเลยครับ`
                : `Hello ${name}. ${pending.length} children need you today — let’s start with the first.`
              : th
                ? `ครู${name}ตามครบทุกคนแล้วครับ วันนี้ไม่มีเคสเร่งด่วนเหลือ`
                : `You have reached everyone today, ${name}. Nothing urgent is left.`}
          </p>
        </div>
      </div>

      {/* ── เด็กหนึ่งคน ──────────────────────────────────
          remount ด้วย key อย่างเดียว ไม่ใช้ AnimatePresence mode="wait" — แบบนั้น
          คนใหม่จะยังไม่ขึ้นจนกว่า animation ขาออกของคนเก่าจะเล่นจบ และเมื่อ
          เบราว์เซอร์หน่วงเฟรม (แท็บพื้นหลัง · มือถือโหมดประหยัดแบต) คิวจะค้างอยู่
          ที่เด็กคนที่เพิ่งบันทึกไปแล้ว ความถูกต้องของคิวต้องไม่ขึ้นกับ animation */}
        {row && s && (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22 }}
            className="mt-4 rounded-2xl border border-surface-border bg-white p-4 shadow-card"
          >
            <div className="flex items-start gap-3">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[18px] font-bold text-white"
                style={{ background: tone }}
              >
                {s.riskScore}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink-faint">
                  {th ? `คนที่ ${Math.min(i, pending.length - 1) + 1} จาก ${pending.length}` : `${Math.min(i, pending.length - 1) + 1} of ${pending.length}`}
                </p>
                <p className="truncate text-[18px] font-bold text-ink">{s.name}</p>
                <p className="text-[13px] text-ink-muted">{GRADE_LABEL(s.gradeKey, th)}</p>
              </div>
              {hist.length > 1 && (
                <span className="shrink-0 text-right">
                  <Sparkline
                    data={hist.map((p) => p.score)}
                    color={up ? RISK_COLOR.critical : RISK_COLOR.normal}
                    width={64}
                    height={22}
                  />
                  <span
                    className="block text-[12px] font-bold tabular"
                    style={{ color: up ? RISK_COLOR.critical : RISK_COLOR.normal }}
                  >
                    {up ? '▲' : '▼'} {Math.abs(row.riskDelta)}
                  </span>
                </span>
              )}
            </div>

            {why.length > 0 && (
              <ul className="mt-3 space-y-1">
                {why.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-[14px] leading-snug text-ink">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
                    {w}
                  </li>
                ))}
              </ul>
            )}

            {pick && (
              <div className="mt-3 rounded-xl bg-brand-50 p-3">
                <p className="text-[12px] font-semibold text-brand-700">
                  {th ? 'AI แนะนำ' : 'AI suggests'}
                </p>
                <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">
                  {th ? pick.th : pick.en}
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-ink-muted">
                  {th ? pick.whyTh : pick.whyEn}
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {pick?.action && mayAct && (
                <button
                  type="button"
                  onClick={act}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-[15px] font-semibold text-white shadow-card transition-colors hover:bg-brand-600"
                >
                  {pick.action === 'followUp'
                    ? th
                      ? 'ตั้งนัดติดตาม 7 วัน'
                      : 'Set a 7-day follow-up'
                    : pick.action === 'visit'
                      ? th
                        ? 'บันทึกว่าเยี่ยมบ้านแล้ว'
                        : 'Log the home visit'
                      : th
                        ? 'บันทึกว่าติดต่อแล้ว'
                        : 'Log the contact'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="rounded-xl border border-surface-border bg-white px-4 py-3 text-[14px] font-medium text-ink transition-colors hover:border-brand-400"
              >
                {th ? 'เปิดแฟ้มเด็ก' : 'Open the file'}
              </button>
              {pending.length > 1 && (
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex items-center justify-center gap-1 rounded-xl px-4 py-3 text-[14px] font-medium text-ink-muted transition-colors hover:text-brand-600"
                >
                  {th ? 'คนถัดไป' : 'Next'}
                  <IconArrowRight width={14} height={14} />
                </button>
              )}
            </div>
          </motion.div>
        )}

      {/* ── ถามเลขา ─────────────────────────────────────
          คำถามสำเร็จรูปมีชื่อเด็กคนที่อยู่บนจออยู่ในนั้น ครูแตะอย่างเดียว */}
      {s && (
        <div className="mt-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-muted">
            {th ? `ถามเรื่อง${first}ได้เลย` : `Ask about ${first}`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['why', th ? `ทำไม${first}ถึงเสี่ยง` : `Why is ${first} at risk`],
                ['how', th ? `ควรช่วย${first}อย่างไร` : `How to help ${first}`],
                ['who', th ? 'ใครควรรับเรื่องต่อ' : 'Who takes it on'],
                ['close', th ? 'ปิดเคสได้หรือยัง' : 'Can it be closed'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => ask(k)}
                className="rounded-full border border-brand-200 bg-white px-3.5 py-2 text-[13.5px] font-medium text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {local && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex gap-2.5 rounded-2xl border border-surface-border bg-white p-3.5"
        >
          <img src={MASCOT} alt="" className="h-8 w-8 shrink-0 object-contain" draggable={false} />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink-muted">{local.q}</p>
            <ul className="mt-1 space-y-0.5">
              {local.lines.map((l) => (
                <li key={l} className="text-[14px] leading-relaxed text-ink">
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* ── ถามอย่างอื่น ──────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!q.trim()) return
          setLocal(null)
          onAsk(q)
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={th ? 'หรือพิมพ์ถามเรื่องอื่น…' : 'Or ask something else…'}
          className="min-w-0 flex-1 rounded-xl border border-surface-border bg-white px-3.5 py-3 text-[15px] outline-none transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={asking || !q.trim()}
          className="shrink-0 rounded-xl bg-ink px-4 py-3 text-[14px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {asking ? (th ? 'กำลังคิด…' : 'Thinking…') : th ? 'ถาม' : 'Ask'}
        </button>
      </form>

      {asked && !local && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex gap-2.5 rounded-2xl border border-surface-border bg-white p-3.5"
        >
          <img src={MASCOT} alt="" className="h-8 w-8 shrink-0 object-contain" draggable={false} />
          <p className="min-w-0 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{asked.text}</p>
        </motion.div>
      )}
    </div>
  )
}
