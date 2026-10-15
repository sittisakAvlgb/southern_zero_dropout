import { useMemo, useState } from 'react'
import {
  DIRECTOR_ACT_TH,
  VERDICT_TH,
  type DirectorAct,
  type DirectorVerdict,
  type SupportRequest,
} from '@/lib/caseLog'
import type { FollowCase } from '@/lib/followOps'
import { directiveFor, execSummary, fmtDay, isoIn, type TeamRow } from '@/lib/directorOps'
import type { Log } from '@/components/referrals/useRefCases'
import { Label, PrimaryBtn, inputCls, textareaCls } from '@/components/referrals/ui'

/** ครูที่ว่างที่สุด (ไม่นับเจ้าของเดิม) — เคสเสี่ยงสูงน้อยสุด แล้วเคสเปิดน้อยสุด */
export function lightestOf(load: TeamRow[] | undefined, exclude?: string): string | undefined {
  return [...(load ?? [])].filter((r) => r.owner !== exclude).sort((a, b) => a.high - b.high || a.sla - b.sla || a.open - b.open)[0]?.owner
}

/**
 * เลือกครูผู้รับผิดชอบ — แตะเลือกจากรายการที่บอกภาระงานของแต่ละคน ไม่ใช่ dropdown ชื่อเปล่า
 * ผอ. เห็นทันทีว่าใครว่าง ใครงานล้น และทำไม AI แนะนำคนนี้ (ปุ่มใหญ่ ไม่ต้อง hover)
 */
export function OwnerPicker({
  team,
  load,
  value,
  onChange,
  current,
  suggest,
  id,
}: {
  team: string[]
  load?: TeamRow[]
  value: string
  onChange: (owner: string) => void
  /** เจ้าของเคสเดิม — แสดงไว้ให้เทียบ แต่เลือกไม่ได้ */
  current?: string
  suggest?: string
  id: string
}) {
  const rowOf = (n: string) => load?.find((r) => r.owner === n)
  const names = [...new Set([...(current ? [current] : []), ...team])]
  return (
    <div role="radiogroup" aria-labelledby={id} className="space-y-2">
      {names.map((n) => {
        const r = rowOf(n)
        const isCurrent = n === current
        const on = value === n
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={isCurrent}
            onClick={() => onChange(n)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left disabled:cursor-not-allowed ${on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : isCurrent ? 'border-surface-border bg-surface-muted/60' : 'border-surface-border bg-white hover:border-brand-300'}`}
          >
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand-500' : 'border-slate-400'}`} aria-hidden>
              {on && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[15.5px] font-semibold text-ink">{n}</span>
                {isCurrent && <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold text-ink-muted ring-1 ring-surface-border">ผู้รับผิดชอบเดิม</span>}
                {!isCurrent && n === suggest && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[12px] font-semibold text-white">AI แนะนำ</span>}
              </span>
              <span className="mt-0.5 block text-[13.5px] text-ink-muted">
                {r ? `เปิดอยู่ ${r.open} เคส · เสี่ยงสูง ${r.high} · เกิน SLA ${r.sla}` : 'ยังไม่มีเคสที่รับผิดชอบ'}
                {!isCurrent && n === suggest ? ' — ว่างที่สุดในทีม' : ''}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

const ACTS = Object.keys(DIRECTOR_ACT_TH) as DirectorAct[]
const VERDICTS: DirectorVerdict[] = ['approve', 'needInfo', 'sendBack', 'reject']

const pill = (on: boolean) => ({
  borderColor: on ? '#2f66f6' : '#e2e8f0',
  background: on ? '#eef3ff' : '#fff',
  color: on ? '#1d4ed8' : '#0f172a',
})

/**
 * ผอ. ตัดสินใจ — ทุกการตัดสินใจมี ผู้ตัดสินใจ · วันที่ · เหตุผล · next action · ผู้รับผิดชอบ
 * ผลกลับไปเป็น "งานจาก ผอ." ในงานวันนี้ของครูทันที ครูยังเป็นเจ้าของเคส
 */
export function DirectorDecisionSheet({
  c,
  req,
  by,
  team,
  load,
  heavy,
  log,
  push,
  done,
}: {
  c: FollowCase
  req: SupportRequest
  by: string
  /** รายชื่อครู/บุคลากรในโรงเรียน สำหรับมอบหมาย */
  team: string[]
  /** ภาระงานของทีม — ใช้แสดงในตัวเลือกครู */
  load?: TeamRow[]
  /** ครูที่ภาระงานล้น — ใช้ให้ AI เสนอเหมือนการ์ดหน้าแรก */
  heavy?: string
  log: Log
  push: (m: string) => void
  done: () => void
}) {
  const ai = useMemo(() => execSummary(c, req, heavy), [c, req, heavy])
  const [verdict, setVerdict] = useState<DirectorVerdict>('approve')
  const [acts, setActs] = useState<DirectorAct[]>(() => ai.options.slice(0, 2).map((o) => o.act))
  const [meetingDate, setMeetingDate] = useState(isoIn(2))
  const [resource, setResource] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [escalateTo, setEscalateTo] = useState('สพท. (เขตพื้นที่การศึกษา)')
  const [reason, setReason] = useState('')
  const owner0 = c.s.caseOwner || req.by
  const draft = directiveFor(acts, { meetingDate, resource, newOwner })
  const [nextTh, setNextTh] = useState<string>()
  const [support, setSupport] = useState<string[]>()
  const [owner, setOwner] = useState(owner0)
  const [due, setDue] = useState<string>()
  // ค่าตั้งต้นตามสิ่งที่ ผอ. เลือก จนกว่า ผอ. จะแก้เอง
  const nextValue = nextTh ?? (verdict === 'sendBack' ? '' : draft.th)
  const supportValue = support ?? draft.support
  const dueValue = due ?? isoIn(draft.dueDays)
  const ownerValue = acts.includes('owner') && newOwner ? newOwner : owner

  const withNext = verdict === 'approve' || verdict === 'sendBack'
  const ready =
    reason.trim().length >= 3 &&
    (verdict !== 'approve' || acts.length > 0) &&
    (!withNext || nextValue.trim().length >= 3) &&
    (!acts.includes('owner') || newOwner.trim().length >= 2)

  const toggle = (a: DirectorAct) => setActs(acts.includes(a) ? acts.filter((x) => x !== a) : [...acts, a])

  const save = () => {
    const next = withNext ? { th: nextValue.trim(), owner: ownerValue, support: supportValue, due: dueValue } : undefined
    const actsUsed = verdict === 'approve' ? acts : []
    const note =
      verdict === 'needInfo'
        ? `ผอ. ขอข้อมูลเพิ่ม: ${reason.trim()}`
        : verdict === 'reject'
          ? `ผอ. ไม่อนุมัติ: ${reason.trim()}`
          : `${verdict === 'approve' ? `ผอ. อนุมัติ: ${actsUsed.map((a) => DIRECTOR_ACT_TH[a]).join(' + ')}` : 'ผอ. ส่งกลับพร้อมคำแนะนำ'} — ${reason.trim()}${next ? `\n→ ${next.owner}: ${next.th} (กำหนด ${fmtDay(next.due)})` : ''}`
    log.decide(
      req.id,
      {
        by,
        verdict,
        acts: actsUsed,
        reason: reason.trim(),
        next,
        meetingDate: actsUsed.includes('meeting') ? meetingDate : undefined,
        newOwner: actsUsed.includes('owner') ? newOwner.trim() : undefined,
        resource: actsUsed.includes('resource') ? resource.trim() || undefined : undefined,
        escalateTo: actsUsed.includes('escalate') ? escalateTo : undefined,
      },
      note,
    )
    push(verdict === 'needInfo' ? 'ส่งคำถามถึงครูแล้ว' : next ? `ส่งงานถึง ${next.owner} แล้ว — ขึ้นในงานวันนี้ของครูทันที` : 'บันทึกการตัดสินใจแล้ว')
    done()
  }

  return (
    <div>
      <h3 className="text-[18px] font-bold text-ink">ตัดสินใจ</h3>
      <p className="mt-1 text-[14px] text-ink-muted">ครูขอ: {req.ask}</p>

      <Label>ผลการพิจารณา</Label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ผลการพิจารณา">
        {VERDICTS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={verdict === v} onClick={() => setVerdict(v)} className="rounded-xl border px-3 py-3 text-[14.5px] font-semibold" style={pill(verdict === v)}>
            {VERDICT_TH[v]}
          </button>
        ))}
      </div>

      {verdict === 'approve' && (
        <>
          <Label>สิ่งที่ ผอ. ทำให้ (เลือกได้หลายข้อ)</Label>
          {ai.options.length > 0 && <p className="-mt-1 mb-1.5 text-[13px] text-ink-muted">ติ๊กไว้ให้ตามทางเลือกที่ AI เสนอ — ผอ. เปลี่ยนได้</p>}
          <div className="flex flex-wrap gap-2" role="group" aria-label="สิ่งที่ ผอ. ทำให้">
            {ACTS.map((a) => (
              <button key={a} type="button" aria-pressed={acts.includes(a)} onClick={() => toggle(a)} className="rounded-full border px-4 py-2.5 text-[14px] font-medium" style={pill(acts.includes(a))}>
                {acts.includes(a) ? '✓ ' : ''}
                {DIRECTOR_ACT_TH[a]}
              </button>
            ))}
          </div>
          {acts.includes('meeting') && (
            <>
              <Label>วันประชุมทีม</Label>
              <input id="dec-meeting" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className={inputCls} />
            </>
          )}
          {acts.includes('resource') && (
            <>
              <Label>ทรัพยากรที่อนุมัติ</Label>
              <input id="dec-resource" value={resource} onChange={(e) => setResource(e.target.value)} placeholder="เช่น ทุนค่าเดินทาง 500 บาท/เดือน จากกองทุนโรงเรียน" className={inputCls} />
            </>
          )}
          {acts.includes('owner') && (
            <>
              <p id="dec-owner-label" className="mb-1.5 mt-4 text-[14px] font-semibold text-ink">ผู้รับผิดชอบหลักคนใหม่</p>
              <OwnerPicker id="dec-owner-label" team={team} load={load} value={newOwner} onChange={setNewOwner} current={c.s.caseOwner} suggest={lightestOf(load, c.s.caseOwner)} />
            </>
          )}
          {acts.includes('escalate') && (
            <>
              <Label>ยกระดับไปที่</Label>
              <select id="dec-escalate" value={escalateTo} onChange={(e) => setEscalateTo(e.target.value)} className={inputCls}>
                {['สพท. (เขตพื้นที่การศึกษา)', 'ศปก.อำเภอ', 'พมจ. จังหวัด', 'ศอ.บต.'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </>
          )}
        </>
      )}

      <Label>{verdict === 'needInfo' ? 'อยากรู้อะไรเพิ่ม' : 'เหตุผล'}</Label>
      <textarea
        id="dec-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className={textareaCls}
        placeholder={verdict === 'needInfo' ? 'เช่น ครอบครัวมีญาติที่ติดต่อได้ไหม' : verdict === 'reject' ? 'เช่น ทรัพยากรนี้ใช้ได้เฉพาะ ม.ต้น — ให้ใช้ทุนเสมอภาคแทน' : 'เช่น ติดต่อผู้ปกครองไม่ได้ 9 วัน ความเสี่ยงเพิ่มขึ้น'}
      />

      {withNext && (
        <div className="mt-4 rounded-2xl border border-surface-border bg-surface-muted/40 p-4">
          <p className="text-[13px] font-semibold text-ink-muted">ส่งกลับไปที่ครู — ขึ้นใน "งานวันนี้" ทันที</p>
          <Label>{verdict === 'sendBack' ? 'คำแนะนำ / สิ่งที่ครูทำต่อ' : 'สิ่งที่ต้องทำต่อ'}</Label>
          <textarea id="dec-next" value={nextValue} onChange={(e) => setNextTh(e.target.value)} rows={2} className={textareaCls} />
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>ผู้รับผิดชอบ</Label>
              <select id="dec-next-owner" value={ownerValue} onChange={(e) => setOwner(e.target.value)} disabled={acts.includes('owner') && Boolean(newOwner)} className={inputCls}>
                {[...new Set([owner0, ...team])].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>กำหนด</Label>
              <input id="dec-due" type="date" value={dueValue} onChange={(e) => setDue(e.target.value)} className={inputCls} />
            </div>
          </div>
          <Label>ทีมช่วย</Label>
          <input
            id="dec-support"
            value={supportValue.join(', ')}
            onChange={(e) => setSupport(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
            placeholder="คั่นด้วยจุลภาค เช่น ครูแนะแนว, ฝ่ายปกครอง"
            className={inputCls}
          />
        </div>
      )}

      <div className="mt-4">
        <PrimaryBtn disabled={!ready} onClick={save}>
          {verdict === 'needInfo' ? 'ส่งคำถามถึงครู' : verdict === 'reject' ? 'บันทึกว่าไม่อนุมัติ' : 'ยืนยันและส่งงานถึงครู'}
        </PrimaryBtn>
        {!ready && <p className="mt-2 text-[13px] text-ink-muted">{verdict === 'approve' && !acts.length ? 'เลือกสิ่งที่ ผอ. ทำให้อย่างน้อยหนึ่งข้อ · ' : ''}กรอกเหตุผล{withNext ? ' และสิ่งที่ครูต้องทำต่อ' : ''}</p>}
      </div>
    </div>
  )
}

/**
 * ผอ. ขยับเคสที่ค้าง โดยไม่รับเคสไปทำเอง — สามทาง:
 * เตือนผู้รับผิดชอบ · เปลี่ยน/มอบหมายผู้รับผิดชอบ · Escalate หน่วยงานภายนอกที่เกินกำหนด
 * ทุกทางลงไทม์ไลน์ของเด็กพร้อมป้าย "ผอ." และเหตุผล
 */
export type AssignMode = 'nudge' | 'assign' | 'escalate'

export function AssignOwnerSheet({
  c,
  by,
  team,
  log,
  push,
  done,
  start,
  suggestOwner,
  load,
}: {
  c: FollowCase
  by: string
  team: string[]
  log: Log
  push: (m: string) => void
  done: () => void
  start?: AssignMode
  suggestOwner?: string
  load?: TeamRow[]
}) {
  const late = c.refs.filter((r) => r.bucket === 'breach')
  const modes: AssignMode[] = [...(c.s.caseOwner ? (['nudge'] as const) : []), 'assign', ...(late.length ? (['escalate'] as const) : [])]
  const [mode, setMode] = useState<AssignMode>(start && modes.includes(start) ? start : modes[0])
  const [owner, setOwner] = useState(suggestOwner && team.includes(suggestOwner) && suggestOwner !== c.s.caseOwner ? suggestOwner : '')
  // AI เสนอให้ย้ายแล้ว — เติมเหตุผลตั้งต้นให้ ปุ่มกดได้ทันที (ผอ. แก้ได้)
  const [why, setWhy] = useState(
    start === 'assign' && suggestOwner && c.s.caseOwner ? `ลดภาระของ ${c.s.caseOwner} — ย้ายให้ครูที่ว่างกว่า` : start === 'assign' && !c.s.caseOwner ? 'เคสยังไม่มีผู้รับผิดชอบ ต้องมีคนดูแลวันนี้' : '',
  )
  const [refId, setRefId] = useState(late[0]?.id ?? '')
  const [level, setLevel] = useState<2 | 3>(2)
  const MODE_TH: Record<AssignMode, string> = { nudge: 'เตือนผู้รับผิดชอบ', assign: c.s.caseOwner ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมายครู', escalate: 'Escalate หน่วยงาน' }
  const ready = why.trim().length >= 3 && (mode !== 'assign' || Boolean(owner)) && (mode !== 'escalate' || Boolean(refId))
  const ref = late.find((r) => r.id === refId)

  const save = () => {
    const stamp = (note: string) => log.add({ childId: c.s.id, mode: 'note', date: isoIn(0), by, role: 'director', escalation: 'ผอ.', note })
    if (mode === 'assign') {
      log.setOwner(c.s.id, owner)
      stamp(`ผอ. มอบหมาย ${owner} เป็นผู้รับผิดชอบ — ${why.trim()}`)
      push(`มอบหมาย ${owner} แล้ว — เคสขึ้นในงานของ ${owner}`)
    } else if (mode === 'nudge') {
      stamp(`ผอ. เตือน ${c.s.caseOwner}: ${why.trim()}`)
      push(`เตือน ${c.s.caseOwner} แล้ว`)
    } else if (ref) {
      // เหตุการณ์จริงบนการส่งต่อ — ไทม์ไลน์ข้ามหน่วยงานและนาฬิกา SLA เห็นตรงกัน
      log.addRefEvent(ref.id, { type: 'escalated', ts: Date.now(), by, level, note: `ผอ. ยกระดับ${level === 2 ? 'ถึงหัวหน้าหน่วยงาน' : 'ถึงระดับจังหวัด'} — ${why.trim()}` })
      stamp(`ผอ. Escalate ${ref.toName} (${level === 2 ? 'หัวหน้าหน่วยงาน' : 'ระดับจังหวัด'}) — ${why.trim()}`)
      push(`Escalate ${ref.toName} แล้ว`)
    }
    done()
  }

  return (
    <div>
      <h3 className="text-[18px] font-bold text-ink">ผอ. ขยับเคสนี้อย่างไร</h3>
      <p className="mt-1 text-[14px] text-ink-muted">
        {c.s.caseOwner ? `ผู้รับผิดชอบ ${c.s.caseOwner}` : 'ยังไม่มีผู้รับผิดชอบ'} · {c.sla.text} · ไม่มีการอัปเดต {c.updatedDaysAgo} วัน
      </p>
      <div className={`mt-3 grid gap-2 ${modes.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label="สิ่งที่ ผอ. ทำ">
        {modes.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className="rounded-xl border px-3 py-3 text-[14.5px] font-semibold" style={pill(mode === m)}>
            {MODE_TH[m]}
          </button>
        ))}
      </div>

      {mode === 'assign' && (
        <>
          <p id="assign-owner-label" className="mb-1.5 mt-4 text-[14px] font-semibold text-ink">{c.s.caseOwner ? 'ย้ายให้ใคร' : 'ครูผู้รับผิดชอบ'}</p>
          <OwnerPicker id="assign-owner-label" team={team} load={load} value={owner} onChange={setOwner} current={c.s.caseOwner} suggest={suggestOwner ?? lightestOf(load, c.s.caseOwner)} />
        </>
      )}
      {mode === 'escalate' && (
        <>
          <Label>การส่งต่อที่เกินกำหนด</Label>
          <select id="assign-ref" value={refId} onChange={(e) => setRefId(e.target.value)} className={inputCls}>
            {late.map((r) => (
              <option key={r.id} value={r.id}>{r.toName} · {r.needTh} · {r.sla.text}</option>
            ))}
          </select>
          <Label>ยกระดับถึง</Label>
          <div className="grid grid-cols-2 gap-2">
            {([2, 3] as const).map((l) => (
              <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className="rounded-xl border px-3 py-3 text-[14.5px] font-semibold" style={pill(level === l)}>
                {l === 2 ? 'หัวหน้าหน่วยงาน' : 'ระดับจังหวัด'}
              </button>
            ))}
          </div>
        </>
      )}

      <Label>{mode === 'nudge' ? 'ข้อความถึงผู้รับผิดชอบ' : 'เหตุผล'}</Label>
      <textarea
        id="assign-why"
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        rows={2}
        className={textareaCls}
        placeholder={mode === 'nudge' ? 'เช่น ขอให้อัปเดตเคสภายในพรุ่งนี้ ติดอะไรแจ้ง ผอ. ได้' : mode === 'escalate' ? 'เช่น ส่งเรื่องไป 9 วันยังไม่มีผู้รับเคส เด็กขาดเรียนต่อเนื่อง' : 'เช่น เสี่ยงสูง ต้องมีผู้ดูแลภายในวันนี้'}
      />
      <div className="mt-4">
        <PrimaryBtn disabled={!ready} onClick={save}>
          {mode === 'nudge' ? 'ส่งการเตือน' : mode === 'escalate' ? 'Escalate' : 'มอบหมาย'}
        </PrimaryBtn>
      </div>
    </div>
  )
}
