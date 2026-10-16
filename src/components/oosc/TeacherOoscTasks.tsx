import { useMemo, useState } from 'react'
import type { User } from '@/auth/roles'
import { assignedOosc } from '@/auth/scope'
import { useI18n } from '@/i18n/LanguageContext'
import type { useCaseLog, ConsentRecord } from '@/lib/caseLog'
import { fmtDay, isoIn } from '@/lib/directorOps'
import { viewOosc, type OoscView } from '@/lib/ooscOps'
import { SCOPE_OPTIONS } from '@/lib/refOps'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { Drawer, Label, PrimaryBtn, inputCls, textareaCls } from '@/components/referrals/ui'
import { useToast } from '@/components/ui/Toast'

type Log = ReturnType<typeof useCaseLog>

/** งานลงพื้นที่ของเด็กนอกระบบที่ ผอ. มอบหมายให้ครูคนนี้ — ยังต้องลงพื้นที่ (มีนัดค้าง)
 *  หรือพบตัวแล้วแต่ยังไม่ได้ความยินยอม เลยจากนั้นเป็นเรื่องที่ ผอ. ขยับต่อ */
export function useTeacherOosc(user: User | null, log: Log): OoscView[] {
  return useMemo(
    () =>
      assignedOosc(user, log.owners)
        .map((r) => viewOosc(r, log))
        .filter((v) => (v.step === 'verify' || v.step === 'notFound' ? Boolean(v.visitDue) : v.step === 'consent'))
        // เลยกำหนดก่อน แล้วตามวันนัด ส่วนที่รอความยินยอมต่อท้าย
        .sort((a, b) => (a.visitDue?.date ?? '9999').localeCompare(b.visitDue?.date ?? '9999')),
    [user, log],
  )
}

const daysTo = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const now = new Date()
  return Math.round((Date.UTC(y, (m ?? 1) - 1, d ?? 1) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
}

/**
 * การ์ด "งานจาก ผอ. · เด็กนอกระบบ" บนหน้าแรกของครู — หนึ่งเด็ก หนึ่งปุ่ม
 *
 * ครูไม่มีทะเบียนเด็กนอกระบบ เห็นเฉพาะเด็กที่ ผอ. มอบหมายให้ตัวเอง (assignedOosc)
 * และเห็นเท่าที่ต้องใช้ลงพื้นที่: ชื่อ อายุ ตำบล ออกมานานเท่าไร และสิ่งที่ ผอ. ฝากมา
 * ผลที่บันทึกลงบันทึกของโรงเรียนรูปแบบเดียวกับที่ ผอ. บันทึก หน้าทะเบียนของ ผอ. จึงขยับตามทันที
 */
export function TeacherOoscTasks({ user, log, mayAct }: { user: User | null; log: Log; mayAct: boolean }) {
  const { tn } = useI18n()
  const tasks = useTeacherOosc(user, log)
  const [open, setOpen] = useState<OoscView | null>(null)
  if (!tasks.length) return null

  return (
    <div className="mt-4 space-y-3">
      {tasks.map((v) => {
        const dir = v.entries.find((e) => e.role === 'director')
        const due = v.visitDue
        const left = due ? daysTo(due.date) : undefined
        const consentStep = v.step === 'consent'
        return (
          <div key={v.r.id} className="rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-amber-800">งานจาก ผอ. · เด็กนอกระบบ</p>
              {due && left !== undefined ? (
                <span className={`rounded-lg px-2.5 py-1 text-[13px] font-bold ${left < 0 ? 'bg-red-600 text-white' : left <= 1 ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-900'}`}>
                  {left < 0 ? `เลยกำหนดลงพื้นที่ ${-left} วัน` : left === 0 ? 'ลงพื้นที่ภายในวันนี้' : `ลงพื้นที่ภายใน ${fmtDay(due.date)} · อีก ${left} วัน`}
                </span>
              ) : consentStep ? (
                <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[13px] font-bold text-amber-900">พบตัวแล้ว · รอความยินยอม</span>
              ) : null}
            </div>
            <p className="mt-2 text-[18px] font-bold leading-snug text-ink">
              {v.r.name} <span className="text-[14px] font-medium text-ink-muted">· {v.r.id}</span>
            </p>
            <p className="mt-0.5 text-[14.5px] leading-snug text-ink">
              {v.r.ageYears} ปี · {tn(v.r.tambonKey)} · ออกจากระบบ {v.r.yearsOut.toFixed(1)} ปี · เรียนถึง {GRADE_LABEL(v.r.lastGradeKey, true)}
            </p>
            {v.r.note && <p className="mt-1 text-[14px] leading-snug text-ink-muted">ทะเบียน: {v.r.note}</p>}
            {dir && (
              <p className="mt-2.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[14.5px] leading-snug text-ink">
                <span className="font-semibold">{dir.by}: </span>
                {dir.note}
              </p>
            )}
            {v.step === 'notFound' && <p className="mt-2 text-[14px] text-ink">ครั้งก่อนลงพื้นที่แล้วไม่พบตัว — ผอ. ให้ไปอีกครั้ง</p>}
            {mayAct && (
              <button
                type="button"
                onClick={() => setOpen(v)}
                className="mt-3 w-full rounded-xl bg-brand-500 px-4 py-3.5 text-[16px] font-semibold text-white shadow-card hover:bg-brand-600"
              >
                {consentStep ? 'บันทึกความยินยอมของครอบครัว' : 'บันทึกผลลงพื้นที่'}
              </button>
            )}
          </div>
        )
      })}
      {open && <FieldResultSheet v={open} by={user?.ownerName ?? user?.name ?? 'ครูผู้รับผิดชอบ'} log={log} tambon={tn(open.r.tambonKey)} onClose={() => setOpen(null)} />}
    </div>
  )
}

const RELATIONS = ['พ่อ', 'แม่', 'ปู่ / ย่า / ตา / ยาย', 'ญาติที่ดูแล']
const METHODS = ['ลงนามในแบบฟอร์ม', 'ยินยอมด้วยวาจาต่อหน้าพยาน']

/** ผลลงพื้นที่ — พบตัว / ไม่พบตัว และถ้าพบ ขอความยินยอมได้ในครั้งเดียวกัน */
function FieldResultSheet({ v, by, log, tambon, onClose }: { v: OoscView; by: string; log: Log; tambon: string; onClose: () => void }) {
  const { push } = useToast()
  const consentOnly = v.step === 'consent'
  const [found, setFound] = useState<boolean | null>(consentOnly ? true : null)
  const [agreed, setAgreed] = useState<boolean | null>(null)
  const [giver, setGiver] = useState('')
  const [relation, setRelation] = useState('')
  const [method, setMethod] = useState(METHODS[0])
  const [note, setNote] = useState('')
  const today = isoIn(0)
  const granted = found === true && agreed === true
  const ready = found !== null && (found === false || agreed === false || (agreed === true && giver.trim().length >= 2 && Boolean(relation))) && (!consentOnly || agreed === true)

  const save = () => {
    const extra = note.trim() ? ` — ${note.trim()}` : ''
    const consentLine = granted ? ` · ${relation} (${giver.trim()}) ยินยอมให้ช่วยเหลือ — ${method}` : ''
    if (consentOnly) {
      log.add({ childId: v.r.id, mode: 'note', date: today, by, consent: 'granted', note: `ได้ความยินยอมจากครอบครัว${consentLine}${extra}` })
    } else {
      log.add({
        childId: v.r.id,
        mode: 'visit',
        date: today,
        by,
        homeVisited: Boolean(found),
        result: found ? 'พบตัว' : 'ไม่พบตัว',
        ...(granted ? { consent: 'granted' as const } : {}),
        note: `ลงพื้นที่: ${found ? 'พบตัว ยืนยันว่าอยู่นอกระบบ' : 'ไม่พบตัว'}${consentLine}${found && agreed === false ? ' · ยังไม่ได้ความยินยอม' : ''}${extra}`,
      })
      // ไปแล้ว — ปิดนัดลงพื้นที่ที่ ผอ. ตั้งไว้ ไม่งั้นทะเบียนของ ผอ. ยังขึ้นว่ารอลงพื้นที่
      for (const e of v.entries) if (e.followUpMethod === 'เยี่ยมบ้าน' && e.followUpDate && !e.followUpDone) log.setFollowUpDone(e.id, true)
    }
    if (granted) {
      const rec: ConsentRecord = {
        status: 'granted',
        method,
        date: today,
        giver: giver.trim(),
        relation,
        scope: SCOPE_OPTIONS.map((o) => o.key),
        agencies: 'any',
        purpose: 'เพื่อการช่วยเหลือให้เด็กได้เรียนต่อ',
        expires: isoIn(365),
        evidence: method === METHODS[0] ? 'แบบฟอร์มที่ครอบครัวลงนาม' : `บันทึกลงพื้นที่ของ ${by}`,
        ts: Date.now(),
      }
      log.saveConsent(v.r.id, rec)
    }
    push(
      !found
        ? `บันทึกว่าไม่พบตัว ${v.r.name} — แจ้ง ผอ. ในไทม์ไลน์แล้ว`
        : granted
          ? `บันทึกแล้ว — ${v.r.name} ได้ความยินยอม ขั้นถัดไป: ทำแผนช่วยเหลือ`
          : `ยืนยันตัวตน ${v.r.name} แล้ว — ขั้นถัดไป: ขอความยินยอมจากครอบครัว`,
    )
    onClose()
  }

  const choice = (on: boolean, label: string, sub: string, pick: () => void) => (
    <button
      key={label}
      type="button"
      role="radio"
      aria-checked={on}
      onClick={pick}
      className={`rounded-xl border px-4 py-3 text-left ${on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-surface-border bg-white'}`}
    >
      <span className="block text-[16px] font-bold text-ink">{label}</span>
      <span className="block text-[13.5px] text-ink-muted">{sub}</span>
    </button>
  )
  const chip = (on: boolean, label: string, pick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={pick}
      className={`rounded-full border px-4 py-2 text-[14.5px] font-medium ${on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-surface-border bg-white text-ink'}`}
    >
      {label}
    </button>
  )

  return (
    <Drawer
      label={consentOnly ? 'บันทึกความยินยอม' : 'บันทึกผลลงพื้นที่'}
      head={
        <>
          <p className="truncate text-[19px] font-bold leading-tight text-ink">{v.r.name}</p>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            {v.r.id} · {v.r.ageYears} ปี · {tambon}
          </p>
        </>
      }
      onClose={onClose}
    >
      <h3 className="text-[18px] font-bold text-ink">{consentOnly ? 'ความยินยอมของครอบครัว' : 'ผลลงพื้นที่'}</h3>
      <p className="mt-1 text-[14px] text-ink-muted">บันทึกลงไทม์ไลน์ของเด็ก ผอ. เห็นทันที</p>

      {!consentOnly && (
        <>
          <p className="mb-1.5 mt-4 text-[14.5px] font-semibold text-ink">พบตัวเด็กไหม</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ผลลงพื้นที่">
            {choice(found === true, 'พบตัว', 'ยืนยันว่าอยู่นอกระบบ', () => setFound(true))}
            {choice(found === false, 'ไม่พบตัว', 'ครอบครัวอาจย้ายถิ่น', () => {
              setFound(false)
              setAgreed(null)
            })}
          </div>
        </>
      )}

      {found && (
        <>
          <p className="mb-1.5 mt-4 text-[14.5px] font-semibold text-ink">ครอบครัวยินยอมให้ช่วยเหลือแล้วไหม</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ความยินยอม">
            {choice(agreed === true, 'ยินยอมแล้ว', 'ส่งต่อหน่วยงานช่วยได้', () => setAgreed(true))}
            {!consentOnly && choice(agreed === false, 'ยังไม่ได้', 'คุยอีกครั้งภายหลัง', () => setAgreed(false))}
          </div>
          {agreed && (
            <>
              <Label>ผู้ให้ความยินยอม</Label>
              <input id="oosc-giver" value={giver} onChange={(e) => setGiver(e.target.value)} className={inputCls} placeholder="ชื่อ-สกุล" />
              <Label>เกี่ยวข้องเป็น</Label>
              <div className="flex flex-wrap gap-2">{RELATIONS.map((r) => chip(relation === r, r, () => setRelation(r)))}</div>
              <Label>วิธีให้ความยินยอม</Label>
              <div className="flex flex-wrap gap-2">{METHODS.map((m) => chip(method === m, m, () => setMethod(m)))}</div>
            </>
          )}
        </>
      )}

      <Label>รายละเอียด (ไม่บังคับ)</Label>
      <textarea id="oosc-field-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaCls} placeholder="เช่น เด็กช่วยครอบครัวกรีดยาง ผู้ปกครองยินดีคุยเรื่องเรียนต่อ" />

      <div className="mt-5">
        <PrimaryBtn disabled={!ready} onClick={save}>
          บันทึกผล
        </PrimaryBtn>
      </div>
    </Drawer>
  )
}
