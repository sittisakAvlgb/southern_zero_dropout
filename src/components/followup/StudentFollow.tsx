import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { entryTs, type CaseLogEntry } from '@/lib/caseLog'
import { caseTimeline, HEALTH_META, type FollowCase } from '@/lib/followOps'
import { fmtTs } from '@/lib/refOps'
import { useToast } from '@/components/ui/Toast'
import { IconArrowRight } from '@/components/icons'
import type { Log } from '@/components/referrals/useRefCases'
import type { Sheet } from './FollowCaseDetail'

/**
 * แถบ "สิ่งที่ต้องทำต่อ" ของหน้าข้อมูลเด็ก — หน้าตาเดิม แต่ข้อความ เหตุผล และปุ่ม
 * มาจาก followOps ตัวเดียวกับหน้าติดตามการช่วยเหลือ
 *
 * เดิมข้อความคือ `student.nextAction` ที่ seed ไว้ตายตัว ไม่เปลี่ยนตามสิ่งที่ครูทำ
 * และเคยบอก "ประสานผู้ปกครองผ่านผู้นำชุมชน" ทั้งที่ช่องข้าง ๆ บอกว่าติดต่อ
 * ผู้ปกครองได้ปกติ ส่วนหน้าติดตามบอกเด็กคนเดียวกันว่า "นัดเยี่ยมบ้าน"
 */
export function StudentNextStep({
  fc,
  mayAct,
  lastContact,
  onLogContact,
  onLogVisit,
  onSheet,
  onExport,
}: {
  fc: FollowCase
  mayAct: boolean
  lastContact?: string
  /** ฟอร์มบันทึกของหน้าข้อมูลเด็ก (มีช่องทาง ผลลัพธ์ นัดครั้งหน้า) */
  onLogContact: () => void
  /** ฟอร์มเยี่ยมบ้านเต็มรูปแบบ (ข้อมูลครอบครัว ลายเซ็น ความยินยอม) */
  onLogVisit: () => void
  onSheet: (s: Sheet) => void
  onExport: () => void
}) {
  const nav = useNavigate()
  const n = fc.next
  const run = () => {
    const g = n.go
    if ('href' in g) return nav(g.href)
    if (g.sheet === 'outcome' && g.mode === 'contact') return onLogContact()
    if (g.sheet === 'outcome' && g.mode === 'visit') return onLogVisit()
    onSheet(g as Sheet)
  }
  const h = HEALTH_META[fc.health]
  return (
    <div className="border-t border-surface-border bg-brand-50/50 px-5 py-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
          <IconArrowRight width={14} height={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug">
            <span className="font-semibold text-brand-800">สิ่งที่ต้องทำต่อ:</span> <span className="font-semibold text-ink">{n.th}</span>
          </p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-muted">เพราะ{n.whyTh.replace(/^เพราะ/, '')}</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            <span className="font-semibold" style={{ color: h.color }}>
              {h.icon} {h.th}
            </span>
            {' · '}
            {fc.sla.text}
            {' · '}ติดต่อล่าสุด: <span className="font-semibold text-ink">{lastContact ?? 'ยังไม่มีบันทึก'}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-0 sm:pl-[38px]">
        {mayAct && (
          <>
            <button type="button" onClick={run} className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white shadow-card">
              {n.cta}
            </button>
            {fc.open && !('sheet' in n.go && n.go.sheet === 'schedule') && (
              <button type="button" onClick={() => onSheet({ sheet: 'schedule' })} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14px] font-medium text-ink">
                นัดติดตาม
              </button>
            )}
            <button type="button" onClick={() => onSheet({ sheet: 'ask' })} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14px] font-medium text-ink">
              ถาม AI
            </button>
          </>
        )}
        <button type="button" onClick={onExport} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14px] font-medium text-ink">
          ส่งออกประวัติเด็ก
        </button>
      </div>
    </div>
  )
}

/**
 * ไทม์ไลน์การช่วยเหลือ — ชุดเดียวกับหน้าติดตาม: บันทึกของครู + ระเบียน +
 * เหตุการณ์ของการส่งต่อ + จุดที่ระดับความเสี่ยงเปลี่ยน บันทึกของบัญชีนี้ยังลบได้
 * และติ๊กนัดว่าทำแล้วได้เหมือนเดิม
 */
export function StudentTimeline({
  fc,
  entries,
  log,
  mayAct,
  onLogContact,
}: {
  fc: FollowCase
  entries: CaseLogEntry[]
  log: Log
  mayAct: boolean
  onLogContact: () => void
}) {
  const { push } = useToast()
  const items = useMemo(() => caseTimeline(fc, entries), [fc, entries])
  const [all, setAll] = useState(false)
  const mine = (ts: number, th: string) => entries.find((e) => entryTs(e) === ts && e.note === th)
  const shown = all ? items : items.slice(0, 12)
  return (
    <div className="rounded-2xl border border-surface-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
        <div>
          <h3 className="text-[16px] font-bold text-ink">ไทม์ไลน์การช่วยเหลือ</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">ใหม่ไปเก่า · รวมบันทึกของโรงเรียน หน่วยงานที่รับส่งต่อ และการเปลี่ยนระดับความเสี่ยง</p>
        </div>
        {mayAct && (
          <button type="button" onClick={onLogContact} className="rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-brand-700">
            บันทึกการติดต่อผู้ปกครอง
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {/* จุดสีเดียว (เข้ม = ล่าสุด) — ใครเป็นคนทำบอกด้วยคำในทุกแถว ไม่ใช้สีแยก */}
        <ol className="relative ml-2 border-l-2 border-surface-border">
          {shown.map((x, i) => {
            const e = x.who === 'school' ? mine(x.ts, x.th) : undefined
            return (
              <li key={i} className="relative pb-4 pl-5 last:pb-0">
                <span
                  className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white"
                  style={{ background: i === 0 ? '#0f172a' : '#94a3b8' }}
                />
                <p className="text-[12.5px] text-ink-faint">
                  {fmtTs(x.ts).replace(/ \d\d:\d\d$/, '')} · {x.who === 'school' ? 'โรงเรียน' : x.who === 'agency' ? 'หน่วยงาน' : 'ระบบ'} · {x.by}
                  {e && <span className="ml-1.5 font-semibold text-ink-muted">· บันทึกของคุณ</span>}
                </p>
                <p className="mt-0.5 text-[14.5px] leading-snug text-ink">{x.th}</p>
                {e && (
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px]">
                    {e.followUpDate && (
                      <button
                        type="button"
                        onClick={() => log.setFollowUpDone(e.id, !e.followUpDone)}
                        className={`font-semibold underline-offset-2 hover:underline ${e.followUpDone ? 'text-ink-faint line-through' : 'text-brand-700'}`}
                      >
                        {e.followUpDone ? `✓ ทำตามนัด ${e.followUpDate} แล้ว (กดเพื่อยกเลิก)` : `กดเมื่อทำตามนัด ${e.followUpDate} แล้ว`}
                      </button>
                    )}
                    {mayAct && (
                      <button
                        type="button"
                        onClick={() => {
                          log.remove(e.id)
                          push('ลบบันทึกแล้ว')
                        }}
                        className="font-semibold text-ink-faint underline-offset-2 hover:text-red-700 hover:underline"
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {items.length > 12 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[14px] font-semibold text-brand-700 underline">
            {all ? 'ย่อ' : `ดูทั้งหมด ${items.length} รายการ`}
          </button>
        )}
        {!items.length && <p className="text-[14px] text-ink-muted">ยังไม่มีประวัติการช่วยเหลือ</p>}
      </div>
    </div>
  )
}
