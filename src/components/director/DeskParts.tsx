import { useState, type ReactNode } from 'react'
import { assetUrl } from '@/lib/asset'
import { fmtDay, isoIn, type TeamRow } from '@/lib/directorOps'
import type { DeskBrief, DeskOption } from '@/lib/directorDeskOps'
import type { useCaseLog } from '@/lib/caseLog'
import { Drawer, Label, PrimaryBtn, inputCls, textareaCls } from '@/components/referrals/ui'
import { OwnerPicker, lightestOf } from '@/components/support/DirectorDecisionSheet'

// ─────────────────────────────────────────────────────────────
// ชิ้นส่วนร่วมของหน้าทำงาน ผอ. (เส้นทางโอกาส · การส่งต่อ)
// หน้าใช้แถวแบบเดียวกับครู กดแถวแล้วเปิดลิ้นชัก: ทำไม ผอ. ต้องดู → ทางเลือกที่ AI แนะนำอยู่บนสุด → ลงมือ
// ─────────────────────────────────────────────────────────────

export const MASCOT = assetUrl('ChatBot.png')
export const btnSecondary = 'rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink hover:border-brand-300'

const TONE_DOT: Record<DeskBrief['tone'], string> = { red: 'bg-red-600', orange: 'bg-orange-500', green: 'bg-green-600' }

function ToneDot({ tone }: { tone: DeskBrief['tone'] }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
}

const TONE_BORDER: Record<DeskBrief['tone'], string> = { red: 'border-red-200', orange: 'border-orange-200', green: 'border-surface-border' }
const TONE_PILL: Record<DeskBrief['tone'], string> = { red: 'bg-red-50 text-red-700', orange: 'bg-orange-50 text-orange-700', green: 'bg-green-50 text-green-700' }

/**
 * เนื้อในลิ้นชักของ ผอ. — โครงเดียวกับลิ้นชักการส่งต่อของครู:
 *   การ์ดสถานะ (เกิดอะไรขึ้น · ข้อเท็จจริง) → AI มองว่า → ทางเลือกของ ผอ. เรียงลงทีละแถว → ดูรายละเอียดแบบอ่านอย่างเดียว
 * `body` คือส่วนเฉพาะของแต่ละหน้า (นาฬิกา SLA · แถบขั้นของแผน)
 */
export function DeskCard<O extends Pick<DeskOption, 'label' | 'effect' | 'recommended'>>({
  b,
  body,
  position,
  sources,
  onPick,
  onDetail,
  detailLabel,
  empty,
}: {
  b: Omit<DeskBrief, 'options'> & { options: O[] }
  body?: ReactNode
  /** "เรื่องที่ 1 จาก 4" หรือ "ครูดูแลอยู่" */
  position: string
  sources: string
  onPick: (o: O) => void
  onDetail?: () => void
  detailLabel?: string
  /** ข้อความเมื่อไม่มีทางเลือกให้ ผอ. */
  empty?: ReactNode
}) {
  // หัวการ์ด: ครึ่งแรกของคำถาม ("หน่วยงานเกินกำหนด") — ส่วน "ผอ. อาจพิจารณาทางไหน" ไปอยู่หัวทางเลือก
  const headline = b.question.includes(' — ') ? b.question.split(' — ')[0] : b.tag
  const ask = b.question.includes(' — ') ? b.question.split(' — ').slice(1).join(' — ') : 'ผอ. อาจพิจารณาทางไหน'
  return (
    <div>
      <section className={`rounded-2xl border bg-white px-4 py-4 shadow-card ${TONE_BORDER[b.tone]}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold ${TONE_PILL[b.tone]}`}>
            <ToneDot tone={b.tone} />
            {b.options.length ? 'ต้องใช้ ผอ.' : 'ครูดูแลอยู่'}
          </span>
          <span className="text-[13px] font-medium text-ink-muted">{position}</span>
        </div>
        <p className="mt-2.5 text-[19px] font-bold leading-snug text-ink">{headline}</p>
        {body && <div className="mt-1.5">{body}</div>}
        <dl className="mt-3 space-y-1.5 border-t border-surface-border pt-3">
          {b.why.map((w) => (
            <div key={w} className="flex items-start gap-2 text-[14.5px] leading-snug text-ink">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
              <dd>{w}</dd>
            </div>
          ))}
        </dl>
      </section>

      {b.insight && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-brand-50/80 px-4 py-3.5">
          <img src={MASCOT} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-0.5" draggable={false} />
          <p className="min-w-0 text-[14.5px] leading-relaxed text-ink">
            <span className="block text-[12.5px] font-semibold text-brand-700">AI มองว่า</span>
            {b.insight}
          </p>
        </div>
      )}

      {b.options.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-[16px] font-bold text-ink">{ask}</h3>
          <div className="mt-3 space-y-2.5">
            {b.options.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => onPick(o)}
                className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                  o.recommended ? 'border-2 border-brand-500 bg-brand-50/60 hover:bg-brand-50' : 'border border-surface-border bg-white hover:border-brand-300'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-bold leading-snug text-ink">{o.label}</span>
                    {o.recommended && b.options.length > 1 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[12px] font-semibold text-white">AI แนะนำ</span>}
                  </span>
                  <span className="mt-0.5 block text-[14px] leading-snug text-ink-muted">{o.effect}</span>
                </span>
                <span aria-hidden className={`shrink-0 text-[18px] ${o.recommended ? 'text-brand-600' : 'text-ink-faint group-hover:text-brand-600'}`}>
                  →
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[13px] leading-snug text-ink-muted">ข้อมูลที่ AI ใช้: {sources} · ผอ. เป็นผู้ตัดสินใจ</p>
        </section>
      ) : (
        <p className="mt-5 rounded-2xl bg-green-50 px-4 py-3 text-[15px] font-medium text-green-800">{empty ?? 'ไม่มีเรื่องที่ต้องใช้ ผอ. ตอนนี้ — ครูดูแลอยู่และเดินตามกำหนด'}</p>
      )}

      {onDetail && (
        <button type="button" onClick={onDetail} className={`${btnSecondary} mt-6 w-full`}>
          {detailLabel}
        </button>
      )}
    </div>
  )
}

type Log = ReturnType<typeof useCaseLog>

/**
 * ผอ. ขยับเรื่องที่ค้าง โดยไม่ทำแทนครู — เตือน · มอบหมาย/ย้าย · ยกระดับหน่วยงาน · นัดคุยกับครอบครัว
 * ทุกทางลงไทม์ไลน์ของเด็กพร้อมป้าย "ผอ." การยกระดับลงเป็นเหตุการณ์ของการส่งต่อด้วย
 */
export function DeskActionSheet({
  opt,
  childId,
  head,
  owner,
  agencyName,
  by,
  team,
  load,
  log,
  push,
  onClose,
}: {
  opt: DeskOption
  childId: string
  head: ReactNode
  owner?: string
  /** หน่วยงานที่จะยกระดับ */
  agencyName?: string
  by: string
  team: string[]
  load: TeamRow[]
  log: Log
  push: (m: string) => void
  onClose: () => void
}) {
  const suggest = lightestOf(load, owner)
  const [pick, setPick] = useState(opt.kind === 'assign' ? (suggest ?? '') : '')
  const [msg, setMsg] = useState(
    opt.message ??
      (opt.kind === 'assign'
        ? owner
          ? `ลดภาระของ ${owner} — ย้ายให้ครูที่ว่างกว่า`
          : 'ยังไม่มีผู้รับผิดชอบ ต้องมีคนดูแล'
        : opt.kind === 'escalate'
          ? `${agencyName ?? 'หน่วยงาน'}เกินกำหนดและยังไม่ขยับ`
          : ''),
  )
  const [due, setDue] = useState(isoIn(opt.kind === 'meeting' ? 3 : 0))
  const today = isoIn(0)
  const stamp = (note: string, extra: Partial<Parameters<Log['add']>[0]> = {}) =>
    log.add({ childId, mode: 'note', date: today, by, role: 'director', escalation: 'ผอ.', note, ...extra })

  const save = () => {
    const why = msg.trim()
    if (opt.kind === 'assign') {
      log.setOwner(childId, pick)
      stamp(`ผอ. มอบหมาย ${pick} เป็นผู้รับผิดชอบ — ${why}`)
      push(`มอบหมาย ${pick} แล้ว — ขึ้นในงานของ ${pick}`)
    } else if (opt.kind === 'nudge') {
      stamp(`ผอ. เตือน ${owner}: ${why}`)
      push(`เตือน ${owner} แล้ว`)
    } else if (opt.kind === 'escalate') {
      const lv = opt.level ?? 2
      const where = lv === 2 ? 'หัวหน้าหน่วยงาน' : 'ระดับจังหวัด'
      if (opt.refId) log.addRefEvent(opt.refId, { type: 'escalated', ts: Date.now(), by, level: lv, note: `ผอ. ยกระดับถึง${where} — ${why}` })
      stamp(`ผอ. ยกระดับ ${agencyName ?? 'หน่วยงาน'} (${where}) — ${why}`)
      push(`ยกระดับ ${agencyName ?? 'หน่วยงาน'} แล้ว`)
    } else {
      stamp(`ผอ. นัดคุยกับครอบครัวพร้อม ${owner} วันที่ ${fmtDay(due)}${why ? ` — ${why}` : ''}`, { followUpDate: due, followUpMethod: 'ประชุมกับครอบครัว', followUpOwner: owner })
      push(`นัดคุยกับครอบครัว ${fmtDay(due)} — ขึ้นในงานของ ${owner}`)
    }
    onClose()
  }

  const ready = opt.kind === 'assign' ? Boolean(pick) && msg.trim().length >= 3 : opt.kind === 'meeting' ? Boolean(due) : msg.trim().length >= 3
  const titleTh = { assign: owner ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมายผู้รับผิดชอบ', nudge: `เตือน ${owner ?? ''}`, escalate: opt.label, meeting: 'นัดคุยกับครอบครัวพร้อมครู' }[opt.kind]

  return (
    <Drawer label={opt.label} head={head} onClose={onClose}>
      <h3 className="text-[18px] font-bold text-ink">{titleTh}</h3>
      <p className="mt-1 text-[14px] text-ink-muted">{opt.effect}</p>

      {opt.kind === 'assign' && (
        <>
          <p id="desk-owner-label" className="mb-1.5 mt-4 text-[14px] font-semibold text-ink">
            ให้ใครดูแล
          </p>
          <OwnerPicker id="desk-owner-label" team={team} load={load} value={pick} onChange={setPick} current={owner} suggest={suggest} />
        </>
      )}

      {opt.kind === 'meeting' && (
        <>
          <Label>วันที่นัด</Label>
          <input id="desk-due" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </>
      )}

      <Label>{opt.kind === 'nudge' ? `ข้อความถึง ${owner ?? 'ครู'}` : opt.kind === 'meeting' ? 'เรื่องที่อยากคุย (ไม่บังคับ)' : 'เหตุผล (ลงไทม์ไลน์ของเด็ก)'}</Label>
      <textarea id="desk-msg" value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className={textareaCls} />

      <div className="mt-5">
        <PrimaryBtn disabled={!ready} onClick={save}>
          {opt.kind === 'assign' ? 'มอบหมาย' : opt.kind === 'nudge' ? 'ส่งการเตือน' : opt.kind === 'escalate' ? 'ยกระดับ' : 'บันทึกนัด'}
        </PrimaryBtn>
      </div>
    </Drawer>
  )
}

/** แถบบนสุดของตารางแบบเต็มเมื่อ ผอ. เปิดดู — กลับไปมุมมองของ ผอ. ได้ในคลิกเดียว ไม่ติดค้างที่ ?view=full */
export function BackToDesk({ onBack, label = '← กลับไปมุมมองของ ผอ.' }: { onBack: () => void; label?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-[14.5px] text-ink">กำลังดูตารางแบบเต็ม — สำหรับค้นหา กรอง และส่งออกข้อมูล</p>
      <button type="button" onClick={onBack} className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600">
        {label}
      </button>
    </div>
  )
}
