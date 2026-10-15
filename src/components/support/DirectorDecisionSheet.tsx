import { useMemo, useState } from 'react'
import {
  DIRECTOR_ACT_TH,
  VERDICT_TH,
  type DirectorAct,
  type DirectorVerdict,
  type SupportRequest,
} from '@/lib/caseLog'
import type { FollowCase } from '@/lib/followOps'
import { directiveFor, execSummary, fmtDay, isoIn } from '@/lib/directorOps'
import type { Log } from '@/components/referrals/useRefCases'
import { Label, PrimaryBtn, inputCls, textareaCls } from '@/components/referrals/ui'

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
  log,
  push,
  done,
}: {
  c: FollowCase
  req: SupportRequest
  by: string
  /** รายชื่อครู/บุคลากรในโรงเรียน สำหรับมอบหมาย */
  team: string[]
  log: Log
  push: (m: string) => void
  done: () => void
}) {
  const ai = useMemo(() => execSummary(c, req), [c, req])
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
              <Label>ผู้รับผิดชอบหลักคนใหม่</Label>
              <select id="dec-owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} className={inputCls}>
                <option value="">เลือกครู</option>
                {team.filter((n) => n !== c.s.caseOwner).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
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

/** มอบหมายครูให้เคสที่ยังไม่มีเจ้าของ / เปลี่ยนผู้รับผิดชอบเคสที่ค้างนาน — ผอ. ไม่รับเคสไปทำเอง */
export function AssignOwnerSheet({ c, by, team, log, push, done }: { c: FollowCase; by: string; team: string[]; log: Log; push: (m: string) => void; done: () => void }) {
  const [owner, setOwner] = useState('')
  const [why, setWhy] = useState('')
  const [nudge, setNudge] = useState(false)
  const has = Boolean(c.s.caseOwner)
  return (
    <div>
      <h3 className="text-[18px] font-bold text-ink">{has ? 'เคสค้างนาน — ผอ. ทำอะไรได้' : 'มอบหมายครูผู้รับผิดชอบ'}</h3>
      {has && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={nudge} onClick={() => setNudge(true)} className="rounded-xl border px-3 py-3 text-[14.5px] font-semibold" style={pill(nudge)}>
            เตือนผู้รับผิดชอบ
          </button>
          <button type="button" aria-pressed={!nudge} onClick={() => setNudge(false)} className="rounded-xl border px-3 py-3 text-[14.5px] font-semibold" style={pill(!nudge)}>
            เปลี่ยนผู้รับผิดชอบ
          </button>
        </div>
      )}
      {!nudge && (
        <>
          <Label>ครูผู้รับผิดชอบ</Label>
          <select id="assign-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}>
            <option value="">เลือกครู</option>
            {team.filter((n) => n !== c.s.caseOwner).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </>
      )}
      <Label>{nudge ? 'ข้อความถึงผู้รับผิดชอบ' : 'เหตุผล'}</Label>
      <textarea id="assign-why" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} className={textareaCls} placeholder={nudge ? 'เช่น ขอให้อัปเดตเคสภายในพรุ่งนี้ ติดอะไรแจ้ง ผอ. ได้' : 'เช่น เสี่ยงสูง ต้องมีผู้ดูแลภายในวันนี้'} />
      <div className="mt-4">
        <PrimaryBtn
          disabled={why.trim().length < 3 || (!nudge && !owner)}
          onClick={() => {
            if (!nudge) log.setOwner(c.s.id, owner)
            log.add({
              childId: c.s.id,
              mode: 'note',
              date: isoIn(0),
              by,
              role: 'director',
              escalation: 'ผอ.',
              note: nudge ? `ผอ. เตือน ${c.s.caseOwner}: ${why.trim()}` : `ผอ. มอบหมาย ${owner} เป็นผู้รับผิดชอบ — ${why.trim()}`,
            })
            push(nudge ? `เตือน ${c.s.caseOwner} แล้ว` : `มอบหมาย ${owner} แล้ว`)
            done()
          }}
        >
          {nudge ? 'ส่งการเตือน' : 'มอบหมาย'}
        </PrimaryBtn>
      </div>
    </div>
  )
}
