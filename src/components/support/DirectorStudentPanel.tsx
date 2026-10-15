import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestStatus } from '@/lib/caseLog'
import { HEALTH_META, type FollowCase } from '@/lib/followOps'
import { isoIn } from '@/lib/directorOps'
import type { Log } from '@/components/referrals/useRefCases'
import { useToast } from '@/components/ui/Toast'

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
 * การตัดสินใจ มอบหมาย หรือเตือนผู้รับผิดชอบ ทำในหน้าเรื่องที่ต้องตัดสินใจที่เดียว
 */
export function DirectorStudentPanel({ fc, by, log }: { fc: FollowCase; by: string; log: Log }) {
  const nav = useNavigate()
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const h = HEALTH_META[fc.health]
  const st = fc.support ? requestStatus(fc.support.req) : undefined
  const pending = st && ['new', 'seen', 'answered'].includes(st)

  return (
    <div className="border-t border-surface-border bg-surface-muted/50 px-5 py-4">
      <p className="text-[15px] leading-snug">
        <span className="font-semibold text-ink-muted">ครูกำลังทำ:</span> <span className="font-semibold text-ink">{fc.next.th}</span>
      </p>
      <p className="mt-0.5 text-[13.5px] text-ink-muted">
        ผู้รับผิดชอบ <span className="font-semibold text-ink">{fc.s.caseOwner || 'ยังไม่มี'}</span>
        {' · '}
        <span className="font-semibold" style={{ color: h.color }}>
          {h.icon} {h.th}
        </span>
        {' · '}
        {fc.sla.text}
      </p>
      {st && st !== 'rejected' && (
        <p className={`mt-1.5 text-[14px] font-semibold ${pending ? 'text-red-700' : 'text-ink'}`}>คำขอถึง ผอ.: {STATUS_TH[st]}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => nav(`/decisions?open=${fc.s.id}`)}
          className={`rounded-xl px-4 py-2.5 text-[14px] font-semibold ${pending ? 'bg-brand-500 text-white shadow-card' : 'border border-surface-border bg-white text-ink'}`}
        >
          {pending ? 'พิจารณาคำขอ' : fc.s.caseOwner ? 'มอบหมาย / เตือนผู้รับผิดชอบ' : 'มอบหมายครู'}
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14px] font-medium text-ink">
          บันทึกของ ผอ.
        </button>
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
