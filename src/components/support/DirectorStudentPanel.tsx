import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestStatus } from '@/lib/caseLog'
import { HEALTH_META, type FollowCase } from '@/lib/followOps'
import { isoIn } from '@/lib/directorOps'
import type { Log } from '@/components/referrals/useRefCases'
import { useToast } from '@/components/ui/Toast'
import { IconArrowRight } from '@/components/icons'

const STATUS_TH: Record<ReturnType<typeof requestStatus>, string> = {
  new: 'ครูขอการสนับสนุน — ยังไม่ได้เปิดอ่าน',
  seen: 'ครูขอการสนับสนุน — รอ ผอ. ตัดสินใจ',
  needInfo: 'ผอ. ขอข้อมูลเพิ่ม — รอครูตอบ',
  answered: 'ครูตอบแล้ว — รอ ผอ. ตัดสินใจ',
  withTeacher: 'ผอ. ตัดสินใจแล้ว — งานอยู่ที่ครู',
  done: 'ครูทำตามที่ ผอ. อนุมัติแล้ว',
  rejected: 'ผอ. ไม่อนุมัติ',
}

/**
 * แฟ้มเด็กเมื่อ ผอ. เปิดดู — ผอ. ไม่ทำงานแทนครู (ไม่มีบันทึกการติดต่อ เยี่ยมบ้าน นัด หรือรับเคสเอง)
 * เห็นว่าครูกำลังทำอะไร มีคำขอค้างไหม และเพิ่ม "บันทึกของ ผอ." ได้ โดยไม่แก้บันทึกของครู
 * หน้าตาเดียวกับกล่อง "สิ่งที่ต้องทำต่อ" ของครู — ผอ. เปิดแฟ้มเด็กแล้วเห็นเลย์เอาต์เดียวกับครู
 * `onDecide` เปิดลิ้นชักตัดสินใจบนหน้านี้ (ไม่มีก็ไปหน้าเรื่องที่ต้องตัดสินใจ)
 */
export function DirectorStudentPanel({
  fc,
  by,
  log,
  lastContact,
  onDecide,
  onExport,
}: {
  fc: FollowCase
  by: string
  log: Log
  lastContact?: string
  onDecide?: () => void
  onExport?: () => void
}) {
  const nav = useNavigate()
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const h = HEALTH_META[fc.health]
  const st = fc.support ? requestStatus(fc.support.req) : undefined
  const pending = st && ['new', 'seen', 'answered'].includes(st)
  const decide = onDecide ?? (() => nav(`/decisions?open=${fc.s.id}`))

  return (
    <div className="border-t border-surface-border bg-brand-50/50 px-5 py-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500 text-white" aria-hidden>
          <IconArrowRight width={14} height={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug">
            <span className="font-semibold text-brand-800">ครูกำลังทำ:</span> <span className="font-semibold text-ink">{fc.next.th}</span>
          </p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-muted">เพราะ{fc.next.whyTh.replace(/^เพราะ/, '')}</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            ผู้รับผิดชอบ <span className="font-semibold text-ink">{fc.s.caseOwner || 'ยังไม่มี'}</span>
            {' · '}
            <span className="font-semibold" style={{ color: h.color }}>
              {h.icon} {h.th}
            </span>
            {' · '}
            {fc.sla.text}
            {' · '}ติดต่อล่าสุด: <span className="font-semibold text-ink">{lastContact ?? 'ยังไม่มีบันทึก'}</span>
          </p>
          {st && st !== 'rejected' && (
            <p className={`mt-1 text-[13.5px] font-semibold ${pending ? 'text-red-700' : 'text-ink'}`}>คำขอถึง ผอ.: {STATUS_TH[st]}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 pl-0 sm:pl-[38px]">
        <button
          type="button"
          onClick={decide}
          className={`rounded-xl px-4 py-2.5 text-[14.5px] font-semibold ${pending || !fc.s.caseOwner ? 'bg-brand-500 text-white shadow-card hover:bg-brand-600' : 'border border-surface-border bg-white text-ink hover:border-brand-300'}`}
        >
          {pending ? 'พิจารณาคำขอ' : fc.s.caseOwner ? 'มอบหมาย / เตือนผู้รับผิดชอบ' : 'มอบหมายครู'}
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink hover:border-brand-300">
          บันทึกของ ผอ.
        </button>
        {onExport && (
          <button type="button" onClick={onExport} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink hover:border-brand-300">
            สรุปเคส / ส่งออก
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <label htmlFor="director-note" className="mb-1 block text-[13px] font-semibold text-ink-muted">
            บันทึกเพิ่มในไทม์ไลน์ของเด็ก — บันทึกของครูไม่ถูกแก้
          </label>
          <textarea
            id="director-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="เช่น คุยกับนายก อบต. แล้ว ยินดีช่วยค่าเดินทาง ให้ครูติดต่อกองการศึกษา"
            className="w-full rounded-xl border border-surface-border bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={text.trim().length < 3}
              onClick={() => {
                // งานเอกสารของ ผอ. — ลงไทม์ไลน์เดียวพร้อมป้าย "ผอ." แต่ไม่นับเป็นการติดต่อเด็ก (SLA ไม่เริ่มนับใหม่)
                log.add({ childId: fc.s.id, mode: 'note', date: isoIn(0), by, role: 'director', escalation: 'ผอ.', note: `บันทึกของ ผอ.: ${text.trim()}` })
                setText('')
                setOpen(false)
                push('บันทึกของ ผอ. ลงไทม์ไลน์แล้ว — ครูเห็นในแฟ้มเด็ก')
              }}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              บันทึก
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-surface-border px-4 py-2.5 text-[14px] font-medium text-ink">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
