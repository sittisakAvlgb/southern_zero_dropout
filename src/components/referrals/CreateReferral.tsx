import { useMemo, useState } from 'react'
import type { Agency, AgencyKind, ReferralNeed, Student } from '@/types'
import type { User } from '@/auth/roles'
import { NEED_LABEL } from '@/data/referrals'
import { NEED_TO_KIND } from '@/data/agencies'
import { reasonFor } from '@/data/dropReasons'
import { suggestAgencies } from '@/lib/planOps'
import type { ConsentRecord, HandoffType, LocalReferral } from '@/lib/caseLog'
import {
  acceptSlaHours,
  CONSENT_META,
  consentOf,
  needFromStudent,
  readiness,
  SCOPE_OPTIONS,
  sharePreview,
  type ConsentView,
} from '@/lib/refOps'
import { byOf, schoolOf, type Log } from './useRefCases'
import { Chips, ConsentBadge, GhostBtn, inputCls, isoIn, Label, PrimaryBtn, textareaCls } from './ui'

type Step = 'problem' | 'agency' | 'ready' | 'consent' | 'share' | 'confirm'
const STEPS: { k: Step; th: string }[] = [
  { k: 'problem', th: 'ปัญหา' },
  { k: 'agency', th: 'หน่วยงาน' },
  { k: 'ready', th: 'ความพร้อม' },
  { k: 'consent', th: 'ความยินยอม' },
  { k: 'share', th: 'ข้อมูลที่ส่ง' },
  { k: 'confirm', th: 'ยืนยัน' },
]

const NEEDS = Object.keys(NEED_LABEL) as ReferralNeed[]

/** ความยินยอมครอบคลุมหน่วยงานนี้ไหม — ยินยอมให้ "หน่วยงานในแผน" หรือระบุชื่อ */
const covers = (c: ConsentView, agencyId?: string) =>
  (c.state === 'granted' || c.state === 'expiring') &&
  (!c.record || c.record.agencies === 'any' || (agencyId ? c.record.agencies.includes(agencyId) : false))

/**
 * สร้างการส่งต่อ — ใช้ทั้งจากหน้าส่งต่อและจากในเคสของเส้นทางโอกาส
 *
 * ลำดับตาม brief: เหตุผล → AI แนะนำหน่วยงาน → ตรวจความพร้อม → ความยินยอม
 * → ดูข้อมูลที่จะส่งจริง + รูปแบบการส่งมอบ → ยืนยัน → แจ้งผล
 * ไม่มีขั้นไหนที่ข้ามความยินยอมได้ ถ้ายังไม่ได้ ระบบบันทึกเป็นร่างให้
 */
export function CreateReferral({
  student: s,
  log,
  user,
  preset,
  historyCount,
  onDone,
  onOpen,
}: {
  student: Student
  log: Log
  user: User | null
  preset?: { kinds?: AgencyKind[]; reason?: string }
  historyCount: number
  onDone: () => void
  onOpen?: (refId: string) => void
}) {
  const by = byOf(user)
  const guess = useMemo(() => needFromStudent(s), [s])
  // สาเหตุที่ใช้เดาด้านความช่วยเหลือ — ต้องเป็นตัวเดียวกับที่ AI อ้าง ไม่ใช่สาเหตุแรกของเด็ก
  const cause = (guess.key && reasonFor(guess.key)) || s.causeKeys.map((k) => reasonFor(k)).find(Boolean)
  const [step, setStep] = useState<Step>('problem')
  const [need, setNeed] = useState<ReferralNeed>(guess.need)
  const [reason, setReason] = useState(
    preset?.reason ??
      `ขอความช่วยเหลือด้าน${NEED_LABEL[guess.need].th}${cause ? ` — สาเหตุหลักตามรหัส สพฐ. ${cause.id}: ${cause.shortTh}` : ''}`,
  )
  const kinds = preset?.kinds ?? [NEED_TO_KIND[need]]
  // suggestAgencies เรียกประเภทที่ส่งเข้าไปว่า "ตรงกับทางเลือกที่คุณเลือก" ซึ่งจริงเฉพาะเมื่อมาจาก
  // ทางเลือกในเคส — ถ้าประเภทมาจากด้านที่เลือกที่นี่ ต้องบอกเหตุผลตามจริง
  const options = useMemo(
    () =>
      suggestAgencies(s, s.provinceKey, kinds).map((o) =>
        !preset?.kinds && o.agency.kind === kinds[0]
          ? { ...o, why: `รับผิดชอบด้าน${NEED_LABEL[need].th}ในจังหวัดของเด็ก${cause ? ` · ตรงกับสาเหตุรหัส ${cause.id} ${cause.shortTh}` : ''}` }
          : o,
      ),
    [s, kinds.join(','), need, cause?.id], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [agency, setAgency] = useState<Agency | undefined>()
  const [showAlt, setShowAlt] = useState(false)
  const consent = consentOf(s.id, s.consent, s, log.consents[s.id])
  const [editConsent, setEditConsent] = useState(false)
  const allowed = consent.record?.scope ?? ['basic']
  const [share, setShare] = useState<string[]>(['basic', 'summary'])
  const [handoff, setHandoff] = useState<HandoffType>(need === 'protection' ? 'transfer' : 'joint')
  const [phase, setPhase] = useState<'form' | 'sending' | 'done' | 'draft' | 'error'>('form')
  const [refId, setRefId] = useState('')
  const [err, setErr] = useState<string>()

  const top = options[0]
  const ready = readiness({ reason, student: s, consent, historyCount })
  const idx = STEPS.findIndex((x) => x.k === step)
  const slaH = acceptSlaHours(need, s.riskLevel === 'critical')
  const shared = share.filter((k) => k === 'basic' || allowed.includes(k))

  const makeRef = (): LocalReferral => ({
    id: `ref-${Date.now()}`,
    childId: s.id,
    childName: s.name,
    provinceKey: s.provinceKey,
    need,
    reason: reason.trim(),
    reasonCode: cause?.id,
    toAgencyId: agency!.id,
    toAgencyName: agency!.th,
    fromName: schoolOf(user),
    share: shared,
    handoff,
    referralOwner: by,
    createdTs: Date.now(),
  })

  const send = () => {
    setPhase('sending')
    setTimeout(() => {
      // ออฟไลน์ = ส่งไม่ได้จริง บอกตรง ๆ ไม่แกล้งว่าสำเร็จ
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return setPhase('error')
      const ref = makeRef()
      const now = Date.now()
      log.addRef(ref, [
        { type: 'sent', ts: now, by: ref.fromName },
        { type: 'received', ts: now + 1, by: 'ระบบ' },
      ])
      log.add({ childId: s.id, by, date: isoIn(0), mode: 'note', note: `ส่งต่อ ${ref.toAgencyName} — ${NEED_LABEL[need].th}`, refId: ref.id })
      setRefId(ref.id)
      setPhase('done')
    }, 700)
  }

  const saveDraft = () => {
    const ref = makeRef()
    log.addRef(ref, [])
    setRefId(ref.id)
    setPhase('draft')
  }

  // ── ผลลัพธ์ ──
  if (phase === 'sending')
    return (
      <div className="grid place-items-center py-16 text-center" role="status">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
        <p className="mt-4 text-[15px] font-semibold text-ink">กำลังส่งเรื่องถึง {agency?.th}…</p>
      </div>
    )
  if (phase === 'error')
    return (
      <div className="rounded-2xl bg-red-50 p-4">
        <p className="text-[16px] font-bold text-red-700">✕ ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่</p>
        <p className="mt-1 text-[14px] text-ink">ดูเหมือนอุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต ข้อมูลที่กรอกไว้ยังอยู่ครบ ไม่ต้องกรอกใหม่</p>
        <div className="mt-4 flex gap-2">
          <GhostBtn onClick={() => setPhase('form')}>กลับไปแก้ไข</GhostBtn>
          <PrimaryBtn onClick={send}>ลองส่งอีกครั้ง</PrimaryBtn>
        </div>
      </div>
    )
  if (phase === 'done' || phase === 'draft')
    return (
      <div>
        <div className={`rounded-2xl p-4 ${phase === 'done' ? 'bg-green-50' : 'bg-amber-50'}`}>
          {phase === 'done' ? (
            <>
              <p className="text-[17px] font-bold text-green-700">✓ ส่งต่อสำเร็จ และหน่วยงานได้รับแจ้งแล้ว</p>
              <p className="mt-2 text-[14.5px] text-ink">
                {agency?.th} ต้องรับเคสภายใน <b>{slaH} ชั่วโมง</b> · โดยปกติตอบรับใน {Math.round(agency?.avgAcceptHours ?? 24)} ชั่วโมง
              </p>
              <p className="mt-1 text-[14px] text-ink-muted">สถานะตอนนี้: รอหน่วยงานรับเรื่อง · ระบบจะเตือนคุณถ้าใกล้เกินกำหนด</p>
            </>
          ) : (
            <>
              <p className="text-[17px] font-bold text-amber-700">⚠ บันทึกเป็นร่างแล้ว — ยังไม่ได้ส่ง</p>
              <p className="mt-2 text-[14.5px] text-ink">ส่งต่อได้ทันทีที่บันทึกความยินยอมของผู้ปกครอง การส่งต่อนี้จะอยู่ในกลุ่ม "รอความยินยอม"</p>
            </>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <GhostBtn onClick={onDone}>เสร็จ</GhostBtn>
          {onOpen && <PrimaryBtn onClick={() => onOpen(refId)}>ดูการส่งต่อนี้</PrimaryBtn>}
        </div>
      </div>
    )

  const go = (k: Step) => {
    setErr(undefined)
    setStep(k)
  }
  const next = () => {
    if (step === 'problem') {
      if (reason.trim().length < 12) return setErr('เขียนสรุปปัญหาให้หน่วยงานเข้าใจสักประโยค (อย่างน้อย 12 ตัวอักษร)')
      if (!agency) setAgency(top?.agency)
      return go('agency')
    }
    if (step === 'agency') return agency ? go('ready') : setErr('เลือกหน่วยงานก่อน')
    if (step === 'ready') return go('consent')
    if (step === 'consent') return covers(consent, agency?.id) ? go('share') : setErr('ต้องมีความยินยอมที่ครอบคลุมหน่วยงานนี้ก่อน')
    if (step === 'share') return go('confirm')
    send()
  }

  return (
    <div>
      {/* แถบขั้น — ข้อความทุกขั้น ไม่ใช่จุดสี */}
      <ol className="mb-4 grid grid-cols-6 gap-1" aria-label="ขั้นตอน">
        {STEPS.map((x, i) => (
          <li key={x.k} className="min-w-0">
            <span className="block h-1.5 rounded-full" style={{ background: i <= idx ? '#2f66f6' : '#e2e8f0' }} />
            <span className={`mt-1 block truncate text-[12px] ${i === idx ? 'font-bold text-brand-700' : 'text-ink-faint'}`}>{x.th}</span>
          </li>
        ))}
      </ol>

      {step === 'problem' && (
        <>
          <Label>ต้องการความช่วยเหลือด้านไหน</Label>
          {guess.code && (
            <p className="mb-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13.5px] text-ink">
              AI เลือกไว้ให้จากสาเหตุของ {s.name}: <b>{cause?.shortTh}</b> (รหัส {guess.code}) — เปลี่ยนได้
            </p>
          )}
          <Chips
            items={NEEDS.map((k) => ({ key: k, th: NEED_LABEL[k].th }))}
            value={need}
            onPick={(k) => {
              setNeed(k)
              setAgency(undefined)
              setHandoff(k === 'protection' ? 'transfer' : 'joint')
            }}
          />
          <Label>สรุปปัญหาและเหตุผลที่ส่งต่อ (หน่วยงานจะเห็นข้อความนี้)</Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className={textareaCls} />
        </>
      )}

      {step === 'agency' && (
        <>
          {top && !showAlt && (
            <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/60 p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">AI แนะนำ</p>
              <p className="mt-1 text-[17px] font-bold text-ink">{top.agency.th}</p>
              <p className="mt-1 text-[14px] text-ink">
                <span className="text-ink-muted">เหตุผล:</span> {top.why ?? `ดูแลด้าน${NEED_LABEL[need].th}ในจังหวัดของเด็ก`}
              </p>
              <AgencyStats a={top.agency} />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <PrimaryBtn
                  onClick={() => {
                    setAgency(top.agency)
                    go('ready')
                  }}
                >
                  เลือกหน่วยงานนี้
                </PrimaryBtn>
                <GhostBtn onClick={() => setShowAlt(true)}>ดูทางเลือกอื่น</GhostBtn>
              </div>
            </div>
          )}
          {(showAlt || !top) && (
            <>
              <Label>เลือกหน่วยงาน — เรียงตามความเหมาะกับเด็กคนนี้</Label>
              <div className="space-y-1.5">
                {options.slice(0, 8).map(({ agency: a, why }, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAgency(a)}
                    aria-pressed={agency?.id === a.id}
                    className="w-full rounded-xl border px-3.5 py-3 text-left"
                    style={{ borderColor: agency?.id === a.id ? '#2f66f6' : '#e2e8f0', background: agency?.id === a.id ? '#eef3ff' : '#fff' }}
                  >
                    <p className="text-[14.5px] font-semibold text-ink">
                      {a.th} {i === 0 && <span className="text-[12px] font-bold text-brand-600">· AI แนะนำ</span>}
                    </p>
                    {why && <p className="text-[12.5px] text-brand-700">{why}</p>}
                    <AgencyStats a={a} compact />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {step === 'ready' && (
        <>
          <div className={`rounded-2xl p-4 ${ready.ready ? 'bg-green-50' : 'bg-amber-50'}`}>
            <p className={`text-[16px] font-bold ${ready.ready ? 'text-green-700' : 'text-amber-700'}`}>
              {ready.ready ? '✓ พร้อมส่ง' : `⚠ ยังไม่พร้อม — ขาด ${ready.items.filter((i) => i.state === 'no').length} ข้อ`}
            </p>
            <p className="mt-0.5 text-[13.5px] text-ink-muted">ตรวจก่อนส่งเพื่อให้หน่วยงานเริ่มงานได้ทันที ไม่ต้องย้อนมาถาม</p>
          </div>
          <ul className="mt-3 divide-y divide-surface-border rounded-2xl border border-surface-border">
            {ready.items.map((it) => (
              <li key={it.key} className="flex gap-3 px-3.5 py-3">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: it.state === 'ok' ? '#16a34a' : it.state === 'warn' ? '#ea580c' : it.state === 'no' ? '#dc2626' : '#94a3b8' }}
                  aria-hidden
                >
                  {it.state === 'ok' ? '✓' : it.state === 'no' ? '✕' : it.state === 'warn' ? '!' : '–'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-ink">
                    {it.th}
                    <span className="ml-1.5 text-[12px] font-medium text-ink-muted">
                      {it.state === 'ok' ? 'ผ่าน' : it.state === 'no' ? 'ยังขาด (ต้องมี)' : it.state === 'warn' ? 'ควรมี' : 'ไม่บังคับ'}
                    </span>
                  </p>
                  <p className="text-[13px] text-ink-muted">{it.detail}</p>
                  {it.state !== 'ok' && it.fix && <p className="mt-0.5 text-[13px] text-ink">→ {it.fix}</p>}
                  {it.key === 'summary' && it.state === 'no' && (
                    <button type="button" onClick={() => go('problem')} className="mt-1 text-[13px] font-semibold text-brand-700 underline">
                      กลับไปแก้สรุปปัญหา
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 'consent' &&
        (covers(consent, agency?.id) && !editConsent ? (
          <>
            <ConsentSummary c={consent} />
            <button type="button" onClick={() => setEditConsent(true)} className="mt-3 text-[13.5px] font-semibold text-brand-700 underline">
              บันทึกความยินยอมใหม่
            </button>
          </>
        ) : (
          <>
            {consent.state !== 'none' && (
              <p className="mb-2 text-[13.5px] text-ink">
                สถานะตอนนี้: <ConsentBadge state={consent.state} daysLeft={consent.daysLeft} />
                {consent.record && !covers(consent, agency?.id) && consent.state !== 'pending' && ' — ไม่ครอบคลุมหน่วยงานนี้'}
              </p>
            )}
            <ConsentForm
              student={s}
              agency={agency}
              prev={consent.record}
              onSave={(rec) => {
                log.saveConsent(s.id, rec)
                setEditConsent(false)
                if (rec.status === 'granted') {
                  setShare((v) => v.filter((k) => k === 'basic' || rec.scope.includes(k)))
                  go('share')
                }
              }}
              onDraft={saveDraft}
            />
          </>
        ))}

      {step === 'share' && (
        <>
          <Label>ข้อมูลที่หน่วยงานจะเห็นจริง</Label>
          <ul className="space-y-1.5">
            {SCOPE_OPTIONS.map((o) => {
              const inScope = o.key === 'basic' || allowed.includes(o.key)
              const on = o.key === 'basic' || (inScope && share.includes(o.key))
              return (
                <li key={o.key}>
                  <label className={`flex gap-3 rounded-xl border border-surface-border px-3.5 py-3 ${inScope ? '' : 'bg-surface-muted/50'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0"
                      checked={on}
                      disabled={o.key === 'basic' || !inScope}
                      onChange={() => setShare((v) => (on ? v.filter((x) => x !== o.key) : [...v, o.key]))}
                    />
                    <span className="min-w-0">
                      <span className={`block text-[14.5px] font-semibold ${inScope ? 'text-ink' : 'text-ink-faint'}`}>{o.th}</span>
                      {inScope ? (
                        on && <span className="block text-[13px] text-ink-muted">“{sharePreview(s, o.key, reason, historyCount)}”</span>
                      ) : (
                        <span className="block text-[13px] text-ink-faint">ไม่อยู่ในขอบเขตความยินยอม — ส่งไม่ได้</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <Label>รูปแบบการส่งมอบ</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { k: 'joint', th: 'A · ช่วยเหลือร่วมกัน', d: 'โรงเรียนยังเป็นเจ้าของเคส หน่วยงานช่วยเรื่องเฉพาะด้าน' },
                { k: 'transfer', th: 'B · ส่งมอบความรับผิดชอบหลัก', d: 'หน่วยงานเป็นเจ้าภาพหลัก โรงเรียนติดตามผลและรับผลกลับ' },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setHandoff(o.k)}
                aria-pressed={handoff === o.k}
                className="rounded-xl border px-3.5 py-3 text-left"
                style={{ borderColor: handoff === o.k ? '#2f66f6' : '#e2e8f0', background: handoff === o.k ? '#eef3ff' : '#fff' }}
              >
                <p className="text-[14.5px] font-bold text-ink">{o.th}</p>
                <p className="mt-0.5 text-[13px] text-ink-muted">{o.d}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'confirm' && agency && (
        <>
          <dl className="space-y-2.5 rounded-2xl border border-surface-border p-4 text-[14px]">
            <Row k="นักเรียน" v={`${s.name} · ${s.id}`} />
            <Row k="ส่งถึง" v={agency.th} />
            <Row k="ด้าน" v={NEED_LABEL[need].th} />
            <Row k="เหตุผล" v={reason} />
            <Row k="รูปแบบ" v={handoff === 'joint' ? 'A · ช่วยเหลือร่วมกัน — โรงเรียนยังเป็นเจ้าของเคส' : 'B · ส่งมอบความรับผิดชอบหลัก'} />
            <Row k="ผู้รับผิดชอบการส่งต่อ" v={`${by} (คุณ)`} />
            <Row k="ข้อมูลที่ส่ง" v={shared.map((k) => SCOPE_OPTIONS.find((o) => o.key === k)?.th).join(' · ')} />
            <Row k="ความยินยอม" v={`${CONSENT_META[consent.state].icon} ${CONSENT_META[consent.state].th}${consent.record ? ` · ${consent.record.giver} · หมดอายุ ${consent.record.expires}` : ''}`} />
          </dl>
          <p className="mt-3 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[14px] text-ink">
            หลังส่ง {agency.th} ต้องรับเคสภายใน <b>{slaH} ชั่วโมง</b> — ถ้าเกินกำหนด ระบบจะเตือนคุณทันที และเสนอ Escalate เมื่อค้างเกิน 48 และ 72 ชั่วโมงหลังส่ง
          </p>
        </>
      )}

      {err && (
        <p className="mt-3 text-[13.5px] font-semibold text-red-700" role="alert">
          ⚠ {err}
        </p>
      )}

      {!(step === 'agency' && top && !showAlt) && !(step === 'consent' && !covers(consent, agency?.id)) && (
        <div className="mt-5 flex gap-2">
          {idx > 0 && <GhostBtn onClick={() => go(STEPS[idx - 1].k)}>ย้อนกลับ</GhostBtn>}
          <PrimaryBtn onClick={next}>
            {step === 'confirm' ? 'ยืนยันส่งต่อ' : step === 'ready' ? (ready.ready ? 'ถัดไป' : 'ถัดไป: ขอความยินยอม') : 'ถัดไป'}
          </PrimaryBtn>
        </div>
      )}
      {step === 'consent' && !covers(consent, agency?.id) && (
        <div className="mt-3">
          <GhostBtn onClick={() => go('ready')}>ย้อนกลับ</GhostBtn>
        </div>
      )}
      {step === 'agency' && top && !showAlt && (
        <div className="mt-3">
          <GhostBtn onClick={() => go('problem')}>ย้อนกลับ</GhostBtn>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-faint">{k}</dt>
      <dd className="leading-snug text-ink">{v}</dd>
    </div>
  )
}

function AgencyStats({ a, compact }: { a: Agency; compact?: boolean }) {
  return (
    <p className={`${compact ? 'mt-0.5 text-[12.5px]' : 'mt-2 text-[13.5px]'} text-ink-muted`}>
      รับเรื่องเฉลี่ย {Math.round(a.avgAcceptHours)} ชม. · ดำเนินการสำเร็จ {Math.round(a.completionRate)}% · กำลังดูแล {a.openReferrals} เคส
      {!compact && <span className="block">ที่ตั้ง/ช่องทางติดต่อ: {a.contact}</span>}
    </p>
  )
}

export function ConsentSummary({ c }: { c: ConsentView }) {
  const r = c.record
  return (
    <div className="rounded-2xl border border-surface-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ConsentBadge state={c.state} daysLeft={c.daysLeft} />
        {r && <span className="text-[13px] text-ink-muted">บันทึกเมื่อ {r.date}</span>}
      </div>
      {r ? (
        <dl className="mt-3 grid gap-2.5 text-[14px] sm:grid-cols-2">
          <Row k="ผู้ให้ความยินยอม" v={`${r.giver} (${r.relation})`} />
          <Row k="วิธี" v={r.method} />
          <Row k="ขอบเขตข้อมูล" v={r.scope.map((k) => SCOPE_OPTIONS.find((o) => o.key === k)?.th.split(' (')[0]).join(' · ')} />
          <Row k="หน่วยงานที่รับได้" v={r.agencies === 'any' ? 'ทุกหน่วยงานในแผนช่วยเหลือ' : `${r.agencies.length} หน่วยงานที่ระบุ`} />
          <Row k="วัตถุประสงค์" v={r.purpose} />
          <Row k="หมดอายุ" v={`${r.expires}${c.daysLeft !== undefined ? ` (${c.daysLeft < 0 ? 'หมดแล้ว' : `อีก ${c.daysLeft} วัน`})` : ''}`} />
          {r.evidence && <Row k="หลักฐาน" v={r.evidence} />}
        </dl>
      ) : (
        <p className="mt-2 text-[14px] text-ink-muted">ยังไม่มีบันทึกความยินยอม</p>
      )}
    </div>
  )
}

/** ความยินยอม PDPA เป็นขั้นตอนจริง — ต้องตอบได้ว่า ใครให้ ให้อย่างไร ให้แชร์อะไร
 *  กับใคร เพื่ออะไร ถึงเมื่อไร และมีหลักฐานอะไร */
export function ConsentForm({
  student: s,
  agency,
  prev,
  onSave,
  onDraft,
}: {
  student: Student
  agency?: Agency
  prev?: ConsentRecord
  onSave: (r: ConsentRecord) => void
  onDraft?: () => void
}) {
  const rel = s.master.parentRelationName || 'ผู้ปกครอง'
  const [status, setStatus] = useState<ConsentRecord['status']>('granted')
  const [method, setMethod] = useState(prev?.method ?? 'ลงนามในแบบฟอร์มยินยอม')
  const [date, setDate] = useState(isoIn(0))
  const [giver, setGiver] = useState(prev?.giver ?? '')
  const [relation, setRelation] = useState(prev?.relation ?? rel)
  const [scope, setScope] = useState<string[]>(prev?.scope ?? ['basic', 'summary', 'history'])
  const [agencies, setAgencies] = useState<'any' | 'this'>('any')
  const [purpose, setPurpose] = useState(prev?.purpose ?? 'เพื่อช่วยเหลือให้เด็กได้เรียนต่อและได้รับสวัสดิการที่ควรได้')
  const [months, setMonths] = useState<'6' | '12'>('12')
  const [evidence, setEvidence] = useState('ถ่ายภาพแบบฟอร์มที่ลงนามแล้ว')
  const [err, setErr] = useState<string>()

  const save = () => {
    if (status === 'granted' && giver.trim().length < 2) return setErr('ระบุชื่อผู้ให้ความยินยอม')
    if (status === 'granted' && scope.length < 1) return setErr('เลือกขอบเขตข้อมูลอย่างน้อย 1 ข้อ')
    onSave({
      status,
      method,
      date,
      giver: giver.trim() || rel,
      relation,
      scope: scope.includes('basic') ? scope : ['basic', ...scope],
      agencies: agencies === 'any' || !agency ? 'any' : [agency.id],
      purpose,
      expires: isoIn(months === '6' ? 182 : 365),
      evidence,
      ts: Date.now(),
    })
  }

  return (
    <div>
      <Label>ผลการขอความยินยอม</Label>
      <Chips
        items={[
          { key: 'granted' as const, th: '✓ ยินยอม' },
          { key: 'pending' as const, th: '⚠ ยังรอคำตอบ' },
          { key: 'declined' as const, th: '✕ ไม่ยินยอม' },
        ]}
        value={status}
        onPick={setStatus}
      />

      {status === 'granted' && (
        <>
          <Label>ผู้ให้ความยินยอม</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={giver} onChange={(e) => setGiver(e.target.value)} placeholder={`ชื่อ${rel}`} className={inputCls} aria-label="ชื่อผู้ให้ความยินยอม" />
            <input value={relation} onChange={(e) => setRelation(e.target.value)} className={inputCls} aria-label="ความสัมพันธ์กับเด็ก" />
          </div>
          <Label>วิธีให้ความยินยอม และวันที่</Label>
          <Chips
            items={['ลงนามในแบบฟอร์มยินยอม', 'ยินยอมด้วยวาจาต่อหน้าพยาน', 'ผ่านโทรศัพท์/LINE (มีบันทึก)'].map((x) => ({ key: x, th: x }))}
            value={method}
            onPick={setMethod}
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} mt-2`} aria-label="วันที่ให้ความยินยอม" />
          <Label>ขอบเขตข้อมูลที่ยินยอมให้แชร์</Label>
          <div className="space-y-1.5">
            {SCOPE_OPTIONS.map((o) => {
              const on = o.key === 'basic' || scope.includes(o.key)
              return (
                <label key={o.key} className="flex items-center gap-3 rounded-xl border border-surface-border px-3.5 py-2.5 text-[14.5px] text-ink">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={on}
                    disabled={o.key === 'basic'}
                    onChange={() => setScope((v) => (on ? v.filter((x) => x !== o.key) : [...v, o.key]))}
                  />
                  {o.th}
                </label>
              )
            })}
          </div>
          <Label>ให้แชร์กับหน่วยงานใด</Label>
          <Chips
            items={[
              { key: 'any' as const, th: 'ทุกหน่วยงานในแผนช่วยเหลือ' },
              ...(agency ? [{ key: 'this' as const, th: `เฉพาะ ${agency.th}` }] : []),
            ]}
            value={agencies}
            onPick={setAgencies}
          />
          <Label>วัตถุประสงค์</Label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls} aria-label="วัตถุประสงค์" />
          <Label>ระยะเวลาความยินยอม</Label>
          <Chips
            items={[
              { key: '6' as const, th: '6 เดือน' },
              { key: '12' as const, th: '1 ปี' },
            ]}
            value={months}
            onPick={setMonths}
          />
          <Label>หลักฐาน</Label>
          <Chips
            items={['ถ่ายภาพแบบฟอร์มที่ลงนามแล้ว', 'เก็บแบบฟอร์มตัวจริงที่ห้องแนะแนว', 'บันทึกข้อความ/เสียงจากผู้ปกครอง'].map((x) => ({ key: x, th: x }))}
            value={evidence}
            onPick={setEvidence}
          />
        </>
      )}

      {status === 'pending' && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-[14px] text-ink">
          ยังส่งข้อมูลส่วนบุคคลข้ามหน่วยงานไม่ได้จนกว่าผู้ปกครองจะยินยอม (PDPA) — บันทึกการส่งต่อนี้เป็นร่างไว้ก่อน แล้วส่งได้ทันทีเมื่อได้คำตอบ
        </p>
      )}
      {status === 'declined' && (
        <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-3 text-[14px] text-ink">
          ผู้ปกครองไม่ยินยอม — ส่งข้อมูลของเด็กให้หน่วยงานไม่ได้ ทางเลือก: ช่วยเหลือภายในโรงเรียนก่อน หรือนัดคุยกับครอบครัวอีกครั้ง
          (ถ้ามีเหตุคุ้มครองเด็กเร่งด่วน ให้แจ้งผู้บริหารโรงเรียนตามระเบียบ)
        </p>
      )}

      {err && <p className="mt-3 text-[13.5px] font-semibold text-red-700" role="alert">⚠ {err}</p>}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {status === 'pending' && onDraft ? (
          <PrimaryBtn
            onClick={() => {
              save()
              onDraft()
            }}
          >
            บันทึกเป็นร่าง รอความยินยอม
          </PrimaryBtn>
        ) : (
          <PrimaryBtn onClick={save}>{status === 'granted' ? 'บันทึกความยินยอม แล้วไปต่อ' : 'บันทึก'}</PrimaryBtn>
        )}
      </div>
    </div>
  )
}
