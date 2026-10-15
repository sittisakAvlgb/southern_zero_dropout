import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AgencyKind, ReferralNeed } from '@/types'
import { useScopedData } from '@/auth/scope'
import { canWorkCases } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { applyLog, useCaseLog, logKeyOf } from '@/lib/caseLog'
import { needsAgency } from '@/lib/recommend'
import { useSimulatedLoading } from '@/lib/useLoading'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { assetUrl } from '@/lib/asset'
import { BUCKET_META, type Bucket, type RefCase } from '@/lib/refOps'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { IconArrowRight, IconPlus, IconReferral } from '@/components/icons'
import { groupByChild, useRefCases } from './useRefCases'
import { BucketBadge, Drawer, inputCls, SlaText } from './ui'
import { ReferralDetail } from './ReferralDetail'
import { CreateReferral } from './CreateReferral'

const MASCOT = assetUrl('ChatBot.png')
export const BUCKETS: Bucket[] = ['breach', 'near', 'returned', 'review', 'consent', 'awaiting', 'needInfo', 'inProgress', 'done']

/**
 * ส่งต่อเคสข้ามหน่วยงาน สำหรับครู
 *
 * "การส่งต่อไม่ใช่การโยนเคส แต่คือการส่งมอบความรับผิดชอบแบบติดตามได้"
 *
 * หน้าเดิมเป็นตารางของผู้กำกับดูแล 4,800 แถว กับเมทริกซ์การไหลระหว่างหน่วยงาน
 * ครูมีการส่งต่อไม่กี่รายการ สิ่งที่ต้องรู้คือรายการไหนค้าง ค้างที่ใคร และต้อง
 * ทำอะไร หน้านี้จึงเรียงตามความเร่งด่วน (เกิน SLA → ใกล้เกิน → รอความยินยอม →
 * รอรับเรื่อง → รอข้อมูล → กำลังทำ → เสร็จ) และจัดกลุ่มตามเด็ก เพราะเด็กหนึ่งคน
 * ส่งหลายหน่วยงานได้แต่เป็นเคสเดียวกัน
 */
export function TeacherReferralCenter() {
  const { t } = useI18n()
  const { user, students, referrals } = useScopedData()
  const log = useCaseLog(logKeyOf(user), user?.id)
  const mayAct = canWorkCases(user)
  const loading = useSimulatedLoading(450)
  const [params, setParams] = useSearchParams()

  // นาฬิกา SLA ต้องเดินเองแม้ครูไม่ได้กดอะไร
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const now = useMemo(() => Date.now(), [tick, log]) // eslint-disable-line react-hooks/exhaustive-deps

  const roster = useMemo(() => students.map((s) => applyLog(s, log)), [students, log])
  const byId = useMemo(() => new Map(roster.map((s) => [s.id, s])), [roster])
  const refs = useRefCases(user, roster, referrals, log, now)

  const [filter, setFilter] = useState<Bucket | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ childId: string; kinds?: AgencyKind[]; need?: ReferralNeed } | null>(null)
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  const [allCand, setAllCand] = useState(false)

  // ลิงก์ตรง /referral?ref=ID (จากหน้าเคสในเส้นทางโอกาส) หรือ ?child=ID ให้เริ่มส่งต่อ
  useEffect(() => {
    if (loading) return
    const ref = params.get('ref')
    const child = params.get('child')
    if (!ref && !child) return
    if (ref) setOpenId(ref)
    else if (child && byId.has(child)) setCreating({ childId: child, need: (params.get('need') as ReferralNeed | null) ?? undefined })
    params.delete('ref')
    params.delete('child')
    params.delete('need')
    setParams(params, { replace: true })
  }, [params, setParams, loading, byId])

  const active = refs.filter((r) => r.bucket !== 'done')
  const done = refs.filter((r) => r.bucket === 'done')
  const count = (b: Bucket) => refs.filter((r) => r.bucket === b).length
  const breach = count('breach')
  const near = count('near')
  const mine = refs.filter((r) => ['returned', 'review', 'needInfo', 'consent'].includes(r.bucket))
  const shown = filter === 'all' ? active : refs.filter((r) => r.bucket === filter)
  const groups = groupByChild(shown)

  const openChildren = new Set(active.map((r) => r.childId))
  const candidates = roster
    .filter(
      (s) =>
        needsAgency(s) &&
        (s.riskLevel === 'high' || s.riskLevel === 'critical') &&
        s.caseStage !== 'resolved' &&
        s.caseStage !== 'returned' &&
        !openChildren.has(s.id),
    )
    .sort((a, b) => b.riskScore - a.riskScore)

  const first = active[0]
  const insight = breach
    ? `${breach} รายการเกินกำหนดแล้ว — ยิ่งรอนาน เด็กยิ่งเสี่ยงหลุด โทรถามหน่วยงานแล้วอัปเดตความคืบหน้า หรือ Escalate ได้จากในรายการ`
    : mine.length
      ? `${mine.length} รายการรอคุณอยู่ — หน่วยงานขอข้อมูลเพิ่ม ได้ผลแล้วรอประเมิน หรือยังรอความยินยอม`
      : near
        ? `${near} รายการใกล้เกินกำหนด ติดต่อหน่วยงานไว้ก่อนจะช่วยได้`
        : active.length
          ? 'ทุกการส่งต่ออยู่ในกำหนด หน่วยงานกำลังดำเนินการ'
          : candidates.length
            ? `ยังไม่มีการส่งต่อที่ค้าง · ${candidates.length} คนมีปัญหาที่ต้องให้หน่วยงานช่วย`
            : 'ยังไม่มีการส่งต่อที่ต้องติดตาม'

  const open = refs.find((r) => r.id === openId)
  const creatingStudent = creating ? byId.get(creating.childId) : undefined
  const historyOf = (childId: string) =>
    log.entries.filter((e) => e.childId === childId).length + (byId.get(childId)?.timeline.length ?? 0)

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconReferral width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.referral')]} />}
        title={t('ref.title')}
        subtitle="ส่งมอบความรับผิดชอบแบบติดตามได้ — รู้เสมอว่าเรื่องอยู่ที่ใคร เกินกำหนดไหม และต้องทำอะไรต่อ"
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
                  {active.length} การส่งต่อที่ยังเปิดอยู่
                  {breach > 0 && <span style={{ color: BUCKET_META.breach.color }}> · ⚠ {breach} เกิน SLA</span>}
                  {near > 0 && <span style={{ color: BUCKET_META.near.color }}> · ⏰ {near} ใกล้เกิน</span>}
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{insight}</p>
              </>
            )}
          </div>
        </div>
        {!loading && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {first && first.bucket !== 'inProgress' && first.bucket !== 'awaiting' ? (
              <button
                type="button"
                onClick={() => setOpenId(first.id)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600"
              >
                จัดการรายการแรก · {first.childName}
                <IconArrowRight width={16} height={16} />
              </button>
            ) : (
              candidates[0] &&
              mayAct && (
                <button
                  type="button"
                  onClick={() => setCreating({ childId: candidates[0].id })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600"
                >
                  ส่งต่อให้ {candidates[0].name}
                  <IconArrowRight width={16} height={16} />
                </button>
              )
            )}
            {mayAct && (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-300 bg-white px-5 py-3.5 text-[15px] font-semibold text-brand-700"
              >
                <IconPlus width={16} height={16} /> ส่งต่อเคสใหม่
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── ตัวกรองตามสถานะ — ตัวเลขพร้อมชื่อ ไม่ใช่สีอย่างเดียว ── */}
      {!loading && refs.length > 0 && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          <FilterChip on={filter === 'all'} onClick={() => setFilter('all')} label="ยังเปิดอยู่" n={active.length} />
          {BUCKETS.filter((b) => count(b) > 0).map((b) => (
            <FilterChip key={b} on={filter === b} onClick={() => setFilter(b)} label={BUCKET_META[b].th} n={count(b)} color={BUCKET_META[b].color} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : refs.length === 0 && candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-border bg-white px-6 py-10 text-center">
          <p className="text-[17px] font-semibold text-ink">ยังไม่มีการส่งต่อในความดูแลของคุณ</p>
          <p className="mt-1 text-[14px] text-ink-muted">เมื่อเด็กในเคสของคุณต้องการความช่วยเหลือจากหน่วยงานอื่น ส่งต่อได้จากปุ่ม "ส่งต่อเคสใหม่"</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.length === 0 && filter === 'all' && active.length === 0 && (
            <p className="rounded-2xl bg-green-50 px-4 py-3 text-[14.5px] font-medium text-green-800">✓ ไม่มีการส่งต่อที่ค้างอยู่</p>
          )}
          {groups.length > 0 && (
            <ul className="space-y-2.5">
              {groups.map((g) => (
                <ChildCard key={g[0].childId} refs={g} risk={byId.get(g[0].childId)?.riskScore} level={byId.get(g[0].childId)?.riskLevel} onOpen={setOpenId} />
              ))}
            </ul>
          )}

          {filter === 'all' && candidates.length > 0 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
                <span className="h-3 w-3 rounded-full border-2 border-ink-faint" />
                ควรพิจารณาส่งต่อ
                <span className="font-medium text-ink-faint">· {candidates.length}</span>
              </h2>
              <p className="mb-2 text-[13.5px] text-ink-muted">เสี่ยงสูง และสาเหตุเป็นเรื่องที่โรงเรียนแก้เองไม่ได้ (ตามกลุ่มรหัส สพฐ.)</p>
              <ul className="overflow-hidden rounded-2xl border border-dashed border-surface-border bg-white">
                {(allCand ? candidates : candidates.slice(0, 5)).map((st) => (
                  <li key={st.id} className="flex items-center gap-3 border-b border-surface-border px-4 py-3 last:border-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: RISK_COLOR[st.riskLevel] }}>
                      {st.riskScore}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-semibold text-ink">{st.name}</p>
                      <p className="text-[13px] text-ink-muted">
                        {GRADE_LABEL(st.gradeKey, true)} · {t(`cause.${st.causeKeys[0]}`)}
                      </p>
                    </div>
                    {mayAct && (
                      <button type="button" onClick={() => setCreating({ childId: st.id })} className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white">
                        ส่งต่อ
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {candidates.length > 5 && (
                <button type="button" onClick={() => setAllCand((v) => !v)} className="mt-2 text-[14px] font-semibold text-brand-700 underline">
                  {allCand ? 'ย่อ' : `ดูทั้งหมด ${candidates.length} คน`}
                </button>
              )}
            </section>
          )}

          {filter === 'all' && done.length > 0 && (
            <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
              <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
                <span className="inline-flex items-center gap-1.5">
                  <IconArrowRight width={14} height={14} className="transition-transform group-open:rotate-90" />
                  เสร็จแล้ว · {done.length}
                </span>
              </summary>
              <ul className="mt-2 space-y-2">
                {groupByChild(done).map((g) => (
                  <ChildCard key={g[0].childId} refs={g} onOpen={setOpenId} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {open && (
        <ReferralDetail
          key={open.id}
          r={open}
          siblings={refs.filter((x) => x.childId === open.childId && x.id !== open.id)}
          student={byId.get(open.childId)}
          log={log}
          user={user}
          mayAct={mayAct}
          onClose={() => setOpenId(null)}
          onOpen={setOpenId}
          onReferMore={() => {
            setOpenId(null)
            setCreating({ childId: open.childId })
          }}
        />
      )}

      {creating && creatingStudent && (
        <Drawer
          label="ส่งต่อหน่วยงาน"
          head={
            <>
              <p className="text-[19px] font-bold leading-tight text-ink">ส่งต่อหน่วยงาน</p>
              <p className="mt-1 text-[13.5px] text-ink-muted">
                {creatingStudent.name} · {GRADE_LABEL(creatingStudent.gradeKey, true)}
              </p>
            </>
          }
          onClose={() => setCreating(null)}
        >
          <CreateReferral
            student={creatingStudent}
            log={log}
            user={user}
            preset={creating.kinds || creating.need ? { kinds: creating.kinds, need: creating.need } : undefined}
            historyCount={historyOf(creatingStudent.id)}
            onDone={() => setCreating(null)}
            onOpen={(id) => {
              setCreating(null)
              setOpenId(id)
            }}
          />
        </Drawer>
      )}

      {picking && (
        <Drawer label="เลือกนักเรียน" head={<p className="text-[19px] font-bold text-ink">ส่งต่อเคสของใคร</p>} onClose={() => setPicking(false)}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อเด็ก" className={inputCls} autoFocus />
          <ul className="mt-3 divide-y divide-surface-border rounded-2xl border border-surface-border">
            {roster
              .filter((s) => s.name.includes(q.trim()))
              .sort((a, b) => b.riskScore - a.riskScore)
              .slice(0, 40)
              .map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false)
                      setCreating({ childId: s.id })
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[14px] font-bold text-white" style={{ background: RISK_COLOR[s.riskLevel] }}>
                      {s.riskScore}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{s.name}</span>
                      <span className="block text-[13px] text-ink-muted">
                        {GRADE_LABEL(s.gradeKey, true)} · {t(`cause.${s.causeKeys[0]}`)}
                        {openChildren.has(s.id) && ' · มีการส่งต่อที่เปิดอยู่'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </Drawer>
      )}
    </div>
  )
}

export function FilterChip({ on, onClick, label, n, color }: { on: boolean; onClick: () => void; label: string; n: number; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] font-medium"
      style={{ borderColor: on ? '#2f66f6' : '#e2e8f0', background: on ? '#eef3ff' : '#fff', color: on ? '#1d4ed8' : '#0f172a' }}
    >
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      {label}
      <span className="font-bold">{n}</span>
    </button>
  )
}

/** การ์ดต่อเด็กหนึ่งคน — การส่งต่อทุกหน่วยงานของเด็กคนนั้นอยู่ในการ์ดเดียว */
/** การ์ดของเด็กหนึ่งคน — ผอ. ใช้การ์ดเดียวกัน โดยแทนบรรทัด "ถัดไป" ด้วยมุมของ ผอ. และบอกชื่อครูผู้รับผิดชอบ */
export function ChildCard({
  refs,
  risk,
  level,
  onOpen,
  nextOf,
  owner,
}: {
  refs: RefCase[]
  risk?: number
  level?: keyof typeof RISK_COLOR
  onOpen: (id: string) => void
  nextOf?: (r: RefCase) => React.ReactNode
  owner?: string
}) {
  const head = refs[0]
  return (
    <li className="overflow-hidden rounded-2xl border border-surface-border bg-white">
      <div className="flex items-center gap-2 border-b border-surface-border bg-surface-muted/40 px-4 py-2.5">
        {risk !== undefined && level && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: RISK_COLOR[level] }}>
            {risk}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink">{head.childName}</p>
        {owner && <span className="hidden shrink-0 text-[13px] font-semibold text-brand-700 sm:inline">{owner}</span>}
        {refs.length > 1 && <span className="shrink-0 text-[13px] font-medium text-ink-muted">{refs.length} หน่วยงาน</span>}
      </div>
      <ul>
        {refs.map((r) => (
          <li key={r.id} className="border-b border-surface-border last:border-0">
            <button type="button" onClick={() => onOpen(r.id)} className="group flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-muted/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <BucketBadge b={r.bucket} />
                  <span className="text-[14px] font-semibold text-ink">{r.needTh}</span>
                  <span className="text-[13.5px] text-ink-muted">→ {r.toName}</span>
                </div>
                <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink">
                  {nextOf ? (
                    nextOf(r)
                  ) : (
                    <>
                      <span className="text-ink-muted">ถัดไป:</span> {r.next.th}
                    </>
                  )}
                </p>
                {r.sla.clock !== 'none' && (
                  <p className="mt-0.5 text-[13px]">
                    <SlaText sla={r.sla} />
                  </p>
                )}
              </div>
              <IconArrowRight width={16} height={16} className="shrink-0 self-center text-ink-faint group-hover:text-brand-600" />
            </button>
          </li>
        ))}
      </ul>
    </li>
  )
}
