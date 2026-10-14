import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { canWorkCases } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { SCHOOL_BY_ID } from '@/data/schools'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { useSimulatedLoading } from '@/lib/useLoading'
import { assetUrl } from '@/lib/asset'
import { LEVEL_TH, type FollowCase, type Go } from '@/lib/followOps'
import {
  careOptions,
  caseStatus,
  caseTeam,
  goalProgress,
  latestOutcome,
  observationHints,
  riskTrend,
  suggestGoals,
  type CareOption,
} from '@/lib/careOps'
import { closability } from '@/lib/recommend'
import type { CaseLogEntry, Observation } from '@/lib/caseLog'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { IconStudent } from '@/components/icons'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { FollowCaseDetail, type Sheet } from '@/components/followup/FollowCaseDetail'
import { StudentTimeline } from '@/components/followup/StudentFollow'
import { Drawer, inputCls, isoIn, textareaCls } from '@/components/referrals/ui'
import { byOf } from '@/components/referrals/useRefCases'
import { LogForm, type LogResult } from '@/pages/Student360'
import { Attendance, CaseSummary, FamilyFromVisit, Grades, MicButton } from './DeskExtras'

const MASCOT = assetUrl('ChatBot.png')

/**
 * ข้อมูลเด็กรายบุคคล สำหรับครู — "โต๊ะทำงานของครูสำหรับดูแลเด็กคนนี้"
 *
 * ครูรู้ปัญหา — AI ช่วยหาวิธี ลำดับของหน้า:
 *   เด็กคนนี้เป็นใคร → สิ่งที่ครูพบ → ทำไมต้องดูตอนนี้ → สิ่งที่ต้องทำต่อ
 *   → แนวทางที่ AI เสนอ (ครูเลือก) → นัดหมาย → ผลล่าสุด → เป้าหมาย
 *   → ไทม์ไลน์ → แนวโน้มความเสี่ยง → ทีม → งานที่เกี่ยวข้อง
 *
 * หน้าเดิม (Student360) ยังใช้กับบทบาทอื่น — เป็นแฟ้มข้อมูลที่มีแท็บและกราฟ
 * เหมาะกับคนที่มาดู ไม่เหมาะกับคนที่มาลงมือช่วย
 */
export function TeacherStudentDesk() {
  const { t, lang } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const { push } = useToast()
  const { user, log, built } = useFollowCases()
  const mayAct = canWorkCases(user)
  const by = byOf(user)
  const loading = useSimulatedLoading(450)
  const [params, setParams] = useSearchParams()

  const list = 'list' in built ? built.list : []
  const id = params.get('id') ?? list[0]?.s.id
  const fc = list.find((c) => c.s.id === id) ?? list[0]
  const childId = fc?.s.id ?? ''
  const entries = useMemo(() => log.entries.filter((e) => e.childId === childId), [log.entries, childId])
  const obs = log.observations[childId] ?? []

  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [logMode, setLogMode] = useState<'contact' | 'visit' | null>(null)
  const [picking, setPicking] = useState(false)
  const noteRef = useRef<HTMLInputElement>(null)
  const wide = useMedia('(min-width: 1536px)')
  const [summaryOpen, setSummaryOpen] = useState(false)

  const pick = (sid: string) => {
    const next = new URLSearchParams(params)
    next.set('id', sid)
    setParams(next, { replace: true })
    setPicking(false)
    window.scrollTo({ top: 0 })
  }

  const run = (go: Go) => {
    if ('href' in go) return nav(go.href)
    if (go.sheet === 'outcome' && go.mode === 'visit') return setLogMode('visit')
    setSheet(go as Sheet)
  }

  const saveLogForm = (res: LogResult) => {
    if (!fc) return
    log.add({
      childId: fc.s.id,
      mode: res.mode,
      date: res.date,
      channel: res.channel,
      outcome: res.outcome,
      note: res.note,
      by,
      followUpDate: res.followUpDate || undefined,
      parentContact: res.parentContact,
      homeVisited: res.mode === 'visit' ? true : undefined,
      attendees: res.attendees,
      family: res.family,
      arrivedAt: res.arrivedAt,
      signature: res.signature,
      consent: res.consent,
    })
    setLogMode(null)
    push(res.mode === 'visit' ? 'บันทึกการเยี่ยมบ้านแล้ว — เพิ่มเข้าไทม์ไลน์' : 'บันทึกการติดต่อแล้ว — เพิ่มเข้าไทม์ไลน์')
  }

  if (loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
      </div>
    )
  if ('error' in built)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <p className="text-[17px] font-semibold text-red-700">ไม่สามารถโหลดข้อมูลนักเรียนได้</p>
        <p className="mt-1 text-[14px] text-ink">บันทึกที่คุณทำไว้ยังอยู่ครบ ลองโหลดอีกครั้ง</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white">
          ลองอีกครั้ง
        </button>
      </div>
    )
  if (!fc)
    return (
      <div className="rounded-2xl border border-dashed border-surface-border bg-white px-6 py-10 text-center">
        <p className="text-[17px] font-semibold text-ink">ยังไม่มีนักเรียนในความดูแลของคุณ</p>
        <p className="mt-1 text-[14px] text-ink-muted">เมื่อมีนักเรียนในเคสของคุณ จะเปิดดูแลรายคนได้ที่นี่</p>
      </div>
    )

  // แต่ละส่วนนิยามครั้งเดียว — สองเลย์เอาต์ต่างกันแค่การจัดวาง
  const sec = {
    summary: <Summary fc={fc} onSummary={() => setSummaryOpen(true)} />,
    close: <CloseBanner fc={fc} mayAct={mayAct} onAssess={() => setSheet({ sheet: 'close' })} onReopen={() => setSheet({ sheet: 'reopen' })} />,
    observations: (
      <Observations
        key={`obs-${childId}`}
        s={fc.s}
        obs={obs}
        mayAct={mayAct}
        onAdd={(text) => {
          log.addObservation(childId, text, by)
          // บันทึกลงไทม์ไลน์ แต่ไม่นับเป็นการอัปเดตเคส — ยืนยันสิ่งที่ระบบเสนอไม่ใช่การติดต่อเด็ก
          log.add({ childId, by, date: isoIn(0), mode: 'note', note: `ครูพบว่า: ${text}`, choice: 'observe' })
          push('บันทึกสิ่งที่พบแล้ว — AI จะใช้ประกอบคำแนะนำ')
        }}
        onEdit={(oid, text) => log.updateObservation(childId, oid, { text })}
        onResolve={(o) => {
          log.updateObservation(childId, o.id, { resolvedTs: Date.now() })
          log.add({ childId, by, date: isoIn(0), mode: 'note', note: `คลี่คลายแล้ว: ${o.text}` })
          push('ทำเครื่องหมายว่าคลี่คลายแล้ว')
        }}
      />
    ),
    next: (
      <NextStep
        fc={fc}
        mayAct={mayAct}
        onRun={() => run(fc.next.go)}
        onAlt={() => document.getElementById('ai-options')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onAsk={() => setSheet({ sheet: 'ask' })}
      />
    ),
    ai: <AiOptions key={`ai-${childId}`} fc={fc} obs={obs} entries={entries} mayAct={mayAct} by={by} log={log} run={run} />,
    appointments: (
      <Appointments fc={fc} entries={entries} mayAct={mayAct} onAdd={() => setSheet({ sheet: 'schedule' })} onLog={() => setSheet({ sheet: 'outcome', mode: 'followUp' })} />
    ),
    outcome: <Outcome fc={fc} entries={entries} />,
    goals: (
      <Goals
        key={`goal-${childId}`}
        s={fc.s}
        goal={log.goals[childId]}
        mayAct={mayAct}
        onSave={(items, days) => {
          log.saveGoal(childId, { items, due: isoIn(days), ts: Date.now(), by })
          push('บันทึกเป้าหมายแล้ว')
        }}
      />
    ),
    note: (
      <section>
        <SectionTitle>บันทึกสั้น</SectionTitle>
        {mayAct && (
          <QuickNote
            inputRef={noteRef}
            onSave={(text) => {
              log.add({ childId, by, date: isoIn(0), mode: 'note', note: text })
              push('บันทึกแล้ว — เพิ่มเข้าไทม์ไลน์ และ AI จะใช้ประกอบคำแนะนำครั้งถัดไป')
            }}
          />
        )}
      </section>
    ),
    timeline: <StudentTimeline fc={fc} entries={entries} log={log} mayAct={mayAct} onLogContact={() => setSheet({ sheet: 'outcome', mode: 'contact' })} />,
    trend: <Trend fc={fc} />,
    team: <Team fc={fc} entries={entries} me={by} />,
    related: <Related fc={fc} entries={entries} mayAct={mayAct} onVisit={() => setLogMode('visit')} />,
    more: <MoreInfo fc={fc} th={th} t={t} />,
    attendance: <Attendance s={fc.s} />,
    grades: <Grades s={fc.s} />,
    family: <FamilyFromVisit visit={entries.find((e) => e.mode === 'visit')} t={t} mayAct={mayAct} onVisit={() => setLogMode('visit')} />,
  }

  return (
    <div className="animate-page-rise pb-28 md:pb-6">
      <PageHeader
        icon={<IconStudent width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.student')]} />}
        title={t('nav.student')}
        subtitle="โต๊ะทำงานของคุณสำหรับดูแลเด็กหนึ่งคน — ครูรู้ปัญหา AI ช่วยหาวิธี"
      />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ── รายชื่อ (จอใหญ่) ─────────────────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 overflow-hidden rounded-2xl border border-surface-border bg-white">
            <p className="border-b border-surface-border px-4 py-2.5 text-[13px] font-semibold text-ink-muted">เด็กในความดูแล · เรียงตามความเร่งด่วน</p>
            <ul className="max-h-[70vh] overflow-y-auto">
              {list.map((c) => (
                <StudentPickRow key={c.s.id} c={c} active={c.s.id === fc.s.id} onPick={() => pick(c.s.id)} />
              ))}
            </ul>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex w-full items-center justify-between rounded-xl border border-surface-border bg-white px-4 py-3 text-[14.5px] font-medium text-ink lg:hidden"
          >
            เปลี่ยนนักเรียน ({list.length} คน)
            <span aria-hidden>▾</span>
          </button>

          {/* จอกว้าง (≥1536px) แยกสองคอลัมน์ตั้งแต่บนสุด: งานหลักตรงกลาง ข้อมูลประกอบด้านขวา
              จอเล็กกว่านั้นเรียงคอลัมน์เดียวตามลำดับของ brief (มือถือก่อน) */}
          {wide ? (
            <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4">
              <div className="min-w-0 space-y-4">
                {sec.summary}
                {sec.close}
                {sec.observations}
                {sec.next}
                {sec.ai}
                {sec.note}
                {sec.timeline}
              </div>
              <div className="space-y-4">
                {sec.appointments}
                {sec.outcome}
                {sec.attendance}
                {sec.goals}
                {sec.trend}
                {sec.grades}
                {sec.family}
                {sec.team}
                {sec.related}
                {sec.more}
              </div>
            </div>
          ) : (
            <>
              {sec.summary}
              {sec.close}
              {sec.observations}
              {sec.next}
              {sec.ai}
              {sec.appointments}
              {sec.outcome}
              {sec.attendance}
              {sec.goals}
              {sec.note}
              {sec.timeline}
              {sec.trend}
              {sec.grades}
              {sec.family}
              {sec.team}
              {sec.related}
              {sec.more}
            </>
          )}
        </div>
      </div>

      {/* ── แถบปุ่มติดล่างบนมือถือ ─────────────────── */}
      {mayAct && (
        <div className="fixed inset-x-0 bottom-16 z-30 grid grid-cols-3 gap-2 border-t border-surface-border bg-white/95 px-4 py-2.5 backdrop-blur md:hidden">
          <BarBtn primary onClick={() => setSheet({ sheet: 'outcome', mode: 'sheet' in fc.next.go && fc.next.go.sheet === 'outcome' ? fc.next.go.mode : 'followUp' })}>
            บันทึกผล
          </BarBtn>
          <BarBtn
            onClick={() => {
              noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              window.setTimeout(() => noteRef.current?.focus(), 350)
            }}
          >
            เพิ่ม Note
          </BarBtn>
          <BarBtn onClick={() => setSheet({ sheet: 'ask' })}>ถาม AI</BarBtn>
        </div>
      )}

      {sheet && (
        <FollowCaseDetail key={JSON.stringify(sheet)} c={fc} entries={entries} log={log} user={user} mayAct={mayAct} initial={sheet} closeAfter onClose={() => setSheet(null)} />
      )}
      {summaryOpen && (
        <CaseSummary fc={fc} entries={entries} obs={obs.filter((o) => !o.resolvedTs).map((o) => o.text)} by={by} t={t} onClose={() => setSummaryOpen(false)} />
      )}
      {logMode && <LogForm mode={logMode} student={fc.s} actor={by} onCancel={() => setLogMode(null)} onSave={saveLogForm} th={th} t={t} />}
      {picking && (
        <Drawer label="เลือกนักเรียน" head={<p className="text-[19px] font-bold text-ink">เด็กในความดูแล</p>} onClose={() => setPicking(false)}>
          <ul className="divide-y divide-surface-border rounded-2xl border border-surface-border">
            {list.map((c) => (
              <StudentPickRow key={c.s.id} c={c} active={c.s.id === fc.s.id} onPick={() => pick(c.s.id)} />
            ))}
          </ul>
        </Drawer>
      )}
    </div>
  )
}

/** จอกว้างพอสำหรับคอลัมน์ขวาไหม — อ่านตอนเปิดและตามการปรับขนาดหน้าต่าง */
function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [q])
  return on
}

// ── ชิ้นส่วน ─────────────────────────────────────────────────

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-[16px] font-bold text-ink">{children}</h2>
      {right}
    </div>
  )
}

function BarBtn({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? 'rounded-xl bg-brand-500 px-2 py-3 text-[14.5px] font-semibold text-white' : 'rounded-xl border border-surface-border bg-white px-2 py-3 text-[14.5px] font-medium text-ink'}
    >
      {children}
    </button>
  )
}

function StudentPickRow({ c, active, onPick }: { c: FollowCase; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={active} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${active ? 'bg-surface-muted font-bold' : 'hover:bg-surface-muted/60'}`}>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-[14px] font-bold tabular ${c.s.riskLevel === 'critical' ? 'border-red-200 text-red-700' : 'border-surface-border text-ink'}`}>
          {c.s.riskScore}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14.5px] ${active ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{c.s.name}</span>
          <span className="block truncate text-[12.5px] text-ink-muted">{c.today ? c.because.replace('ต้องดูวันนี้ เพราะ', '') : GRADE_LABEL(c.s.gradeKey, true)}</span>
        </span>
      </button>
    </li>
  )
}

/** 1. เด็กคนนี้เป็นใคร — คะแนนต้องมีคำอธิบายเสมอ */
function Summary({ fc, onSummary }: { fc: FollowCase; onSummary: () => void }) {
  const s = fc.s
  const tr = riskTrend(s)
  const st = caseStatus(fc)
  const school = SCHOOL_BY_ID[s.schoolKey]
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold leading-tight text-ink">{s.name}</h1>
          <p className="mt-1 text-[14px] text-ink-muted">
            {GRADE_LABEL(s.gradeKey, true)} · {school ? `โรงเรียน${school.name}` : s.schoolKey} · {s.id}
          </p>
          <p className="mt-0.5 text-[14px] text-ink-muted">
            ครูเจ้าของเคส: <span className="font-semibold text-ink">{s.caseOwner || 'ยังไม่มี'}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-[13px] font-semibold text-ink">
              สถานะ: {st.th}
            </span>
            <button type="button" onClick={onSummary} className="rounded-full border border-surface-border px-3 py-1 text-[13px] font-semibold text-brand-700">
              สรุปเคส / ส่งออก
            </button>
          </div>
        </div>
        {/* มือถือ: แถวเดียวเต็มความกว้าง คะแนนซ้าย คำอธิบายขวา · จอใหญ่: กล่องชิดขวา */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-surface-border px-4 py-3 sm:block sm:text-right">
          <div>
            <p className="text-[12.5px] font-semibold text-ink-muted">คะแนนความเสี่ยง</p>
            <p className="text-[34px] font-bold leading-none tabular" style={{ color: RISK_COLOR[s.riskLevel] }}>
              {s.riskScore}
            </p>
          </div>
          <div className="text-right">
            <p className="mt-0.5 text-[14px] font-bold text-ink">
              เสี่ยง{LEVEL_TH[s.riskLevel]}
            </p>
            <p className="mt-1 text-[13px] font-medium text-ink">
              {tr.weekDelta > 0 ? `↑ เพิ่มขึ้น ${tr.weekDelta} คะแนน` : tr.weekDelta < 0 ? `↓ ลดลง ${-tr.weekDelta} คะแนน` : 'ไม่เปลี่ยน'}จากสัปดาห์ก่อน
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function CloseBanner({ fc, mayAct, onAssess, onReopen }: { fc: FollowCase; mayAct: boolean; onAssess: () => void; onReopen: () => void }) {
  if (fc.open && fc.closable) {
    const open = fc.refs.filter((r) => r.bucket !== 'done')
    return (
      <section className="rounded-2xl border border-surface-border bg-white p-4">
        <p className="text-[15.5px] font-bold text-ink">ข้อมูลล่าสุดบ่งชี้ว่าเคสนี้อาจพร้อมประเมินเพื่อปิด</p>
        <ul className="mt-1.5 space-y-0.5 text-[14px] text-ink">
          {closability(fc.s).metTh.slice(0, 4).map((m) => (
            <li key={m}>✓ {m}</li>
          ))}
          <li>{open.length ? `○ ยังมีการส่งต่อเปิดอยู่ ${open.length} รายการ` : '✓ ไม่มีการส่งต่อค้าง'}</li>
        </ul>
        <p className="mt-1.5 text-[13px] text-ink-muted">ระบบไม่ปิดเคสเอง — ครูตรวจและตัดสินใจ</p>
        {mayAct && (
          <button type="button" onClick={onAssess} className="mt-3 rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white">
            ประเมินเพื่อปิดเคส
          </button>
        )}
      </section>
    )
  }
  if (!fc.open)
    return (
      <section className={`rounded-2xl border p-4 ${fc.relapse ? 'border-red-200 bg-white' : 'border-surface-border bg-white'}`}>
        <p className="text-[15.5px] font-bold text-ink">{fc.relapse ? `ปิดเคสแล้ว แต่ความเสี่ยงกลับมาที่ ${fc.s.riskScore}/100` : 'ปิดเคสแล้ว — ติดตามห่าง ๆ'}</p>
        <p className="mt-0.5 text-[13.5px] text-ink-muted">ประวัติทั้งหมดยังอยู่ — เปิดเคสอีกครั้งได้โดยไม่เริ่มใหม่</p>
        {mayAct && (
          <button type="button" onClick={onReopen} className="mt-3 rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink">
            เปิดเคสอีกครั้ง
          </button>
        )}
      </section>
    )
  return null
}

/** 2. สิ่งที่ครูพบ — ข้อมูลหลัก สำคัญกว่า AI */
function Observations({
  s,
  obs,
  mayAct,
  onAdd,
  onEdit,
  onResolve,
}: {
  s: FollowCase['s']
  obs: Observation[]
  mayAct: boolean
  onAdd: (text: string) => void
  onEdit: (id: string, text: string) => void
  onResolve: (o: Observation) => void
}) {
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const active = obs.filter((o) => !o.resolvedTs)
  const resolved = obs.filter((o) => o.resolvedTs)
  const hints = observationHints(s, obs)
  const fmt = (ts: number) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <SectionTitle
        right={
          mayAct && !adding ? (
            <button type="button" onClick={() => setAdding(true)} className="rounded-xl border border-brand-300 px-3.5 py-2 text-[14px] font-semibold text-brand-700">
              + เพิ่มสิ่งที่พบ
            </button>
          ) : undefined
        }
      >
        สิ่งที่ครูพบ
      </SectionTitle>
      {active.length ? (
        <ul className="space-y-2">
          {active.map((o) => (
            <li key={o.id} className="rounded-xl bg-surface-muted/50 px-3.5 py-2.5">
              {editing === o.id ? (
                <div className="flex gap-2">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} className={inputCls} aria-label="แก้ไขสิ่งที่พบ" />
                  <button
                    type="button"
                    onClick={() => {
                      if (draft.trim()) onEdit(o.id, draft.trim())
                      setEditing(null)
                    }}
                    className="shrink-0 rounded-xl bg-brand-500 px-4 text-[14px] font-semibold text-white"
                  >
                    บันทึก
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="shrink-0 rounded-xl border border-surface-border px-3 text-[14px] text-ink">
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[15px] leading-snug text-ink">• {o.text}</p>
                  <p className="mt-0.5 flex flex-wrap gap-3 text-[12.5px] text-ink-faint">
                    <span>
                      {fmt(o.ts)} · {o.by}
                    </span>
                    {mayAct && (
                      <>
                        <button type="button" onClick={() => { setEditing(o.id); setDraft(o.text) }} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                          แก้ไข
                        </button>
                        <button type="button" onClick={() => onResolve(o)} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                          คลี่คลายแล้ว
                        </button>
                      </>
                    )}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-muted">ยังไม่มีสิ่งที่ครูบันทึก — สิ่งที่ครูเห็นเองคือข้อมูลที่สำคัญที่สุด และ AI จะใช้ประกอบคำแนะนำ</p>
      )}
      {s.guidanceNote && <p className="mt-2 text-[13.5px] text-ink-muted">บันทึกเดิมในระบบ: “{s.guidanceNote}”</p>}

      {adding && (
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="เช่น นักเรียนเริ่มไม่พูดคุยกับเพื่อน"
            className={inputCls}
            aria-label="สิ่งที่พบ"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim().length >= 3) {
                onAdd(text.trim())
                setText('')
                setAdding(false)
              }
            }}
          />
          <MicButton onText={(v) => setText((x) => (x ? `${x} ${v}` : v))} />
          <button
            type="button"
            disabled={text.trim().length < 3}
            onClick={() => {
              onAdd(text.trim())
              setText('')
              setAdding(false)
            }}
            className="shrink-0 rounded-xl bg-brand-500 px-4 text-[14.5px] font-semibold text-white disabled:opacity-40"
          >
            บันทึก
          </button>
        </div>
      )}
      {mayAct && hints.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-surface-border px-3.5 py-3">
          <p className="text-[13px] text-ink-muted">ข้อมูลในระบบบอกว่า — ตรงกับที่ครูเห็นไหม? กดเพื่อยืนยันเป็นสิ่งที่ครูพบ</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hints.map((h) => (
              <button key={h} type="button" onClick={() => onAdd(h)} className="rounded-full border border-surface-border bg-white px-3.5 py-2 text-[13.5px] text-ink">
                + {h}
              </button>
            ))}
          </div>
        </div>
      )}
      {resolved.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13.5px] font-semibold text-ink-muted">คลี่คลายแล้ว · {resolved.length}</summary>
          <ul className="mt-1.5 space-y-1 text-[14px] text-ink-muted">
            {resolved.map((o) => (
              <li key={o.id} className="line-through">
                {o.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** 3 + 4. ทำไมต้องดูตอนนี้ → สิ่งที่ต้องทำต่อ (เด่นที่สุดของหน้า) */
function NextStep({ fc, mayAct, onRun, onAlt, onAsk }: { fc: FollowCase; mayAct: boolean; onRun: () => void; onAlt: () => void; onAsk: () => void }) {
  return (
    <section className="rounded-3xl border-2 border-ink/80 bg-white p-4 sm:p-5">
      {fc.open && fc.reasons.length > 0 && (
        <div className="mb-3">
          <p className="text-[13.5px] font-semibold text-ink-muted">ต้องติดตามตอนนี้ เพราะ</p>
          <ul className="mt-1 space-y-0.5 text-[14.5px] text-ink">
            {fc.reasons.slice(0, 4).map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[13px] font-semibold text-ink-muted">สิ่งที่ต้องทำต่อ</p>
      <p className="mt-0.5 text-[20px] font-bold leading-snug text-ink">{fc.next.th}</p>
      <p className="mt-1 text-[14.5px] leading-snug text-ink-muted">เหตุผล: {fc.next.whyTh}</p>
      {mayAct && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={onRun} className="rounded-xl bg-brand-500 px-5 py-3.5 text-[15.5px] font-semibold text-white shadow-card">
            {fc.next.cta}
          </button>
          <button type="button" onClick={onAlt} className="rounded-xl border border-surface-border bg-white px-4 py-3 text-[14.5px] font-medium text-ink">
            ดูทางเลือกอื่น
          </button>
          <button type="button" onClick={onAsk} className="rounded-xl border border-surface-border bg-white px-4 py-3 text-[14.5px] font-medium text-ink">
            ถาม AI
          </button>
        </div>
      )}
    </section>
  )
}

/** 5–6, 16–17. แนวทางที่ AI เสนอ — ภาษาเสนอ ไม่สั่ง · บอกว่าใช้ข้อมูลอะไร · ครูเลือก */
function AiOptions({
  fc,
  obs,
  entries,
  mayAct,
  by,
  log,
  run,
}: {
  fc: FollowCase
  obs: Observation[]
  entries: CaseLogEntry[]
  mayAct: boolean
  by: string
  log: ReturnType<typeof useFollowCases>['log']
  run: (g: Go) => void
}) {
  const { push } = useToast()
  const [thinking, setThinking] = useState(true)
  const [all, setAll] = useState(false)
  const [adjust, setAdjust] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dismissing, setDismissing] = useState<string | null>(null)
  useEffect(() => {
    const id = window.setTimeout(() => setThinking(false), 500)
    return () => window.clearTimeout(id)
  }, [])
  const { options, alternative, basis } = useMemo(() => careOptions(fc, obs, entries), [fc, obs, entries])
  // ทางที่ครูปฏิเสธแล้วไม่เสนอซ้ำ — อ่านจากบันทึก จึงคงอยู่หลังรีโหลด
  const declined = new Set(entries.filter((e) => e.choice?.startsWith('dismiss:')).map((e) => e.choice!.slice(8)))
  const chosen = new Set(entries.filter((e) => /^(pick|adjust):/.test(e.choice ?? '')).map((e) => e.choice!.split(':')[1]))
  const live = options.filter((o) => !declined.has(o.key))
  const shown = all ? live : live.slice(0, 3)
  const add = (note: string, choice: string) => log.add({ childId: fc.s.id, by, date: isoIn(0), mode: 'note', note, choice })

  // ไม่บันทึก "ครูเลือกแนวทาง" ตอนกด — ถ้าครูกดแล้วยกเลิกนัด ไทม์ไลน์จะมีรายการลอย ๆ
  // สิ่งที่ครูทำจริง (นัด บันทึกผล ส่งต่อ) บันทึกตัวเองอยู่แล้ว
  const choose = (o: CareOption) => run(o.go)

  return (
    <section id="ai-options" className="scroll-mt-4 rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <img src={MASCOT} alt="" className="h-9 w-9 rounded-xl bg-surface-muted object-contain p-0.5" draggable={false} />
        <div>
          <h2 className="text-[16px] font-bold text-ink">แนวทางที่อาจช่วยได้</h2>
          <p className="text-[13px] text-ink-muted">AI เสนอทางเลือก — ครูเป็นผู้ตัดสินใจ</p>
        </div>
      </div>

      {thinking ? (
        <div className="mt-3 space-y-2" role="status">
          <p className="text-[13.5px] text-ink-muted">AI กำลังคิดทางเลือกจากข้อมูลล่าสุด…</p>
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          {alternative && (
            <p className="mt-3 rounded-xl border border-surface-border px-3.5 py-2.5 text-[14px] font-medium text-ink">
              แนวทางเดิมยังไม่ได้ผล — ติดต่อผู้ปกครองไม่สำเร็จแล้ว จึงลองเสนอทางอื่นที่ครูอาจยังไม่ได้ลอง
            </p>
          )}
          {live.length > 0 && <p className="mt-3 text-[14.5px] text-ink">
            จากข้อมูลล่าสุด อาจพิจารณา {Math.min(3, live.length)} แนวทาง{live.length > 3 && !all ? ` (มีอีก ${live.length - 3})` : ''}:
          </p>}
          <ol className="mt-2 space-y-2.5">
            {shown.map((o, i) => (
              <li key={o.key} className="rounded-2xl border border-surface-border p-3.5">
                <p className="text-[15.5px] font-bold text-ink">
                  {i + 1}. {o.th}
                  {chosen.has(o.key) && <span className="ml-2 text-[12.5px] font-semibold text-ink-muted">✓ ครูเลือกแล้ว</span>}
                </p>
                <p className="mt-1 text-[14px] text-ink">
                  <span className="text-ink-muted">เพราะ</span> {o.why}
                </p>
                <dl className="mt-1.5 grid gap-1 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold text-ink">ข้อดี: </dt>
                    <dd className="inline text-ink">{o.pros}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-ink">ข้อควรพิจารณา: </dt>
                    <dd className="inline text-ink">{o.cons}</dd>
                  </div>
                </dl>
                {adjust === o.key ? (
                  <div className="mt-2.5">
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className={textareaCls} aria-label="ปรับแนวทาง" />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          add(`ครูเลือกแนวทาง (ปรับเอง): ${draft.trim() || o.th}`, `adjust:${o.key}`)
                          setAdjust(null)
                          run(o.go)
                        }}
                        className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white"
                      >
                        ใช้แนวทางที่ปรับแล้ว
                      </button>
                      <button type="button" onClick={() => setAdjust(null)} className="rounded-xl border border-surface-border px-4 py-2.5 text-[14px] text-ink">
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : dismissing === o.key ? (
                  <div className="mt-2.5">
                    <p className="text-[13.5px] text-ink-muted">ไม่ใช้เพราะ</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {['ทำไปแล้ว', 'ไม่เหมาะกับครอบครัวนี้', 'ยังไม่ถึงเวลา', 'ครูมีวิธีอื่น'].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            add(`ไม่ใช้คำแนะนำ "${o.th}" — ${r}`, `dismiss:${o.key}`)
                            setDismissing(null)
                            push('รับทราบ — จะไม่เสนอแนวทางนี้ซ้ำ')
                          }}
                          className="rounded-full border border-surface-border bg-white px-3.5 py-2 text-[13.5px] text-ink"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  mayAct && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => choose(o)} className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white">
                        เลือกแนวทางนี้
                      </button>
                      <button type="button" onClick={() => { setAdjust(o.key); setDraft(o.th) }} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14px] font-medium text-ink">
                        ปรับแนวทาง
                      </button>
                      <button type="button" onClick={() => setDismissing(o.key)} className="rounded-xl px-3 py-2.5 text-[14px] font-medium text-ink-muted underline-offset-2 hover:underline">
                        ไม่ใช้คำแนะนำ
                      </button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ol>
          {live.length > 3 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[14px] font-semibold text-brand-700 underline">
              {all ? 'ย่อ' : `ดูทางเลือกอื่นอีก ${live.length - 3} ทาง`}
            </button>
          )}
          {!live.length && (
            <p className="mt-2 text-[14px] text-ink-muted">
              {fc.open ? 'ไม่มีข้อเสนอเพิ่ม — ครูปฏิเสธทุกแนวทางแล้ว หรือเคสนี้อยู่ในกำหนด' : 'เคสปิดแล้ว — AI จะเสนอแนวทางอีกครั้งถ้าความเสี่ยงกลับมา'}
            </p>
          )}
          {basis.length > 0 && (
            <div className="mt-3 rounded-xl bg-surface-muted/60 px-3.5 py-2.5">
              <p className="text-[13px] font-semibold text-ink-muted">AI แนะนำจากข้อมูลเหล่านี้</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13.5px] text-ink">
                {basis.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** 11. นัดหมาย / สิ่งที่จะทำต่อ */
function Appointments({ fc, entries, mayAct, onAdd, onLog }: { fc: FollowCase; entries: CaseLogEntry[]; mayAct: boolean; onAdd: () => void; onLog: () => void }) {
  const fus = entries
    .filter((e) => e.followUpDate && !e.followUpDone)
    .sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!) || (a.followUpTime ?? '').localeCompare(b.followUpTime ?? ''))
  const today = isoIn(0)
  const fmt = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <SectionTitle
        right={
          mayAct && fc.open ? (
            <button type="button" onClick={onAdd} className="rounded-xl border border-brand-300 px-3.5 py-2 text-[14px] font-semibold text-brand-700">
              + เพิ่มนัด
            </button>
          ) : undefined
        }
      >
        นัดหมาย / สิ่งที่จะทำต่อ
      </SectionTitle>
      {fus.length ? (
        <ul className="divide-y divide-surface-border">
          {fus.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <div className="w-16 shrink-0 text-center">
                <p className={`text-[15px] font-bold ${e.followUpDate! < today ? 'text-red-700' : 'text-ink'}`}>{fmt(e.followUpDate!)}</p>
                {e.followUpTime && <p className="text-[12.5px] text-ink-muted">{e.followUpTime}</p>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{e.followUpMethod ?? 'ติดตามผล'}</p>
                <p className="text-[13px] text-ink-muted">
                  ผู้รับผิดชอบ: {e.followUpOwner ?? e.by}
                  {e.followUpDate! < today ? ' · เลยวันนัดแล้ว' : e.followUpDate === today ? ' · วันนี้' : ''}
                </p>
              </div>
              {mayAct && e.followUpDate! <= today && (
                <button type="button" onClick={onLog} className="shrink-0 rounded-xl bg-brand-500 px-3.5 py-2 text-[14px] font-semibold text-white">
                  บันทึกผล
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-muted">ยังไม่มีนัด — ทุกครั้งที่บันทึกผล ระบบจะถามว่าจะติดตามครั้งถัดไปเมื่อไร</p>
      )}
    </section>
  )
}

/** 13. ผลล่าสุด — ผลจริงของการช่วยเหลือ ไม่ใช่สถานะระบบ */
function Outcome({ fc, entries }: { fc: FollowCase; entries: CaseLogEntry[] }) {
  // การมาเรียนมีส่วนของตัวเองด้านล่าง ไม่ซ้ำที่นี่
  const rows = latestOutcome(fc, entries).filter((r) => !r.th.startsWith('มาเรียน'))
  const last = entries.find((e) => e.result)
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <SectionTitle>ผลล่าสุด</SectionTitle>
      {last && (
        <p className="mb-2 text-[14px] text-ink">
          ครั้งล่าสุด ({last.date}): <span className="font-semibold">{last.note}</span>
        </p>
      )}
      <ul className="grid gap-1.5">
        {rows.map((r) => (
          <li key={r.th} className="flex items-start gap-2 text-[14.5px]">
            <span className={`mt-0.5 font-bold ${r.ok ? 'text-ink' : 'text-ink-faint'}`} aria-hidden>
              {r.ok ? '✓' : '○'}
            </span>
            <span className={r.ok ? 'text-ink' : 'text-ink-muted'}>{r.th}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 10. เป้าหมาย — AI เสนอ ครูแก้และยืนยัน */
function Goals({ s, goal, mayAct, onSave }: { s: FollowCase['s']; goal?: import('@/lib/caseLog').CareGoal; mayAct: boolean; onSave: (items: { text: string; done?: boolean }[], days: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<string[]>(() => goal?.items.map((i) => i.text) ?? suggestGoals(s))
  const [extra, setExtra] = useState('')
  const [manual, setManual] = useState<Record<number, boolean>>(() => Object.fromEntries((goal?.items ?? []).map((g, i) => [i, Boolean(g.done)])))

  // ยังไม่มีเป้าหมาย: แสดงข้อเสนอเป็นรายการอ่านง่าย กดใช้ได้ทันที — ฟอร์มแก้ไขเปิดเมื่อครูต้องการเท่านั้น
  if (!goal && !editing)
    return (
      <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
        <SectionTitle>เป้าหมายการช่วยเหลือ 30 วัน</SectionTitle>
        <p className="mb-2 text-[13.5px] text-ink-muted">AI เสนอจากข้อมูลของเด็กคนนี้ — ครูตัดสินใจว่าจะใช้หรือปรับ</p>
        <ul className="space-y-1 text-[15px] text-ink">
          {items.map((it) => (
            <li key={it}>• {it}</li>
          ))}
        </ul>
        {mayAct && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onSave(items.map((text) => ({ text })), 30)} className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white">
              ใช้เป้าหมายนี้
            </button>
            <button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-medium text-ink">
              แก้ไขก่อนใช้
            </button>
          </div>
        )}
      </section>
    )
  if (!goal || editing)
    return (
      <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
        <SectionTitle>เป้าหมายการช่วยเหลือ 30 วัน</SectionTitle>
        <p className="mb-2 text-[13.5px] text-ink-muted">แก้ ลบ หรือเพิ่มได้ แล้วกดยืนยัน</p>
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <input value={it} onChange={(e) => setItems((v) => v.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} aria-label={`เป้าหมายที่ ${i + 1}`} />
              <button type="button" onClick={() => setItems((v) => v.filter((_, j) => j !== i))} className="shrink-0 rounded-xl border border-surface-border px-3 text-[14px] text-ink-muted" aria-label="ลบเป้าหมาย">
                ลบ
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="เพิ่มเป้าหมายของครู" className={inputCls} />
          <button type="button" disabled={!extra.trim()} onClick={() => { setItems((v) => [...v, extra.trim()]); setExtra('') }} className="shrink-0 rounded-xl border border-brand-300 px-4 text-[14px] font-semibold text-brand-700 disabled:opacity-40">
            เพิ่ม
          </button>
        </div>
        {mayAct && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!items.some((x) => x.trim())}
              onClick={() => {
                onSave(items.filter((x) => x.trim()).map((text) => ({ text: text.trim() })), 30)
                setEditing(false)
              }}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white disabled:opacity-40"
            >
              ยืนยันเป้าหมาย
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-surface-border px-4 py-2.5 text-[14.5px] text-ink">
              ยกเลิก
            </button>
          </div>
        )}
      </section>
    )

  const met = goal.items.filter((g, i) => goalProgress(s, g.text).auto ?? manual[i]).length
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <SectionTitle
        right={
          mayAct ? (
            <button type="button" onClick={() => setEditing(true)} className="text-[14px] font-semibold text-brand-700 underline">
              แก้ไข
            </button>
          ) : undefined
        }
      >
        เป้าหมายการช่วยเหลือ
      </SectionTitle>
      <p className="mb-2 text-[13.5px] text-ink-muted">
        ถึง {goal.due} · ทำได้ {met}/{goal.items.length} ข้อ · ครูยืนยันโดย {goal.by}
      </p>
      <ul className="space-y-1.5">
        {goal.items.map((g, i) => {
          const p = goalProgress(s, g.text)
          const done = p.auto ?? Boolean(manual[i])
          return (
            <li key={i} className="flex items-start gap-2.5 text-[14.5px]">
              {p.auto === undefined ? (
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5"
                  checked={done}
                  disabled={!mayAct}
                  onChange={(e) => {
                    const m = { ...manual, [i]: e.target.checked }
                    setManual(m)
                    onSave(goal.items.map((x, j) => ({ text: x.text, done: m[j] })), Math.max(1, Math.round((new Date(goal.due).getTime() - Date.now()) / 86400000)))
                  }}
                  aria-label={g.text}
                />
              ) : (
                <span className={`mt-0.5 w-5 text-center font-bold ${done ? 'text-ink' : 'text-ink-faint'}`} aria-hidden>
                  {done ? '✓' : '○'}
                </span>
              )}
              <span className={done ? 'text-ink' : 'text-ink-muted'}>
                {g.text}
                {p.note && <span className="ml-1.5 text-[13px] text-ink-faint">({p.note} · ระบบวัดให้)</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function QuickNote({ onSave, inputRef }: { onSave: (t: string) => void; inputRef: React.RefObject<HTMLInputElement> }) {
  const [v, setV] = useState('')
  const save = () => {
    if (v.trim().length < 3) return
    onSave(v.trim())
    setV('')
  }
  return (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="เช่น วันนี้เด็กมาเรียน สีหน้าดีขึ้น แต่ยังไม่มีเงินค่าเดินทางพรุ่งนี้"
        className={inputCls}
        aria-label="บันทึกสั้น"
      />
      <MicButton onText={(x) => setV((p) => (p ? `${p} ${x}` : x))} />
      <button type="button" disabled={v.trim().length < 3} onClick={save} className="shrink-0 rounded-xl bg-brand-500 px-4 text-[14.5px] font-semibold text-white disabled:opacity-40">
        บันทึก
      </button>
    </div>
  )
}

/** 9. แนวโน้มความเสี่ยง — ตัวเลขสี่สัปดาห์ + ข้อสังเกตหนึ่งประโยค ไม่ใช่กราฟ */
function Trend({ fc }: { fc: FollowCase }) {
  const tr = riskTrend(fc.s)
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <SectionTitle>แนวโน้มความเสี่ยง</SectionTitle>
      <p className="mb-3 text-[15px] font-semibold text-ink">{tr.insight}</p>
      <ul className="space-y-1.5">
        {tr.points.map((p) => (
          <li key={p.label} className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-[14px]">
            <span className="text-ink-muted">{p.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
              <span className={`block h-full rounded-full ${p.score >= 85 ? 'bg-red-600' : 'bg-slate-400'}`} style={{ width: `${p.score}%` }} />
            </span>
            <span className="text-right font-bold tabular text-ink">{p.score}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 12. ทีมที่กำลังช่วย — เฉพาะคนที่เกี่ยวข้องจริง */
function Team({ fc, entries, me }: { fc: FollowCase; entries: CaseLogEntry[]; me: string }) {
  const team = caseTeam(fc, entries, me)
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <SectionTitle>ทีมที่กำลังช่วยเด็กคนนี้</SectionTitle>
      <ul className="grid gap-2 sm:grid-cols-2">
        {team.map((m) => (
          <li key={`${m.role}-${m.name}`} className="rounded-xl bg-surface-muted/50 px-3.5 py-2.5">
            <p className="text-[12.5px] text-ink-faint">{m.role}</p>
            <p className="text-[14.5px] font-semibold text-ink">
              {m.name}
              {m.note && <span className="ml-1 font-normal text-ink-muted">· {m.note}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 15. งานที่เกี่ยวข้อง — สถานะของงาน ไม่ใช่เมนูระบบ */
function Related({ fc }: { fc: FollowCase; entries?: CaseLogEntry[]; mayAct?: boolean; onVisit?: () => void }) {
  const nav = useNavigate()
  const openRefs = fc.refs.filter((r) => r.bucket !== 'done')
  // นัดหมายและการเยี่ยมบ้านมีส่วนของตัวเองบนหน้านี้แล้ว — ที่นี่เหลือเฉพาะงานที่อยู่หน้าอื่น
  const rows: { k: string; v: string; cta?: string; go?: () => void }[] = [
    { k: 'แผนช่วยเหลือ', v: fc.hasPlan ? 'มีแผนแล้ว' : 'ยังไม่มี', cta: fc.hasPlan ? 'ดูแผน' : 'สร้างแผน', go: () => nav(`/plan?child=${fc.s.id}`) },
    {
      k: 'การส่งต่อ',
      v: openRefs.length ? `${openRefs.length} รายการ · ${openRefs[0].next.th}` : fc.refs.length ? `ปิดแล้ว ${fc.refs.length} รายการ` : 'ยังไม่มี',
      cta: openRefs.length ? 'ดูการส่งต่อ' : 'พิจารณาส่งต่อ',
      go: () => nav(openRefs[0] ? `/referral?ref=${openRefs[0].id}` : `/referral?child=${fc.s.id}`),
    },
  ]
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <SectionTitle>แผนและการส่งต่อ</SectionTitle>
      <ul className="divide-y divide-surface-border">
        {rows.map((r) => (
          <li key={r.k} className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink-faint">{r.k}</p>
              <p className="text-[14.5px] font-medium text-ink">{r.v}</p>
            </div>
            {r.cta && (
              <button type="button" onClick={r.go} className="shrink-0 rounded-xl border border-surface-border px-3.5 py-2 text-[14px] font-semibold text-brand-700">
                {r.cta}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** ข้อมูลเพิ่มเติม — พับไว้ท้ายหน้า ครูเปิดดูเมื่อต้องการ */
function MoreInfo({ fc, t }: { fc: FollowCase; th: boolean; t: (k: string) => string }) {
  const s = fc.s
  const rows: [string, string][] = [
    ['ผู้ดูแล', s.master.parentRelationName],
    ['รายได้ครอบครัว', `${s.master.parentSalary.toLocaleString('th-TH')} บาท/เดือน`],
    ['การเดินทาง', `${s.master.timeDt} นาที · ${s.master.journeyTypeName}`],
    ['กลุ่มด้อยโอกาส', s.master.disadvantaged.join(', ') || '—'],
    ['ความยินยอม (PDPA)', s.consent === 'granted' ? 'ยินยอมแล้ว' : s.consent === 'pending' ? 'กำลังรอ' : 'ยังไม่ยินยอม'],
    ['สาเหตุตามข้อมูล', s.causeKeys.map((k) => t(`cause.${k}`)).join(' · ')],
  ]
  const subs: [string, number][] = [
    ['การมาเรียน', s.attendanceRisk],
    ['การเรียน', s.academicRisk],
    ['พฤติกรรม', s.behaviorRisk],
    ['ครอบครัว', s.familyRisk],
    ['สุขภาวะ', s.wellbeingRisk],
    ['ผู้ปกครอง', s.parentRisk],
  ]
  return (
    <details className="group rounded-3xl border border-surface-border bg-white px-4 py-3 sm:px-5">
      <summary className="cursor-pointer list-none py-1 text-[16px] font-bold text-ink marker:hidden">ข้อมูลเพิ่มเติม ▾</summary>
      <dl className="mt-2 grid gap-2.5 text-[14px] sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12.5px] text-ink-faint">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-1.5 mt-4 text-[13.5px] font-semibold text-ink-muted">องค์ประกอบความเสี่ยง (0–100 · สูง = เสี่ยงมาก)</p>
      <ul className="grid gap-1.5 pb-2 sm:grid-cols-2">
        {subs.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[80px_1fr_32px] items-center gap-2 text-[13.5px]">
            <span className="text-ink-muted">{k}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full rounded-full bg-slate-400" style={{ width: `${v}%` }} />
            </span>
            <span className="text-right font-semibold tabular text-ink">{v}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
