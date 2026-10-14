import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { canWorkCases } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { applyLog, applyPlans, useCaseLog } from '@/lib/caseLog'
import { buildCase, milestones, PRIORITY_META, sortCases, type PlanCase, type Priority } from '@/lib/planOps'
import { useSimulatedLoading } from '@/lib/useLoading'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { PATHWAY_COLOR } from '@/data/plans'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { IconArrowRight, IconPathway } from '@/components/icons'
import { assetUrl } from '@/lib/asset'
import { PlanCaseView } from './PlanCaseView'
import { CreatePlanView } from './CreatePlanView'

const MASCOT = assetUrl('ChatBot.png')
const ORDER: Priority[] = ['today', 'soon', 'onTrack', 'improving']

const dueText = (n: number) =>
  n < 0 ? `เลยกำหนด ${-n} วัน` : n === 0 ? 'ครบกำหนดวันนี้' : `อีก ${n} วัน`

/**
 * เส้นทางโอกาสรายบุคคล สำหรับครู — "ศูนย์ปฏิบัติการช่วยนักเรียนรายคน"
 *
 * หน้าเดิมเปิดด้วยตัวเลขใหญ่ แถบสุขภาพของแผนสี่สี ตัวกรองห้าตัวสำหรับแผน
 * ห้าแผน แล้วปิดท้ายด้วยโดนัทกับกราฟแท่ง — เป็นแดชบอร์ดของคนกำกับดูแล
 * ไม่ใช่ที่ทำงานของครู ลำดับใหม่ตาม brief:
 *
 *   สิ่งที่ต้องทำตอนนี้ (AI) → เคสเรียงตามความเร่งด่วน → ยังไม่มีแผน → สถิติ (พับไว้)
 *
 * แต่ละแถวบอก "ขั้นตอนถัดไป" ของเคสนั้นตรง ๆ ไม่ใช่ชื่อขั้นในแม่แบบ และบอก
 * ว่าลูกบอลอยู่ในมือใคร — "คุณ" หรือหน่วยงานภายนอก
 */
export function TeacherPlanWorkspace() {
  const { t } = useI18n()
  const { user, plans, students } = useScopedData()
  const log = useCaseLog(user?.id)
  const mayAct = canWorkCases(user)
  const loading = useSimulatedLoading(450)
  const [params, setParams] = useSearchParams()

  const roster = useMemo(() => students.map((st) => applyLog(st, log)), [students, log])
  const byId = useMemo(() => new Map(roster.map((st) => [st.id, st])), [roster])
  const records = useMemo(() => applyPlans(plans, log), [plans, log])
  const cases = useMemo(
    () => sortCases(records.map((p) => buildCase(p, byId.get(p.childId), log.entries, true))),
    [records, byId, log.entries],
  )
  /** เด็กในความดูแลที่เสี่ยงแต่ยังไม่มีแผน — จุดเริ่มของขั้น "วางแผน" */
  const noPlan = useMemo(
    () =>
      roster
        .filter(
          (st) =>
            !records.some((p) => p.childId === st.id) &&
            st.caseStage !== 'resolved' &&
            st.caseStage !== 'returned' &&
            (st.riskLevel === 'high' || st.riskLevel === 'critical'),
        )
        .sort((a, b) => b.riskScore - a.riskScore),
    [roster, records],
  )

  const [openChild, setOpenChild] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // ลิงก์ตรงจากหน้าแรกของครู: /plan?child=ID เปิดเคสทันที หรือเปิดหน้าสร้างแผน
  // ถ้าเด็กคนนั้นยังไม่มีแผน — ครูไม่ต้องมาหาชื่อเองในรายการ
  useEffect(() => {
    const id = params.get('child')
    if (!id || loading) return
    if (records.some((p) => p.childId === id)) setOpenChild(id)
    else if (byId.has(id)) setCreating(id)
    params.delete('child')
    setParams(params, { replace: true })
  }, [params, setParams, records, byId, loading])

  // เคสที่ปิดแล้วไม่อยู่ในรายการที่ต้องดูแล — พับไว้ท้ายหน้า
  const isClosed = (c: PlanCase) => c.next.kind === 'done'
  const active = cases.filter((c) => !isClosed(c))
  const closedCases = cases.filter(isClosed)
  const shown = query.trim()
    ? active.filter((c) => c.plan.childName.includes(query.trim()))
    : active
  const groups = ORDER.map((k) => ({ k, items: shown.filter((c) => c.priority === k) })).filter((g) => g.items.length)

  const today = active.filter((c) => c.priority === 'today')
  const waiting = today.filter((c) => !c.next.ownerIsTeacher && (c.next.kind === 'chase' || c.next.kind === 'unblock'))
  const blocked = today.filter((c) => c.current?.status === 'blocked')
  const closeable = active.filter((c) => c.closeReady)
  const insight = !today.length
    ? closeable.length
      ? `ไม่มีเคสเร่งด่วนวันนี้ และมี ${closeable.length} เคสที่ดีขึ้นจนปิดได้แล้ว`
      : 'ไม่มีเคสเร่งด่วนวันนี้ ทุกแผนยังอยู่ในกำหนด'
    : waiting.length
      ? `${waiting.length} ใน ${today.length} เคสเร่งด่วนรอหน่วยงานภายนอกอยู่ — ทวงถามได้จากในเคสเลย`
      : blocked.length
        ? `${blocked.length} เคสติดขัด ต้องตัดสินใจว่าจะทวงถามหรือส่งต่อ`
        : `${today.length} เคสถึงกำหนดหรือเลยกำหนดแล้ว`

  const open = cases.find((c) => c.plan.childId === openChild)
  const pathwayLabel = (c: PlanCase) => t(`pathway.${c.plan.pathway}`)

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconPathway width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.plan')]} />}
        title={t('plan.title')}
        subtitle={t('plan.subtitle')}
      />

      {/* ── NUMBER → INSIGHT → ACTION ─────────────────────── */}
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
                  <span style={{ color: today.length ? PRIORITY_META.today.color : undefined }}>
                    {today.length} ต้องดำเนินการวันนี้
                  </span>
                  {noPlan.length > 0 && <> · {noPlan.length} คนเสี่ยงแต่ยังไม่มีแผน</>}
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{insight}</p>
              </>
            )}
          </div>
        </div>
        {!loading && (today[0] ?? noPlan[0]) && (
          <button
            type="button"
            onClick={() => (today[0] ? setOpenChild(today[0].plan.childId) : setCreating(noPlan[0].id))}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600 sm:w-auto"
          >
            {today[0] ? `เปิดเคสแรก · ${today[0].plan.childName}` : `สร้างแผนให้ ${noPlan[0].name}`}
            <IconArrowRight width={16} height={16} />
          </button>
        )}
      </div>

      {cases.length > 8 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อเด็ก"
          className="mb-4 w-full rounded-xl border border-surface-border bg-white px-4 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
      )}

      {/* ── เคสเรียงตามความเร่งด่วน ──────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : active.length === 0 && noPlan.length === 0 && closedCases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-border bg-white px-6 py-10 text-center">
          <p className="text-[17px] font-semibold text-ink">ยังไม่มีแผนในความดูแลของคุณ</p>
          <p className="mt-1 text-[14px] text-ink-muted">เมื่อมีเด็กเสี่ยงสูงในเคสของคุณ จะขึ้นที่นี่ให้สร้างแผนได้ทันที</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.k}>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
                <span className="h-3 w-3 rounded-full" style={{ background: PRIORITY_META[g.k].color }} />
                {PRIORITY_META[g.k].th}
                <span className="font-medium text-ink-faint">· {g.items.length}</span>
              </h2>
              <ul className="overflow-hidden rounded-2xl border border-surface-border bg-white">
                {g.items.map((c) => (
                  <CaseRow key={c.plan.id} c={c} pathway={pathwayLabel(c)} onOpen={() => setOpenChild(c.plan.childId)} />
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
                      <p className="text-[13px] text-ink-muted">{GRADE_LABEL(st.gradeKey, true)} · {t(`cause.${st.causeKeys[0]}`)}</p>
                    </div>
                    {mayAct && (
                      <button
                        type="button"
                        onClick={() => setCreating(st.id)}
                        className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white"
                      >
                        สร้างแผน
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
                  <CaseRow key={c.plan.id} c={c} pathway={pathwayLabel(c)} onOpen={() => setOpenChild(c.plan.childId)} />
                ))}
              </ul>
            </details>
          )}

          <StatsFold cases={cases} t={t} />
        </div>
      )}

      {open && (
        <PlanCaseView c={open} pathwayLabel={pathwayLabel(open)} log={log} user={user} mayAct={mayAct} onClose={() => setOpenChild(null)} />
      )}
      {creating && byId.get(creating) && (
        <CreatePlanView
          student={byId.get(creating)!}
          log={log}
          user={user}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null)
            setOpenChild(id)
          }}
        />
      )}
    </div>
  )
}

function CaseRow({ c, pathway, onOpen }: { c: PlanCase; pathway: string; onOpen: () => void }) {
  const ms = milestones(c)
  const done = c.plan.steps.filter((s) => s.status === 'done').length
  const n = c.next
  return (
    <li className="border-b border-surface-border last:border-0">
      <button type="button" onClick={onOpen} className="group flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-muted/60">
        <span className="w-1 shrink-0 self-stretch rounded-full" style={{ background: PRIORITY_META[c.priority].color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[16px] font-bold text-ink">{c.plan.childName}</span>
            <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: `${PATHWAY_COLOR[c.plan.pathway]}1a`, color: PATHWAY_COLOR[c.plan.pathway] }}>
              {pathway}
            </span>
            {!c.plan.agreedByFamily && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700">รอครอบครัวเห็นชอบ</span>
            )}
          </div>
          <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink">
            <span className="text-ink-muted">ถัดไป:</span> {n.th}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            <span className={n.ownerIsTeacher ? 'font-semibold text-brand-700' : ''}>{n.ownerTh}</span>
            {n.daysLeft !== undefined && (
              <span style={{ color: n.daysLeft < 0 ? RISK_COLOR.critical : n.daysLeft <= 3 ? RISK_COLOR.high : undefined }}>
                {' · '}
                {dueText(n.daysLeft)}
              </span>
            )}
            {c.followUpIn !== undefined && (
              <span> · นัดติดตาม{c.followUpIn <= 0 ? 'ถึงกำหนดแล้ว' : `อีก ${c.followUpIn} วัน`}</span>
            )}
          </p>
        </div>
        <div className="hidden shrink-0 flex-col items-end justify-center gap-1.5 sm:flex">
          <div className="flex gap-1" aria-label="milestone">
            {ms.map((m) => (
              <span
                key={m.th}
                title={m.th}
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: m.state === 'done' ? RISK_COLOR.normal : m.state === 'active' ? '#2f66f6' : '#e2e8f0' }}
              />
            ))}
          </div>
          <span className="text-[12.5px] text-ink-muted">
            ทำแล้ว {done}/{c.plan.steps.length} ขั้น
          </span>
        </div>
        <IconArrowRight width={16} height={16} className="shrink-0 self-center text-ink-faint group-hover:text-brand-600" />
      </button>
    </li>
  )
}

/** สถิติไว้ท้ายสุดและพับไว้ — ครูเข้ามาเพื่อช่วยนักเรียน ไม่ได้มาดูกราฟ */
function StatsFold({ cases, t }: { cases: PlanCase[]; t: (k: string) => string }) {
  const by = new Map<string, number>()
  for (const c of cases) by.set(c.plan.pathway, (by.get(c.plan.pathway) ?? 0) + 1)
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...rows.map((r) => r[1]))
  if (!rows.length) return null
  return (
    <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
      <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
        <span className="inline-flex items-center gap-1.5">
          <IconArrowRight width={14} height={14} className="transition-transform group-open:rotate-90" />
          สถิติของแผนทั้งหมด
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-[13px] text-ink-muted">เส้นทางที่เลือก</p>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-[13.5px]">
              <span className="text-ink">{t(`pathway.${k}`)}</span>
              <span className="font-bold tabular text-ink">{v}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: PATHWAY_COLOR[k as keyof typeof PATHWAY_COLOR] }} />
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
