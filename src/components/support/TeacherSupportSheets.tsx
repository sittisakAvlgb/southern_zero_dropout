import { useMemo, useState } from 'react'
import {
  requestStatus,
  SUPPORT_REASON_TH,
  VERDICT_TH,
  DIRECTOR_ACT_TH,
  type CaseLogEntry,
  type SupportReason,
  type SupportRequest,
} from '@/lib/caseLog'
import type { FollowCase } from '@/lib/followOps'
import { caseSummaryLine, fmtDay, suggestAsk, suggestReasons, triedFrom } from '@/lib/directorOps'
import type { Log } from '@/components/referrals/useRefCases'
import { Label, PrimaryBtn, textareaCls } from '@/components/referrals/ui'

const REASONS = Object.keys(SUPPORT_REASON_TH) as SupportReason[]

/**
 * ขอการสนับสนุนจาก ผอ. — ครูไม่ได้ส่งเคสทิ้ง ครูยังเป็นเจ้าของเคส
 * ต้องบอกให้ได้ว่า "ต้องการให้ ผอ. ช่วยอะไร" ไม่ใช่กดส่งเฉย ๆ
 */
export function RequestSupportSheet({ c, entries, by, log, push, done }: { c: FollowCase; entries: CaseLogEntry[]; by: string; log: Log; push: (m: string) => void; done: () => void }) {
  const auto = useMemo(() => triedFrom(entries, c), [entries, c])
  const [reasons, setReasons] = useState<SupportReason[]>(() => suggestReasons(c))
  const [summary, setSummary] = useState(() => caseSummaryLine(c))
  const [tried, setTried] = useState<string[]>(auto)
  const [extra, setExtra] = useState('')
  const [ask, setAsk] = useState(() => suggestAsk(suggestReasons(c)))
  const [askTouched, setAskTouched] = useState(false)
  const [sent, setSent] = useState(false)

  const toggle = (k: SupportReason) => {
    const next = reasons.includes(k) ? reasons.filter((x) => x !== k) : [...reasons, k]
    setReasons(next)
    if (!askTouched) setAsk(suggestAsk(next))
  }
  const ready = reasons.length > 0 && summary.trim().length >= 5 && ask.trim().length >= 5

  if (sent)
    return (
      <div>
        <div className="rounded-2xl bg-green-50 p-4">
          <p className="text-[17px] font-bold text-green-700">✓ ส่งคำขอถึง ผอ. แล้ว</p>
          <p className="mt-1 text-[14px] text-ink">คุณยังเป็นผู้รับผิดชอบเคสนี้ — เมื่อ ผอ. ตัดสินใจ งานถัดไปจะขึ้นใน "งานวันนี้" ของคุณทันที</p>
        </div>
        <div className="mt-4">
          <PrimaryBtn onClick={done}>กลับไปที่เคส</PrimaryBtn>
        </div>
      </div>
    )

  return (
    <div>
      <h3 className="text-[18px] font-bold text-ink">ขอการสนับสนุนจาก ผอ.</h3>
      <p className="mt-1 text-[14px] text-ink-muted">ส่งเมื่อช่วยเองแล้วติดอุปสรรค — บอกให้ชัดว่าต้องการให้ ผอ. ช่วยอะไร คุณยังดูแลเคสนี้ต่อ</p>

      <Label>เหตุผล (เลือกได้หลายข้อ)</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="เหตุผลที่ขอการสนับสนุน">
        {REASONS.map((k) => {
          const on = reasons.includes(k)
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={on}
              className="rounded-full border px-4 py-2.5 text-[14px] font-medium"
              style={{ borderColor: on ? '#2f66f6' : '#e2e8f0', background: on ? '#eef3ff' : '#fff', color: on ? '#1d4ed8' : '#0f172a' }}
            >
              {on ? '✓ ' : ''}
              {SUPPORT_REASON_TH[k]}
            </button>
          )
        })}
      </div>

      <Label>สรุปเคสสั้น ๆ</Label>
      <textarea id="support-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className={textareaCls} />

      <Label>สิ่งที่ทำแล้ว</Label>
      <p className="-mt-1 mb-1.5 text-[13px] text-ink-muted">ดึงจากบันทึกให้แล้ว — เอาเครื่องหมายออกได้ถ้าไม่ตรง</p>
      <div className="space-y-1.5">
        {auto.map((t) => {
          const on = tried.includes(t)
          return (
            <label key={t} className="flex items-start gap-3 rounded-xl border border-surface-border px-3.5 py-2.5 text-[14.5px]">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={on} onChange={() => setTried(on ? tried.filter((x) => x !== t) : [...tried, t])} />
              <span>{t}</span>
            </label>
          )
        })}
      </div>
      <input
        id="support-extra"
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        placeholder="เพิ่มสิ่งที่ทำแล้วนอกระบบ เช่น ฝากเพื่อนบ้านบอกผู้ปกครอง"
        className="mt-2 w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
      />

      <Label>ต้องการให้ ผอ. ช่วยอะไร</Label>
      <textarea
        id="support-ask"
        value={ask}
        onChange={(e) => {
          setAsk(e.target.value)
          setAskTouched(true)
        }}
        rows={2}
        className={textareaCls}
        placeholder="เช่น ขอให้ ผอ. ช่วยประสานผู้นำชุมชน และอนุมัติทีมเยี่ยมบ้าน"
      />

      <div className="mt-4">
        <PrimaryBtn
          disabled={!ready}
          onClick={() => {
            log.requestSupport({
              childId: c.s.id,
              childName: c.s.name,
              by,
              reasons,
              summary: summary.trim(),
              tried: [...tried, ...(extra.trim() ? [extra.trim()] : [])],
              ask: ask.trim(),
            })
            push('ส่งคำขอถึง ผอ. แล้ว')
            setSent(true)
          }}
        >
          ส่งคำขอถึง ผอ.
        </PrimaryBtn>
        {!ready && <p className="mt-2 text-[13px] text-ink-muted">เลือกเหตุผลอย่างน้อยหนึ่งข้อ และบอกสิ่งที่ต้องการจาก ผอ.</p>}
      </div>
    </div>
  )
}

/** ผอ. ขอข้อมูลเพิ่ม — ตอบในที่เดียวกับคำขอ ไม่ต้องไปคุยนอกระบบ */
export function ReplyDirectorSheet({ req, by, log, push, done }: { req: SupportRequest; by: string; log: Log; push: (m: string) => void; done: () => void }) {
  const last = req.decisions.at(-1)
  const [text, setText] = useState('')
  return (
    <div>
      <h3 className="text-[18px] font-bold text-ink">ตอบ ผอ.</h3>
      <div className="mt-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[14.5px] text-ink">
        <p className="font-semibold">{last?.by} ขอข้อมูลเพิ่ม</p>
        <p className="mt-0.5">{last?.reason}</p>
      </div>
      <Label>คำตอบ</Label>
      <textarea id="support-reply" value={text} onChange={(e) => setText(e.target.value)} rows={3} className={textareaCls} />
      <div className="mt-4">
        <PrimaryBtn
          disabled={text.trim().length < 3}
          onClick={() => {
            log.replyRequest(req.id, by, text.trim())
            push('ส่งคำตอบถึง ผอ. แล้ว')
            done()
          }}
        >
          ส่งคำตอบ
        </PrimaryBtn>
      </div>
    </div>
  )
}

/** ทำ action ที่ ผอ. ส่งกลับมาแล้ว — บันทึกผลจริง นับเป็นการลงมือกับเด็ก */
export function DirectiveDoneSheet({ req, by, log, push, done }: { req: SupportRequest; by: string; log: Log; push: (m: string) => void; done: () => void }) {
  const d = req.decisions.at(-1)
  const [note, setNote] = useState('')
  if (!d?.next) return null
  return (
    <div>
      <h3 className="text-[18px] font-bold text-ink">งานจาก ผอ.</h3>
      <DecisionCard req={req} />
      <Label>ผลที่ได้</Label>
      <textarea id="directive-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={textareaCls} placeholder="เช่น นัดทีมเยี่ยมบ้านวันศุกร์ ผู้นำชุมชนแจ้งครอบครัวแล้ว" />
      <div className="mt-4">
        <PrimaryBtn
          disabled={note.trim().length < 3}
          onClick={() => {
            log.completeDirective(req.id, by, note.trim())
            push('บันทึกแล้ว — ผอ. เห็นผลในไทม์ไลน์ของเด็ก')
            done()
          }}
        >
          บันทึกว่าทำแล้ว
        </PrimaryBtn>
      </div>
    </div>
  )
}

/** การตัดสินใจล่าสุดของ ผอ. — ใครตัดสิน เมื่อไร เพราะอะไร ใครทำต่อ กับใคร ภายในเมื่อไร */
export function DecisionCard({ req }: { req: SupportRequest }) {
  const d = req.decisions.at(-1)
  if (!d) return null
  const when = new Date(d.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return (
    <div className="mt-2 rounded-2xl border border-surface-border p-4">
      <p className="text-[12.5px] font-semibold text-ink-muted">
        {d.by} · {when} · {VERDICT_TH[d.verdict]}
      </p>
      {d.acts.length > 0 && <p className="mt-1 text-[15px] font-semibold text-ink">{d.acts.map((a) => DIRECTOR_ACT_TH[a]).join(' · ')}</p>}
      <p className="mt-1 text-[14px] text-ink">เหตุผล: {d.reason}</p>
      {d.next && (
        <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-surface-border pt-3 text-[14px] sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-[12px] text-ink-faint">สิ่งที่ต้องทำต่อ</dt>
            <dd className="font-bold text-ink">{d.next.th}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-faint">ผู้รับผิดชอบ</dt>
            <dd className="font-semibold text-ink">{d.next.owner}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-faint">กำหนด</dt>
            <dd className="font-semibold text-ink">{fmtDay(d.next.due)}</dd>
          </div>
          {d.next.support.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-[12px] text-ink-faint">ทีมช่วย</dt>
              <dd className="font-semibold text-ink">{d.next.support.join(' · ')}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}

const STATUS_TH: Record<ReturnType<typeof requestStatus>, string> = {
  new: 'ส่งถึง ผอ. แล้ว — รอ ผอ. เปิดอ่าน',
  seen: 'ผอ. รับเรื่องแล้ว — กำลังพิจารณา',
  needInfo: 'ผอ. ขอข้อมูลเพิ่ม',
  answered: 'ตอบ ผอ. แล้ว — รอตัดสินใจ',
  withTeacher: 'ผอ. ตัดสินใจแล้ว — งานอยู่ที่คุณ',
  done: 'ทำตามที่ ผอ. อนุมัติแล้ว',
  rejected: 'ผอ. ไม่อนุมัติ',
}

/** แถบสถานะคำขอบนเคส — ครูไม่ต้องเดาว่า ผอ. เห็นหรือยัง */
export function SupportStatus({ req }: { req: SupportRequest }) {
  const st = requestStatus(req)
  const sent = new Date(req.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-muted/50 p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">คำขอถึง ผอ. · ส่งเมื่อ {sent}</p>
      <p className="mt-0.5 text-[15.5px] font-bold text-ink">{STATUS_TH[st]}</p>
      <p className="mt-1 text-[14px] text-ink-muted">ขอ: {req.ask}</p>
      {(st === 'withTeacher' || st === 'done' || st === 'rejected') && <DecisionCard req={req} />}
    </div>
  )
}
