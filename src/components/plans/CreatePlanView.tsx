import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { OpportunityPlan, Pathway, Student } from '@/types'
import type { User } from '@/auth/roles'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { recommendSteps } from '@/lib/recommend'
import { planStepsFrom, suggestAgencies, suggestPathway } from '@/lib/planOps'
import { reasonFor } from '@/data/dropReasons'
import { SCHOOL_OWNER_ID } from '@/data/plans'
import { lastVisit, type useCaseLog } from '@/lib/caseLog'
import { useI18n } from '@/i18n/LanguageContext'
import { useToast } from '@/components/ui/Toast'
import { useScrollLock } from '@/lib/useScrollLock'
import { IconArrowRight, IconClose } from '@/components/icons'
import { assetUrl } from '@/lib/asset'
import { useDialogDismiss } from '@/lib/useDialog'

const MASCOT = assetUrl('ChatBot.png')
const PATHWAYS: Pathway[] = ['formalReturn', 'nfe', 'vocational', 'islamicSchool', 'apprentice', 'employment', 'specialNeeds', 'undecided']
/** คำอธิบายบรรทัดเดียวของแต่ละเส้นทาง — ครูเลือกได้โดยไม่ต้องรู้ศัพท์ */
const PATHWAY_HINT: Record<Pathway, string> = {
  formalReturn: 'กลับไปเรียนในโรงเรียนเดิมหรือย้ายโรงเรียน',
  nfe: 'เรียนแบบยืดหยุ่นกับ สกร. เหมาะกับเด็กที่ต้องทำงานหรือมีภาระ',
  vocational: 'เรียนสายอาชีพ ได้วุฒิและทักษะทำงาน',
  islamicSchool: 'เรียนสามัญควบศาสนาในโรงเรียนเอกชนสอนศาสนา',
  apprentice: 'ฝึกงานในสถานประกอบการควบคู่การเรียน',
  employment: 'เน้นมีงานทำที่มั่นคง สำหรับเด็กที่พ้นวัยเรียนภาคบังคับ',
  specialNeeds: 'ประเมินเฉพาะทางก่อน แล้วจัดรูปแบบการเรียนให้เหมาะ',
  undecided: 'ยังไม่แน่ใจ — เก็บข้อมูลและคุยกับครอบครัวก่อน',
}
const iso = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

/**
 * วางแผน → AI แนะนำ → เริ่มดำเนินการ
 *
 * ข้อมูลเกือบทุกช่องมาจากระเบียนเด็กอยู่แล้ว (ระดับความเสี่ยง สาเหตุหลัก
 * ปัจจัยเสี่ยง หน่วยงานที่เกี่ยวข้อง) ครูไม่ต้องพิมพ์ซ้ำ — ตรวจ แก้ถ้าไม่ตรง
 * แล้วกดถัดไป เป้าหมายของแผนก็ AI เสนอมาพร้อมเหตุผล
 */
export function CreatePlanView({
  student: s,
  log,
  user,
  onCreated,
  onClose,
}: {
  student: Student
  log: ReturnType<typeof useCaseLog>
  user: User | null
  onCreated: (childId: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const { push } = useToast()
  useScrollLock()
  const suggested = useMemo(() => suggestPathway(s), [s])
  const agencies = useMemo(() => suggestAgencies(s, s.provinceKey).filter((a) => a.why).slice(0, 4), [s])
  const cause = s.causeKeys.map(reasonFor).find(Boolean)

  const [step, setStep] = useState<1 | 2>(1)
  const [pathway, setPathway] = useState<Pathway>(suggested.pathway)
  const [owner, setOwner] = useState(user?.ownerName ?? user?.name ?? '')
  const [start, setStart] = useState(iso())
  const [follow, setFollow] = useState(iso(7))
  const [picked, setPicked] = useState<string[]>(agencies.slice(0, 1).map((a) => a.agency.id))
  const [note, setNote] = useState('')

  // สิ่งที่ครูเห็นเองมาก่อนระเบียน — ครูเพิ่งบันทึก "ไม่มีค่ารถ" และไปเยี่ยมบ้านมา
  // ถ้าฟอร์มยังโชว์แต่ตัวเลขในทะเบียน ครูจะรู้สึกว่าที่บันทึกไปไม่มีใครอ่าน
  const notes = useMemo(() => (log.observations[s.id] ?? []).filter((o) => !o.resolvedTs).map((o) => o.text), [log.observations, s.id])
  const visit = useMemo(() => lastVisit(s.id, log), [s.id, log])
  const vf = visit?.family
  const factors = [
    ...notes.map((n) => `ครูพบ: ${n}`),
    s.absenceStreak >= 3 && !notes.some((n) => n.includes(`ขาดเรียนต่อเนื่อง ${s.absenceStreak}`)) && `ขาดเรียนติดกัน ${s.absenceStreak} วัน`,
    `มาเรียน ${Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)}%`,
    s.parentContact !== 'ok' && 'ยังติดต่อผู้ปกครองไม่ได้',
    vf?.incomeBand && vf.incomeBand !== 'unknown'
      ? `รายได้ครัวเรือน ${t(`hv.inc.${vf.incomeBand}`)} (จากเยี่ยมบ้าน)`
      : `รายได้ครอบครัว ${s.master.parentSalary.toLocaleString('th-TH')} บาท/เดือน`,
    s.master.timeDt >= 20 && `เดินทางมาโรงเรียน ${s.master.timeDt} นาที`,
    vf?.guardianRelation
      ? `ผู้ดูแลคือ${t(`hv.rel.${vf.guardianRelation}`)} (จากเยี่ยมบ้าน)`
      : s.master.parentRelationName && !['มารดา', 'บิดา'].includes(s.master.parentRelationName) && `ผู้ดูแลคือ${s.master.parentRelationName}`,
    ...(vf?.findings ?? []).map((c) => `พบที่บ้าน: ${t(`cause.${c}`)}`),
  ].filter(Boolean) as string[]

  const recs = useMemo(() => recommendSteps(s, true, { notes, visitFindings: vf?.findings }), [s, notes, vf])
  const steps = useMemo(() => planStepsFrom(s, recs), [s, recs])

  const create = () => {
    const daysAgo = Math.max(0, Math.round((Date.now() - new Date(start).getTime()) / 86400000))
    const target = new Date(start)
    target.setMonth(target.getMonth() + 3)
    const names = agencies.filter((a) => picked.includes(a.agency.id)).map((a) => a.agency.th)
    const plan: OpportunityPlan = {
      id: `PLAN-${s.id}`,
      childId: s.id,
      childName: s.name,
      pathway,
      rationaleTh: `${pathway === suggested.pathway ? suggested.whyTh : 'ครูเลือกเส้นทางนี้เอง'}${names.length ? ` · หน่วยงานที่เกี่ยวข้อง: ${names.join(', ')}` : ''}`,
      rationaleEn: '',
      barriers: [],
      steps,
      progress: 0,
      targetMonth: target.toISOString().slice(0, 7),
      reviewedDaysAgo: 0,
      startedDaysAgo: daysAgo,
      agreedByFamily: false,
      ownerAgencyId: SCHOOL_OWNER_ID,
    }
    log.savePlan(plan)
    log.add({
      childId: s.id,
      mode: 'note',
      date: iso(),
      by: owner || 'ครูผู้รับผิดชอบ',
      note: `เริ่มดำเนินการตามแผน · ผู้รับผิดชอบ ${owner || 'ครูผู้รับผิดชอบ'}${note.trim() ? ` · ${note.trim()}` : ''}`,
      followUpDate: follow,
    })
    push(`สร้างแผนของ ${s.name} แล้ว · นัดติดตาม ${follow}`)
    onCreated(s.id)
  }

  const dialogRef = useDialogDismiss<HTMLElement>(onClose)

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="ปิด" className="absolute inset-0 bg-brand-950/35" onClick={onClose} />
      <motion.aside
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`สร้างแผนของ ${s.name}`}
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[19px] font-bold text-ink">สร้างแผนช่วยเหลือ</p>
            {/* แถบขั้น — ข้อความกำกับทุกขั้น */}
            <ol className="mt-2 grid grid-cols-2 gap-2" aria-label="ขั้นตอน">
              {['วางแผน', 'AI แนะนำลำดับขั้น'].map((x, i) => (
                <li key={x}>
                  <span className={`block h-1.5 rounded-full ${i < step ? 'bg-brand-500' : 'bg-surface-muted'}`} />
                  <span className={`mt-1 block text-[12.5px] ${i + 1 === step ? 'font-bold text-ink' : 'text-ink-muted'}`}>
                    {i + 1}. {x}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted">
            <IconClose width={18} height={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
          {step === 1 ? (
            <>
              {/* ── ข้อมูลจากระเบียน — อ่านอย่างเดียว ไม่ต้องกรอก ─────────── */}
              <section className="rounded-2xl border border-surface-border bg-surface-muted/40 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-[18px] font-bold text-brand-700">{s.name.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-bold leading-tight text-ink">{s.name}</p>
                    <p className="mt-0.5 text-[13.5px] text-ink-muted">
                      {GRADE_LABEL(s.gradeKey, true)} · {s.id}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[26px] font-bold leading-none tabular" style={{ color: RISK_COLOR[s.riskLevel] }}>
                      {s.riskScore}
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-ink">{t(`risk.${s.riskLevel}`)}</p>
                  </div>
                </div>
                <div className="mt-3 border-t border-surface-border pt-3">
                  <p className="text-[12.5px] font-semibold text-ink-muted">สาเหตุหลัก</p>
                  <p className="text-[15px] font-semibold text-ink">{cause ? `${cause.shortTh} (รหัส ${cause.id})` : t(`cause.${s.causeKeys[0]}`)}</p>
                  <p className="mt-2.5 text-[12.5px] font-semibold text-ink-muted">ปัจจัยเสี่ยง</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {factors.map((f) => (
                      <span key={f} className="rounded-lg bg-white px-2.5 py-1 text-[13.5px] text-ink">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-[12.5px] text-ink-muted">ดึงจากระเบียนของเด็ก สิ่งที่ครูพบ และการเยี่ยมบ้าน — ไม่ต้องกรอก ถ้าไม่ตรงให้แก้ที่ข้อมูลเด็ก</p>
              </section>

              {/* ── ① เป้าหมาย — การ์ดให้กดเลือก แทน dropdown ─────────────── */}
              <Section n={1} title="เป้าหมายของแผน">
                {(() => {
                  const ai = suggested.pathway
                  const card = (k: Pathway, big?: boolean) => {
                    const on = pathway === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPathway(k)}
                        aria-pressed={on}
                        className={`w-full rounded-xl border-2 px-3.5 text-left ${big ? 'py-3' : 'py-2.5'} ${on ? 'border-brand-500 bg-brand-50' : 'border-surface-border bg-white hover:border-brand-200'}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand-500' : 'border-ink-faint'}`} aria-hidden>
                            {on && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                          </span>
                          <span className="text-[15px] font-semibold text-ink">{t(`pathway.${k}`)}</span>
                          {k === ai && <span className="ml-auto shrink-0 rounded-md bg-white px-2 py-0.5 text-[12px] font-bold text-brand-700">AI แนะนำ</span>}
                        </span>
                        <span className="mt-0.5 block pl-7 text-[13px] leading-snug text-ink-muted">{k === ai ? suggested.whyTh : PATHWAY_HINT[k]}</span>
                      </button>
                    )
                  }
                  return (
                    <>
                      {card(ai, true)}
                      <p className="mb-1.5 mt-3 text-[13px] text-ink-muted">หรือเลือกเส้นทางอื่น</p>
                      <div className="grid gap-2 sm:grid-cols-2">{PATHWAYS.filter((k) => k !== ai).map((k) => card(k))}</div>
                    </>
                  )
                })()}
              </Section>

              {/* ── ② ใครทำ เมื่อไร ─────────────────────────────────── */}
              <Section n={2} title="ใครรับผิดชอบ และติดตามเมื่อไร">
                <Field label="ผู้รับผิดชอบ">
                  <Input value={owner} onChange={setOwner} />
                </Field>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="วันที่เริ่ม">
                    <Input type="date" value={start} onChange={setStart} />
                  </Field>
                  <Field label="วันที่ต้องติดตาม">
                    <Input type="date" value={follow} onChange={setFollow} />
                  </Field>
                </div>
              </Section>

              {/* ── ③ หน่วยงาน ──────────────────────────────────────── */}
              <Section n={3} title="หน่วยงานที่เกี่ยวข้อง" hint="แนะนำตามสาเหตุของเด็ก — เลือกได้หลายแห่ง">
                <div className="space-y-2">
                  {agencies.map(({ agency: a, why }) => {
                    const on = picked.includes(a.id)
                    return (
                      <label
                        key={a.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3.5 py-3 ${on ? 'border-brand-500 bg-brand-50' : 'border-surface-border bg-white'}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0"
                          checked={on}
                          onChange={() => setPicked((v) => (on ? v.filter((x) => x !== a.id) : [...v, a.id]))}
                        />
                        <span className="min-w-0">
                          <span className="block text-[14.5px] font-semibold leading-snug text-ink">{a.th}</span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{why}</span>
                        </span>
                      </label>
                    )
                  })}
                  {agencies.length === 0 && <p className="text-[14px] text-ink-muted">สาเหตุของเด็กคนนี้อยู่ในมือโรงเรียน ยังไม่ต้องใช้หน่วยงานภายนอก</p>}
                </div>
              </Section>

              {/* ── ④ หมายเหตุ ─────────────────────────────────────── */}
              <Section n={4} title="หมายเหตุ" hint="ไม่บังคับ">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="เช่น ครอบครัวสะดวกให้เยี่ยมช่วงเย็น"
                  className="w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                />
              </Section>
            </>
          ) : (
            <>
              <div className="flex gap-2.5 rounded-2xl bg-brand-50/70 p-3.5">
                <img src={MASCOT} alt="" className="h-9 w-9 shrink-0 object-contain" draggable={false} />
                <p className="text-[14.5px] leading-relaxed text-ink">
                  {s.name}
                  {cause ? `เสี่ยงหลัก ๆ จาก${cause.shortTh}` : ''}
                  {s.absenceStreak >= 3 ? ` ขาดเรียนติดกัน ${s.absenceStreak} วัน` : ''}
                  {s.parentContact !== 'ok' ? ' และยังติดต่อผู้ปกครองไม่ได้' : ''} — แนะนำให้เริ่มตามลำดับนี้
                </p>
              </div>
              <p className="mb-2 mt-4 text-[13.5px] font-semibold text-ink">AI Recommended Path · {t(`pathway.${pathway}`)}</p>
              <ol className="space-y-2">
                {steps.map((st, i) => (
                  <li key={st.id} className="flex gap-3 rounded-xl border border-surface-border p-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12.5px] font-bold text-brand-700">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-medium text-ink">{st.titleTh}</p>
                      <p className="text-[12.5px] text-ink-muted">
                        <span className={st.ownerAgencyId === SCHOOL_OWNER_ID ? 'font-semibold text-brand-700' : ''}>
                          {st.ownerAgencyId === SCHOOL_OWNER_ID ? 'คุณ (โรงเรียน)' : st.ownerName}
                        </span>{' '}
                        · ภายใน {st.dueInDays} วัน
                      </p>
                      <p className="text-[12.5px] text-ink-faint">{recs[i]?.whyTh}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <footer className="flex gap-2 border-t border-surface-border bg-white px-4 py-3">
          {step === 2 && (
            <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-surface-border px-4 py-3 text-[14px] font-medium text-ink">
              แก้แผน
            </button>
          )}
          <button
            type="button"
            disabled={!owner.trim()}
            onClick={() => (step === 1 ? setStep(2) : create())}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-card disabled:opacity-40"
          >
            {step === 1 ? 'ถัดไป · ให้ AI แนะนำ' : 'เริ่มดำเนินการ'}
            <IconArrowRight width={16} height={16} />
          </button>
        </footer>
      </motion.aside>
    </div>
  )
}

/** หัวข้อมีเลขลำดับ แยกด้วยเส้น — อ่านเป็นขั้น ๆ ไม่เป็นฟอร์มยาวพรืด */
function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-surface-border pt-5">
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[14px] font-bold text-white">{n}</span>
        <h3 className="text-[16px] font-bold text-ink">{title}</h3>
        {hint && <span className="text-[13px] text-ink-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  )
}

function Input({ value, onChange, type = 'text' }: { value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
    />
  )
}
