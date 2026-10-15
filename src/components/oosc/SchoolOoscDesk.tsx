import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { fmtDay, isoIn, teamLoad, type TeamRow } from '@/lib/directorOps'
import { STEP_ORDER, STEP_SHORT, STEP_TH, needsDirector, ooscBrief, priorityOf, viewOosc, type OoscOption, type OoscStep, type OoscView } from '@/lib/ooscOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { byOf } from '@/components/referrals/useRefCases'
import { Drawer, Label, PrimaryBtn, inputCls, textareaCls } from '@/components/referrals/ui'
import { DeskCard, MASCOT, btnSecondary } from '@/components/director/DeskParts'
import { IconRegistry } from '@/components/icons'
import { OwnerPicker, lightestOf } from '@/components/support/DirectorDecisionSheet'
import { teamOf } from '@/pages/DirectorDecisions'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'


/** แถบขั้นของเด็กหนึ่งคน — เห็นทันทีว่าติดตรงไหน */
function StepTrack({ v }: { v: OoscView }) {
  const at = v.step === 'notFound' ? 1 : STEP_ORDER.indexOf(v.step)
  return (
    <>
    <ol className="grid grid-cols-6 gap-1" aria-label={`ขั้นของเด็ก: ${STEP_TH[v.step]}`}>
      {STEP_ORDER.map((s, i) => {
        const done = i < at || v.step === 'done'
        const here = i === at && v.step !== 'done'
        return (
          <li key={s} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${done ? 'bg-brand-500' : here ? (v.step === 'notFound' ? 'bg-red-500' : 'bg-amber-500') : 'bg-surface-muted'}`} />
            {/* จอแคบ ชื่อขั้นหกช่องถูกตัดจนอ่านไม่ออก — แสดงบรรทัดเดียวด้านล่างแทน */}
            <span className={`mt-1 hidden truncate text-[12px] sm:block ${here ? 'font-bold text-ink' : 'text-ink-muted'}`}>{STEP_SHORT[s as Exclude<OoscStep, 'notFound'>]}</span>
          </li>
        )
      })}
    </ol>
    <p className="mt-1.5 text-[13.5px] text-ink-muted sm:hidden">
      ขั้นที่ {Math.min(at, STEP_ORDER.length - 1) + 1} จาก {STEP_ORDER.length}: <span className="font-semibold text-ink">{STEP_TH[v.step]}</span>
    </p>
    </>
  )
}

/** จุดหกจุดแบบแถวของแผนครู — เห็นทันทีว่าเด็กเดินมาถึงขั้นไหน */
function StepDots({ v }: { v: OoscView }) {
  const at = v.step === 'notFound' ? 1 : STEP_ORDER.indexOf(v.step)
  return (
    <div className="hidden shrink-0 flex-col items-end justify-center gap-1.5 sm:flex">
      <div className="flex gap-1" aria-hidden>
        {STEP_ORDER.map((s, i) => (
          <span
            key={s}
            className={`h-2.5 w-2.5 rounded-full ${i < at || v.step === 'done' ? 'bg-green-600' : i === at ? (v.step === 'notFound' ? 'bg-red-500' : 'bg-brand-500') : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <span className="text-[12.5px] text-ink-muted">
        ขั้นที่ {Math.min(at, STEP_ORDER.length - 1) + 1}/{STEP_ORDER.length}
      </span>
    </div>
  )
}

const toneOf = (v: OoscView): 'red' | 'orange' | 'green' =>
  v.step === 'owner' || v.step === 'notFound' || v.visitDue?.late ? 'red' : needsDirector(v) ? 'orange' : 'green'

/**
 * ทะเบียนเด็กนอกระบบ สำหรับ ผอ. — หน้าตาเดียวกับเส้นทางโอกาสและการส่งต่อ (ซึ่งตามแบบหน้าครู)
 *
 *   ผู้ช่วย AI (ตัวเลข → ข้อสังเกต → ปุ่มเดียว) → รายชื่อแบ่งกลุ่ม "ต้องใช้ ผอ." ก่อน → ข้อมูลประกอบพับไว้
 *
 * แต่ละแถวบอกว่าเด็กติดขั้นไหน ใครรับผิดชอบ และ AI แนะนำให้ ผอ. ทำอะไร กดแถวแล้วเปิดลิ้นชัก:
 * สถานะ → AI มองว่า → ทางเลือกของ ผอ. (มอบหมาย · เตือน · บันทึกผลที่ได้รับแจ้ง) ทุกอย่างเก็บในบันทึกของโรงเรียน
 */
export function SchoolOoscDesk({ onFullView }: { onFullView: () => void }) {
  const { t, tn } = useI18n()
  const nav = useNavigate()
  const { push } = useToast()
  const { oosc } = useScopedData()
  const { user, log, built } = useFollowCases()
  const loading = useSimulatedLoading(400)
  const by = byOf(user)
  const cases = 'list' in built ? built.list : []
  const load = useMemo(() => teamLoad(cases).rows, [cases])
  const team = useMemo(() => teamOf(cases), [cases])

  const views = useMemo(() => oosc.map((r) => viewOosc(r, log)), [oosc, log])
  const byPrio = (a: OoscView, b: OoscView) => priorityOf(b) - priorityOf(a)
  const queue = views.filter((v) => needsDirector(v) && !v.handled).sort(byPrio)
  const waiting = views.filter((v) => needsDirector(v) && v.handled).sort(byPrio)
  const following = views.filter((v) => v.step === 'follow').sort(byPrio)
  const done = views.filter((v) => v.step === 'done')

  const [openId, setOpenId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ v: OoscView; opt: OoscOption } | null>(null)
  const counts = Object.fromEntries([...STEP_ORDER, 'notFound'].map((s) => [s, views.filter((v) => v.step === s).length])) as Record<OoscStep, number>
  const briefFor = (v: OoscView) => ooscBrief(v, tn(v.r.tambonKey), lightestOf(load, v.owner ?? undefined))

  const q = (s: OoscStep) => queue.filter((v) => v.step === s).length
  const lateVisit = queue.filter((v) => v.visitDue?.late).length
  const insight = queue.length
    ? [
        q('owner') > 0 && `${q('owner')} คนยังไม่มีผู้รับผิดชอบ`,
        q('verify') > 0 && `${q('verify')} คนรอลงพื้นที่${lateVisit ? ` (เลยกำหนด ${lateVisit})` : ''}`,
        q('notFound') > 0 && `${q('notFound')} คนลงพื้นที่แล้วไม่พบตัว`,
        q('consent') > 0 && `${q('consent')} คนรอความยินยอม`,
        q('plan') > 0 && `${q('plan')} คนยังไม่มีแผน`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'ทุกคนมีผู้รับผิดชอบและเดินหน้าอยู่ ไม่มีเรื่องที่ต้องใช้ ผอ. วันนี้'
  const first = queue[0]
  const open = openId ? views.find((v) => v.r.id === openId) : undefined

  const row = (v: OoscView, line: React.ReactNode) => (
    <li key={v.r.id} className="border-b border-surface-border last:border-0">
      <button type="button" onClick={() => setOpenId(v.r.id)} className="group flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-muted/60">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[16px] font-bold text-ink">{v.r.name}</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] font-semibold text-ink-muted">
              {v.r.ageYears} ปี · {tn(v.r.tambonKey)}
            </span>
          </div>
          <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink">{line}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            <span className={v.owner ? 'font-semibold text-brand-700' : 'font-semibold text-red-700'}>{v.owner ?? 'ยังไม่มีผู้รับผิดชอบ'}</span>
            {v.visitDue && (
              <span className={v.visitDue.late ? 'font-semibold text-red-700' : ''}>
                {' · '}นัดลงพื้นที่ {fmtDay(v.visitDue.date)}
                {v.visitDue.late && ' (เลยกำหนด)'}
              </span>
            )}
            <span> · ออกจากระบบ {v.r.yearsOut.toFixed(1)} ปี</span>
          </p>
        </div>
        <StepDots v={v} />
        <span aria-hidden className="shrink-0 self-center text-[16px] text-ink-faint group-hover:text-brand-600">
          →
        </span>
      </button>
    </li>
  )

  const group = (title: string, dot: string, items: OoscView[], line: (v: OoscView) => React.ReactNode) =>
    items.length ? (
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
          <span className={`h-3 w-3 rounded-full ${dot}`} />
          {title}
          <span className="font-medium text-ink-faint">· {items.length}</span>
        </h2>
        <ul className="overflow-hidden rounded-2xl border border-surface-border bg-white">{items.map((v) => row(v, line(v)))}</ul>
      </section>
    ) : null

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconRegistry width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.oosc')]} />}
        title={t('nav.oosc')}
        subtitle="เด็กที่โรงเรียนแจ้งว่าหลุดจากระบบ — ผอ. ดูว่าแต่ละคนมีคนรับผิดชอบและเดินต่อได้หรือยัง"
      />

      {/* ── NUMBER → INSIGHT → ACTION (เหมือนหน้าครู) ─────────── */}
      <div className="mb-5 rounded-3xl border-2 border-brand-200 bg-gradient-to-b from-brand-50/80 to-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <img src={MASCOT} alt="" className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-card" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">ผู้ช่วย AI ของคุณ</p>
            {loading ? (
              <div className="mt-1.5 space-y-2">
                <Skeleton className="h-5 w-8/12" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            ) : (
              <>
                <p className="mt-0.5 text-[17px] font-semibold leading-snug text-ink">
                  เด็กที่โรงเรียนแจ้ง {views.length} คน · <span className={queue.length ? 'text-red-600' : ''}>{queue.length} คนต้องใช้ ผอ.</span>
                  {counts.done > 0 && <> · กลับเข้าเรียนแล้ว {counts.done}</>}
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{insight}</p>
              </>
            )}
          </div>
        </div>
        {!loading && first && (
          <button
            type="button"
            onClick={() => setOpenId(first.r.id)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600 sm:w-auto"
          >
            เปิดคนแรก · {first.r.name} <span aria-hidden>→</span>
          </button>
        )}
      </div>

      {loading || 'error' in built ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5 pb-24">
          {group('ต้องใช้ ผอ.', 'bg-red-600', queue, (v) => {
            const o = briefFor(v).options[0]
            return (
              <>
                <span className="text-ink-muted">{STEP_TH[v.step]} —</span> {o ? `AI แนะนำ: ${o.label}` : 'ดูรายละเอียด'}
              </>
            )
          })}
          {group('ผอ. ดำเนินการแล้ว รอผล', 'bg-amber-500', waiting, (v) => (
            <>
              <span className="text-ink-muted">{STEP_TH[v.step]} —</span> รอผู้รับผิดชอบแจ้งผล
            </>
          ))}
          {group('กำลังดึงกลับตามแผน', 'bg-green-600', following, () => (
            <>
              <span className="text-ink-muted">ครูดูแลอยู่:</span> ติดตามตามแผนช่วยเหลือ
            </>
          ))}

          {done.length > 0 && (
            <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
              <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
                  กลับเข้าเรียน / มีอาชีพแล้ว · {done.length}
                </span>
              </summary>
              <ul className="mt-2 overflow-hidden rounded-xl border border-surface-border">{done.map((v) => row(v, STEP_TH.done))}</ul>
            </details>
          )}

          <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
            <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
                เด็กเดินมาถึงไหนแล้ว
              </span>
            </summary>
            <ul className="mt-3 space-y-2.5">
              {([...STEP_ORDER, 'notFound'] as OoscStep[]).map((s) => (
                <li key={s} className="flex items-center gap-3 text-[14.5px]">
                  <span className="w-44 shrink-0 text-ink sm:w-56">{STEP_TH[s]}</span>
                  <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <span className="block h-full rounded-full bg-slate-400" style={{ width: `${(counts[s] / Math.max(1, views.length)) * 100}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right font-bold tabular text-ink">{counts[s]}</span>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onFullView} className={btnSecondary}>
              เปิดทะเบียนแบบเต็ม (ค้นหา · กรอง · กราฟ)
            </button>
            <button type="button" onClick={() => nav('/decisions')} className={btnSecondary}>
              ไปที่เรื่องที่ต้องตัดสินใจ
            </button>
          </div>
        </div>
      )}

      {/* กดแถว → สถานะ · AI มองว่า · ทางเลือกของ ผอ. */}
      {open && !sheet && (
        <Drawer
          label={open.r.name}
          head={
            <>
              <p className="truncate text-[19px] font-bold leading-tight text-ink">{open.r.name}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                {open.r.id} · {open.r.ageYears} ปี · {tn(open.r.tambonKey)} · {open.owner ?? 'ยังไม่มีผู้รับผิดชอบ'}
              </p>
            </>
          }
          onClose={() => setOpenId(null)}
        >
          {(() => {
            const b = briefFor(open)
            const inQueue = queue.indexOf(open)
            return (
              <DeskCard
                b={{ ...b, tag: STEP_TH[open.step], tone: toneOf(open), question: b.options.length ? `${STEP_TH[open.step]} — ${b.question}` : b.question }}
                body={<StepTrack v={open} />}
                position={inQueue >= 0 ? `คนที่ ${inQueue + 1} จาก ${queue.length}` : open.handled ? 'ผอ. ดำเนินการแล้ว' : 'ครูดูแลอยู่'}
                sources="ทะเบียนเด็กนอกระบบ · สิ่งที่บันทึกในเคสนี้ · ภาระงานของทีม"
                onPick={(opt) => setSheet({ v: open, opt })}
              />
            )
          })()}
        </Drawer>
      )}

      {sheet && (
        <OoscActionSheet
          v={sheet.v}
          opt={sheet.opt}
          by={by}
          team={team}
          load={load}
          log={log}
          push={push}
          tambon={tn(sheet.v.r.tambonKey)}
          onClose={() => {
            setSheet(null)
            setOpenId(null)
          }}
        />
      )}
    </div>
  )
}

/** มอบหมาย · เตือน · บันทึกผลลงพื้นที่ — ผอ. ไม่ลงพื้นที่เอง แต่บันทึกผลที่ผู้รับผิดชอบแจ้งได้ */
function OoscActionSheet({
  v,
  opt,
  by,
  team,
  load,
  log,
  push,
  tambon,
  onClose,
}: {
  v: OoscView
  opt: OoscOption
  by: string
  team: string[]
  load: TeamRow[]
  log: ReturnType<typeof useFollowCases>['log']
  push: (m: string) => void
  tambon: string
  onClose: () => void
}) {
  const suggest = lightestOf(load, v.owner ?? undefined)
  const [owner, setOwner] = useState(opt.kind === 'assign' ? (suggest ?? '') : '')
  const [due, setDue] = useState(isoIn(7))
  const [msg, setMsg] = useState(opt.message ?? '')
  const [found, setFound] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const today = isoIn(0)
  const head = (
    <>
      <p className="truncate text-[19px] font-bold leading-tight text-ink">{v.r.name}</p>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        {v.r.id} · {v.r.ageYears} ปี · {tambon} · {STEP_TH[v.step]}
      </p>
    </>
  )

  const save = () => {
    if (opt.kind === 'assign') {
      log.setOwner(v.r.id, owner)
      log.add({
        childId: v.r.id,
        mode: 'note',
        date: today,
        by,
        role: 'director',
        note: `ผอ. มอบหมาย ${owner} ลงพื้นที่ยืนยันตัวตนภายใน ${fmtDay(due)}${note.trim() ? ` — ${note.trim()}` : ''}`,
        followUpDate: due,
        followUpMethod: 'เยี่ยมบ้าน',
        followUpOwner: owner,
      })
      push(`มอบหมาย ${owner} ลงพื้นที่แล้ว · กำหนด ${fmtDay(due)}`)
    } else if (opt.kind === 'nudge') {
      log.add({ childId: v.r.id, mode: 'note', date: today, by, role: 'director', escalation: 'ผอ.', note: `ผอ. เตือน ${v.owner}: ${msg.trim()}` })
      push(`เตือน ${v.owner} แล้ว`)
    } else {
      // ผลที่ผู้รับผิดชอบแจ้ง ผอ. บันทึกแทน — ระบุว่าใครแจ้ง ไม่อ้างว่า ผอ. ไปเอง
      log.add({
        childId: v.r.id,
        mode: 'visit',
        date: today,
        by,
        role: 'director',
        homeVisited: Boolean(found),
        result: found ? 'พบตัว' : 'ไม่พบตัว',
        note: `ผลลงพื้นที่ (แจ้งโดย ${v.owner ?? 'ผู้รับผิดชอบ'}): ${found ? 'พบตัว ยืนยันว่าอยู่นอกระบบ' : 'ไม่พบตัว'}${note.trim() ? ` — ${note.trim()}` : ''}`,
      })
      for (const e of v.entries) if (e.followUpMethod === 'เยี่ยมบ้าน' && e.followUpDate && !e.followUpDone) log.setFollowUpDone(e.id, true)
      push(found ? `ยืนยันตัวตน ${v.r.name} แล้ว — ขั้นถัดไป: ขอความยินยอม` : `บันทึกว่าไม่พบตัว ${v.r.name}`)
    }
    onClose()
  }

  const ready = opt.kind === 'assign' ? Boolean(owner) && Boolean(due) : opt.kind === 'nudge' ? msg.trim().length >= 3 : found !== null

  return (
    <Drawer label={opt.label} head={head} onClose={onClose}>
      <h3 className="text-[18px] font-bold text-ink">{opt.kind === 'assign' ? 'มอบหมายผู้ลงพื้นที่' : opt.kind === 'nudge' ? `เตือน ${v.owner}` : 'บันทึกผลลงพื้นที่'}</h3>
      <p className="mt-1 text-[14px] text-ink-muted">{opt.effect}</p>

      {opt.kind === 'assign' && (
        <>
          <p id="oosc-owner-label" className="mb-1.5 mt-4 text-[14px] font-semibold text-ink">
            ให้ใครลงพื้นที่
          </p>
          <OwnerPicker id="oosc-owner-label" team={team} load={load} value={owner} onChange={setOwner} current={v.owner ?? undefined} suggest={suggest} />
          <Label>ลงพื้นที่ภายใน</Label>
          <input id="oosc-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
          <Label>หมายเหตุถึงผู้ลงพื้นที่ (ไม่บังคับ)</Label>
          <textarea id="oosc-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaCls} placeholder="เช่น ไปพร้อมผู้นำชุมชน ครอบครัวอาจย้ายไปอยู่กับญาติ" />
        </>
      )}

      {opt.kind === 'nudge' && (
        <>
          <Label>ข้อความถึง {v.owner}</Label>
          <textarea id="oosc-msg" value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className={textareaCls} />
        </>
      )}

      {opt.kind === 'visit' && (
        <>
          <p className="mb-1.5 mt-4 text-[14px] font-semibold text-ink">ผลที่ {v.owner ?? 'ผู้รับผิดชอบ'} แจ้ง</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ผลลงพื้นที่">
            {[
              { k: true, th: 'พบตัว', sub: 'ยืนยันว่าอยู่นอกระบบ' },
              { k: false, th: 'ไม่พบตัว', sub: 'ครอบครัวอาจย้ายถิ่น' },
            ].map((x) => (
              <button
                key={x.th}
                type="button"
                role="radio"
                aria-checked={found === x.k}
                onClick={() => setFound(x.k)}
                className={`rounded-xl border px-4 py-3 text-left ${found === x.k ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-surface-border bg-white'}`}
              >
                <span className="block text-[15.5px] font-bold text-ink">{x.th}</span>
                <span className="block text-[13px] text-ink-muted">{x.sub}</span>
              </button>
            ))}
          </div>
          <Label>รายละเอียด (ไม่บังคับ)</Label>
          <textarea id="oosc-visit-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaCls} placeholder="เช่น เด็กช่วยครอบครัวกรีดยาง ผู้ปกครองยินดีคุยเรื่องเรียนต่อ" />
        </>
      )}

      <div className="mt-5">
        <PrimaryBtn disabled={!ready} onClick={save}>
          {opt.kind === 'assign' ? 'มอบหมาย' : opt.kind === 'nudge' ? 'ส่งการเตือน' : 'บันทึกผล'}
        </PrimaryBtn>
      </div>
    </Drawer>
  )
}
