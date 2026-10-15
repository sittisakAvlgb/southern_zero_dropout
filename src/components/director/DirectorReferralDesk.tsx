import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { teamLoad } from '@/lib/directorOps'
import { needsAgency } from '@/lib/recommend'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { BUCKET_META, type Bucket, type RefCase } from '@/lib/refOps'
import { refBrief, refHandled, refNeedsDirector, refRank, type DeskOption } from '@/lib/directorDeskOps'
import type { Student } from '@/types'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { byOf, groupByChild, useRefCases } from '@/components/referrals/useRefCases'
import { Drawer, SlaText } from '@/components/referrals/ui'
import { ReferralDetail } from '@/components/referrals/ReferralDetail'
import { BUCKETS, ChildCard, FilterChip } from '@/components/referrals/TeacherReferralCenter'
import { lightestOf } from '@/components/support/DirectorDecisionSheet'
import { teamOf } from '@/pages/DirectorDecisions'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { IconArrowRight, IconReferral } from '@/components/icons'
import { DeskActionSheet, DeskCard, MASCOT, btnSecondary } from './DeskParts'

const ESC_TH = ['', 'แจ้งเตือนแล้ว', 'ยกระดับถึงหัวหน้าหน่วยงานแล้ว', 'ยกระดับถึงระดับจังหวัดแล้ว'] as const

/**
 * ส่งต่อข้ามหน่วยงาน สำหรับ ผอ. — หน้าตาเดียวกับหน้าครู
 *
 *   ผู้ช่วย AI (ตัวเลข → ข้อสังเกต → ปุ่มเดียว) → ตัวกรองตามสถานะ → การ์ดเด็กทีละคน → ควรพิจารณาส่งต่อ → เสร็จแล้ว
 *
 * ครูเป็นคนส่ง ติดตาม และประเมินผล ผอ. ไม่ส่งแทน ตัวกรองแรกจึงเป็น "ต้องใช้ ผอ." — หน่วยงานเกินกำหนด
 * (ยกระดับ) · ถูกส่งกลับหรือขอข้อมูลแล้วค้างที่ครู · ครอบครัวยังไม่ยินยอมนาน แถวบอกสิ่งที่ AI แนะนำ
 * กดแถวแล้วเห็นทางเลือกของ ผอ. ไทม์ไลน์การส่งต่อเปิดอ่านได้อย่างเดียว
 */
export function DirectorReferralDesk({ onFullView }: { onFullView: () => void }) {
  const { t } = useI18n()
  const nav = useNavigate()
  const { push } = useToast()
  const { students, referrals, oosc } = useScopedData()
  const { user, log, built } = useFollowCases()
  const loading = useSimulatedLoading(400)
  const by = byOf(user)
  const fc = 'list' in built ? built.list : []
  const tl = useMemo(() => teamLoad(fc), [fc])
  const load = tl.rows
  const heavy = tl.insight?.owner
  const team = useMemo(() => teamOf(fc), [fc])

  // นาฬิกา SLA เดินเองแม้ ผอ. ไม่ได้กดอะไร
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const now = useMemo(() => Date.now(), [tick, log]) // eslint-disable-line react-hooks/exhaustive-deps
  const roster = useMemo(() => fc.map((c) => c.s), [fc])
  const byId = useMemo(() => new Map(roster.map((s) => [s.id, s])), [roster])
  const refs = useRefCases(user, roster.length ? roster : students, referrals, log, now)
  const live = useMemo(() => refs.filter((r) => r.stage !== 'draft'), [refs])
  // เด็กนอกระบบไม่อยู่ในรายชื่อนักเรียน — ผู้รับผิดชอบมาจากที่ ผอ. มอบหมาย หรือจากทะเบียน
  const ooscOwner = useMemo(() => new Map(oosc.map((r) => [r.id, r.ownerName])), [oosc])

  const [filter, setFilter] = useState<Bucket | 'all' | 'director'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [readOnly, setReadOnly] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ childId: string; name: string; sub: string; owner?: string; agency?: string; opt: DeskOption } | null>(null)
  const [allCand, setAllCand] = useState(false)

  const ownerOfChild = (childId: string, fallback?: string) => byId.get(childId)?.caseOwner || log.owners[childId] || ooscOwner.get(childId) || fallback
  const ownerOf = (r: RefCase) => ownerOfChild(r.childId, r.caseOwner) as string
  const briefOf = (r: RefCase) => {
    const owner = ownerOf(r)
    return refBrief({ ...r, caseOwner: owner }, { heavy: owner === heavy, suggest: lightestOf(load, owner), now, by })
  }

  const active = live.filter((r) => r.bucket !== 'done')
  const done = live.filter((r) => r.bucket === 'done')
  const queue = active.filter((r) => refNeedsDirector(r, now) && !refHandled(r, { by, now })).sort((a, b) => refRank(b, now) - refRank(a, now))
  const inQueue = new Set(queue.map((r) => r.id))
  const count = (b: Bucket) => live.filter((r) => r.bucket === b).length
  const breach = count('breach')
  const near = count('near')
  // คิวของ ผอ. ขึ้นก่อน แล้วตามด้วยลำดับเดิมของครู
  const ordered = [...active].sort((a, b) => Number(inQueue.has(b.id)) - Number(inQueue.has(a.id)) || BUCKET_META[a.bucket].rank - BUCKET_META[b.bucket].rank)
  const shown = filter === 'all' ? ordered : filter === 'director' ? queue : live.filter((r) => r.bucket === filter)
  const groups = groupByChild(shown)

  const openChildren = new Set(active.map((r) => r.childId))
  const candidates = roster
    .filter((s) => needsAgency(s) && (s.riskLevel === 'high' || s.riskLevel === 'critical') && s.caseStage !== 'resolved' && s.caseStage !== 'returned' && !openChildren.has(s.id))
    .sort((a, b) => b.riskScore - a.riskScore)

  const qBreach = queue.filter((r) => r.bucket === 'breach').length
  const qTeacher = queue.length - qBreach
  const insight = queue.length
    ? [qBreach > 0 && `${qBreach} รายการหน่วยงานเกินกำหนด — ผอ. ยกระดับถึงหัวหน้าหน่วยงานได้`, qTeacher > 0 && `${qTeacher} รายการค้างที่ครูนานเกินไป`].filter(Boolean).join(' · ')
    : active.length
      ? 'ทุกการส่งต่ออยู่ในกำหนด หรือครูกำลังดูแลอยู่ — ไม่มีเรื่องที่ต้องใช้ ผอ. วันนี้'
      : candidates.length
        ? `ยังไม่มีการส่งต่อที่ค้าง · ${candidates.length} คนมีปัญหาที่ต้องให้หน่วยงานช่วย`
        : 'ยังไม่มีการส่งต่อที่ต้องติดตาม'

  const first = queue[0]
  const open = openId ? live.find((r) => r.id === openId) : undefined
  const ro = readOnly ? refs.find((r) => r.id === readOnly) : undefined

  const nextOf = (r: RefCase) => {
    if (inQueue.has(r.id)) {
      const o = briefOf(r).options[0]
      return (
        <>
          <span className="text-ink-muted">ต้องใช้ ผอ. —</span> {o ? `AI แนะนำ: ${o.label}` : 'ดูรายละเอียด'}
        </>
      )
    }
    return (
      <>
        <span className="text-ink-muted">ครูดูแลอยู่:</span> {r.next.th}
        {r.escalated > 0 && <span className="text-ink-muted"> · {ESC_TH[r.escalated]}</span>}
      </>
    )
  }

  /** เด็กที่ควรส่งต่อแต่ยังไม่ได้ส่ง — ผอ. ไม่ส่งเอง แต่เตือนหรือมอบหมายครูให้ส่ง */
  const askRefer = (st: Student) => {
    const owner = ownerOfChild(st.id)
    setSheet({
      childId: st.id,
      name: st.name,
      sub: `${GRADE_LABEL(st.gradeKey, true)} · ${t(`cause.${st.causeKeys[0]}`)}`,
      owner,
      opt: owner
        ? { kind: 'nudge', label: `ให้ ${owner} พิจารณาส่งต่อ`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', message: `${st.name} มีปัญหาที่โรงเรียนแก้เองไม่ได้ — ช่วยพิจารณาส่งต่อหน่วยงานที่เกี่ยวข้อง ติดอะไรบอก ผอ. ได้เลย` }
        : { kind: 'assign', label: 'มอบหมายครูดูแล', effect: 'เด็กขึ้นในงานของครูคนนั้นทันที' },
    })
  }

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconReferral width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.referral')]} />}
        title={t('ref.title')}
        subtitle="ส่งมอบความรับผิดชอบแบบติดตามได้ — รู้เสมอว่าเรื่องอยู่ที่ใคร เกินกำหนดไหม และต้องทำอะไรต่อ"
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
                  {active.length} การส่งต่อที่ยังเปิดอยู่
                  {breach > 0 && <span style={{ color: BUCKET_META.breach.color }}> · ⚠ {breach} เกิน SLA</span>}
                  {near > 0 && <span style={{ color: BUCKET_META.near.color }}> · ⏰ {near} ใกล้เกิน</span>}
                  {queue.length > 0 && <> · {queue.length} เรื่องต้องใช้ ผอ.</>}
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{insight}</p>
              </>
            )}
          </div>
        </div>
        {!loading && (first ?? candidates[0]) && (
          <button
            type="button"
            onClick={() => (first ? setOpenId(first.id) : askRefer(candidates[0]))}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600 sm:w-auto"
          >
            {first ? `เปิดเรื่องแรก · ${first.childName}` : `ให้ครูพิจารณาส่งต่อ ${candidates[0].name}`}
            <IconArrowRight width={16} height={16} />
          </button>
        )}
      </div>

      {/* ── ตัวกรองตามสถานะ — ตัวเลขพร้อมชื่อ ไม่ใช่สีอย่างเดียว ── */}
      {!loading && live.length > 0 && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          <FilterChip on={filter === 'all'} onClick={() => setFilter('all')} label="ยังเปิดอยู่" n={active.length} />
          {queue.length > 0 && <FilterChip on={filter === 'director'} onClick={() => setFilter('director')} label="ต้องใช้ ผอ." n={queue.length} color={BUCKET_META.breach.color} />}
          {BUCKETS.filter((b) => count(b) > 0).map((b) => (
            <FilterChip key={b} on={filter === b} onClick={() => setFilter(b)} label={BUCKET_META[b].th.replace('คุณ', 'ครู')} n={count(b)} color={BUCKET_META[b].color} />
          ))}
        </div>
      )}

      {loading || 'error' in built ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5 pb-24">
          {groups.length === 0 && filter === 'all' && (
            <p className="rounded-2xl bg-green-50 px-4 py-3 text-[14.5px] font-medium text-green-800">✓ ไม่มีการส่งต่อที่ค้างอยู่</p>
          )}
          {groups.length > 0 && (
            <ul className="space-y-2.5">
              {groups.map((g) => {
                const st = byId.get(g[0].childId)
                return (
                  <ChildCard
                    key={g[0].childId}
                    refs={g}
                    risk={st?.riskScore}
                    level={st?.riskLevel}
                    owner={ownerOf(g[0])}
                    nextOf={nextOf}
                    onOpen={(id) => (refs.find((r) => r.id === id)?.bucket === 'done' ? setReadOnly(id) : setOpenId(id))}
                  />
                )
              })}
            </ul>
          )}

          {filter === 'all' && candidates.length > 0 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
                <span className="h-3 w-3 rounded-full border-2 border-ink-faint" />
                ควรพิจารณาส่งต่อ
                <span className="font-medium text-ink-faint">· {candidates.length}</span>
              </h2>
              <p className="mb-2 text-[13.5px] text-ink-muted">เสี่ยงสูง และสาเหตุเป็นเรื่องที่โรงเรียนแก้เองไม่ได้ (ตามกลุ่มรหัส สพฐ.) — ครูเป็นคนส่งต่อ</p>
              <ul className="overflow-hidden rounded-2xl border border-dashed border-surface-border bg-white">
                {(allCand ? candidates : candidates.slice(0, 5)).map((st) => (
                  <li key={st.id} className="flex items-center gap-3 border-b border-surface-border px-4 py-3 last:border-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: RISK_COLOR[st.riskLevel] }}>
                      {st.riskScore}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-semibold text-ink">{st.name}</p>
                      <p className="text-[13px] text-ink-muted">
                        {GRADE_LABEL(st.gradeKey, true)} · {t(`cause.${st.causeKeys[0]}`)} · {ownerOfChild(st.id) ?? 'ยังไม่มีผู้รับผิดชอบ'}
                      </p>
                    </div>
                    <button type="button" onClick={() => askRefer(st)} className="shrink-0 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-brand-700 hover:bg-brand-50">
                      {ownerOfChild(st.id) ? 'ให้ครูส่งต่อ' : 'มอบหมายครู'}
                    </button>
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
                  <ChildCard key={g[0].childId} refs={g} owner={ownerOf(g[0])} onOpen={setReadOnly} />
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onFullView} className={btnSecondary}>
              เปิดรายการส่งต่อแบบเต็ม (ค้นหา · กรอง · กราฟ SLA)
            </button>
            <button type="button" onClick={() => nav('/decisions')} className={btnSecondary}>
              ไปที่เรื่องที่ต้องตัดสินใจ
            </button>
          </div>
        </div>
      )}

      {/* กดแถว → ทางเลือกของ ผอ. สำหรับการส่งต่อนั้น */}
      {open && !sheet && (
        <Drawer
          label={`การส่งต่อของ ${open.childName}`}
          head={
            <>
              <p className="truncate text-[19px] font-bold leading-tight text-ink">{open.childName}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                {open.needTh} → {open.toName} · {ownerOf(open)}
              </p>
            </>
          }
          onClose={() => setOpenId(null)}
        >
          <DeskCard
            b={briefOf(open)}
            body={
              <p className="text-[15.5px] font-semibold">
                <SlaText sla={open.sla} />
                {open.escalated > 0 && <span className="text-ink-muted"> · {ESC_TH[open.escalated]}</span>}
              </p>
            }
            position={inQueue.has(open.id) ? `เรื่องที่ ${queue.indexOf(open) + 1} จาก ${queue.length}` : 'ครูดูแลอยู่'}
            sources="ไทม์ไลน์การส่งต่อ · นาฬิกา SLA · ภาระงานของทีม"
            onPick={(opt) => setSheet({ childId: open.childId, name: open.childName, sub: `${open.toName} · ${BUCKET_META[open.bucket].th}`, owner: ownerOf(open), agency: open.toName, opt })}
            onDetail={() => {
              setReadOnly(open.id)
              setOpenId(null)
            }}
            detailLabel="ดูไทม์ไลน์การส่งต่อ (อ่านอย่างเดียว)"
          />
        </Drawer>
      )}

      {sheet && (
        <DeskActionSheet
          opt={sheet.opt}
          childId={sheet.childId}
          owner={sheet.owner}
          agencyName={sheet.agency}
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
            setOpenId(null)
          }}
        />
      )}

      {ro && (
        <ReferralDetail
          key={ro.id}
          r={ro}
          siblings={refs.filter((x) => x.childId === ro.childId && x.id !== ro.id)}
          student={byId.get(ro.childId)}
          log={log}
          user={user}
          mayAct={false}
          onClose={() => setReadOnly(null)}
          onOpen={setReadOnly}
          onReferMore={() => setReadOnly(null)}
        />
      )}
    </div>
  )
}
