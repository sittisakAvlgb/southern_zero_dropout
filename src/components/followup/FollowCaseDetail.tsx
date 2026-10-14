import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import type { CaseLogEntry, ContactOutcome } from '@/lib/caseLog'
import { agencyOwners, closability } from '@/lib/recommend'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { fmtTs } from '@/lib/refOps'
import {
  caseTimeline,
  HEALTH_META,
  LEVEL_TH,
  METHODS,
  PIPELINE,
  type FollowCase,
  type Go,
} from '@/lib/followOps'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { assetUrl } from '@/lib/asset'
import { byOf, type Log } from '@/components/referrals/useRefCases'
import { Chips, Drawer, GhostBtn, inputCls, isoIn, Label, PrimaryBtn, Section, textareaCls } from '@/components/referrals/ui'

const MASCOT = assetUrl('ChatBot.png')

export type Sheet =
  | { sheet: 'outcome'; mode: 'contact' | 'visit' | 'followUp' }
  | { sheet: 'schedule'; method?: string }
  | { sheet: 'close' | 'reopen' | 'escalate' | 'ask' }

export const SLA_TONE = { breach: '#dc2626', near: '#ea580c', ok: '#475569', done: '#16a34a' } as const

export function RiskBadge({ c }: { c: FollowCase }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold text-white" style={{ background: RISK_COLOR[c.s.riskLevel] }}>
      เสี่ยง{LEVEL_TH[c.s.riskLevel]} {c.s.riskScore}
    </span>
  )
}

export function HealthBadge({ c }: { c: FollowCase }) {
  const m = HEALTH_META[c.health]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: `${m.color}14`, color: m.color }}>
      {m.icon} {m.th}
    </span>
  )
}

/**
 * รายละเอียดเคส — ลำดับตาม brief:
 * หัว (ชื่อ ความเสี่ยง สุขภาพเคส SLA) → สถานะวันนี้ → AI สรุป → ขั้นถัดไป
 * → บันทึกสั้น → Timeline → Pipeline → ลิงก์ที่เกี่ยวข้อง
 * มือถือมีแถบปุ่มติดล่าง [บันทึกผล] [นัดติดตาม] [ถาม AI]
 */
export function FollowCaseDetail({
  c,
  entries,
  log,
  user,
  mayAct,
  initial,
  closeAfter,
  onClose,
}: {
  c: FollowCase
  entries: CaseLogEntry[]
  log: Log
  user: User | null
  mayAct: boolean
  initial?: Sheet
  /** เปิดมาเพื่อทำแผ่นงานเดียวจากหน้าอื่น — ทำเสร็จแล้วปิดลิ้นชักกลับไปหน้านั้น */
  closeAfter?: boolean
  onClose: () => void
}) {
  const nav = useNavigate()
  const { push } = useToast()
  const by = byOf(user)
  const s = c.s
  const [sheet, setSheet] = useState<Sheet | null>(initial ?? null)
  const [thinking, setThinking] = useState(true)
  const [note, setNote] = useState('')
  const [allTl, setAllTl] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setThinking(false), 500)
    return () => window.clearTimeout(id)
  }, [])
  const tl = useMemo(() => caseTimeline(c, entries), [c, entries])

  const run = (go: Go) => {
    if ('href' in go) return nav(go.href)
    setSheet(go as Sheet)
  }
  const add = (e: Omit<CaseLogEntry, 'id' | 'childId' | 'by' | 'date'> & { date?: string }) =>
    log.add({ childId: s.id, by, date: isoIn(0), ...e })

  const head = (
    <>
      <p className="truncate text-[19px] font-bold leading-tight text-ink">{s.name}</p>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        {GRADE_LABEL(s.gradeKey, true)} · {s.id}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <RiskBadge c={c} />
        <HealthBadge c={c} />
        <span className="text-[13px] font-semibold" style={{ color: SLA_TONE[c.sla.level] }}>
          {c.sla.level === 'breach' ? '⚠ ' : c.sla.level === 'near' ? '⏰ ' : ''}
          {c.sla.text}
        </span>
      </div>
    </>
  )

  if (sheet)
    return (
      <Drawer label={s.name} head={head} onBack={closeAfter ? undefined : () => setSheet(null)} onClose={onClose}>
        <ActionSheet sheet={sheet} c={c} entries={entries} tl={tl} by={by} log={log} add={add} push={push} done={() => (closeAfter ? onClose() : setSheet(null))} go={run} />
      </Drawer>
    )

  return (
    <Drawer
      label={s.name}
      head={head}
      onClose={onClose}
      footer={
        mayAct ? (
          <div className="grid grid-cols-3 gap-2">
            <BarBtn primary onClick={() => setSheet({ sheet: 'outcome', mode: c.next.go && 'sheet' in c.next.go && c.next.go.sheet === 'outcome' ? c.next.go.mode : 'followUp' })}>
              บันทึกผล
            </BarBtn>
            <BarBtn onClick={() => setSheet({ sheet: 'schedule' })}>นัดติดตาม</BarBtn>
            <BarBtn onClick={() => setSheet({ sheet: 'ask' })}>ถาม AI</BarBtn>
          </div>
        ) : (
          <p className="text-center text-[13px] text-ink-muted">บัญชีนี้ดูได้อย่างเดียว</p>
        )
      }
    >
      {/* ── 2. สถานะวันนี้ ───────────────────── */}
      <div className="rounded-2xl border border-surface-border p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">สถานะวันนี้</p>
        <p className="mt-0.5 text-[16px] font-bold leading-snug text-ink">{c.doneToday ? '✓ วันนี้คุณบันทึกเคสนี้แล้ว' : c.because}</p>
        {c.reasons.length > 1 && (
          <ul className="mt-2 space-y-1 text-[14px] text-ink">
            {c.reasons.slice(1, 4).map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13.5px]">
          <div>
            <dt className="text-[12px] text-ink-faint">อัปเดตล่าสุด</dt>
            <dd className="font-semibold text-ink">{c.updatedDaysAgo === 0 ? 'วันนี้' : `${c.updatedDaysAgo} วันก่อน`}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-faint">ผู้รับผิดชอบ</dt>
            <dd className="font-semibold text-ink">{s.caseOwner || 'ยังไม่มี'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[12px] text-ink-faint">นัดติดตามครั้งถัดไป</dt>
            <dd className="font-semibold text-ink">
              {c.followUp
                ? `${c.followUp.entry.followUpMethod ?? 'ติดตามผล'} · ${c.followUp.entry.followUpDate}${c.followUp.entry.followUpTime ? ` ${c.followUp.entry.followUpTime}` : ''} (${c.followUp.daysAway === 0 ? 'วันนี้' : c.followUp.daysAway < 0 ? `เลยมา ${-c.followUp.daysAway} วัน` : `อีก ${c.followUp.daysAway} วัน`})`
                : 'ยังไม่ได้นัด'}
            </dd>
          </div>
          {c.escalated && (
            <div className="col-span-2">
              <dt className="text-[12px] text-ink-faint">ยกระดับแล้ว</dt>
              <dd className="font-semibold text-ink">
                {c.escalated.escalation} · {c.escalated.date}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── 3. AI สรุป ───────────────────────── */}
      <div className="mt-3 rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-4">
        <div className="flex items-center gap-2">
          <img src={MASCOT} alt="" className="h-8 w-8 rounded-xl bg-white object-contain p-0.5" draggable={false} />
          <p className="text-[13px] font-semibold uppercase tracking-wide text-brand-600">AI สรุปเคสนี้</p>
        </div>
        {thinking ? (
          <div className="mt-3 space-y-2" role="status" aria-label="AI กำลังสรุปข้อมูลล่าสุด">
            <p className="text-[13.5px] text-ink-muted">AI กำลังสรุปข้อมูลล่าสุด…</p>
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-4 w-8/12" />
          </div>
        ) : (
          <dl className="mt-3 space-y-2 text-[14.5px]">
            <SumRow k="สถานการณ์" v={c.summary.situation} />
            <SumRow k="ความเสี่ยง" v={c.summary.risk} />
            <SumRow k="เปลี่ยนแปลง" v={c.summary.change} />
            <SumRow k="แนะนำ" v={c.summary.recommend} strong />
          </dl>
        )}
        {mayAct && !thinking && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => run(c.next.go)} className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white">
              ทำตามคำแนะนำ
            </button>
            <button type="button" onClick={() => setSheet({ sheet: 'ask' })} className="rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-brand-700">
              ถาม AI เพิ่มเติม
            </button>
          </div>
        )}
      </div>

      {/* ── 4. ขั้นถัดไป ─────────────────────── */}
      <Section title="ขั้นถัดไป">
        <div className="rounded-2xl border-2 p-4" style={{ borderColor: `${HEALTH_META[c.health].color}55` }}>
          <p className="text-[17px] font-bold leading-snug text-ink">{c.next.th}</p>
          <p className="mt-1 text-[14px] text-ink-muted">เหตุผล: {c.next.whyTh}</p>
          {mayAct && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => run(c.next.go)} className="rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white shadow-card">
                {c.next.cta}
              </button>
              {c.secondary.map((x) => (
                <button key={x.th} type="button" onClick={() => run(x.go)} className="rounded-xl border border-surface-border bg-white px-4 py-3 text-[14.5px] font-medium text-ink">
                  {x.th}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── 5. บันทึกสั้น ────────────────────── */}
      {mayAct && (
        <Section title="บันทึกสั้น">
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น วันนี้เด็กมาเรียนแล้ว แต่ยังมีปัญหาค่าเดินทาง"
              className={inputCls}
              aria-label="บันทึกสั้น"
            />
            <button
              type="button"
              disabled={note.trim().length < 3}
              onClick={() => {
                add({ mode: 'note', note: note.trim() })
                setNote('')
                push('บันทึกแล้ว — เพิ่มเข้า Timeline')
              }}
              className="shrink-0 rounded-xl bg-brand-500 px-4 text-[14.5px] font-semibold text-white disabled:opacity-40"
            >
              บันทึก
            </button>
          </div>
        </Section>
      )}

      {/* ── 6. Timeline ──────────────────────── */}
      <Section title="ที่ผ่านมาเกิดอะไรขึ้นแล้ว">
        <ol className="relative ml-2 border-l-2 border-surface-border">
          {(allTl ? tl : tl.slice(0, 6)).map((x, i) => (
            <li key={i} className="relative pb-3 pl-4">
              <span
                className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white"
                style={{ background: x.who === 'school' ? '#2f66f6' : x.who === 'agency' ? '#7c3aed' : '#94a3b8' }}
              />
              <p className="text-[12.5px] text-ink-faint">
                {fmtTs(x.ts).replace(/ \d\d:\d\d$/, '')} · {x.who === 'school' ? 'โรงเรียน' : x.who === 'agency' ? 'หน่วยงาน' : 'ระบบ'} · {x.by}
              </p>
              <p className="text-[14px] leading-snug text-ink">{x.th}</p>
            </li>
          ))}
        </ol>
        {tl.length > 6 && (
          <button type="button" onClick={() => setAllTl((v) => !v)} className="text-[14px] font-semibold text-brand-700 underline">
            {allTl ? 'ย่อ' : `ดูประวัติทั้งหมด ${tl.length} รายการ`}
          </button>
        )}
      </Section>

      {/* ── 7. Pipeline ──────────────────────── */}
      <Section title="ตอนนี้เคสอยู่ขั้นไหน">
        <Pipeline stage={s.caseStage} />
      </Section>

      {/* ── 8. ลิงก์ ─────────────────────────── */}
      <Section title="ดูเพิ่มเติม">
        <div className="grid grid-cols-2 gap-2">
          <LinkBtn onClick={() => nav(`/student?id=${s.id}`)}>ข้อมูลเด็กรายบุคคล</LinkBtn>
          <LinkBtn onClick={() => nav(`/plan?child=${s.id}`)}>{c.hasPlan ? 'แผนโอกาส' : 'สร้างแผนโอกาส'}</LinkBtn>
          <LinkBtn onClick={() => nav(c.refs[0] ? `/referral?ref=${c.refs[0].id}` : `/referral?child=${s.id}`)}>
            {c.refs.length ? `การส่งต่อ (${c.refs.length})` : 'ส่งต่อหน่วยงาน'}
          </LinkBtn>
          <LinkBtn onClick={() => setAllTl(true)}>ประวัติทั้งหมด</LinkBtn>
        </div>
      </Section>
    </Drawer>
  )
}

function SumRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-[13px] font-semibold text-ink-muted">{k}</dt>
      <dd className={`leading-snug ${strong ? 'font-bold text-brand-800' : 'text-ink'}`}>{v}</dd>
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

function LinkBtn({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-surface-border px-3 py-3 text-left text-[14px] font-medium text-brand-700">
      → {children}
    </button>
  )
}

function Pipeline({ stage }: { stage: FollowCase['s']['caseStage'] }) {
  const { t } = useI18n()
  const at = PIPELINE.indexOf(stage)
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-2xl border border-surface-border p-3 sm:grid-cols-4">
      {PIPELINE.map((p, i) => (
        <li key={p} className="flex items-center gap-2 text-[13.5px]">
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
            style={{ background: i < at ? '#16a34a' : i === at ? '#2f66f6' : '#e2e8f0', color: i <= at ? '#fff' : '#64748b' }}
            aria-hidden
          >
            {i < at ? '✓' : i + 1}
          </span>
          <span className={i === at ? 'font-bold text-ink' : i < at ? 'text-ink' : 'text-ink-faint'}>
            {t(`stage.${p}`)}
            {i === at && ' ← ตอนนี้'}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ── แผ่นงาน ─────────────────────────────────────────────────

const OUTCOMES: Record<'contact' | 'visit' | 'followUp', { k: string; th: string; contact?: ContactOutcome; parent?: 'ok' | 'unreachable'; visited?: boolean; refer?: boolean }[]> = {
  contact: [
    { k: 'reached', th: 'ติดต่อได้', contact: 'reached', parent: 'ok' },
    { k: 'noAnswer', th: 'ติดต่อไม่ได้', contact: 'noAnswer', parent: 'unreachable' },
    { k: 'appointment', th: 'นัดหมายแล้ว', contact: 'appointment', parent: 'ok' },
    { k: 'wait', th: 'ผู้ปกครองขอเวลา', contact: 'reached', parent: 'ok' },
    { k: 'newIssue', th: 'พบปัญหาใหม่', contact: 'reached', parent: 'ok' },
    { k: 'refer', th: 'ต้องส่งต่อ', contact: 'reached', parent: 'ok', refer: true },
  ],
  visit: [
    { k: 'met', th: 'พบผู้ปกครองและนักเรียน', visited: true, parent: 'ok' },
    { k: 'noOne', th: 'ไม่พบใครที่บ้าน' },
    { k: 'newIssue', th: 'พบปัญหาใหม่', visited: true },
    { k: 'refer', th: 'ต้องส่งต่อ', visited: true, refer: true },
  ],
  followUp: [
    { k: 'better', th: 'ดีขึ้น' },
    { k: 'same', th: 'เหมือนเดิม' },
    { k: 'worse', th: 'แย่ลง' },
    { k: 'newIssue', th: 'พบปัญหาใหม่' },
    { k: 'refer', th: 'ต้องส่งต่อ', refer: true },
  ],
}

const OUT_TITLE = { contact: 'บันทึกการติดต่อผู้ปกครอง', visit: 'บันทึกผลการเยี่ยมบ้าน', followUp: 'บันทึกผลการติดตาม' } as const

function ActionSheet({
  sheet,
  c,
  entries,
  tl,
  by,
  log,
  add,
  push,
  done,
  go,
}: {
  sheet: Sheet
  c: FollowCase
  entries: CaseLogEntry[]
  tl: ReturnType<typeof caseTimeline>
  by: string
  log: Log
  add: (e: Omit<CaseLogEntry, 'id' | 'childId' | 'by' | 'date'>) => string
  push: (m: string) => void
  done: () => void
  go: (g: Go) => void
}) {
  const s = c.s
  const [pickK, setPickK] = useState<string>()
  const [method, setMethod] = useState<string>(sheet.sheet === 'schedule' && sheet.method ? sheet.method : sheet.sheet === 'outcome' && sheet.mode === 'contact' ? 'โทรผู้ปกครอง' : 'คุยกับนักเรียน')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<null | { th: string; refer?: boolean }>(null)
  const [days, setDays] = useState<'1' | '3' | '7' | 'custom'>('3')
  const [date, setDate] = useState(isoIn(3))
  const [time, setTime] = useState('09:00')
  const [owner, setOwner] = useState(by)
  const [remind, setRemind] = useState<'day' | 'before'>('day')
  const [confirm, setConfirm] = useState(false)
  const [esc, setEsc] = useState<string>()
  const [newOwner, setNewOwner] = useState('')
  const [q, setQ] = useState<string>()

  // ── ผลหลังบันทึก — ถามต่อทันทีว่าจะนัดครั้งหน้าเมื่อไร ──
  if (saved)
    return (
      <div>
        <div className="rounded-2xl bg-green-50 p-4">
          <p className="text-[17px] font-bold text-green-700">✓ บันทึกการติดตามแล้ว</p>
          <p className="mt-1 text-[14px] text-ink">เพิ่มเข้า Timeline: “{saved.th}”</p>
          <p className="mt-1 text-[13.5px] text-ink-muted">กำหนดติดตามเริ่มนับใหม่จากวันนี้</p>
        </div>
        <p className="mt-4 text-[15px] font-semibold text-ink">ทำอะไรต่อ</p>
        <div className="mt-2 space-y-2">
          {saved.refer ? (
            <PrimaryBtn onClick={() => go({ href: `/referral?child=${s.id}` })}>ส่งต่อหน่วยงาน</PrimaryBtn>
          ) : (
            <PrimaryBtn onClick={() => { setSaved(null); go({ sheet: 'schedule' }) }}>นัดติดตามครั้งถัดไป</PrimaryBtn>
          )}
          <button type="button" onClick={done} className="w-full rounded-xl border border-surface-border bg-white px-4 py-3.5 text-[15px] font-semibold text-ink">
            กลับไปที่เคส
          </button>
        </div>
      </div>
    )

  if (sheet.sheet === 'outcome') {
    const opts = OUTCOMES[sheet.mode]
    const chosen = opts.find((o) => o.k === pickK)
    return (
      <div>
        <h3 className="text-[18px] font-bold text-ink">{OUT_TITLE[sheet.mode]}</h3>
        {sheet.mode !== 'visit' && (
          <>
            <Label>{sheet.mode === 'contact' ? 'ช่องทาง' : 'วิธีติดตาม'}</Label>
            <Chips
              items={(sheet.mode === 'contact' ? ['โทรผู้ปกครอง', 'LINE', 'ผ่านผู้นำชุมชน / อสม.'] : [...METHODS]).map((x) => ({ key: x, th: x }))}
              value={method}
              onPick={setMethod}
            />
          </>
        )}
        <Label>ผลลัพธ์</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {opts.map((o) => (
            <label
              key={o.k}
              className="flex items-center gap-3 rounded-xl border px-3.5 py-3 text-[15px]"
              style={{ borderColor: pickK === o.k ? '#2f66f6' : '#e2e8f0', background: pickK === o.k ? '#eef3ff' : '#fff' }}
            >
              <input type="radio" name="outcome" className="h-5 w-5" checked={pickK === o.k} onChange={() => setPickK(o.k)} />
              {o.th}
            </label>
          ))}
        </div>
        <Label>บันทึกเพิ่มเติม (ไม่บังคับ)</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaCls} placeholder="เช่น ติดต่อแม่แล้ว นัดคุยพรุ่งนี้ 09:00" />
        <div className="mt-4">
          <PrimaryBtn
            disabled={!chosen}
            onClick={() => {
              const what = sheet.mode === 'visit' ? 'เยี่ยมบ้าน' : method
              const th = `${what}: ${chosen!.th}${note.trim() ? ` — ${note.trim()}` : ''}`
              add({
                mode: sheet.mode === 'visit' ? 'visit' : sheet.mode === 'contact' ? 'contact' : 'talk',
                channel: sheet.mode === 'contact' ? method : undefined,
                outcome: chosen!.contact,
                note: th,
                result: chosen!.th,
                ...(chosen!.parent ? { parentContact: chosen!.parent } : {}),
                ...(chosen!.visited ? { homeVisited: true } : {}),
              })
              // ทำตามนัดแล้ว — ปิดเฉพาะนัดที่เป็นเรื่องเดียวกัน โทรไม่ติดไม่ได้แปลว่า
              // นัดประสานผู้นำชุมชนเสร็จแล้ว (เคยปิดนัดแรกสุดทิ้งทุกครั้งที่บันทึกอะไรก็ได้)
              const same = (m?: string) => !m || m === what || (sheet.mode === 'contact' && m === 'โทรผู้ปกครอง' && method === 'โทรผู้ปกครอง')
              const due = entries.find((e) => e.followUpDate && !e.followUpDone && same(e.followUpMethod))
              if (due) log.setFollowUpDone(due.id, true)
              setSaved({ th, refer: chosen!.refer })
            }}
          >
            บันทึกผล
          </PrimaryBtn>
        </div>
      </div>
    )
  }

  if (sheet.sheet === 'schedule')
    return (
      <div>
        <h3 className="text-[18px] font-bold text-ink">นัดติดตามครั้งถัดไป</h3>
        <Label>วิธีติดตาม</Label>
        <Chips items={METHODS.map((x) => ({ key: x as string, th: x as string }))} value={method} onPick={setMethod} />
        <Label>วันที่</Label>
        <Chips
          items={[
            { key: '1' as const, th: 'พรุ่งนี้' },
            { key: '3' as const, th: 'อีก 3 วัน' },
            { key: '7' as const, th: 'อีก 7 วัน' },
            { key: 'custom' as const, th: 'เลือกวัน' },
          ]}
          value={days}
          onPick={(k) => {
            setDays(k)
            if (k !== 'custom') setDate(isoIn(Number(k)))
          }}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input type="date" value={date} min={isoIn(0)} onChange={(e) => { setDays('custom'); setDate(e.target.value) }} className={inputCls} aria-label="วันที่นัด" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} aria-label="เวลา" />
        </div>
        <Label>ผู้รับผิดชอบ</Label>
        <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} aria-label="ผู้รับผิดชอบ" />
        <Label>การเตือน</Label>
        <Chips
          items={[
            { key: 'day' as const, th: 'เตือนในวันนัด' },
            { key: 'before' as const, th: 'เตือนล่วงหน้า 1 วัน' },
          ]}
          value={remind}
          onPick={setRemind}
        />
        <p className="mt-2 text-[13px] text-ink-muted">นัดจะขึ้นในหน้า "เคสของฉัน" และในงานวันนี้ของหน้านี้ — การนัดอย่างเดียวไม่นับเป็นการอัปเดตเคส</p>
        <div className="mt-4">
          <PrimaryBtn
            onClick={() => {
              add({
                mode: 'note',
                note: `นัด${method} ${date} ${time}${owner.trim() && owner.trim() !== by ? ` · ผู้รับผิดชอบ ${owner.trim()}` : ''}${remind === 'before' ? ' · เตือนล่วงหน้า 1 วัน' : ''}`,
                followUpDate: date,
                followUpTime: time,
                followUpMethod: method,
                followUpOwner: owner.trim() || by,
              })
              push(`นัด${method}วันที่ ${date} ${time} แล้ว`)
              done()
            }}
          >
            บันทึกนัด
          </PrimaryBtn>
        </div>
      </div>
    )

  if (sheet.sheet === 'close') {
    const cl = closability(s)
    const openRefs = c.refs.filter((r) => r.bucket !== 'done')
    const ok = cl.ready && !openRefs.length && confirm
    return (
      <div>
        <h3 className="text-[18px] font-bold text-ink">ประเมินเพื่อปิดเคส</h3>
        <p className="mt-1 text-[14px] text-ink-muted">ระบบเสนอได้ แต่ครูเป็นคนตัดสินใจปิดเสมอ</p>
        <ul className="mt-3 divide-y divide-surface-border rounded-2xl border border-surface-border">
          {cl.metTh.map((m) => (
            <li key={m} className="px-4 py-2.5 text-[14.5px] text-ink">
              <span className="font-bold text-green-700">✓</span> {m}
            </li>
          ))}
          {cl.missingTh.map((m) => (
            <li key={m} className="px-4 py-2.5 text-[14.5px] text-ink">
              <span className="font-bold text-red-700">✕</span> {m}
            </li>
          ))}
          <li className="px-4 py-2.5 text-[14.5px] text-ink">
            {openRefs.length ? (
              <>
                <span className="font-bold text-red-700">✕</span> ยังมีการส่งต่อที่เปิดอยู่ {openRefs.length} รายการ — ปิดการส่งต่อก่อน
              </>
            ) : (
              <>
                <span className="font-bold text-green-700">✓</span> ไม่มีการส่งต่อที่ค้าง
              </>
            )}
          </li>
        </ul>
        <label className="mt-3 flex items-start gap-3 rounded-xl border border-surface-border px-3.5 py-3 text-[14.5px] text-ink">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          ได้คุยกับนักเรียนและครอบครัวแล้ว และจะติดตามห่าง ๆ ต่อหลังปิดเคส
        </label>
        <div className="mt-4 flex gap-2">
          <GhostBtn onClick={done}>ยังไม่ปิด</GhostBtn>
          <PrimaryBtn
            disabled={!ok}
            onClick={() => {
              add({ mode: 'note', note: `ปิดเคส — ประเมินผลแล้ว: ${cl.metTh.join(' · ')}`, stage: 'resolved', result: 'ปิดเคส' })
              push(`ปิดเคสของ ${s.name} แล้ว`)
              done()
            }}
          >
            ปิดเคส
          </PrimaryBtn>
        </div>
        {!cl.ready && <p className="mt-2 text-[13px] text-ink-muted">ยังปิดไม่ได้จนกว่าจะผ่านทุกข้อ — ข้อที่ยังไม่ผ่านอยู่ด้านบน</p>}
      </div>
    )
  }

  if (sheet.sheet === 'reopen')
    return (
      <div>
        <h3 className="text-[18px] font-bold text-ink">เปิดเคสอีกครั้ง</h3>
        <p className="mt-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[14.5px] text-ink">
          ความเสี่ยงตอนนี้ {s.riskScore}/100 (ระดับ{LEVEL_TH[s.riskLevel]}) · ประวัติเดิมทั้งหมดยังอยู่ในเคสเดียวกัน ไม่เริ่มใหม่
        </p>
        <Label>เหตุผล</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaCls} placeholder="เช่น กลับมาขาดเรียนอีก 3 วันติด" />
        <div className="mt-4">
          <PrimaryBtn
            onClick={() => {
              add({ mode: 'note', note: `เปิดเคสอีกครั้ง — ${note.trim() || (c.relapse ? `ความเสี่ยงกลับมาที่ ${s.riskScore}/100` : 'ครูพบเรื่องที่ต้องติดตามต่อ')}`, stage: 'inProgress', result: 'เปิดเคสอีกครั้ง' })
              push('เปิดเคสอีกครั้งแล้ว')
              done()
            }}
          >
            เปิดเคสอีกครั้ง
          </PrimaryBtn>
        </div>
      </div>
    )

  if (sheet.sheet === 'escalate') {
    const opts = [
      ...(s.caseOwner && s.caseOwner !== by ? ['เตือนผู้รับผิดชอบ'] : []),
      'แจ้งหัวหน้างานแนะแนว',
      'แจ้ง ผอ.โรงเรียน',
      'เปลี่ยนผู้รับผิดชอบ',
      'ส่งต่อหน่วยงาน',
    ]
    return (
      <div>
        <h3 className="text-[18px] font-bold text-ink">Escalate เคสนี้</h3>
        <p className="mt-2 rounded-xl bg-red-50 px-3.5 py-3 text-[14px] text-ink">เหตุผล: {c.reasons[0] ?? c.sla.text}</p>
        <p className="mt-1 text-[13px] text-ink-muted">ระบบไม่ยกระดับเอง — บันทึกไว้ใน Timeline ให้ตรวจสอบได้ว่าใครแจ้งใครเมื่อไร</p>
        <div className="mt-3 space-y-2">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-3 rounded-xl border px-3.5 py-3 text-[15px]" style={{ borderColor: esc === o ? '#2f66f6' : '#e2e8f0', background: esc === o ? '#eef3ff' : '#fff' }}>
              <input type="radio" name="esc" className="h-5 w-5" checked={esc === o} onChange={() => setEsc(o)} />
              {o}
            </label>
          ))}
        </div>
        {esc === 'เปลี่ยนผู้รับผิดชอบ' && <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="ชื่อผู้รับผิดชอบคนใหม่" className={`${inputCls} mt-2`} />}
        <div className="mt-4">
          <PrimaryBtn
            disabled={!esc || (esc === 'เปลี่ยนผู้รับผิดชอบ' && newOwner.trim().length < 2)}
            onClick={() => {
              if (esc === 'ส่งต่อหน่วยงาน') return go({ href: `/referral?child=${s.id}` })
              if (esc === 'เปลี่ยนผู้รับผิดชอบ') log.setOwner(s.id, newOwner.trim())
              const what = esc === 'เปลี่ยนผู้รับผิดชอบ' ? `เปลี่ยนผู้รับผิดชอบเป็น ${newOwner.trim()}` : esc!
              add({ mode: 'note', note: `Escalate: ${what} — ${c.reasons[0] ?? c.sla.text}`, escalation: what })
              push(`บันทึกการ Escalate แล้ว: ${what}`)
              done()
            }}
          >
            ยืนยัน
          </PrimaryBtn>
        </div>
      </div>
    )
  }

  // ── ถาม AI — คำถามสำเร็จรูป ตอบจากข้อมูลของเด็กคนนี้ ──
  const QS: { k: string; th: string; a: () => string[] }[] = [
    { k: 'why', th: `ทำไมต้องติดตาม${s.name.split(' ')[0]}วันนี้`, a: () => (c.reasons.length ? c.reasons.map((r) => `• ${r}`) : ['ไม่มีเรื่องเร่งด่วน — ติดตามตามรอบปกติ']) },
    {
      k: 'history',
      th: 'ที่ผ่านมาทำอะไรไปแล้วบ้าง',
      a: () => tl.filter((x) => x.who !== 'system').slice(0, 5).map((x) => `• ${fmtTs(x.ts).replace(/ \d\d:\d\d$/, '')} — ${x.th}`),
    },
    {
      k: 'trend',
      th: 'ดีขึ้นหรือแย่ลง',
      a: () => [
        `คะแนนเสี่ยง ${s.riskHistory[0]?.score ?? s.riskScore} → ${s.riskScore} ใน 8 สัปดาห์ (${c.riskDelta > 0 ? `แย่ลง ${c.riskDelta}` : c.riskDelta < 0 ? `ดีขึ้น ${-c.riskDelta}` : 'ทรงตัว'})`,
        `มาเรียนล่าสุด ${Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)}% · ขาดติดกัน ${s.absenceStreak} วัน`,
        c.summary.change,
      ],
    },
    {
      k: 'refer',
      th: 'ควรส่งต่อไหม ส่งใคร',
      a: () => {
        const o = agencyOwners(s)
        return o.length ? ['สาเหตุของเด็กคนนี้มีเจ้าภาพตามตาราง สพฐ.:', ...o.map((x) => `• ${x}`)] : ['สาเหตุอยู่ในมือโรงเรียน ยังไม่จำเป็นต้องส่งต่อ']
      },
    },
    {
      k: 'close',
      th: 'ปิดเคสได้หรือยัง',
      a: () => {
        const cl = closability(s)
        return cl.ready ? ['✓ เข้าเกณฑ์แล้ว', ...cl.metTh.map((m) => `• ${m}`)] : ['ยังไม่ได้ — ยังขาด:', ...cl.missingTh.map((m) => `• ${m}`)]
      },
    },
    {
      k: 'unreachable',
      th: 'ถ้าติดต่อผู้ปกครองไม่ได้ ทำอย่างไร',
      a: () => [
        '1. ลองช่องทางอื่น: LINE หรือฝากผ่านผู้นำชุมชน / อสม.',
        '2. นัดเยี่ยมบ้านภายใน 3 วัน',
        `3. ถ้ายังไม่พบ ให้แจ้ง ผอ. และพิจารณาส่งต่อ${agencyOwners(s)[0] ? ` (${agencyOwners(s)[0]})` : ''}`,
      ],
    },
  ]
  const cur = QS.find((x) => x.k === q)
  return (
    <div>
      <div className="flex items-center gap-2">
        <img src={MASCOT} alt="" className="h-9 w-9 rounded-xl bg-brand-50 object-contain p-0.5" draggable={false} />
        <h3 className="text-[18px] font-bold text-ink">ถาม AI เรื่อง{s.name.split(' ')[0]}</h3>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {QS.map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => setQ(x.k)}
            aria-pressed={q === x.k}
            className="rounded-full border px-4 py-2.5 text-left text-[14px] font-medium"
            style={{ borderColor: q === x.k ? '#2f66f6' : '#e2e8f0', background: q === x.k ? '#eef3ff' : '#fff' }}
          >
            {x.th}
          </button>
        ))}
      </div>
      {cur && (
        <div className="mt-4 rounded-2xl bg-brand-50/60 p-4">
          <p className="text-[14px] font-semibold text-brand-700">{cur.th}</p>
          <div className="mt-2 space-y-1 text-[14.5px] leading-snug text-ink">
            {cur.a().map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-ink-muted">ตอบจากข้อมูลในระบบของเด็กคนนี้</p>
        </div>
      )}
    </div>
  )
}
