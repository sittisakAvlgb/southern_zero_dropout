import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { CreateReferral } from '@/components/referrals/CreateReferral'
import { useRefCases } from '@/components/referrals/useRefCases'
import { BucketBadge } from '@/components/referrals/ui'
import type { AgencyKind, PlanStep } from '@/types'
import type { User } from '@/auth/roles'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { recommendSteps } from '@/lib/recommend'
import { isSchoolStep, stepDaysLeft, stepDueDate, PATHWAY_COLOR } from '@/data/plans'
import {
  OBSTACLES,
  PRIORITY_META,
  aiSummary,
  finalAssessment,
  milestones,
  timeline,
  type PlanCase,
} from '@/lib/planOps'
import type { LogMode, ObstacleKey, useCaseLog } from '@/lib/caseLog'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useScrollLock } from '@/lib/useScrollLock'
import { IconArrowRight, IconClose } from '@/components/icons'
import { assetUrl } from '@/lib/asset'
import { useDialogDismiss } from '@/lib/useDialog'

const MASCOT = assetUrl('ChatBot.png')

type Log = ReturnType<typeof useCaseLog>
type Sheet = null | 'log' | 'followup' | 'ai' | 'obstacle' | 'refer' | 'close'

const iso = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

const dueText = (n: number) =>
  n < 0 ? `เลยกำหนด ${-n} วัน` : n === 0 ? 'ครบกำหนดวันนี้' : `อีก ${n} วัน`
const dueColor = (n: number) => (n < 0 ? RISK_COLOR.critical : n <= 3 ? RISK_COLOR.high : undefined)

/**
 * ศูนย์ปฏิบัติการของเด็กหนึ่งคน — "เกิดอะไรขึ้น · อะไรสำคัญที่สุด · ต้องทำอะไรต่อ"
 *
 * ลำดับบนจอตาม brief: สรุปจาก AI → ขั้นตอนถัดไป (เด่นที่สุด) → milestone →
 * ขั้นตอนในแผนพร้อมเจ้าภาพและกำหนด → timeline → รายละเอียด แถบปุ่มล่างติด
 * ก้นจอเสมอ งานย่อย (บันทึก · นัด · อุปสรรค · ส่งต่อ · ปิดเคส) เปิดแทนที่เนื้อหา
 * ในแผงเดียวกัน ครูไม่ต้องออกจากเคสไปเริ่มใหม่ที่เมนูอื่น
 *
 * ทุกการเขียนผ่าน useCaseLog ตัวเดียวกับหน้าครู และทุกปุ่มเขียนถูกซ่อนเมื่อ
 * บัญชีไม่มีสิทธิ์ลงมือ (canWorkCases)
 */
export function PlanCaseView({
  c,
  pathwayLabel,
  log,
  user,
  mayAct,
  onClose,
}: {
  c: PlanCase
  pathwayLabel: string
  log: Log
  user: User | null
  mayAct: boolean
  onClose: () => void
}) {
  const { push } = useToast()
  useScrollLock()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [referPreset, setReferPreset] = useState<{ kinds?: AgencyKind[]; reason?: string }>({})
  const by = user?.ownerName ?? user?.name ?? 'ครูผู้รับผิดชอบ'
  const p = c.plan
  const s = c.student
  const prio = PRIORITY_META[c.priority]

  const add = (e: Omit<Parameters<Log['add']>[0], 'childId' | 'by' | 'date'> & { date?: string }) =>
    log.add({ childId: p.childId, by, date: iso(), ...e })

  const markDone = (step: PlanStep) => {
    log.markStep(step.id, { status: 'done', at: iso(), by })
    push(`บันทึกว่า "${step.titleTh}" เสร็จแล้ว`)
  }
  const chase = (step: PlanStep) => {
    add({ mode: 'contact', note: `ทวงถาม${step.ownerName} เรื่อง "${step.titleTh}"`, followUpDate: iso(3) })
    push(`บันทึกการทวงถามแล้ว และตั้งนัดดูผลอีก 3 วัน`)
  }

  const tl = useMemo(() => timeline(c, pathwayLabel, log.entries, log.steps), [c, pathwayLabel, log.entries, log.steps])
  const ms = milestones(c)
  const [allTl, setAllTl] = useState(false)

  // การส่งต่อของเด็กคนนี้ที่ยังเปิดอยู่ — สถานะจริงจากศูนย์ส่งต่อ ไม่ใช่ "รอรับเรื่อง" ตลอดไป
  const { referrals } = useScopedData()
  const roster = useMemo(() => (s ? [s] : []), [s])
  const mineRefs = useMemo(() => referrals.filter((r) => r.childId === p.childId), [referrals, p.childId])
  const now = useMemo(() => Date.now(), [log]) // eslint-disable-line react-hooks/exhaustive-deps
  const childRefs = useRefCases(user, roster, mineRefs, log, now).filter((r) => r.childId === p.childId && r.bucket !== 'done')
  const nav = useNavigate()

  const dialogRef = useDialogDismiss<HTMLElement>(onClose)

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="ปิด" className="absolute inset-0 bg-brand-950/35" onClick={onClose} />
      <motion.aside
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={p.childName}
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl"
      >
        {/* ── หัว ─────────────────────────────────────── */}
        <header className="flex items-start gap-3 border-b border-surface-border px-5 py-4">
          {s && (
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[18px] font-bold text-white"
              style={{ background: RISK_COLOR[s.riskLevel] }}
            >
              {s.riskScore}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[19px] font-bold leading-tight text-ink">{p.childName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              {s && <span className="text-ink-muted">{GRADE_LABEL(s.gradeKey, true)}</span>}
              <span
                className="rounded-full px-2 py-0.5 font-semibold"
                style={{ background: `${PATHWAY_COLOR[p.pathway]}1a`, color: PATHWAY_COLOR[p.pathway] }}
              >
                {pathwayLabel}
              </span>
              <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: prio.color }}>
                {prio.th}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={sheet ? () => setSheet(null) : onClose}
            aria-label={sheet ? 'ย้อนกลับ' : 'ปิด'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted"
          >
            {sheet ? <IconArrowRight width={18} height={18} className="rotate-180" /> : <IconClose width={18} height={18} />}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
          {sheet === null && (
            <>
              {/* ── สรุปจาก AI — เกิดอะไรขึ้น ──────────── */}
              <div className="flex gap-2.5 rounded-2xl bg-brand-50/70 p-3.5">
                <img src={MASCOT} alt="" className="h-9 w-9 shrink-0 object-contain" draggable={false} />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-brand-700">AI สรุปเคสนี้</p>
                  <p className="mt-0.5 text-[14.5px] leading-relaxed text-ink">{aiSummary(c, pathwayLabel, true)}</p>
                </div>
              </div>

              {/* ── ขั้นตอนถัดไป — ต้องเด่นกว่าทุกอย่าง ─────── */}
              <NextActionCard
                c={c}
                mayAct={mayAct}
                onChase={chase}
                onDone={markDone}
                onAgree={() => {
                  add({ mode: 'contact', note: 'ครอบครัวเห็นชอบแผนแล้ว', familyAgreed: true, parentContact: 'ok' })
                  push('บันทึกว่าครอบครัวเห็นชอบแผนแล้ว')
                }}
                onObstacle={() => setSheet('obstacle')}
                onRefer={() => {
                  setReferPreset({})
                  setSheet('refer')
                }}
                onAssess={() => setSheet('close')}
                onLog={() => setSheet('log')}
              />

              {childRefs.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {childRefs.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => nav(`/referral?ref=${r.id}`)}
                        className="flex w-full items-center gap-2 rounded-xl border border-surface-border px-3.5 py-2.5 text-left text-[13.5px]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold text-ink">ส่งต่อ {r.toName}</span>{' '}
                          <BucketBadge b={r.bucket} />
                          <span className="block text-ink-muted">{r.next.th}</span>
                        </span>
                        <IconArrowRight width={14} height={14} className="shrink-0 text-ink-faint" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ── Milestone ─────────────────────────────── */}
              <Section title="ความคืบหน้าของเคส">
                {/* มือถือ: ป้ายเจ็ดช่องที่ 375px เหลือช่องละราว 47px ป้ายภาษาไทยถูก
                    ตัดเป็น "ติดต่" "ปิดเค" — แสดงเป็นจุดเจ็ดจุดแล้วบอกชื่อขั้นที่
                    กำลังทำเป็นข้อความเต็มแทน จอใหญ่ขึ้นจึงแสดงป้ายครบทุกช่อง */}
                {(() => {
                  const at = ms.findIndex((m) => m.state === 'active')
                  const doneN = ms.filter((m) => m.state === 'done').length
                  return (
                    <div className="sm:hidden">
                      <div className="flex items-center gap-1.5">
                        {ms.map((m) => (
                          <span
                            key={m.th}
                            className="h-2.5 flex-1 rounded-full"
                            style={{ background: m.state === 'done' ? RISK_COLOR.normal : m.state === 'active' ? '#2f66f6' : '#e2e8f0' }}
                          />
                        ))}
                      </div>
                      <p className="mt-2 text-[14px] text-ink">
                        ผ่านแล้ว {doneN} จาก {ms.length} ขั้น
                        {at >= 0 && (
                          <>
                            {' · '}กำลังทำ: <span className="font-semibold text-brand-700">{ms[at].th}</span>
                          </>
                        )}
                      </p>
                    </div>
                  )
                })()}
                <ol className="hidden grid-cols-7 gap-1 sm:grid">
                  {ms.map((m, i) => (
                    <li key={m.th} className="flex flex-col items-center text-center">
                      <span
                        className="grid h-8 w-8 place-items-center rounded-full border-2 text-[13px] font-bold"
                        style={
                          m.state === 'done'
                            ? { background: RISK_COLOR.normal, borderColor: RISK_COLOR.normal, color: '#fff' }
                            : m.state === 'active'
                              ? { borderColor: '#2f66f6', color: '#2f66f6', background: '#eef3ff' }
                              : { borderColor: '#e2e8f0', color: '#94a3b8' }
                        }
                      >
                        {m.state === 'done' ? '✓' : m.state === 'active' ? '●' : i + 1}
                      </span>
                      <span
                        className="mt-1 text-[11.5px] leading-tight"
                        style={{ color: m.state === 'todo' ? '#94a3b8' : '#0f172a', fontWeight: m.state === 'active' ? 700 : 500 }}
                      >
                        {m.th}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>

              {/* ── ขั้นตอนในแผน ───────────────────────────── */}
              <Section title={`ขั้นตอนในแผน · ทำแล้ว ${p.steps.filter((x) => x.status === 'done').length}/${p.steps.length}`}>
                <ol className="space-y-2">
                  {p.steps.map((st) => {
                    const left = stepDaysLeft(p, st)
                    const mine = isSchoolStep(st)
                    return (
                      <li key={st.id} className="flex gap-3 rounded-xl border border-surface-border p-3">
                        <span
                          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold"
                          style={
                            st.status === 'done'
                              ? { background: RISK_COLOR.normal, color: '#fff' }
                              : st.status === 'blocked'
                                ? { background: RISK_COLOR.critical, color: '#fff' }
                                : st.status === 'active'
                                  ? { background: '#2f66f6', color: '#fff' }
                                  : { background: '#f1f5f9', color: '#94a3b8' }
                          }
                        >
                          {st.status === 'done' ? '✓' : st.status === 'blocked' ? '!' : st.status === 'active' ? '●' : '○'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[14.5px] leading-snug ${st.status === 'done' ? 'text-ink-muted line-through decoration-ink-faint/50' : 'font-medium text-ink'}`}>
                            {st.titleTh}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-ink-muted">
                            <span className={mine ? 'font-semibold text-brand-700' : ''}>{mine ? 'คุณ (โรงเรียน)' : st.ownerName}</span>
                            {st.status !== 'done' && (
                              <span style={{ color: dueColor(left) }}>
                                {' · '}
                                {dueText(left)} ({stepDueDate(p, st)})
                              </span>
                            )}
                            {st.status === 'blocked' && <span style={{ color: RISK_COLOR.critical }}> · ติดขัด</span>}
                          </p>
                          {mayAct && (st.status === 'active' || st.status === 'blocked') && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <SmallBtn onClick={() => markDone(st)}>
                                {mine ? 'ทำขั้นนี้เสร็จแล้ว' : 'หน่วยงานทำเสร็จแล้ว'}
                              </SmallBtn>
                              {!mine && <SmallBtn onClick={() => chase(st)}>ทวงถามเจ้าภาพ</SmallBtn>}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </Section>

              {/* ── Timeline ──────────────────────────────── */}
              <Section title="ที่ผ่านมาเกิดอะไรขึ้นแล้วบ้าง">
                <ol className="relative space-y-3 border-l-2 border-surface-border pl-4">
                  {(allTl ? tl : tl.slice(0, 5)).map((it, i) => (
                    <li key={`${it.date}-${i}`} className="relative">
                      <span
                        className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white"
                        style={{
                          background:
                            it.kind === 'referral' ? '#7c3aed' : it.kind === 'obstacle' ? RISK_COLOR.critical : it.kind === 'teacher' ? '#2f66f6' : '#94a3b8',
                        }}
                      />
                      <p className="text-[12px] font-semibold text-ink-muted">{it.date}</p>
                      <p className="text-[14px] leading-snug text-ink">{it.th}</p>
                      <p className="text-[12px] text-ink-faint">{it.by}</p>
                    </li>
                  ))}
                </ol>
                {tl.length > 5 && (
                  <button type="button" onClick={() => setAllTl((v) => !v)} className="mt-2 text-[13px] font-semibold text-brand-600">
                    {allTl ? 'ย่อ' : `ดูทั้งหมด ${tl.length} รายการ`}
                  </button>
                )}
              </Section>

              {/* ── รายละเอียด ────────────────────────────── */}
              <Section title="รายละเอียดแผน">
                <dl className="grid grid-cols-1 gap-2 text-[13.5px] sm:grid-cols-2">
                  <Fact k="เหตุผลของเส้นทางนี้" v={p.rationaleTh} wide />
                  <Fact k="เป้าหมายสำเร็จ" v={p.targetMonth} />
                  <Fact k="ครอบครัว" v={p.agreedByFamily ? 'เห็นชอบแผนแล้ว' : 'ยังไม่ได้เห็นชอบ'} />
                  <Fact k="ทบทวนล่าสุด" v={p.reviewedDaysAgo === 0 ? 'วันนี้' : `${p.reviewedDaysAgo} วันก่อน`} />
                  <Fact k="ความยินยอม (PDPA)" v={s?.consent === 'granted' ? 'ให้ความยินยอมแล้ว' : s?.consent === 'declined' ? 'ปฏิเสธ' : 'รอความยินยอม'} />
                </dl>
              </Section>
            </>
          )}

          {sheet === 'log' && <LogSheet onSave={(mode, note, result) => {
            add({
              mode,
              note,
              result,
              ...(mode === 'contact' && result?.startsWith('ติดต่อได้') ? { parentContact: 'ok' as const } : {}),
              ...(mode === 'visit' ? { homeVisited: true } : {}),
            })
            // บันทึกสิ่งที่ตรงกับขั้นปัจจุบันของแผน ก็คือทำขั้นนั้นเสร็จ — ครูบันทึก
            // ว่าเยี่ยมบ้านแล้ว ขั้น "ลงเยี่ยมบ้าน" ต้องไม่ค้างอยู่ บอกในข้อความ
            // ด้วยว่าติ๊กให้แล้ว ไม่ใช่เปลี่ยนเงียบ ๆ
            const cur = c.current
            const matches =
              cur && isSchoolStep(cur) && cur.status !== 'done' &&
              ((mode === 'visit' && cur.titleTh.includes('เยี่ยมบ้าน')) ||
                (mode === 'contact' && result?.startsWith('ติดต่อได้') && /ผู้ปกครอง|ครอบครัว/.test(cur.titleTh)) ||
                (mode === 'talk' && cur.titleTh.includes('นักเรียน')))
            if (matches) log.markStep(cur!.id, { status: 'done', at: iso(), by })
            push(matches ? `บันทึกแล้ว และติ๊กขั้น "${cur!.titleTh}" ให้แล้ว` : 'บันทึกการช่วยเหลือแล้ว')
            setSheet(null)
          }} />}

          {sheet === 'followup' && (
            <FollowUpSheet
              onSave={(days, note) => {
                add({ mode: 'note', note: note || 'นัดติดตามผล', followUpDate: iso(days) })
                push(`ตั้งนัดติดตามวันที่ ${iso(days)} แล้ว — จะขึ้นในหน้าแรกของคุณเมื่อถึงวัน`)
                setSheet(null)
              }}
            />
          )}

          {sheet === 'ai' && (
            <AISheet
              c={c}
              pathwayLabel={pathwayLabel}
              mayAct={mayAct}
              onAct={(mode, note) => {
                add({
                  mode: mode === 'followUp' ? 'note' : mode,
                  note,
                  ...(mode === 'followUp' ? { followUpDate: iso(7) } : {}),
                  ...(mode === 'visit' ? { homeVisited: true } : {}),
                  ...(mode === 'contact' ? { parentContact: 'ok' as const } : {}),
                })
                push('บันทึกตามคำแนะนำแล้ว')
              }}
            />
          )}

          {sheet === 'obstacle' && (
            <ObstacleSheet
              onPick={(k) => {
                add({ mode: 'note', note: OBSTACLES[k].th, obstacle: k })
                if (c.current && c.current.status !== 'blocked') log.markStep(c.current.id, { status: 'blocked', at: iso(), by, note: OBSTACLES[k].th })
              }}
              onOption={(opt) => {
                if (opt.act === 'refer') {
                  setReferPreset({ kinds: opt.kinds, reason: opt.reason })
                  setSheet('refer')
                } else {
                  add({ mode: opt.act === 'visit' ? 'visit' : opt.act === 'talk' ? 'talk' : 'contact', note: opt.th, ...(opt.act === 'visit' ? { homeVisited: true } : {}) })
                  push('บันทึกแล้ว')
                  setSheet(null)
                }
              }}
              onReferAny={() => {
                setReferPreset({})
                setSheet('refer')
              }}
            />
          )}

          {sheet === 'refer' && s && (
            <>
              <h3 className="mb-1 text-[18px] font-bold text-ink">ส่งต่อหน่วยงาน</h3>
              <p className="mb-3 text-[13.5px] text-ink-muted">ส่งจากเคสนี้ได้เลย — การส่งต่อจะไปอยู่ที่เมนูส่งต่อเคสให้ติดตามต่อ</p>
              <CreateReferral
                student={s}
                log={log}
                user={user}
                preset={{ kinds: referPreset.kinds, reason: referPreset.reason ?? (c.current ? `ขอความช่วยเหลือเรื่อง "${c.current.titleTh}"` : undefined) }}
                historyCount={log.entries.filter((e) => e.childId === p.childId).length + s.timeline.length}
                onDone={() => setSheet(null)}
                onOpen={(id) => nav(`/referral?ref=${id}`)}
              />
            </>
          )}

          {sheet === 'close' && (
            <CloseSheet
              c={c}
              mayAct={mayAct}
              onClose={() => {
                add({ mode: 'note', note: 'ปิดเคส — ประเมินผลแล้วผ่านทุกข้อ', stage: 'resolved' })
                push(`ปิดเคสของ ${p.childName} แล้ว`)
              }}
              onContinue={() => {
                add({ mode: 'note', note: 'ประเมินผลแล้ว ยังต้องติดตามต่อ', followUpDate: iso(14) })
                push(`ตั้งนัดติดตามต่ออีก 14 วัน (${iso(14)})`)
                setSheet(null)
              }}
              onBack={() => setSheet(null)}
            />
          )}
        </div>

        {/* ── แถบปุ่มติดก้นจอ — ทำได้จากทุกตำแหน่งที่เลื่อนอยู่ ── */}
        {mayAct && sheet === null && (
          <footer className="grid grid-cols-3 gap-2 border-t border-surface-border bg-white px-4 py-3">
            <BarBtn primary onClick={() => setSheet('log')}>บันทึกการช่วยเหลือ</BarBtn>
            <BarBtn onClick={() => setSheet('followup')}>นัดติดตาม</BarBtn>
            <BarBtn onClick={() => setSheet('ai')}>AI แนะนำ</BarBtn>
          </footer>
        )}
      </motion.aside>
    </div>
  )
}

// ── ขั้นตอนถัดไป ─────────────────────────────────────────────

function NextActionCard({
  c,
  mayAct,
  onChase,
  onDone,
  onAgree,
  onObstacle,
  onRefer,
  onAssess,
  onLog,
}: {
  c: PlanCase
  mayAct: boolean
  onChase: (s: PlanStep) => void
  onDone: (s: PlanStep) => void
  onAgree: () => void
  onObstacle: () => void
  onRefer: () => void
  onAssess: () => void
  onLog: () => void
}) {
  const n = c.next
  const tone = n.kind === 'unblock' ? RISK_COLOR.critical : n.kind === 'close' ? RISK_COLOR.normal : '#2f66f6'
  const btns: { label: string; on: () => void; primary?: boolean }[] = []
  if (mayAct) {
    if (n.kind === 'unblock' && n.step) {
      if (!n.ownerIsTeacher) btns.push({ label: 'ทวงถามเจ้าภาพ', on: () => onChase(n.step!), primary: true })
      btns.push({ label: 'ติดอุปสรรค', on: onObstacle, primary: n.ownerIsTeacher })
      btns.push({ label: 'ส่งต่อหน่วยงาน', on: onRefer })
    } else if (n.kind === 'agree') {
      btns.push({ label: 'บันทึกว่าครอบครัวเห็นชอบ', on: onAgree, primary: true })
      btns.push({ label: 'ติดอุปสรรค', on: onObstacle })
    } else if (n.kind === 'doStep' && n.step) {
      btns.push({ label: 'ทำขั้นนี้เสร็จแล้ว', on: () => onDone(n.step!), primary: true })
      btns.push({ label: 'บันทึกการช่วยเหลือ', on: onLog })
      btns.push({ label: 'ติดอุปสรรค', on: onObstacle })
    } else if (n.kind === 'chase' && n.step) {
      btns.push({ label: 'ทวงถามเจ้าภาพ', on: () => onChase(n.step!), primary: true })
      btns.push({ label: 'หน่วยงานทำเสร็จแล้ว', on: () => onDone(n.step!) })
      btns.push({ label: 'ติดอุปสรรค', on: onObstacle })
    } else if (n.kind === 'close' || n.kind === 'assess') {
      btns.push({ label: 'ประเมินผลก่อนปิดเคส', on: onAssess, primary: true })
    }
  }
  return (
    <div className="mt-4 rounded-2xl border-2 p-4" style={{ borderColor: tone }}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: tone }}>
        ขั้นตอนถัดไป
      </p>
      <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{n.th}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">เหตุผล:</span> {n.whyTh}
      </p>
      <p className="mt-1 text-[13.5px] text-ink-muted">
        <span className="font-semibold text-ink">ผู้รับผิดชอบ:</span>{' '}
        <span className={n.ownerIsTeacher ? 'font-semibold text-brand-700' : ''}>{n.ownerTh}</span>
        {n.daysLeft !== undefined && (
          <span style={{ color: dueColor(n.daysLeft) }}> · {dueText(n.daysLeft)}</span>
        )}
      </p>
      {btns.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {btns.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.on}
              className={
                b.primary
                  ? 'rounded-xl px-4 py-3 text-[15px] font-semibold text-white shadow-card'
                  : 'rounded-xl border border-surface-border bg-white px-4 py-3 text-[14px] font-medium text-ink hover:border-brand-400'
              }
              style={b.primary ? { background: tone } : undefined}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── งานย่อย ─────────────────────────────────────────────────

const LOG_TYPES: { mode: LogMode; th: string }[] = [
  { mode: 'contact', th: 'ติดต่อผู้ปกครอง' },
  { mode: 'talk', th: 'พูดคุยกับนักเรียน' },
  { mode: 'visit', th: 'เยี่ยมบ้าน' },
  { mode: 'note', th: 'อื่น ๆ' },
]
const RESULTS: Record<LogMode, string[]> = {
  contact: ['ติดต่อได้ ผู้ปกครองรับทราบ', 'ติดต่อได้ แต่ยังไม่ได้ข้อสรุป', 'ติดต่อไม่ได้'],
  talk: ['นักเรียนยินดีกลับมาเรียน', 'นักเรียนยังลังเล', 'พบปัญหาใหม่ที่ต้องช่วย'],
  visit: ['พบครอบครัว ได้ข้อมูลครบ', 'พบบางส่วน', 'ไม่พบใครที่บ้าน'],
  note: [],
}

function LogSheet({ onSave }: { onSave: (mode: LogMode, note: string, result?: string) => void }) {
  const [mode, setMode] = useState<LogMode>('contact')
  const [result, setResult] = useState<string>()
  const [note, setNote] = useState('')
  const label = LOG_TYPES.find((x) => x.mode === mode)!.th
  return (
    <SheetBody title="บันทึกการช่วยเหลือ" hint="เลือกสิ่งที่ทำ ผลลัพธ์ แล้วบันทึก — จะขึ้นใน timeline และหน้าแรกของคุณทันที">
      <Label>ทำอะไรไป</Label>
      <Chips items={LOG_TYPES.map((x) => x.th)} value={label} onPick={(v) => { setMode(LOG_TYPES.find((x) => x.th === v)!.mode); setResult(undefined) }} />
      {RESULTS[mode].length > 0 && (
        <>
          <Label>ผลลัพธ์</Label>
          <Chips items={RESULTS[mode]} value={result} onPick={setResult} />
        </>
      )}
      <Label>หมายเหตุ (ไม่บังคับ)</Label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        placeholder="เช่น แม่บอกว่าจะพามาส่งวันจันทร์"
      />
      <PrimaryBtn disabled={RESULTS[mode].length > 0 && !result} onClick={() => onSave(mode, note.trim() ? `${label}: ${note.trim()}` : label, result)}>
        บันทึก
      </PrimaryBtn>
    </SheetBody>
  )
}

function FollowUpSheet({ onSave }: { onSave: (days: number, note: string) => void }) {
  const [days, setDays] = useState(7)
  const [note, setNote] = useState('')
  const opts = [2, 3, 7, 14]
  return (
    <SheetBody title="นัดติดตาม" hint="ถึงวันนัด เคสนี้จะขึ้นเป็น &ldquo;สิ่งที่ต้องทำวันนี้&rdquo; ในหน้าแรกของคุณ">
      <Label>อีกกี่วัน</Label>
      <Chips items={opts.map((d) => `${d} วัน`)} value={`${days} วัน`} onPick={(v) => setDays(Number(v.split(' ')[0]))} />
      <p className="mt-2 text-[14px] text-ink-muted">วันนัด: <span className="font-semibold text-ink">{iso(days)}</span></p>
      <Label>จะดูอะไร (ไม่บังคับ)</Label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        placeholder="เช่น ดูว่ากลับมาเรียนครบสัปดาห์ไหม"
      />
      <PrimaryBtn onClick={() => onSave(days, note.trim())}>ตั้งนัด</PrimaryBtn>
    </SheetBody>
  )
}

function AISheet({
  c,
  pathwayLabel,
  mayAct,
  onAct,
}: {
  c: PlanCase
  pathwayLabel: string
  mayAct: boolean
  onAct: (mode: 'contact' | 'visit' | 'followUp', note: string) => void
}) {
  // ตามแบบแผนของทั้งแพลตฟอร์ม (useSimulatedLoading) — ให้สถานะ "AI กำลัง
  // วิเคราะห์" มีให้เห็นในเดโม ผลลัพธ์คำนวณจากข้อมูลจริงทั้งหมด
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 450)
    return () => window.clearTimeout(id)
  }, [])
  const [done, setDone] = useState<string[]>([])
  const steps = c.student ? recommendSteps(c.student, true) : []
  return (
    <SheetBody title="AI แนะนำ" hint="เส้นทางที่แนะนำสำหรับเด็กคนนี้ เรียงตามลำดับที่ควรลงมือ ทุกข้อมีเหตุผลจากระเบียน">
      <div className="flex gap-2.5 rounded-2xl bg-brand-50/70 p-3.5">
        <img src={MASCOT} alt="" className="h-9 w-9 shrink-0 object-contain" draggable={false} />
        {ready ? (
          <p className="text-[14.5px] leading-relaxed text-ink">{aiSummary(c, pathwayLabel, true)}</p>
        ) : (
          <div className="flex-1 space-y-2" aria-live="polite">
            <p className="text-[13px] font-semibold text-brand-700">AI กำลังวิเคราะห์ข้อมูลของเด็กคนนี้…</p>
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-8/12" />
          </div>
        )}
      </div>
      {ready && (
        <>
          <Label>AI Recommended Path</Label>
          <ol className="space-y-2">
            {steps.map((st, i) => (
              <li key={st.key} className="rounded-xl border border-surface-border p-3">
                <p className="text-[14.5px] font-semibold text-ink">
                  {i + 1}. {st.th}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">{st.whyTh}</p>
                {mayAct && st.action && (
                  <button
                    type="button"
                    disabled={done.includes(st.key)}
                    onClick={() => {
                      onAct(st.action!, st.th)
                      setDone((d) => [...d, st.key])
                    }}
                    className="mt-2 rounded-lg border border-brand-300 bg-white px-3 py-2 text-[13px] font-semibold text-brand-700 disabled:border-surface-border disabled:text-ink-faint"
                  >
                    {done.includes(st.key) ? '✓ บันทึกแล้ว' : 'เริ่มดำเนินการ'}
                  </button>
                )}
              </li>
            ))}
            {steps.length === 0 && <p className="text-[14px] text-ink-muted">ไม่มีระเบียนนักเรียนให้วิเคราะห์</p>}
          </ol>
        </>
      )}
    </SheetBody>
  )
}

function ObstacleSheet({
  onPick,
  onOption,
  onReferAny,
}: {
  onPick: (k: ObstacleKey) => void
  onOption: (o: (typeof OBSTACLES)[ObstacleKey]['options'][number]) => void
  onReferAny: () => void
}) {
  const [picked, setPicked] = useState<ObstacleKey>()
  return (
    <SheetBody title="ติดอุปสรรค" hint="เลือกสิ่งที่ทำให้แผนเดินต่อไม่ได้ — AI จะเสนอทางเลือกถัดไป">
      {!picked ? (
        <div className="space-y-2">
          {(Object.keys(OBSTACLES) as ObstacleKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPicked(k)
                onPick(k)
                if (k === 'needAgency') onReferAny()
              }}
              className="flex w-full items-center justify-between rounded-xl border border-surface-border px-4 py-3.5 text-left text-[15px] font-medium text-ink hover:border-brand-400"
            >
              {OBSTACLES[k].th}
              <IconArrowRight width={14} height={14} className="text-ink-faint" />
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[14px] text-ink">
            บันทึกแล้ว: <span className="font-semibold">{OBSTACLES[picked].th}</span> — ขั้นปัจจุบันถูกตั้งเป็น &ldquo;ติดขัด&rdquo;
          </p>
          <div className="mt-3 flex gap-2.5 rounded-2xl bg-brand-50/70 p-3.5">
            <img src={MASCOT} alt="" className="h-8 w-8 shrink-0 object-contain" draggable={false} />
            <p className="text-[14px] font-semibold text-ink">AI แนะนำทางเลือกถัดไป</p>
          </div>
          <div className="mt-2 space-y-2">
            {OBSTACLES[picked].options.map((o) => (
              <button
                key={o.th}
                type="button"
                onClick={() => onOption(o)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-brand-200 bg-white px-4 py-3.5 text-left text-[14.5px] font-medium text-ink hover:border-brand-500"
              >
                <span>{o.th}</span>
                <span className="shrink-0 text-[12.5px] font-semibold text-brand-700">{o.act === 'refer' ? 'ส่งต่อ →' : 'บันทึก →'}</span>
              </button>
            ))}
            <button type="button" onClick={onReferAny} className="w-full rounded-xl px-4 py-3 text-[14px] font-medium text-ink-muted hover:text-brand-600">
              หรือส่งต่อหน่วยงานอื่น →
            </button>
          </div>
        </>
      )}
    </SheetBody>
  )
}

function CloseSheet({
  c,
  mayAct,
  onClose,
  onContinue,
  onBack,
}: {
  c: PlanCase
  mayAct: boolean
  onClose: () => void
  onContinue: () => void
  onBack: () => void
}) {
  const fa = finalAssessment(c)
  const [confirm, setConfirm] = useState(false)
  const [closed, setClosed] = useState(false)
  if (!fa) return <SheetBody title="ประเมินผลก่อนปิดเคส" hint="ไม่มีระเบียนนักเรียนให้ประเมิน"><PrimaryBtn onClick={onBack}>กลับ</PrimaryBtn></SheetBody>
  if (closed)
    return (
      <SheetBody title="ปิดเคสแล้ว" hint="">
        <div className="rounded-2xl bg-green-50 p-4 text-[15px] text-ink">
          <p className="text-[16px] font-bold" style={{ color: RISK_COLOR.normal }}>✓ ปิดเคสของ {c.plan.childName} แล้ว</p>
          <p className="mt-1">เคสนี้ออกจากรายการที่ต้องดูแล และบันทึกไว้ใน timeline</p>
        </div>
        <PrimaryBtn onClick={onBack}>กลับไปที่เคส</PrimaryBtn>
      </SheetBody>
    )
  return (
    <SheetBody title="ประเมินผลก่อนปิดเคส" hint="ระบบตอบจากข้อมูลล่าสุด ครูตรวจแล้วตัดสินใจเอง">
      <ul className="space-y-2">
        {fa.questions.map((q) => (
          <li key={q.th} className="flex gap-3 rounded-xl border border-surface-border p-3">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
              style={{ background: q.state === 'ok' ? RISK_COLOR.normal : q.state === 'warn' ? RISK_COLOR.high : RISK_COLOR.critical }}
            >
              {q.state === 'ok' ? '✓' : q.state === 'warn' ? '!' : '✕'}
            </span>
            <div>
              <p className="text-[14.5px] font-semibold text-ink">{q.th}</p>
              <p className="text-[13px] text-ink-muted">{q.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2.5 rounded-2xl bg-brand-50/70 p-3.5">
        <img src={MASCOT} alt="" className="h-8 w-8 shrink-0 object-contain" draggable={false} />
        <p className="text-[14.5px] leading-relaxed text-ink">{fa.summary}</p>
      </div>
      {mayAct && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {fa.canClose && (
            <button
              type="button"
              onClick={() => {
                if (!confirm) return setConfirm(true)
                onClose()
                setClosed(true)
              }}
              className="flex-1 rounded-xl px-4 py-3 text-[15px] font-semibold text-white"
              style={{ background: confirm ? RISK_COLOR.critical : RISK_COLOR.normal }}
            >
              {confirm ? 'ยืนยันปิดเคส — กดอีกครั้ง' : 'ปิดเคส'}
            </button>
          )}
          <button
            type="button"
            onClick={onContinue}
            className={`flex-1 rounded-xl px-4 py-3 text-[15px] font-semibold ${fa.canClose ? 'border border-surface-border bg-white text-ink' : 'bg-brand-500 text-white'}`}
          >
            ติดตามต่อ (นัดอีก 14 วัน)
          </button>
        </div>
      )}
    </SheetBody>
  )
}

// ── ชิ้นเล็ก ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2.5 text-[14px] font-bold text-ink">{title}</h3>
      {children}
    </section>
  )
}

function Fact({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[12.5px] text-ink-faint">{k}</dt>
      <dd className="text-[14px] leading-snug text-ink">{v}</dd>
    </div>
  )
}

function SheetBody({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[18px] font-bold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-[13.5px] leading-snug text-ink-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 mt-4 text-[13.5px] font-semibold text-ink">{children}</p>
}

function Chips({ items, value, onPick }: { items: string[]; value?: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it}
          type="button"
          onClick={() => onPick(it)}
          className="rounded-full border px-4 py-2.5 text-[14px] font-medium"
          style={{ borderColor: value === it ? '#2f66f6' : '#e2e8f0', background: value === it ? '#eef3ff' : '#fff', color: value === it ? '#1d4ed8' : '#0f172a' }}
        >
          {it}
        </button>
      ))}
    </div>
  )
}

function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-4 w-full flex-1 rounded-xl bg-brand-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-card disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function SmallBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
    >
      {children}
    </button>
  )
}

function BarBtn({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? 'rounded-xl bg-brand-500 px-2 py-3 text-[14px] font-semibold leading-tight text-white'
          : 'rounded-xl border border-surface-border bg-white px-2 py-3 text-[14px] font-medium leading-tight text-ink'
      }
    >
      {children}
    </button>
  )
}
