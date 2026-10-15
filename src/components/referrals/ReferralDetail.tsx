import { useMemo, useState, type ReactNode } from 'react'
import type { Student } from '@/types'
import type { User } from '@/auth/roles'
import { NEED_TO_KIND } from '@/data/agencies'
import { suggestAgencies } from '@/lib/planOps'
import type { OutcomeKey, RefEvent, RefVia } from '@/lib/caseLog'
import { useToast } from '@/components/ui/Toast'
import {
  ACK_STEPS,
  ackIndex,
  ACTION_TH,
  crossTimeline,
  fmtTs,
  NEED_OUTCOME,
  OUTCOME,
  SCOPE_OPTIONS,
  sharePreview,
  STAGE_TH,
  VIA_TH,
  type QuickAction,
  type RefCase,
} from '@/lib/refOps'
import { byOf, type Log } from './useRefCases'
import { BucketBadge, Chips, ConsentBadge, Drawer, GhostBtn, inputCls, isoIn, Label, PrimaryBtn, Section, SlaText, SLA_COLOR, textareaCls } from './ui'
import { ConsentForm, ConsentSummary } from './CreateReferral'

type Sheet = null | 'update' | 'contact' | 'escalate' | 'reassign' | 'followUp' | 'sendInfo' | 'review' | 'close' | 'consent'

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
  const ev = (e: Omit<RefEvent, 'ts' | 'by'> & { by?: string; ts?: number }, toast?: string) => {
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
    if (a === 'referMore') return onReferMore()
    setSheet(a === 'review' ? 'review' : a === 'consent' ? 'consent' : (a as Sheet))
  }

  const head = (
    <>
      <p className="truncate text-[19px] font-bold leading-tight text-ink">{r.childName}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="font-semibold text-ink">{r.needTh}</span>
        <span className="text-ink-muted">→ {r.toName}</span>
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

  const sameOwner = r.caseOwner === r.referralOwner
  const sharedOpts = SCOPE_OPTIONS.filter((o) => r.share.includes(o.key))
  const slaTint = SLA_COLOR[r.sla.level]

  return (
    <Drawer label={r.childName} head={head} onClose={onClose}>
      {/* ── การ์ดสถานะ: สิ่งที่ต้องทำมาก่อน ความคืบหน้าเป็นบริบทอยู่ล่าง ─────────
          ครูเปิดมาเพื่อทำงาน — หัวเรื่องคือการกระทำ ป้ายเวลาบอกความเร่ง ขั้นทั้งห้าเป็นแถบเงียบ ๆ ด้านล่าง */}
      <section className={`overflow-hidden rounded-2xl border bg-white shadow-card ${r.sla.level === 'breach' ? 'border-red-200' : 'border-surface-border'}`}>
        <div className="px-4 pb-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold text-ink-muted">{r.next.actions.length > 0 || (r.stage === 'draft' && consentOk) ? 'ต้องทำต่อ' : 'สถานะ'}</p>
            {r.sla.clock !== 'none' && (
              <span className="rounded-full px-2.5 py-1 text-[13px] font-bold" style={{ background: `${slaTint}14`, color: slaTint }}>
                <SlaText sla={r.sla} />
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[19px] font-bold leading-snug text-ink">{r.next.th}</p>
          {r.next.whyTh && <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-muted">{r.next.whyTh}</p>}
          {r.escalated > 0 && <p className="mt-1 text-[13.5px] font-semibold text-ink">Escalate แล้วระดับ {r.escalated}</p>}

          {mayAct && r.stage === 'draft' && consentOk && (
            <div className="mt-4">
              <PrimaryBtn
                onClick={() => {
                  ev({ type: 'sent', by: r.fromName })
                  push(`บันทึกการส่งต่อแล้ว — แจ้ง ${r.toName} แล้วกลับมาอัปเดตเมื่อหน่วยงานรับเรื่อง`)
                }}
              >
                ได้รับความยินยอมแล้ว — ส่งต่อเลย
              </PrimaryBtn>
            </div>
          )}
          {mayAct && r.next.actions.length > 0 && !(r.stage === 'draft' && consentOk) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {r.next.actions.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => act(a)}
                  className={
                    i === 0
                      ? 'w-full rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white shadow-card sm:w-auto'
                      : 'grow whitespace-nowrap rounded-xl border border-surface-border bg-white px-4 py-3 text-[14.5px] font-medium text-ink sm:grow-0'
                  }
                >
                  {ACTION_TH[a]}
                </button>
              ))}
            </div>
          )}
          {!mayAct && <p className="mt-2 text-[13px] text-ink-muted">บัญชีนี้ดูได้อย่างเดียว</p>}

          {r.outcome && (
            <div className="mt-4 rounded-xl bg-surface-muted/60 px-3.5 py-2.5">
              <p className="text-[13px] font-semibold text-ink-muted">ผลจากหน่วยงาน</p>
              <p className={`text-[15px] font-bold ${r.outcome.ok === 'no' ? 'text-red-700' : 'text-ink'}`}>
                {r.outcome.ok === 'ok' ? '✓' : r.outcome.ok === 'warn' ? '⚠' : '✕'} {r.outcome.th}
              </p>
              <p className="text-[13px] text-ink-muted">{r.outcome.reviewed ? 'ครูประเมินและปิดการส่งต่อแล้ว' : 'รอครูประเมินว่าช่วยเด็กได้จริงไหม'}</p>
            </div>
          )}
        </div>

        {r.stage !== 'draft' && (
          <div className="border-t border-surface-border bg-surface-muted/50 px-2 pb-3 pt-3 sm:px-4">
            <p className="mb-3 px-2 text-[13px] text-ink-muted sm:px-0">
              ความคืบหน้า · <span className="font-semibold text-ink">{STAGE_TH[r.stage]}</span>
            </p>
            <Stepper r={r} />
          </div>
        )}
      </section>

      {/* ── รายละเอียด: แถวหัวข้อ–ค่า ในการ์ดเดียว แทนการ์ดคนละช่อง 4 ใบ ── */}
      <Section title="รายละเอียดการส่งต่อ">
        <dl className="divide-y divide-surface-border rounded-2xl border border-surface-border">
          <DRow k="หน่วยงาน">
            <p className="font-semibold">{r.toName}</p>
            {r.toAgency?.contact && <p className="text-[13.5px] text-ink-muted">{r.toAgency.contact}</p>}
          </DRow>
          <DRow k="เจ้าหน้าที่">
            {r.officer ? <span className="font-semibold">{r.officer}</span> : <span className="text-ink-muted">ยังไม่ทราบ — ใส่ได้ตอนอัปเดตความคืบหน้า</span>}
          </DRow>
          <DRow k="ฝั่งโรงเรียน">
            {sameOwner ? (
              <p>
                <span className="font-semibold">{r.caseOwner}</span> <span className="text-ink-muted">· เจ้าของเคสและผู้ส่งต่อ</span>
              </p>
            ) : (
              <>
                <p>
                  <span className="font-semibold">{r.caseOwner}</span> <span className="text-ink-muted">· เจ้าของเคส</span>
                </p>
                <p>
                  <span className="font-semibold">{r.referralOwner}</span> <span className="text-ink-muted">· ผู้ส่งต่อ</span>
                </p>
              </>
            )}
            <p className="text-[13.5px] text-ink-muted">{r.fromName}</p>
          </DRow>
          <DRow k="รูปแบบ">{r.handoff === 'joint' ? 'ช่วยเหลือร่วมกัน — โรงเรียนยังเป็นเจ้าของเคส' : 'ส่งมอบความรับผิดชอบหลัก — โรงเรียนติดตามผล'}</DRow>
          <DRow k="ความยินยอม">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ConsentBadge state={r.consent.state} daysLeft={r.consent.daysLeft} />
              {r.consent.record && (
                <span className="text-[14px] text-ink-muted">
                  {r.consent.record.giver} · ถึง {r.consent.record.expires}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-[14px] font-semibold">
              <button type="button" onClick={() => setMore((v) => (v === 'consent' ? null : 'consent'))} className="text-brand-700">
                {more === 'consent' ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
              </button>
              {mayAct && (r.consent.state !== 'granted' || r.stage === 'draft') && (
                <button type="button" onClick={() => setSheet('consent')} className="text-brand-700">
                  บันทึกความยินยอม
                </button>
              )}
            </div>
            {more === 'consent' && (
              <div className="mt-2">
                <ConsentSummary c={r.consent} />
              </div>
            )}
          </DRow>
          <DRow k="ข้อมูลที่ส่ง">
            <p>
              {sharedOpts.map((o) => o.th.split(' (')[0]).join(' · ')}{' '}
              <span className="text-ink-muted">
                ({sharedOpts.length} จาก {SCOPE_OPTIONS.length} หมวด)
              </span>
            </p>
            <button type="button" onClick={() => setMore((v) => (v === 'data' ? null : 'data'))} className="mt-1 text-[14px] font-semibold text-brand-700">
              {more === 'data' ? 'ซ่อน' : 'ดูสิ่งที่หน่วยงานเห็นจริง'}
            </button>
            {more === 'data' && (
              <ul className="mt-2 divide-y divide-surface-border rounded-xl border border-surface-border">
                {sharedOpts.map((o) => (
                  <li key={o.key} className="px-3.5 py-2.5">
                    <p className="text-[13px] font-semibold text-ink-muted">{o.th}</p>
                    <p className="text-[14px] text-ink">{sharePreview(student, o.key, r.reason, history)}</p>
                  </li>
                ))}
              </ul>
            )}
          </DRow>
        </dl>
      </Section>

      {/* ── หลายหน่วยงาน เคสเดียว ─────────────── */}
      {siblings.length > 0 && (
        <Section title={`ส่งต่อหน่วยงานอื่นด้วย · ${siblings.length}`}>
          <ul className="divide-y divide-surface-border rounded-2xl border border-surface-border">
            {siblings.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onOpen(x.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-ink">
                      {x.needTh} → {x.toName}
                    </p>
                    <p className="mt-0.5 text-[13px]">
                      <BucketBadge b={x.bucket} /> <SlaText sla={x.sla} className="text-[13px]" />
                    </p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold text-brand-700">เปิด ›</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── ประวัติ: 5 รายการล่าสุด ที่เหลือกดดู ─────── */}
      <Section title="ประวัติ">
        <ol className="relative ml-2 border-l-2 border-surface-border">
          {(allTl ? tl : tl.slice(0, 5)).map((x, i) => (
            <li key={i} className="relative pb-3 pl-4">
              <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white" style={{ background: i === 0 ? '#0f172a' : '#94a3b8' }} />
              <p className={`text-[14px] leading-snug ${x.refId && x.refId !== r.id ? 'text-ink-muted' : 'text-ink'}`}>{x.th}</p>
              <p className="text-[12.5px] text-ink-faint">
                {fmtTs(x.ts)} · {x.by}
              </p>
            </li>
          ))}
        </ol>
        {tl.length > 5 && (
          <button type="button" onClick={() => setAllTl((v) => !v)} className="text-[14px] font-semibold text-brand-700">
            {allTl ? 'ย่อ' : `ดูทั้งหมด ${tl.length} รายการ`}
          </button>
        )}
      </Section>
    </Drawer>
  )
}

/** แถวหัวข้อ–ค่า — จอใหญ่เป็นสองคอลัมน์ มือถือซ้อนกัน */
function DRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 px-4 py-3 sm:grid-cols-[112px_1fr] sm:gap-3">
      <dt className="text-[13.5px] text-ink-muted">{k}</dt>
      <dd className="min-w-0 text-[14.5px] text-ink">{children}</dd>
    </div>
  )
}

/**
 * ขั้นความคืบหน้าแบบจุดต่อเส้น 5 ขั้น — อยู่ในการ์ดสถานะ ไม่แยกเป็นตารางอีกส่วน
 * ใต้ขั้นที่ผ่านแล้วบอกวันที่ (ช่องทางที่ครูทราบอยู่ในประวัติ) ขั้นที่ครูข้ามขึ้นว่า "ข้าม"
 */
function Stepper({ r }: { r: RefCase }) {
  const reached = ackIndex(r.stage)
  const branch = r.stage === 'needInfo' || r.stage === 'returned'
  // นับเฉพาะเหตุการณ์หลังการเปลี่ยนหน่วยงานครั้งล่าสุด
  const re = [...r.events].reverse().find((e) => e.type === 'reassigned')
  const live = re ? r.events.filter((e) => e.ts >= re.ts) : r.events
  const at = (i: number) => [...live].reverse().find((e) => ACK_STEPS[i].evs.includes(e.type))
  return (
    <>
      <ol className="grid grid-cols-5">
        {ACK_STEPS.map((x, i) => {
          const done = i <= reached
          const next = !branch && i === reached + 1
          const e = at(i)
          return (
            <li key={x.stage} className="relative flex flex-col items-center text-center">
              {/* เส้นเชื่อมจากขั้นก่อนหน้า — z-0 ให้วงกลม (z-10) ทับเสมอ เดิมเส้นของช่องถัดไปลากทับตัวเลข */}
              {i > 0 && (
                <span className={`absolute right-1/2 top-[15px] z-0 h-[3px] w-full rounded-full ${done ? 'bg-ink' : 'bg-surface-border'}`} aria-hidden />
              )}
              <span
                className="relative z-10 grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold"
                style={{
                  background: done ? '#0f172a' : next ? '#eef3ff' : '#fff',
                  color: done ? '#fff' : next ? '#1d4ed8' : '#64748b',
                  boxShadow: done ? undefined : `inset 0 0 0 2px ${next ? '#2f66f6' : '#cbd5e1'}`,
                }}
                aria-hidden
              >
                {done ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className={`mt-2 whitespace-nowrap text-[13px] leading-tight ${next ? 'font-bold text-brand-700' : done ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                {x.short}
              </span>
              <span className="mt-0.5 whitespace-nowrap text-[12px] leading-tight text-ink-muted">
                {e ? fmtTs(e.ts).split(' ').slice(0, 2).join(' ') : done ? 'ข้าม' : next ? 'ถัดไป' : ' '}
              </span>
              <span className="sr-only">{done ? 'ผ่านแล้ว' : next ? 'ขั้นถัดไป' : 'ยังไม่ถึง'}</span>
            </li>
          )
        })}
      </ol>
      {branch && <p className="mx-2 mt-3 rounded-xl bg-surface-muted px-3 py-2 text-[14px] font-semibold text-ink">↳ {STAGE_TH[r.stage]}</p>}
    </>
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
  ev: (e: Omit<RefEvent, 'ts' | 'by'> & { by?: string; ts?: number }, toast?: string) => void
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
  const [via, setVia] = useState<RefVia>('phone')

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

  if (sheet === 'update') return <UpdateSheet r={r} ev={ev} done={done} />

  if (sheet === 'contact')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">ติดต่อ {r.toName}</h3>
        <p className="mt-2 rounded-xl bg-surface-muted px-3.5 py-3 text-[15px] text-ink">
          {r.toAgency?.contact ?? '—'}
          {r.officer && <span className="block text-[14px] text-ink-muted">เจ้าหน้าที่: {r.officer}</span>}
        </p>
        <Label>ติดต่อทางไหน</Label>
        <ViaChips value={via} onPick={setVia} />
        <Label>คุยแล้วได้ความว่าอย่างไร</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={textareaCls} placeholder="เช่น เจ้าหน้าที่รับปากจะรับเรื่องภายในวันนี้" />
        <p className="mt-1 text-[12.5px] text-ink-muted">ถ้าหน่วยงานรับเรื่องหรือมีผลแล้ว ใช้ปุ่ม "อัปเดตความคืบหน้า" แทน เพื่อให้ขั้นเลื่อนตาม</p>
        <div className="mt-4">
          <PrimaryBtn onClick={() => { ev({ type: 'contacted', via, note: note.trim() || undefined }, 'บันทึกการติดต่อแล้ว'); done() }}>บันทึกการติดต่อ</PrimaryBtn>
        </div>
      </>
    )

  if (sheet === 'escalate')
    return (
      <>
        <h3 className="text-[18px] font-bold text-ink">Escalate ระดับ {nextLevel}</h3>
        <p className="mt-1 text-[14px] text-ink-muted">
          {nextLevel === 1 ? 'เกิน SLA' : nextLevel === 2 ? 'ค้างเกิน 48 ชม.' : 'ค้างเกิน 72 ชม.'} — {ESC_TH[nextLevel]} (โทรหรือทำหนังสือ) แล้วบันทึกไว้ที่นี่ · ใช้ข้อความสรุปด้านล่างได้
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
        <p className="mt-1 text-[14px] text-ink-muted">อย่าลืมแจ้ง {r.toName} ว่าย้ายเรื่องแล้ว และส่งเรื่องถึงหน่วยงานใหม่ · กำหนดรับเรื่องเริ่มนับใหม่ · ความยินยอมเดิมใช้ต่อได้ถ้าครอบคลุม</p>
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
              log.addRefEvent(r.id, { type: 'reassigned', ts: Date.now(), by, toAgencyId: a.id, toAgencyName: a.th })
              push(`ย้ายการส่งต่อไป ${a.th} แล้ว — แจ้งหน่วยงานใหม่ แล้วกลับมาอัปเดตเมื่อรับเรื่อง`)
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

const VIA_ITEMS = (Object.keys(VIA_TH) as RefVia[]).map((k) => ({ key: k, th: VIA_TH[k] }))

function ViaChips({ value, onPick }: { value: RefVia; onPick: (v: RefVia) => void }) {
  return <Chips items={VIA_ITEMS} value={value} onPick={onPick} />
}

type UpdateKey = 'accepted' | 'started' | 'needInfo' | 'outcome' | 'returned'

const UPDATE_TH: Record<UpdateKey, string> = {
  accepted: 'หน่วยงานรับเรื่องแล้ว',
  started: 'เริ่มดำเนินการแล้ว',
  needInfo: 'หน่วยงานขอข้อมูลเพิ่ม',
  outcome: 'ได้ผลแล้ว',
  returned: 'หน่วยงานไม่รับเรื่อง',
}

/**
 * ครูบันทึกความคืบหน้าเอง — ยังไม่ต่อระบบหน่วยงาน ครูได้ข่าวทางโทรศัพท์/หนังสือ/พบตัว
 * แล้วมากดที่นี่ เลือกได้เฉพาะสถานะที่ไปข้างหน้าจากตอนนี้ และข้ามขั้นได้
 * (เช่น โทรไปแล้วรู้ว่าหน่วยงานทำเสร็จแล้ว ก็บันทึกผลได้เลย)
 */
function UpdateSheet({
  r,
  ev,
  done,
}: {
  r: RefCase
  ev: (e: Omit<RefEvent, 'ts' | 'by'> & { by?: string; ts?: number }, toast?: string) => void
  done: () => void
}) {
  const idx = ackIndex(r.stage)
  const options: UpdateKey[] =
    r.stage === 'needInfo'
      ? ['started', 'outcome']
      : idx <= 0
        ? ['accepted', 'started', 'outcome', 'returned']
        : idx === 1
          ? ['started', 'needInfo', 'outcome']
          : idx === 2
            ? ['needInfo', 'outcome']
            : ['outcome']
  const [key, setKey] = useState<UpdateKey>(options[0])
  const [via, setVia] = useState<RefVia>('phone')
  const [officer, setOfficer] = useState(r.officer ?? '')
  // ค่าเริ่มต้นตามด้านที่ส่งต่อ — ส่งต่อสุขภาพก็เริ่มที่ "เข้ารับการรักษาแล้ว"
  const [outcome, setOutcome] = useState<OutcomeKey>(NEED_OUTCOME[r.need])
  const [note, setNote] = useState('')
  const needNote = key === 'needInfo' || key === 'returned'
  const askOfficer = !r.officer && (key === 'accepted' || key === 'started' || key === 'outcome')
  const by = r.officer || officer.trim() || r.toName

  const save = () => {
    const now = Date.now()
    const off = officer.trim() || undefined
    const extra = note.trim() || undefined
    // ข้ามขั้นรับเรื่อง = หน่วยงานรับไปแล้วโดยปริยาย บันทึกไว้ให้นาฬิกากำหนดดำเนินการเริ่มนับ
    if (idx <= 0 && (key === 'started' || key === 'outcome')) ev({ type: 'accepted', ts: now - 2, by: r.toName, officer: off, via })
    if (key === 'accepted') ev({ type: 'accepted', by: r.toName, officer: off, via, note: extra }, `บันทึกแล้ว — ${r.toName} รับเรื่อง`)
    else if (key === 'started') ev({ type: 'started', by, via, note: extra }, 'บันทึกแล้ว — กำลังดำเนินการ')
    else if (key === 'needInfo') ev({ type: 'needInfo', by, via, note: extra }, 'บันทึกแล้ว — หน่วยงานขอข้อมูลเพิ่ม')
    else if (key === 'returned') ev({ type: 'returned', by: r.toName, via, note: extra }, `บันทึกแล้ว — ${r.toName} ไม่รับเรื่อง`)
    else {
      // ห้ามประทับเวลาอนาคต — เหตุการณ์ที่ครูกดตามมาจะเรียงก่อนแล้วถูกกลืน
      ev({ type: 'done', ts: now - 1, by })
      ev({ type: 'outcome', by, via, outcome, note: `${OUTCOME[outcome].th}${extra ? ` — ${extra}` : ''}` }, 'บันทึกผลแล้ว — ประเมินว่าช่วยเด็กได้จริงไหม')
    }
    done()
  }

  return (
    <>
      <h3 className="text-[18px] font-bold text-ink">อัปเดตความคืบหน้า</h3>
      <p className="mt-1 text-[14px] text-ink-muted">ได้ข่าวจาก {r.toName} แล้วบันทึกไว้ที่นี่ — ตอนนี้: {STAGE_TH[r.stage]}</p>

      <Label>ตอนนี้เป็นอย่างไร</Label>
      <div className="space-y-1.5">
        {options.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKey(k)}
            aria-pressed={key === k}
            className="flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left"
            style={{ borderColor: key === k ? '#2f66f6' : '#e2e8f0', background: key === k ? '#eef3ff' : '#fff' }}
          >
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2"
              style={{ borderColor: key === k ? '#2f66f6' : '#94a3b8' }}
              aria-hidden
            >
              {key === k && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
            </span>
            <span className="text-[15px] font-semibold text-ink">{UPDATE_TH[k]}</span>
          </button>
        ))}
      </div>

      {key === 'outcome' && (
        <>
          <Label>ผลเป็นอย่างไร</Label>
          <Chips items={(Object.keys(OUTCOME) as OutcomeKey[]).map((k) => ({ key: k, th: OUTCOME[k].th }))} value={outcome} onPick={setOutcome} />
        </>
      )}

      {askOfficer && (
        <>
          <Label>เจ้าหน้าที่ผู้รับผิดชอบ (ถ้าทราบ)</Label>
          <input value={officer} onChange={(e) => setOfficer(e.target.value)} className={inputCls} placeholder="เช่น คุณอามีนะห์ ส. 08x-xxx-xxxx" />
        </>
      )}

      <Label>ทราบทางไหน</Label>
      <ViaChips value={via} onPick={setVia} />

      <Label>{key === 'needInfo' ? 'หน่วยงานขอข้อมูลอะไร' : key === 'returned' ? 'เหตุผลที่ไม่รับ' : 'บันทึกเพิ่ม (ไม่บังคับ)'}</Label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className={textareaCls}
        placeholder={key === 'needInfo' ? 'เช่น สำเนาทะเบียนบ้าน เบอร์ผู้ปกครองล่าสุด' : key === 'returned' ? 'เช่น ไม่อยู่ในอำนาจหน้าที่ แนะนำให้ส่ง อบต.' : 'เช่น นัดเยี่ยมบ้านวันศุกร์นี้'}
      />

      <div className="mt-4">
        <PrimaryBtn disabled={needNote && note.trim().length < 4} onClick={save}>
          บันทึกความคืบหน้า
        </PrimaryBtn>
      </div>
    </>
  )
}
