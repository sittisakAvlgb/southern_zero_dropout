import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { canWorkCases } from '@/auth/roles'
import { DirectOnlyNotice } from '@/components/auth/DirectOnlyNotice'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { applyPlans } from '@/lib/caseLog'
import { buildCase, PRIORITY_META, sortCases, type PlanCase, type Priority } from '@/lib/planOps'
import { teamLoad } from '@/lib/directorOps'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { inPlanQueue, planBrief, planNeedsDirector, planRank, planTag, type DeskOption } from '@/lib/directorDeskOps'
import type { Student } from '@/types'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { byOf, useRefCases } from '@/components/referrals/useRefCases'
import { Drawer } from '@/components/referrals/ui'
import { lightestOf } from '@/components/support/DirectorDecisionSheet'
import { teamOf } from '@/pages/DirectorDecisions'
import { CaseRow, StatsFold } from '@/components/plans/TeacherPlanWorkspace'
import { PlanCaseView } from '@/components/plans/PlanCaseView'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { IconArrowRight, IconPathway } from '@/components/icons'
import { DeskActionSheet, DeskCard, MASCOT, btnSecondary } from './DeskParts'

const ORDER: Priority[] = ['today', 'soon', 'onTrack', 'improving']
const dueText = (n: number) => (n < 0 ? `เลยกำหนด ${-n} วัน` : n === 0 ? 'ครบกำหนดวันนี้' : `อีก ${n} วัน`)

/**
 * เส้นทางโอกาสรายบุคคล สำหรับ ผอ. — หน้าตาเดียวกับหน้าครู
 *
 *   ผู้ช่วย AI (ตัวเลข → ข้อสังเกต → ปุ่มเดียว) → แผนเรียงตามความเร่งด่วน → เสี่ยงแต่ยังไม่มีแผน → สถิติ (พับไว้)
 *
 * ต่างจากครูตรงที่ ผอ. ไม่ทำขั้นในแผนเอง กลุ่มแรกจึงเป็น "ต้องใช้ ผอ." — แผนที่ไม่มีผู้รับผิดชอบ ·
 * ติดที่หน่วยงาน · ค้างที่ครูนาน · ครอบครัวยังไม่เห็นชอบ แถวบอกสิ่งที่ ผอ. อาจพิจารณา
 * แผนอื่นบอกว่าครูคนไหนดูแลและถึงขั้นไหน กดแถวแล้วเห็นทางเลือกของ ผอ. ส่วนแผนเต็มเปิดอ่านได้อย่างเดียว
 *
 * **เขตใช้หน้านี้ด้วย แต่เป็นคนกำกับ ไม่ใช่เจ้าของเคส** — `canWorkCases()` คืน false ให้ esa
 * ทุกทางที่ลงมือกับเคสจึงปิด: กดแถวแล้วได้แผนแบบอ่านอย่างเดียว ไม่มีชีตมอบหมายครู ไม่มีปุ่ม
 * "ให้ครูสร้างแผน" และปุ่มท้ายหน้าพาไปโรงเรียนในเขต (เครื่องมือจริงของเขต) แทนหน้าเรื่องที่ต้อง
 * ตัดสินใจซึ่งอยู่นอกเมนูของเขต เงื่อนไขอ่านจาก `canWorkCases()` ตรง ๆ ไม่ใช่ prop
 * จะได้ไม่มีใครเปิดปุ่มกลับมาด้วยการส่งค่าผิด (เคยเป็นบั๊กมาแล้ว ดู roles.ts)
 *
 * เขตเห็นหลายโรงเรียน แถวจึงบอกชื่อโรงเรียนด้วย ส่วน ผอ. เห็นโรงเรียนเดียวจึงไม่ต้องบอกซ้ำ
 */
export function DirectorPlanDesk({ onFullView }: { onFullView: () => void }) {
  const { t } = useI18n()
  const nav = useNavigate()
  const { push } = useToast()
  const { plans, students, referrals, oosc, schools } = useScopedData()
  const { user, log, built } = useFollowCases()
  /** ผอ. ลงมือได้ · เขตอ่านอย่างเดียว — ด่านเดียวกับที่ใช้ทั้งแอป */
  const mayAct = canWorkCases(user)
  const loading = useSimulatedLoading(400)
  const by = byOf(user)
  const fc = 'list' in built ? built.list : []
  const tl = useMemo(() => teamLoad(fc), [fc])
  const load = tl.rows
  const heavy = tl.insight?.owner
  const team = useMemo(() => teamOf(fc), [fc])

  const [now] = useState(() => Date.now())
  const roster = useMemo(() => fc.map((c) => c.s), [fc])
  const byId = useMemo(() => new Map(roster.map((s) => [s.id, s])), [roster])
  const refs = useRefCases(user, roster.length ? roster : students, referrals, log, now)
  const records = useMemo(() => applyPlans(plans, log), [plans, log])
  // เด็กนอกระบบไม่อยู่ในรายชื่อนักเรียน — ผู้รับผิดชอบมาจากที่ ผอ. มอบหมาย หรือจากทะเบียน
  const ooscOwner = useMemo(() => new Map(oosc.map((r) => [r.id, r.ownerName])), [oosc])
  const ownerOf = (childId: string) => byId.get(childId)?.caseOwner || log.owners[childId] || ooscOwner.get(childId) || undefined
  /** ชื่อโรงเรียนของเด็ก — มาจากโรงเรียนที่อยู่ในขอบเขตบัญชีนี้ ไม่ใช่ dataset ดิบ */
  const schoolById = useMemo(() => new Map(schools.map((s) => [s.id, s.name])), [schools])
  const schoolOf = (childId: string) => {
    const key = byId.get(childId)?.schoolKey
    return key ? schoolById.get(key) : undefined
  }

  const cases = useMemo(() => sortCases(records.map((p) => buildCase(p, byId.get(p.childId), log.entries, true))), [records, byId, log.entries])
  const noPlan = useMemo(
    () =>
      roster
        .filter((st) => !records.some((p) => p.childId === st.id) && st.caseStage !== 'resolved' && st.caseStage !== 'returned' && (st.riskLevel === 'high' || st.riskLevel === 'critical'))
        .sort((a, b) => b.riskScore - a.riskScore),
    [roster, records],
  )

  const [openChild, setOpenChild] = useState<string | null>(null)
  const [readOnly, setReadOnly] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ childId: string; name: string; sub: string; opt: DeskOption } | null>(null)

  const isClosed = (c: PlanCase) => c.next.kind === 'done'
  const active = cases.filter((c) => !isClosed(c))
  const closedCases = cases.filter(isClosed)
  // กฎคิวเดียวกับตัวเลขบนเมนู (inPlanQueue)
  const queue = active
    .filter((c) => inPlanQueue(c, ownerOf(c.plan.childId), log.entries))
    .sort((a, b) => planRank(b, ownerOf(b.plan.childId)) - planRank(a, ownerOf(a.plan.childId)))
  const rest = active.filter((c) => !queue.includes(c))
  const groups = ORDER.map((k) => ({ k, items: rest.filter((c) => c.priority === k) })).filter((g) => g.items.length)

  const briefOf = (c: PlanCase) => {
    const owner = ownerOf(c.plan.childId)
    return planBrief(c, { owner, heavy: Boolean(owner && owner === heavy), suggest: lightestOf(load, owner), refs: refs.filter((r) => r.childId === c.plan.childId) })
  }
  const pathwayLabel = (c: PlanCase) => t(`pathway.${c.plan.pathway}`)

  const noOwner = queue.filter((c) => !ownerOf(c.plan.childId)).length
  const atAgency = queue.filter((c) => ownerOf(c.plan.childId) && c.current && c.current.ownerAgencyId !== 'SCHOOL' && (c.current.status === 'blocked' || (c.daysLeft ?? 0) < 0)).length
  const notAgreed = queue.filter((c) => !c.plan.agreedByFamily).length
  /** หัวข้อกลุ่มแรกและคำสรุป — ผอ. คือคนที่ต้องลงมือ ส่วนเขตคือคนที่ต้องรู้ว่า
   *  โรงเรียนไหนยังไม่ขยับ แล้วไปหนุนที่ระดับโรงเรียน */
  const queueTh = mayAct ? 'ต้องใช้ ผอ.' : 'เรื่องที่โรงเรียนยังไม่ขยับ'
  const insight = !queue.length
    ? noPlan.length
      ? `ทุกแผนมีผู้รับผิดชอบและเดินหน้าอยู่ — มี ${noPlan.length} คนเสี่ยงสูงที่ครูยังไม่ได้สร้างแผน`
      : mayAct
        ? 'ทุกแผนมีผู้รับผิดชอบและเดินหน้าอยู่ ไม่มีเรื่องที่ต้องใช้ ผอ. วันนี้'
        : 'ทุกแผนมีผู้รับผิดชอบและเดินหน้าอยู่ ไม่มีเรื่องที่ต้องให้เขตหนุนวันนี้'
    : [
        noOwner > 0 && `${noOwner} แผนยังไม่มีผู้รับผิดชอบ`,
        atAgency > 0 &&
          `${atAgency} แผนค้างที่หน่วยงานภายนอก — ${mayAct ? 'ผอ. ประสานหัวหน้าหน่วยงานได้' : 'เขตประสานระดับจังหวัดให้โรงเรียนได้'}`,
        notAgreed > 0 && `${notAgreed} แผนครอบครัวยังไม่เห็นชอบ`,
      ]
        .filter(Boolean)
        .join(' · ') || `${queue.length} แผนค้างที่ครูนานกว่ากำหนด`

  const ownerMeta = (c: PlanCase) => {
    const owner = ownerOf(c.plan.childId)
    const n = c.next
    // เขตดูข้ามโรงเรียน ชื่อครูอย่างเดียวจึงไม่พอที่จะรู้ว่าต้องไปหนุนที่ไหน
    const school = mayAct ? undefined : schoolOf(c.plan.childId)
    return (
      <>
        {school && <span className="text-ink-muted">{school} · </span>}
        <span className={owner ? 'font-semibold text-brand-700' : 'font-semibold text-red-700'}>{owner ?? 'ยังไม่มีผู้รับผิดชอบ'}</span>
        {!n.ownerIsTeacher && n.ownerTh !== '—' && <span> · รอ{n.ownerTh}</span>}
        {n.daysLeft !== undefined && (
          <span style={{ color: n.daysLeft < 0 ? RISK_COLOR.critical : n.daysLeft <= 3 ? RISK_COLOR.high : undefined }}>
            {' · '}
            {dueText(n.daysLeft)}
          </span>
        )}
      </>
    )
  }

  const open = openChild ? cases.find((c) => c.plan.childId === openChild) : undefined
  const ro = readOnly ? cases.find((c) => c.plan.childId === readOnly) : undefined
  const first = queue[0]
  /** กดแถว: ผอ. ได้ลิ้นชักทางเลือกของตัวเอง · เขตได้แผนแบบอ่านอย่างเดียว */
  const openCase = (childId: string) => (mayAct ? setOpenChild(childId) : setReadOnly(childId))

  /** เด็กเสี่ยงที่ยังไม่มีแผน — ผอ. ไม่สร้างแผนเอง แต่เตือนหรือมอบหมายครูให้สร้าง */
  const askPlan = (st: Student) => {
    const owner = ownerOf(st.id)
    setSheet({
      childId: st.id,
      name: st.name,
      sub: `${GRADE_LABEL(st.gradeKey, true)} · คะแนนเสี่ยง ${st.riskScore} · ยังไม่มีแผน`,
      opt: owner
        ? { kind: 'nudge', label: `ให้ ${owner} สร้างแผน`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', message: `${st.name} เสี่ยงสูงแต่ยังไม่มีแผน — ช่วยสร้างแผนภายในสัปดาห์นี้ ติดอะไรบอก ผอ. ได้เลย` }
        : { kind: 'assign', label: 'มอบหมายครูสร้างแผน', effect: 'เด็กขึ้นในงานของครูคนนั้นทันที' },
    })
  }

  return (
    <div className="animate-page-rise">
      <PageHeader icon={<IconPathway width={22} height={22} />} breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.plan')]} />} title={t('plan.title')} subtitle={t('plan.subtitle')} />

      {/* ขึ้นเฉพาะที่นั่งที่อ่านอย่างเดียว (กันตัวเองด้วย canWorkCases) — ผอ. ไม่เห็น
          บอกไปเลยว่าทำไมไม่มีปุ่ม ดีกว่าเงียบ ๆ แล้วปล่อยให้เดาว่าฟีเจอร์หาย */}
      <DirectOnlyNotice />

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
                  {active.length} แผนที่กำลังดำเนินการ ·{' '}
                  <span style={{ color: queue.length ? PRIORITY_META.today.color : undefined }}>
                    {queue.length} {mayAct ? 'เรื่องต้องใช้ ผอ.' : 'เรื่องที่โรงเรียนยังไม่ขยับ'}
                  </span>
                  {noPlan.length > 0 && <> · {noPlan.length} คนเสี่ยงแต่ยังไม่มีแผน</>}
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{insight}</p>
              </>
            )}
          </div>
        </div>
        {/* เขตไม่มีปุ่ม "ให้ครูสร้างแผน" จึงเหลือปุ่มเดียวเมื่อมีเรื่องค้างจริง ๆ */}
        {!loading && (first ?? (mayAct ? noPlan[0] : undefined)) && (
          <button
            type="button"
            onClick={() => (first ? (mayAct ? setOpenChild(first.plan.childId) : setReadOnly(first.plan.childId)) : askPlan(noPlan[0]))}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600 sm:w-auto"
          >
            {first ? `เปิดเรื่องแรก · ${first.plan.childName}` : `ให้ครูสร้างแผนให้ ${noPlan[0].name}`}
            <IconArrowRight width={16} height={16} />
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
          {queue.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
                <span className="h-3 w-3 rounded-full" style={{ background: PRIORITY_META.today.color }} />
                {queueTh}
                <span className="font-medium text-ink-faint">· {queue.length}</span>
              </h2>
              <ul className="overflow-hidden rounded-2xl border border-surface-border bg-white">
                {queue.map((c) => {
                  const o = briefOf(c).options[0]
                  return (
                    <CaseRow
                      key={c.plan.id}
                      c={c}
                      pathway={pathwayLabel(c)}
                      onOpen={() => openCase(c.plan.childId)}
                      next={
                        <>
                          <span className="text-ink-muted">{planTag(c, ownerOf(c.plan.childId))} —</span> {o ? `AI แนะนำ: ${o.label}` : 'ดูรายละเอียด'}
                        </>
                      }
                      meta={ownerMeta(c)}
                    />
                  )
                })}
              </ul>
            </section>
          )}

          {groups.map((g) => (
            <section key={g.k}>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
                <span className="h-3 w-3 rounded-full" style={{ background: PRIORITY_META[g.k].color }} />
                {PRIORITY_META[g.k].th}
                <span className="font-medium text-ink-faint">· {g.items.length} · ครูดูแลอยู่</span>
              </h2>
              <ul className="overflow-hidden rounded-2xl border border-surface-border bg-white">
                {g.items.map((c) => (
                  <CaseRow key={c.plan.id} c={c} pathway={pathwayLabel(c)} onOpen={() => openCase(c.plan.childId)} meta={ownerMeta(c)} />
                ))}
              </ul>
            </section>
          ))}

          {noPlan.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
                <span className="h-3 w-3 rounded-full border-2 border-ink-faint" />
                เสี่ยงสูงแต่ยังไม่มีแผน
                <span className="font-medium text-ink-faint">· {noPlan.length}</span>
              </h2>
              <ul className="overflow-hidden rounded-2xl border border-dashed border-surface-border bg-white">
                {noPlan.map((st) => (
                  <li key={st.id} className="flex items-center gap-3 border-b border-surface-border px-4 py-3 last:border-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: RISK_COLOR[st.riskLevel] }}>
                      {st.riskScore}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-semibold text-ink">{st.name}</p>
                      <p className="text-[13px] text-ink-muted">
                        {!mayAct && schoolOf(st.id) ? `${schoolOf(st.id)} · ` : ''}
                        {GRADE_LABEL(st.gradeKey, true)} · {t(`cause.${st.causeKeys[0]}`)} · {ownerOf(st.id) ?? 'ยังไม่มีผู้รับผิดชอบ'}
                      </p>
                    </div>
                    {/* มอบหมายครูเป็นงานของ ผอ. — เขตหนุนที่ระดับโรงเรียนแทน */}
                    {mayAct && (
                      <button type="button" onClick={() => askPlan(st)} className="shrink-0 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-brand-700 hover:bg-brand-50">
                        {ownerOf(st.id) ? 'ให้ครูสร้างแผน' : 'มอบหมายครู'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {closedCases.length > 0 && (
            <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
              <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
                <span className="inline-flex items-center gap-1.5">
                  <IconArrowRight width={14} height={14} className="transition-transform group-open:rotate-90" />
                  ปิดเคสแล้ว · {closedCases.length}
                </span>
              </summary>
              <ul className="mt-2 overflow-hidden rounded-xl border border-surface-border">
                {closedCases.map((c) => (
                  <CaseRow key={c.plan.id} c={c} pathway={pathwayLabel(c)} onOpen={() => setReadOnly(c.plan.childId)} meta={ownerMeta(c)} />
                ))}
              </ul>
            </details>
          )}

          <StatsFold cases={cases} t={t} />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onFullView} className={btnSecondary}>
              เปิดรายการแผนแบบเต็ม (ค้นหา · กรอง · กราฟ)
            </button>
            {/* /decisions ไม่อยู่ในเมนูของเขต — ส่งไปจะโดน RequireAuth เด้งกลับเงียบ ๆ
                เครื่องมือจริงของเขตคือการหนุนรายโรงเรียน จึงพาไปที่นั่นแทน */}
            <button type="button" onClick={() => nav(mayAct ? '/decisions' : '/school')} className={btnSecondary}>
              {mayAct ? 'ไปที่เรื่องที่ต้องตัดสินใจ' : 'ไปที่โรงเรียนในเขต'}
            </button>
          </div>
        </div>
      )}

      {/* กดแถว → ทางเลือกของ ผอ. สำหรับแผนนั้น */}
      {open && !sheet && (
        <Drawer
          label={`แผนของ ${open.plan.childName}`}
          head={
            <>
              <p className="truncate text-[19px] font-bold leading-tight text-ink">{open.plan.childName}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                {pathwayLabel(open)} · {ownerOf(open.plan.childId) ?? 'ยังไม่มีผู้รับผิดชอบ'}
              </p>
            </>
          }
          onClose={() => setOpenChild(null)}
        >
          <DeskCard
            b={briefOf(open)}
            body={
              <ol className="mt-1 flex gap-1" aria-label={`ทำแล้ว ${open.plan.steps.filter((x) => x.status === 'done').length} จาก ${open.plan.steps.length} ขั้น`}>
                {open.plan.steps.map((x) => (
                  <li
                    key={x.id}
                    className={`h-1.5 min-w-0 flex-1 rounded-full ${x.status === 'done' ? 'bg-brand-500' : x.status === 'blocked' ? 'bg-red-500' : x.status === 'active' ? 'bg-amber-500' : 'bg-surface-muted'}`}
                  />
                ))}
              </ol>
            }
            position={queue.includes(open) ? `เรื่องที่ ${queue.indexOf(open) + 1} จาก ${queue.length}` : 'ครูดูแลอยู่'}
            sources="แผนของเด็ก · สิ่งที่บันทึกในเคส · การส่งต่อ · ภาระงานของทีม"
            onPick={(opt) => setSheet({ childId: open.plan.childId, name: open.plan.childName, sub: `${pathwayLabel(open)} · ${planTag(open, ownerOf(open.plan.childId))}`, opt })}
            onDetail={() => {
              setReadOnly(open.plan.childId)
              setOpenChild(null)
            }}
            detailLabel="ดูแผนทั้งหมด (อ่านอย่างเดียว)"
          />
        </Drawer>
      )}

      {sheet && (
        <DeskActionSheet
          opt={sheet.opt}
          childId={sheet.childId}
          owner={ownerOf(sheet.childId)}
          agencyName={cases.find((c) => c.plan.childId === sheet.childId)?.current?.ownerName}
          head={
            <>
              <p className="truncate text-[19px] font-bold leading-tight text-ink">{sheet.name}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">{sheet.sub}</p>
            </>
          }
          by={by}
          team={team}
          load={load}
          log={log}
          push={push}
          onClose={() => {
            setSheet(null)
            setOpenChild(null)
          }}
        />
      )}

      {ro && <PlanCaseView c={ro} pathwayLabel={pathwayLabel(ro)} log={log} user={user} mayAct={false} onClose={() => setReadOnly(null)} />}
    </div>
  )
}
