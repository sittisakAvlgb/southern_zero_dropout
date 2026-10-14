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
import type { useCaseLog } from '@/lib/caseLog'
import { useI18n } from '@/i18n/LanguageContext'
import { useToast } from '@/components/ui/Toast'
import { IconArrowRight, IconClose } from '@/components/icons'
import { assetUrl } from '@/lib/asset'

const MASCOT = assetUrl('ChatBot.png')
const PATHWAYS: Pathway[] = ['formalReturn', 'nfe', 'vocational', 'islamicSchool', 'apprentice', 'employment', 'specialNeeds', 'undecided']
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

  const factors = [
    s.absenceStreak >= 3 && `ขาดเรียนติดกัน ${s.absenceStreak} วัน`,
    `มาเรียน ${Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)}%`,
    s.parentContact !== 'ok' && 'ยังติดต่อผู้ปกครองไม่ได้',
    `รายได้ครอบครัว ${s.master.parentSalary.toLocaleString('th-TH')} บาท/เดือน`,
    s.master.timeDt >= 20 && `เดินทางมาโรงเรียน ${s.master.timeDt} นาที`,
    s.master.parentRelationName && !['มารดา', 'บิดา'].includes(s.master.parentRelationName) && `ผู้ดูแลคือ${s.master.parentRelationName}`,
  ].filter(Boolean) as string[]

  const recs = useMemo(() => recommendSteps(s, true), [s])
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

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="ปิด" className="absolute inset-0 bg-brand-950/35" onClick={onClose} />
      <motion.aside
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
            <p className="text-[12.5px] font-semibold text-brand-600">
              {step === 1 ? 'ขั้นที่ 1 จาก 2 · วางแผน' : 'ขั้นที่ 2 จาก 2 · AI แนะนำ'}
            </p>
            <p className="truncate text-[19px] font-bold text-ink">สร้างแผนช่วยเหลือ · {s.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted">
            <IconClose width={18} height={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
          {step === 1 ? (
            <>
              <p className="rounded-xl bg-surface-muted px-3.5 py-2.5 text-[13.5px] text-ink-muted">
                ช่องที่มีข้อมูลแล้วดึงมาจากระเบียนของเด็ก — ตรวจ แก้ถ้าไม่ตรง แล้วกดถัดไป
              </p>

              <Row k="นักเรียน">
                <span className="text-[15px] font-semibold text-ink">{s.name}</span>
                <span className="text-[13.5px] text-ink-muted"> · {GRADE_LABEL(s.gradeKey, true)}</span>
              </Row>
              <Row k="ระดับความเสี่ยง">
                <span className="rounded-full px-2.5 py-1 text-[13px] font-bold text-white" style={{ background: RISK_COLOR[s.riskLevel] }}>
                  {s.riskScore} · {t(`risk.${s.riskLevel}`)}
                </span>
              </Row>
              <Row k="สาเหตุหลัก">
                <span className="text-[14.5px] text-ink">{cause ? `${cause.shortTh} (รหัส ${cause.id})` : t(`cause.${s.causeKeys[0]}`)}</span>
              </Row>
              <Row k="ปัจจัยเสี่ยง">
                <ul className="space-y-0.5 text-[14px] text-ink">
                  {factors.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </Row>

              <Row k="เป้าหมายของแผน">
                <select
                  value={pathway}
                  onChange={(e) => setPathway(e.target.value as Pathway)}
                  className="w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400"
                >
                  {PATHWAYS.map((k) => (
                    <option key={k} value={k}>
                      {t(`pathway.${k}`)}
                      {k === suggested.pathway ? ' (AI แนะนำ)' : ''}
                    </option>
                  ))}
                </select>
                {pathway === suggested.pathway && <p className="mt-1.5 text-[13px] text-brand-700">AI: {suggested.whyTh}</p>}
              </Row>
              <Row k="ผู้รับผิดชอบ">
                <Input value={owner} onChange={setOwner} />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <Row k="วันที่เริ่ม">
                  <Input type="date" value={start} onChange={setStart} />
                </Row>
                <Row k="วันที่ต้องติดตาม">
                  <Input type="date" value={follow} onChange={setFollow} />
                </Row>
              </div>
              <Row k="หน่วยงานที่เกี่ยวข้อง — แนะนำตามสาเหตุ">
                <div className="space-y-1.5">
                  {agencies.map(({ agency: a, why }) => {
                    const on = picked.includes(a.id)
                    return (
                      <label key={a.id} className="flex items-start gap-3 rounded-xl border border-surface-border px-3.5 py-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5"
                          checked={on}
                          onChange={() => setPicked((v) => (on ? v.filter((x) => x !== a.id) : [...v, a.id]))}
                        />
                        <span>
                          <span className="block text-[14px] font-medium text-ink">{a.th}</span>
                          <span className="block text-[12.5px] text-ink-muted">{why}</span>
                        </span>
                      </label>
                    )
                  })}
                  {agencies.length === 0 && <p className="text-[13.5px] text-ink-muted">สาเหตุของเด็กคนนี้อยู่ในมือโรงเรียน ยังไม่ต้องใช้หน่วยงานภายนอก</p>}
                </div>
              </Row>
              <Row k="หมายเหตุ (ไม่บังคับ)">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                />
              </Row>
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

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[13px] font-semibold text-ink-muted">{k}</p>
      {children}
    </div>
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
