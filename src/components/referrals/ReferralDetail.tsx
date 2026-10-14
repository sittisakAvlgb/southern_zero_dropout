import { useMemo, useState } from 'react'
import type { Student } from '@/types'
import type { User } from '@/auth/roles'
import { NEED_TO_KIND } from '@/data/agencies'
import { suggestAgencies } from '@/lib/planOps'
import type { OutcomeKey, RefEvent } from '@/lib/caseLog'
import { useToast } from '@/components/ui/Toast'
import { IconAgency, IconUser } from '@/components/icons'
import {
  ACK_STEPS,
  ACTION_TH,
  crossTimeline,
  fmtTs,
  OUTCOME,
  SCOPE_OPTIONS,
  sharePreview,
  STAGE_TH,
  type QuickAction,
  type RefCase,
} from '@/lib/refOps'
import { byOf, type Log } from './useRefCases'
import { BucketBadge, Chips, ConsentBadge, Drawer, GhostBtn, isoIn, Label, PrimaryBtn, Section, SlaText, SLA_COLOR, textareaCls } from './ui'
import { ConsentForm, ConsentSummary } from './CreateReferral'

type Sheet = null | 'contact' | 'escalate' | 'reassign' | 'followUp' | 'sendInfo' | 'review' | 'close' | 'consent'

const ESC_TH = { 1: 'แจ้งเตือนหน่วยงาน', 2: 'แจ้งหัวหน้าหน่วยงาน', 3: 'แจ้งผู้บริหารระดับจังหวัด' } as const

/**
 * รายละเอียดการส่งต่อหนึ่งรายการ — ตอบให้ได้ภายในจอแรก:
 * ตอนนี้อยู่ที่ใคร · เกินกำหนดไหม · ต้องทำอะไรต่อ
 * ส่วนที่เหลือ (ผู้รับผิดชอบ ความยินยอม ข้อมูลที่ส่ง timeline) อยู่ถัดลงมา
 */
export function ReferralDetail({
  r,
  siblings,
  student,
  log,
  user,
  mayAct,
  onClose,
  onOpen,
  onReferMore,
}: {
  r: RefCase
  /** การส่งต่ออื่นของเด็กคนเดียวกัน */
  siblings: RefCase[]
  student?: Student
  log: Log
  user: User | null
  mayAct: boolean
  onClose: () => void
  onOpen: (id: string) => void
  onReferMore: () => void
}) {
  const { push } = useToast()
  const by = byOf(user)
  const [sheet, setSheet] = useState<Sheet>(null)
  const ev = (e: Omit<RefEvent, 'ts' | 'by'> & { by?: string }, toast?: string) => {
    log.addRefEvent(r.id, { ts: Date.now(), by, ...e })
    if (toast) push(toast)
  }
  const history = log.entries.filter((e) => e.childId === r.childId).length + (student?.timeline.length ?? 0)
  const tl = useMemo(
    () => crossTimeline([r, ...siblings], log.entries.filter((e) => e.childId === r.childId), student),
    [r, siblings, log.entries, student],
  )
  const [allTl, setAllTl] = useState(false)
  const [more, setMore] = useState<null | 'consent' | 'data'>(null)
  const consentOk = r.consent.state === 'granted' || r.consent.state === 'expiring'

  const act = (a: QuickAction) => {
    if (a === 'remind') return ev({ type: 'reminded' }, `ส่งการแจ้งเตือนถึง ${r.toName} แล้ว`)
    if (a === 'referMore') return onReferMore()
    setSheet(a === 'review' ? 'review' : a === 'consent' ? 'consent' : (a as Sheet))
  }

  const head = (
    <>
      <p className="truncate text-[19px] font-bold leading-tight text-ink">{r.childName}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="font-semibold text-ink">{r.needTh}</span>
        <span className="text-ink-muted">→ {r.toName}</span>
        <BucketBadge b={r.bucket} />
        {r.urgent && <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">เร่งด่วน</span>}
      </div>
    </>
  )

  if (sheet)
    return (
      <Drawer label={r.childName} head={head} onBack={() => setSheet(null)} onClose={onClose}>
        <ActionSheet sheet={sheet} r={r} student={student} log={log} by={by} ev={ev} done={() => setSheet(null)} onReferMore={onReferMore} push={push} />
      </Drawer>
    )

  return (
    <Drawer label={r.childName} head={head} onClose={onClose}>
      {/* ── สถานะตอนนี้: ความคืบหน้า + ขั้นถัดไป + SLA ในการ์ดเดียว ─────── */}
      <section className={`rounded-2xl border-2 p-4 ${r.sla.level === 'breach' ? 'border-red-200' : 'border-surface-border'}`}>
        <ProgressStrip r={r} />
        <p className="mt-3 text-[13px] font-semibold text-ink-muted">ขั้นถัดไป</p>
        <p className="mt-0.5 text-[18px] font-bold leading-snug text-ink">{r.next.th}</p>
        {r.next.whyTh && <p className="mt-1 text-[14px] leading-snug text-ink-muted">{r.next.whyTh}</p>}
        {r.sla.clock !== 'none' && (
          <p className="mt-2 text-[14px]">
            <SlaText sla={r.sla} />
            <span className="text-ink-muted">
              {' · '}
              {r.sla.rule}
              {r.escalated > 0 && ` · Escalate แล้วระดับ ${r.escalated}`}
            </span>
          </p>
        )}
        {mayAct && r.stage === 'draft' && consentOk && (
          <div className="mt-3">
            <PrimaryBtn
              onClick={() => {
                const now = Date.now()
                ev({ type: 'sent', by: r.fromName })
                log.addRefEvent(r.id, { type: 'received', ts: now + 1, by: 'ระบบ' })
                push(`ส่งต่อสำเร็จ และ${r.toName}ได้รับแจ้งแล้ว`)
              }}
            >
              ได้รับความยินยอมแล้ว — ส่งต่อเลย
            </PrimaryBtn>
          </div>
        )}
        {mayAct && r.next.actions.length > 0 && !(r.stage === 'draft' && consentOk) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {r.next.actions.map((a, i) => (
              <button
                key={a}
                type="button"
                onClick={() => act(a)}
                className={
                  i === 0
                    ? 'flex-1 rounded-xl bg-brand-500 px-4 py-3 text-[14.5px] font-semibold text-white shadow-card sm:flex-none'
                    : 'flex-1 rounded-xl border border-surface-border bg-white px-4 py-3 text-[14.5px] font-medium text-ink sm:flex-none'
                }
              >
                {ACTION_TH[a]}
              </button>
            ))}
          </div>
        )}
        {!mayAct && <p className="mt-2 text-[13px] text-ink-muted">บัญชีนี้ดูได้อย่างเดียว</p>}
        {r.outcome && (
          <div className="mt-3 rounded-xl bg-surface-muted/60 px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-ink-muted">ผลจากหน่วยงาน</p>
            <p className={`text-[15px] font-bold ${r.outcome.ok === 'no' ? 'text-red-700' : 'text-ink'}`}>
              {r.outcome.ok === 'ok' ? '✓' : r.outcome.ok === 'warn' ? '⚠' : '✕'} {r.outcome.th}
            </p>
            <p className="text-[13px] text-ink-muted">{r.outcome.reviewed ? 'ครูประเมินและปิดการส่งต่อแล้ว' : 'รอครูประเมินว่าช่วยเด็กได้จริงไหม'}</p>
          </div>
        )}
      </section>

      {/* ── ความคืบหน้า: ตารางขั้น พร้อมเวลา ─────────────────────── */}
      <Section title="ความคืบหน้าการรับเรื่อง">
        <AckStepper r={r} />
      </Section>

      {/* ── คน: การ์ดคนละช่อง ───────────────────────────────── */}
      <Section title="ใครรับผิดชอบ">
        <div className="grid gap-2 sm:grid-cols-2">
          <Person role="เจ้าของเคส" name={r.caseOwner} />
          <Person role="ผู้ส่งต่อ" name={r.referralOwner} sub={r.fromName} />
          <Person role="หน่วยงานผู้รับ" name={r.toName} sub={r.toAgency?.contact} agency />
          <Person role="เจ้าหน้าที่ผู้รับผิดชอบ" name={r.officer ?? 'ยังไม่ได้มอบหมาย'} muted={!r.officer} />
        </div>
        <p className="mt-2 text-[13.5px] text-ink">
          <span className="font-semibold">รูปแบบ:</span>{' '}
          {r.handoff === 'joint' ? 'A · ช่วยเหลือร่วมกัน — โรงเรียนยังเป็นเจ้าของเคส' : 'B · ส่งมอบความรับผิดชอบหลัก — โรงเรียนติดตามผล'}
        </p>
      </Section>

      {/* ── ความยินยอม + ข้อมูลที่ส่ง: บรรทัดสรุป รายละเอียดกดดู ─────── */}
      <Section title="ความยินยอมและข้อมูลที่ส่ง">
        <div className="rounded-2xl border border-surface-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ConsentBadge state={r.consent.state} daysLeft={r.consent.daysLeft} />
            {r.consent.record && (
              <span className="text-[14px] text-ink">
                {r.consent.record.giver} · หมดอายุ {r.consent.record.expires}
                {r.consent.daysLeft !== undefined && r.consent.daysLeft >= 0 && <span className="text-ink-muted"> (อีก {r.consent.daysLeft} วัน)</span>}
              </span>
            )}
          </div>
          <p className="mb-1.5 mt-3 text-[13px] font-semibold text-ink-muted">หน่วยงานเห็นข้อมูล</p>
          <div className="flex flex-wrap gap-1.5">
            {SCOPE_OPTIONS.map((o) => {
              const on = r.share.includes(o.key)
              return (
                <span key={o.key} className={`rounded-lg px-2.5 py-1 text-[13.5px] ${on ? 'bg-surface-muted font-medium text-ink' : 'text-ink-faint line-through'}`}>
                  {on ? '✓ ' : ''}
                  {o.th.split(' (')[0]}
                </span>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[14px] font-semibold">
            <button type="button" onClick={() => setMore((v) => (v === 'consent' ? null : 'consent'))} className="text-brand-700">
              {more === 'consent' ? 'ซ่อนรายละเอียดความยินยอม' : 'รายละเอียดความยินยอม'}
            </button>
            <button type="button" onClick={() => setMore((v) => (v === 'data' ? null : 'data'))} className="text-brand-700">
              {more === 'data' ? 'ซ่อนข้อมูลที่ส่ง' : 'ดูข้อมูลที่ส่งจริง'}
            </button>
            {mayAct && (r.consent.state !== 'granted' || r.stage === 'draft') && (
              <button type="button" onClick={() => setSheet('consent')} className="text-brand-700">
                บันทึกความยินยอม
              </button>
            )}
          </div>
          {more === 'consent' && (
            <div className="mt-3">
              <ConsentSummary c={r.consent} />
            </div>
          )}
          {more === 'data' && (
            <ul className="mt-3 divide-y divide-surface-border rounded-xl border border-surface-border">
              {SCOPE_OPTIONS.filter((o) => r.share.includes(o.key)).map((o) => (
                <li key={o.key} className="px-3.5 py-2.5">
                  <p className="text-[13px] font-semibold text-ink-muted">{o.th}</p>
                  <p className="text-[14px] text-ink">{sharePreview(student, o.key, r.reason, history)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* ── หลายหน่วยงาน เคสเดียว ─────────────── */}
      {siblings.length > 0 && (
        <Section title={`ส่งต่อหน่วยงานอื่นของ ${r.childName} ด้วย · ${siblings.length}`}>
          <ul className="divide-y divide-surface-border rounded-2xl border border-surface-border">
            {siblings.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onOpen(x.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-ink">
                      {x.needTh} → {x.toName}
                    </p>
                    <p className="text-[13px]">
                      <BucketBadge b={x.bucket} /> <SlaText sla={x.sla} className="text-[13px]" />
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold text-brand-700">เปิด</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── timeline ข้ามหน่วยงาน — จุดสีเดียว ใครทำบอกด้วยคำ ─────── */}
      <Section title="Timeline ข้ามหน่วยงาน">
        <ol className="relative ml-2 border-l-2 border-surface-border">
          {(allTl ? tl : tl.slice(0, 8)).map((x, i) => (
            <li key={i} className="relative pb-3 pl-4">
              <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white" style={{ background: i === 0 ? '#0f172a' : '#94a3b8' }} />
              <p className="text-[12.5px] text-ink-faint">
                {fmtTs(x.ts)} · {x.who === 'school' ? 'โรงเรียน' : x.who === 'agency' ? 'หน่วยงาน' : 'ระบบ'} · {x.by}
              </p>
              <p className={`text-[14px] leading-snug ${x.refId && x.refId !== r.id ? 'text-ink-muted' : 'text-ink'}`}>{x.th}</p>
            </li>
          ))}
        </ol>
        {tl.length > 8 && (
          <button type="button" onClick={() => setAllTl((v) => !v)} className="text-[14px] font-semibold text-brand-700 underline">
            {allTl ? 'ย่อ' : `ดูทั้งหมด ${tl.length} รายการ`}
          </button>
        )}
      </Section>

      {mayAct && <AgencySimulator r={r} log={log} />}
    </Drawer>
  )
}

/** แถบความคืบหน้าแบบย่อ 8 จุด + ชื่อขั้นปัจจุบัน — เห็นภาพรวมในบรรทัดเดียว */
function ProgressStrip({ r }: { r: RefCase }) {
  const done = ACK_STEPS.filter((x) => r.events.some((e) => e.type === x.ev)).length
  const branch = r.stage === 'needInfo' || r.stage === 'returned'
  return (
    <div>
      <div className="flex gap-1" aria-hidden>
        {ACK_STEPS.map((x, i) => (
          <span key={x.stage} className={`h-1.5 flex-1 rounded-full ${i < done ? 'bg-brand-500' : 'bg-surface-muted'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-[13px] text-ink-muted">
        ขั้นที่ {Math.min(done, ACK_STEPS.length)} จาก {ACK_STEPS.length} · <span className="font-semibold text-ink">{branch ? STAGE_TH[r.stage] : STAGE_TH[r.stage] ?? ''}</span>
      </p>
    </div>
  )
}

function Person({ role, name, sub, muted, agency }: { role: string; name: string; sub?: string; muted?: boolean; agency?: boolean }) {
  // ไอคอนแทนตัวอักษรแรก — ชื่อไทยมีคำนำหน้า (ครู/คุณ) ตัวแรกจึงไม่ใช่ชื่อคน
  return (
    <div className="flex items-start gap-3 rounded-xl border border-surface-border px-3.5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted text-ink-muted" aria-hidden>
        {agency ? <IconAgency width={17} height={17} /> : <IconUser width={17} height={17} />}
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] text-ink-muted">{role}</p>
        <p className={`text-[14.5px] leading-snug ${muted ? 'text-ink-muted' : 'font-semibold text-ink'}`}>{name}</p>
        {sub && <p className="text-[13px] leading-snug text-ink-muted">{sub}</p>}
      </div>
    </div>
  )
}

/** ขั้นการรับเรื่องเป็นตาราง (จอใหญ่ 4 คอลัมน์ มือถือ 2) — ทุกขั้นมีเวลาประทับ */
function AckStepper({ r }: { r: RefCase }) {
  const at = (t: string) => [...r.events].reverse().find((e) => e.type === t)
  const reached = ACK_STEPS.findIndex((x) => x.stage === r.stage)
  const branch = r.stage === 'needInfo' || r.stage === 'returned'
  return (
    <div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACK_STEPS.map((x, i) => {
          const e = at(x.ev)
          const done = Boolean(e)
          const current = !branch && i === reached
          return (
            <li key={x.stage} className={`rounded-xl border px-3 py-2.5 ${current ? 'border-brand-500 bg-brand-50' : 'border-surface-border'}`}>
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold"
                style={{ background: done ? '#0f172a' : current ? '#2f66f6' : '#e2e8f0', color: done || current ? '#fff' : '#64748b' }}
                aria-hidden
              >
                {done ? '✓' : i + 1}
              </span>
              <p className={`mt-1.5 text-[13.5px] leading-snug ${done || current ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{x.th}</p>
              {x.stage === 'accepted' && e?.officer && <p className="text-[12.5px] text-ink-muted">{e.officer}</p>}
              <p className="text-[12.5px] text-ink-muted">{e ? fmtTs(e.ts) : current ? 'ตอนนี้' : '—'}</p>
            </li>
          )
        })}
      </ol>
      {branch && <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-[14px] font-semibold text-ink">↳ {STAGE_TH[r.stage]}</p>}
    </div>
  )
}

function ActionSheet({
  sheet,
  r,
  student,
  log,
  by,
  ev,
  done,
  onReferMore,
  push,
}: {
  sheet: Exclude<Sheet, null>
  r: RefCase
  student?: Student
  log: Log
  by: string
  ev: (e: Omit<RefEvent, 'ts' | 'by'> & { by?: string }, toast?: string) => void
  done: () => void
  onReferMore: () => void
  push: (m: string) => void
}) {
  const [note, setNote] = useState('')
  const [days, setDays] = useState<'3' | '7' | '14'>('7')
  const nextLevel = Math.min(3, Math.max(r.escalated + 1, r.escalation || 1)) as 1 | 2 | 3
  const alts = useMemo(
    () => suggestAgencies(student, r.provinceKey, [NEED_TO_KIND[r.need]]).filter((x) => x.agency.id !== r.toAgencyId).slice(0, 6),
    [student, r.provinceKey, r.need, r.toAgencyId],
  )
  const [pick, setPick] = useState<string>()

  if (sheet === 'consent' && student)
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">บันทึกความยินยอม</h3>
        <ConsentForm
          student={student}
          agency={r.toAgency}
          prev={r.consent.record}
          onSave={(rec) => {
            log.saveConsent(r.childId, rec)
            push(rec.status === 'granted' ? 'บันทึกความยินยอมแล้ว' : 'บันทึกแล้ว')
            done()
          }}
        />
      </>
    )

  if (sheet === 'contact')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">ติดต่อ {r.toName}</h3>
        <p className="mt-2 rounded-xl bg-surface-muted px-3.5 py-3 text-[15px] text-ink">
          {r.toAgency?.contact ?? '—'}
          {r.officer && <span className="block text-[14px] text-ink-muted">เจ้าหน้าที่: {r.officer}</span>}
        </p>
        <Label>คุยแล้วได้ความว่าอย่างไร</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={textareaCls} placeholder="เช่น เจ้าหน้าที่รับปากจะรับเรื่องภายในวันนี้" />
        <div className="mt-4">
          <PrimaryBtn onClick={() => { ev({ type: 'contacted', note: note.trim() || undefined }, 'บันทึกการติดต่อแล้ว'); done() }}>บันทึกการติดต่อ</PrimaryBtn>
        </div>
      </>
    )

  if (sheet === 'escalate')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">Escalate ระดับ {nextLevel}</h3>
        <p className="mt-1 text-[14px] text-ink-muted">
          {nextLevel === 1 ? 'เกิน SLA' : nextLevel === 2 ? 'ค้างเกิน 48 ชม.' : 'ค้างเกิน 72 ชม.'} — ระบบจะ{ESC_TH[nextLevel]} พร้อมสรุปเคสและเวลาที่ค้าง
        </p>
        <div className="mt-3 rounded-xl bg-surface-muted px-3.5 py-3 text-[14px] text-ink">
          “การส่งต่อ {r.needTh} ของ {r.childName} ส่งถึง {r.toName} เมื่อ {r.sentTs ? fmtTs(r.sentTs) : '—'} · <SlaText sla={r.sla} />”
        </div>
        <Label>หมายเหตุเพิ่มเติม (ไม่บังคับ)</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaCls} />
        <div className="mt-4">
          <PrimaryBtn
            onClick={() => {
              ev({ type: 'escalated', level: nextLevel, note: note.trim() || ESC_TH[nextLevel] }, `Escalate ระดับ ${nextLevel} แล้ว`)
              done()
            }}
          >
            ยืนยัน Escalate
          </PrimaryBtn>
        </div>
      </>
    )

  if (sheet === 'reassign')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">เปลี่ยนหน่วยงาน</h3>
        <p className="mt-1 text-[14px] text-ink-muted">{r.toName} จะถูกแจ้งว่าเรื่องถูกย้าย เวลา SLA เริ่มนับใหม่ที่หน่วยงานใหม่ · ความยินยอมเดิมใช้ต่อได้ถ้าครอบคลุม</p>
        <div className="mt-3 space-y-1.5">
          {alts.map(({ agency: a, why }) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setPick(a.id)}
              aria-pressed={pick === a.id}
              className="w-full rounded-xl border px-3.5 py-3 text-left"
              style={{ borderColor: pick === a.id ? '#2f66f6' : '#e2e8f0', background: pick === a.id ? '#eef3ff' : '#fff' }}
            >
              <p className="text-[14.5px] font-semibold text-ink">{a.th}</p>
              <p className="text-[12.5px] text-ink-muted">
                {why ? `${why} · ` : ''}รับเรื่องเฉลี่ย {Math.round(a.avgAcceptHours)} ชม.
              </p>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <PrimaryBtn
            disabled={!pick}
            onClick={() => {
              const a = alts.find((x) => x.agency.id === pick)!.agency
              const now = Date.now()
              log.addRefEvent(r.id, { type: 'reassigned', ts: now, by, toAgencyId: a.id, toAgencyName: a.th })
              log.addRefEvent(r.id, { type: 'received', ts: now + 1, by: 'ระบบ' })
              push(`ย้ายการส่งต่อไป ${a.th} แล้ว`)
              done()
            }}
          >
            ย้ายไปหน่วยงานนี้
          </PrimaryBtn>
        </div>
      </>
    )

  if (sheet === 'followUp')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">นัดติดตามกับ {r.toName}</h3>
        <Label>อีกกี่วัน</Label>
        <Chips items={[{ key: '3' as const, th: '3 วัน' }, { key: '7' as const, th: '7 วัน' }, { key: '14' as const, th: '14 วัน' }]} value={days} onPick={setDays} />
        <div className="mt-4">
          <PrimaryBtn
            onClick={() => {
              const date = isoIn(Number(days))
              ev({ type: 'followUp', date }, `นัดติดตามวันที่ ${date} แล้ว — จะขึ้นในงานของคุณวันนั้น`)
              log.add({ childId: r.childId, by, date: isoIn(0), mode: 'note', note: `นัดติดตามการส่งต่อ ${r.toName}`, followUpDate: date, refId: r.id })
              done()
            }}
          >
            บันทึกนัด
          </PrimaryBtn>
        </div>
      </>
    )

  if (sheet === 'sendInfo')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">ส่งข้อมูลเพิ่มเติมให้ {r.toName}</h3>
        <p className="mt-2 rounded-xl bg-purple-50 px-3.5 py-3 text-[14px] text-ink">
          หน่วยงานขอ: {[...r.events].reverse().find((e) => e.type === 'needInfo')?.note ?? '—'}
        </p>
        <Label>ข้อมูลที่ส่ง</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={textareaCls} placeholder="เช่น แนบสำเนาทะเบียนบ้านแล้ว เบอร์ผู้ปกครองล่าสุด 08x-xxx-xxxx" />
        <p className="mt-1 text-[12.5px] text-ink-muted">ส่งได้เฉพาะข้อมูลในขอบเขตความยินยอม</p>
        <div className="mt-4">
          <PrimaryBtn
            disabled={note.trim().length < 4}
            onClick={() => {
              ev({ type: 'infoSent', note: note.trim() }, 'ส่งข้อมูลเพิ่มเติมแล้ว — นาฬิกา SLA เดินต่อ')
              done()
            }}
          >
            ส่งข้อมูล
          </PrimaryBtn>
        </div>
      </>
    )

  if (sheet === 'review')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">ประเมินผลการส่งต่อ</h3>
        <div className="mt-3 rounded-2xl border border-surface-border p-4">
          <p className="text-[13px] text-ink-muted">ผลจาก {r.toName}</p>
          <p className="text-[16px] font-bold text-ink">{r.outcome?.th ?? '—'}</p>
          {student && (
            <p className="mt-2 text-[14px] text-ink">
              ตอนนี้ {student.name}: มาเรียน {student.attendance[student.attendance.length - 1]?.rate ?? 0}% · ความเสี่ยง {student.riskScore}/100
            </p>
          )}
        </div>
        <p className="mt-4 text-[15px] font-semibold text-ink">การส่งต่อนี้ช่วยเด็กได้จริงไหม</p>
        <div className="mt-2 space-y-2">
          <PrimaryBtn
            onClick={() => {
              ev({ type: 'closed', note: 'ประเมินแล้ว ช่วยได้จริง' }, 'ปิดการส่งต่อแล้ว')
              done()
            }}
          >
            ✓ ช่วยได้ — ปิดการส่งต่อ
          </PrimaryBtn>
          <button
            type="button"
            onClick={() => {
              const date = isoIn(14)
              ev({ type: 'followUp', date, note: 'ผลยังไม่พอ ขอให้หน่วยงานเดิมดำเนินการต่อ' }, `ติดตามต่อ นัดดูผลวันที่ ${date}`)
              done()
            }}
            className="w-full rounded-xl border border-surface-border bg-white px-4 py-3.5 text-[15px] font-semibold text-ink"
          >
            ยังไม่พอ — ติดตามต่อกับหน่วยงานเดิม
          </button>
          <button
            type="button"
            onClick={() => {
              ev({ type: 'closed', note: 'ผลไม่พอ ส่งต่อหน่วยงานอื่นเพิ่ม' })
              onReferMore()
            }}
            className="w-full rounded-xl border border-surface-border bg-white px-4 py-3.5 text-[15px] font-semibold text-ink"
          >
            ส่งต่อหน่วยงานอื่นเพิ่ม
          </button>
        </div>
      </>
    )

  // close
  return (
    <>
      <h3 className="text-[18px] font-bold text-ink">ปิดการส่งต่อ</h3>
      <Label>เหตุผล</Label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={textareaCls} placeholder="เช่น ครอบครัวได้รับความช่วยเหลือจากช่องทางอื่นแล้ว" />
      <div className="mt-4 flex gap-2">
        <GhostBtn onClick={done}>ยกเลิก</GhostBtn>
        <PrimaryBtn onClick={() => { ev({ type: 'closed', note: note.trim() || undefined }, 'ปิดการส่งต่อแล้ว'); done() }}>ปิดการส่งต่อ</PrimaryBtn>
      </div>
    </>
  )
}

/** เดโมเท่านั้น — ไม่มีระบบหน่วยงานจริงให้ต่อ จึงให้กดแทนปลายทางเพื่อดูว่าครูจะเห็นอะไร
 *  ติดป้ายชัดว่าเป็นการจำลอง และพับไว้ไม่ให้ปนกับงานจริงของครู */
function AgencySimulator({ r, log }: { r: RefCase; log: Log }) {
  const [outcome, setOutcome] = useState<OutcomeKey>('granted')
  const add = (type: RefEvent['type'], extra: Partial<RefEvent> = {}) =>
    log.addRefEvent(r.id, { type, ts: Date.now(), by: r.officer ?? r.toName, ...extra })
  const btn = 'rounded-lg border border-dashed border-ink-faint bg-white px-3 py-2.5 text-[13.5px] font-medium text-ink'
  const st = r.stage
  return (
    <details className="mt-8 rounded-2xl border-2 border-dashed border-surface-border bg-surface-muted/40 px-4 py-3">
      <summary className="cursor-pointer text-[14px] font-semibold text-ink-muted">🧪 จำลองฝั่งหน่วยงานผู้รับ (สำหรับเดโมเท่านั้น)</summary>
      <p className="mt-2 text-[13px] text-ink-muted">กดแทน {r.toName} เพื่อดูว่าหน้าจอของครูเปลี่ยนอย่างไร — ระบบจริงหน่วยงานจะกดจากฝั่งตัวเอง</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(st === 'sent' || st === 'received') && (
          <button type="button" className={btn} onClick={() => add('viewed', { by: r.toName })}>เจ้าหน้าที่เปิดดู</button>
        )}
        {(st === 'sent' || st === 'received' || st === 'viewed') && (
          <>
            <button type="button" className={btn} onClick={() => add('accepted', { by: r.toName, officer: 'คุณอามีนะห์ ส.' })}>รับเคส + มอบหมายเจ้าหน้าที่</button>
            <button type="button" className={btn} onClick={() => add('returned', { by: r.toName, note: 'ไม่อยู่ในอำนาจหน้าที่ แนะนำให้ส่ง อบต. ในพื้นที่' })}>ไม่รับเรื่อง</button>
          </>
        )}
        {st === 'accepted' && <button type="button" className={btn} onClick={() => add('started')}>เริ่มดำเนินการ</button>}
        {st === 'inProgress' && (
          <button type="button" className={btn} onClick={() => add('needInfo', { note: 'ขอสำเนาทะเบียนบ้านและเบอร์ผู้ปกครองล่าสุด' })}>ขอข้อมูลเพิ่ม</button>
        )}
        {(st === 'inProgress' || st === 'accepted') && (
          <>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeKey)} className="rounded-lg border border-surface-border bg-white px-2 py-2.5 text-[13.5px]" aria-label="ผลที่จะส่งกลับ">
              {(Object.keys(OUTCOME) as OutcomeKey[]).map((k) => (
                <option key={k} value={k}>{OUTCOME[k].th}</option>
              ))}
            </select>
            <button
              type="button"
              className={btn}
              onClick={() => {
                const now = Date.now()
                // ห้ามประทับเวลาอนาคต — เหตุการณ์ที่ครูกดตามมาจะเรียงก่อนแล้วถูกกลืน
                log.addRefEvent(r.id, { type: 'done', ts: now - 1, by: r.officer ?? r.toName })
                log.addRefEvent(r.id, { type: 'outcome', ts: now, by: r.officer ?? r.toName, outcome, note: OUTCOME[outcome].th })
              }}
            >
              เสร็จ + ส่งผลกลับ
            </button>
          </>
        )}
        {r.local && ['sent', 'received', 'viewed', 'accepted', 'inProgress'].includes(st) && (
          <>
            <button type="button" className={btn} onClick={() => log.shiftRef(r.id, 20)}>⏩ เลื่อนเวลา +20 ชม.</button>
            <button type="button" className={btn} onClick={() => log.shiftRef(r.id, 30)}>⏩ +30 ชม.</button>
          </>
        )}
      </div>
    </details>
  )
}
