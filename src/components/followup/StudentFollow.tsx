import { useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CaseLogEntry } from '@/lib/caseLog'
import { caseTimeline, HEALTH_META, type FollowCase } from '@/lib/followOps'
import { fmtTs, type XItem } from '@/lib/refOps'
import { useToast } from '@/components/ui/Toast'
import { IconArrowRight } from '@/components/icons'
import type { Log } from '@/components/referrals/useRefCases'
import { isoIn, textareaCls } from '@/components/referrals/ui'
import { MicButton } from '@/components/student/DeskExtras'
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
  exportLabel = 'ส่งออกประวัติเด็ก',
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
  exportLabel?: string
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
  const pending = fc.support && ['new', 'seen', 'answered'].includes(fc.support.status)
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
          {pending && (
            <p className="mt-1 text-[13.5px] font-semibold text-ink">
              คำขอถึง ผอ.: {fc.support!.status === 'new' ? 'รอ ผอ. เปิดอ่าน' : fc.support!.status === 'seen' ? 'ผอ. รับเรื่องแล้ว กำลังพิจารณา' : 'ตอบ ผอ. แล้ว รอตัดสินใจ'}
            </p>
          )}
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
            {/* ครูขอได้ทุกเมื่อที่ช่วยเองแล้วติด — มีคำขอค้างอยู่ก็กดดูสถานะแทนการส่งซ้ำ */}
            {fc.open && n.kind !== 'directive' && n.kind !== 'replyDirector' && (
              <button type="button" onClick={() => onSheet({ sheet: 'support', mode: 'request' })} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14px] font-medium text-ink">
                {pending ? 'ดูคำขอถึง ผอ.' : 'ขอการสนับสนุนจาก ผอ.'}
              </button>
            )}
          </>
        )}
        <button type="button" onClick={onExport} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14px] font-medium text-ink">
          {exportLabel}
        </button>
      </div>
    </div>
  )
}

/**
 * ไทม์ไลน์การช่วยเหลือ — ชุดเดียวกับหน้าติดตาม: บันทึกของครู + ระเบียน +
 * เหตุการณ์ของการส่งต่อ + จุดที่ระดับความเสี่ยงเปลี่ยน
 *
 * ส่ง `by` มาด้วยเมื่อไหร่ ด้านบนจะเป็นช่องบันทึกในตัว (ครูบันทึกตรงที่อ่าน ไม่ต้องหาฟอร์ม)
 * บันทึกของบัญชีนี้แก้ข้อความ ลบ และติ๊กนัดว่าทำแล้วได้
 */
export function StudentTimeline({
  fc,
  entries,
  log,
  mayAct,
  onLogContact,
  by,
  onVisit,
  composerRef,
}: {
  fc: FollowCase
  entries: CaseLogEntry[]
  log: Log
  mayAct: boolean
  onLogContact: () => void
  /** ชื่อผู้บันทึก — มีแล้วจึงแสดงช่องบันทึก */
  by?: string
  /** เยี่ยมบ้านต้องใช้ฟอร์มเต็ม (ผู้ร่วมพูดคุย ลายเซ็น) */
  onVisit?: () => void
  composerRef?: RefObject<HTMLTextAreaElement>
}) {
  const { push } = useToast()
  const items = useMemo(() => caseTimeline(fc, entries), [fc, entries])
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const [all, setAll] = useState(false)
  const [filter, setFilter] = useState<'all' | XItem['who']>('all')
  const [fresh, setFresh] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const [draft, setDraft] = useState('')
  const [confirmDel, setConfirmDel] = useState<string>()

  const counts = { all: items.length, school: 0, director: 0, agency: 0, system: 0 }
  for (const x of items) counts[x.who] += 1
  const filtered = filter === 'all' ? items : items.filter((x) => x.who === filter)
  const shown = all ? filtered : filtered.slice(0, 12)
  const composer = Boolean(by) && mayAct

  return (
    <div className="rounded-2xl border border-surface-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
        <div>
          <h3 className="text-[16px] font-bold text-ink">ไทม์ไลน์การช่วยเหลือ</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">ใหม่ไปเก่า · บันทึกของโรงเรียน หน่วยงานที่รับส่งต่อ และการเปลี่ยนระดับความเสี่ยง</p>
        </div>
        {mayAct && !composer && (
          <button type="button" onClick={onLogContact} className="rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-brand-700">
            บันทึกการติดต่อผู้ปกครอง
          </button>
        )}
      </div>

      {composer && (
        <Composer
          childId={fc.s.id}
          by={by!}
          log={log}
          inputRef={composerRef}
          onVisit={onVisit}
          onSaved={(id, toast) => {
            setFresh(id)
            setFilter('all')
            push(toast)
          }}
        />
      )}

      <div className="px-5 py-4">
        {items.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="กรองไทม์ไลน์">
            {(['all', 'school', 'director', 'agency', 'system'] as const)
              .filter((k) => k === 'all' || counts[k] > 0)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`rounded-full border px-3 py-1.5 text-[13.5px] font-medium ${filter === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink'}`}
                >
                  {WHO_TH[k]} {counts[k]}
                </button>
              ))}
          </div>
        )}

        {/* จุดสีเดียว (เข้ม = ล่าสุด) — ใครทำ/ชนิดบันทึกบอกด้วยคำ ไม่ใช้สีแยก */}
        <ol className="relative ml-2 border-l-2 border-surface-border">
          {shown.map((x, i) => {
            const e = x.entryId ? byId.get(x.entryId) : undefined
            const isNew = e && e.id === fresh
            // แก้/ลบได้เฉพาะบันทึกของตัวเอง — ประวัติต้องบอกได้ว่าใครบันทึกอะไร
            // บันทึกของคำขอถึง ผอ. เป็นหลักฐานการตัดสินใจ แก้ไม่ได้ทั้งสองฝ่าย
            const editable = mayAct && e && !e.requestId && (!by || e.by === by)
            return (
              <li key={x.entryId ?? `${x.ts}-${i}`} className="relative pb-4 pl-5 last:pb-0">
                <span
                  className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white"
                  style={{ background: i === 0 ? '#0f172a' : '#94a3b8' }}
                />
                <div className={isNew ? '-mx-2 rounded-xl bg-brand-50 px-2 py-1.5' : ''}>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-faint">
                    <span>{fmtTs(x.ts).replace(/ \d\d:\d\d$/, '')}</span>
                    <span>·</span>
                    <span>{x.who === 'school' ? x.by : x.who === 'director' ? `ผอ. · ${x.by}` : x.who === 'agency' ? `หน่วยงาน · ${x.by}` : 'ระบบ'}</span>
                    {x.mode && MODE_TH[x.mode] && (
                      <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[12px] font-semibold text-ink-muted">{MODE_TH[x.mode]}</span>
                    )}
                    {isNew && <span className="text-[12px] font-bold text-brand-700">· เพิ่งบันทึก</span>}
                  </p>

                  {editing && e && editing === e.id ? (
                    <div className="mt-1.5">
                      <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={3} className={textareaCls} aria-label="แก้ไขบันทึก" />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={draft.trim().length < 3}
                          onClick={() => {
                            log.updateEntry(e.id, { note: draft.trim() })
                            setEditing(undefined)
                            push('แก้ไขบันทึกแล้ว')
                          }}
                          className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
                        >
                          บันทึกการแก้ไข
                        </button>
                        <button type="button" onClick={() => setEditing(undefined)} className="rounded-xl border border-surface-border px-4 py-2.5 text-[14px] font-medium text-ink">
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 whitespace-pre-line text-[14.5px] leading-snug text-ink">{x.th}</p>
                  )}

                  {e && editing !== e.id && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
                      {e.followUpDate && (
                        <button
                          type="button"
                          onClick={() => log.setFollowUpDone(e.id, !e.followUpDone)}
                          className={`font-semibold ${e.followUpDone ? 'text-ink-faint line-through' : 'text-brand-700'}`}
                        >
                          {e.followUpDone ? `✓ ทำตามนัด ${e.followUpDate} แล้ว` : `☐ นัด ${e.followUpDate} — กดเมื่อทำแล้ว`}
                        </button>
                      )}
                      {editable && confirmDel !== e.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(e.note)
                              setEditing(e.id)
                              setConfirmDel(undefined)
                            }}
                            className="font-semibold text-ink-muted"
                          >
                            แก้ไข
                          </button>
                          <button type="button" onClick={() => setConfirmDel(e.id)} className="font-semibold text-ink-muted">
                            ลบ
                          </button>
                        </>
                      )}
                      {editable && confirmDel === e.id && (
                        <span className="flex items-center gap-3">
                          <span className="text-ink">ลบบันทึกนี้?</span>
                          <button
                            type="button"
                            onClick={() => {
                              log.remove(e.id)
                              setConfirmDel(undefined)
                              push('ลบบันทึกแล้ว')
                            }}
                            className="font-bold text-red-700"
                          >
                            ลบ
                          </button>
                          <button type="button" onClick={() => setConfirmDel(undefined)} className="font-semibold text-ink-muted">
                            ไม่ลบ
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        {filtered.length > 12 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[14px] font-semibold text-brand-700">
            {all ? 'ย่อ' : `ดูทั้งหมด ${filtered.length} รายการ`}
          </button>
        )}
        {!items.length && <p className="text-[14px] text-ink-muted">ยังไม่มีประวัติการช่วยเหลือ — เริ่มบันทึกได้จากช่องด้านบน</p>}
      </div>
    </div>
  )
}

const WHO_TH = { all: 'ทั้งหมด', school: 'โรงเรียน', director: 'ผอ.', agency: 'หน่วยงาน', system: 'ระบบ' } as const
const MODE_TH: Partial<Record<CaseLogEntry['mode'], string>> = { contact: 'ติดต่อผู้ปกครอง', visit: 'เยี่ยมบ้าน', talk: 'คุยกับนักเรียน' }

type Kind = 'note' | 'contact' | 'talk'
const KIND_ITEMS: { key: Kind | 'visit'; th: string }[] = [
  { key: 'note', th: 'บันทึกทั่วไป' },
  { key: 'contact', th: 'ติดต่อผู้ปกครอง' },
  { key: 'talk', th: 'คุยกับนักเรียน' },
  { key: 'visit', th: 'เยี่ยมบ้าน' },
]
const PLACEHOLDER: Record<Kind, string> = {
  note: 'เช่น วันนี้เด็กมาเรียน สีหน้าดีขึ้น แต่ยังไม่มีเงินค่าเดินทางพรุ่งนี้',
  contact: 'คุยแล้วได้ความว่าอย่างไร (ไม่บังคับ)',
  talk: 'เช่น เด็กบอกว่าต้องช่วยแม่ขายของตอนเช้า อยากเรียนต่อแต่กลัวตามไม่ทัน',
}
const CONTACT_OUT: { key: 'reached' | 'appointment' | 'noAnswer'; th: string }[] = [
  { key: 'reached', th: 'ติดต่อได้' },
  { key: 'appointment', th: 'นัดหมายแล้ว' },
  { key: 'noAnswer', th: 'ติดต่อไม่ได้' },
]
const CHANNELS = ['โทรศัพท์', 'LINE', 'พบตัว'] as const

/**
 * ช่องบันทึกในไทม์ไลน์ — เลือกชนิด → เขียนหรือพูด → วันไหน → นัดครั้งถัดไป → บันทึก
 * บันทึกทั่วไปกับคุยกับนักเรียนต้องมีข้อความ · ติดต่อผู้ปกครองเลือกผลอย่างเดียวก็พอ (ระบบเขียนประโยคให้)
 * ติดต่อได้/ไม่ได้อัปเดตสถานะการติดต่อผู้ปกครองของเด็กด้วย เหมือนฟอร์มเต็ม
 */
function Composer({
  childId,
  by,
  log,
  inputRef,
  onVisit,
  onSaved,
}: {
  childId: string
  by: string
  log: Log
  inputRef?: RefObject<HTMLTextAreaElement>
  onVisit?: () => void
  onSaved: (id: string, toast: string) => void
}) {
  const [kind, setKind] = useState<Kind>('note')
  const [text, setText] = useState('')
  const [out, setOut] = useState<(typeof CONTACT_OUT)[number]['key']>()
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('โทรศัพท์')
  const [when, setWhen] = useState<'today' | 'yesterday' | 'pick'>('today')
  const [day, setDay] = useState(isoIn(-2))
  const [next, setNext] = useState<'' | '3' | '7' | '14'>('')
  const [err, setErr] = useState<string>()

  const date = when === 'today' ? isoIn(0) : when === 'yesterday' ? isoIn(-1) : day
  const ready = kind === 'contact' ? Boolean(out) : text.trim().length >= 3

  const reset = () => {
    setText('')
    setOut(undefined)
    setWhen('today')
    setNext('')
    setErr(undefined)
  }

  const save = () => {
    if (!ready) return setErr(kind === 'contact' ? 'เลือกผลการติดต่อก่อน' : 'เขียนสั้น ๆ สักประโยค (อย่างน้อย 3 ตัวอักษร)')
    if (date > isoIn(0)) return setErr('บันทึกล่วงหน้าไม่ได้ — ถ้าจะนัด ใช้ "นัดครั้งถัดไป"')
    const t = text.trim()
    const outTh = CONTACT_OUT.find((o) => o.key === out)?.th
    const note =
      kind === 'contact' ? `ติดต่อผู้ปกครองทาง${channel} — ${outTh}${t ? `: ${t}` : ''}` : kind === 'talk' ? `คุยกับนักเรียน: ${t}` : t
    const id = log.add({
      childId,
      by,
      date,
      mode: kind,
      note,
      channel: kind === 'contact' ? channel : undefined,
      outcome: kind === 'contact' ? out : undefined,
      parentContact: kind === 'contact' ? (out === 'noAnswer' ? 'unreachable' : 'ok') : undefined,
      followUpDate: next ? isoIn(Number(next)) : undefined,
    })
    reset()
    onSaved(id, next ? `บันทึกแล้ว · นัดครั้งถัดไป ${isoIn(Number(next))}` : 'บันทึกลงไทม์ไลน์แล้ว')
  }

  return (
    <div className="border-b border-surface-border bg-surface-muted/40 px-5 py-4">
      <p className="mb-2 text-[14px] font-semibold text-ink">เพิ่มบันทึก</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="ชนิดบันทึก">
        {KIND_ITEMS.map((k) => {
          const on = k.key === kind
          return (
            <button
              key={k.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (k.key === 'visit') return onVisit?.()
                setKind(k.key)
                setErr(undefined)
              }}
              className={`rounded-full border px-3.5 py-2 text-[14px] font-medium ${on ? 'border-brand-500 bg-white text-brand-700 shadow-sm' : 'border-surface-border bg-white text-ink'}`}
            >
              {k.th}
              {k.key === 'visit' && <span className="text-ink-muted"> ›</span>}
            </button>
          )
        })}
      </div>

      {kind === 'contact' && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13.5px] text-ink-muted">ผล</span>
            {CONTACT_OUT.map((o) => (
              <ChipBtn key={o.key} on={out === o.key} onClick={() => setOut(o.key)}>
                {o.th}
              </ChipBtn>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13.5px] text-ink-muted">ทาง</span>
            {CHANNELS.map((c) => (
              <ChipBtn key={c} on={channel === c} onClick={() => setChannel(c)}>
                {c}
              </ChipBtn>
            ))}
          </div>
        </div>
      )}

      {/* มือถือ: ปุ่มพูดลงไปอยู่ใต้ช่อง ให้ช่องเขียนได้เต็มความกว้าง */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={PLACEHOLDER[kind]}
          className={`${textareaCls} bg-white`}
          aria-label="ข้อความบันทึก"
        />
        <div className="shrink-0">
          <MicButton onText={(x) => setText((p) => (p ? `${p} ${x}` : x))} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[13.5px] text-ink-muted">เมื่อ</span>
          <ChipBtn on={when === 'today'} onClick={() => setWhen('today')}>วันนี้</ChipBtn>
          <ChipBtn on={when === 'yesterday'} onClick={() => setWhen('yesterday')}>เมื่อวาน</ChipBtn>
          <ChipBtn on={when === 'pick'} onClick={() => setWhen('pick')}>เลือกวัน</ChipBtn>
          {when === 'pick' && (
            <input type="date" value={day} max={isoIn(0)} onChange={(e) => setDay(e.target.value)} className="rounded-xl border border-surface-border bg-white px-3 py-2 text-[14px]" aria-label="วันที่" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[13.5px] text-ink-muted">นัดครั้งถัดไป</span>
          {(['', '3', '7', '14'] as const).map((d) => (
            <ChipBtn key={d || 'none'} on={next === d} onClick={() => setNext(d)}>
              {d ? `${d} วัน` : 'ไม่นัด'}
            </ChipBtn>
          ))}
        </div>
      </div>

      {err && (
        <p className="mt-2 text-[13.5px] font-semibold text-red-700" role="alert">
          ⚠ {err}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={save} className={`w-full rounded-xl px-5 py-3 text-[15px] font-semibold text-white sm:w-auto ${ready ? 'bg-brand-500 shadow-card' : 'bg-brand-300'}`}>
          บันทึกลงไทม์ไลน์
        </button>
      </div>
    </div>
  )
}

function ChipBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-[13.5px] font-medium ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink'}`}
    >
      {children}
    </button>
  )
}
