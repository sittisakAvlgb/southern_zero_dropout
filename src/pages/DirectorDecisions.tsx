import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { assetUrl } from '@/lib/asset'
import { requestStatus, SUPPORT_REASON_TH, type SupportRequest } from '@/lib/caseLog'
import type { FollowCase } from '@/lib/followOps'
import { LEVEL_TH } from '@/lib/followOps'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { BOTTLENECK_TH, bottlenecks, caseSummaryLine, directorInbox, execSummary, fmtDay, type BottleneckKey, type InboxItem } from '@/lib/directorOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { StudentTimeline } from '@/components/followup/StudentFollow'
import { byOf } from '@/components/referrals/useRefCases'
import { Drawer } from '@/components/referrals/ui'
import { DecisionCard } from '@/components/support/TeacherSupportSheets'
import { AssignOwnerSheet, DirectorDecisionSheet } from '@/components/support/DirectorDecisionSheet'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'

const MASCOT = assetUrl('ChatBot.png')

type Tile = 'today' | 'sla' | 'people' | 'referral'
const TILE_TH: Record<Tile, string> = {
  today: 'ต้องตัดสินใจวันนี้',
  sla: 'เคสเกิน SLA',
  people: 'ต้องจัดคนเพิ่ม',
  referral: 'รออนุมัติส่งต่อ',
}
const tileTest: Record<Tile, (x: InboxItem) => boolean> = {
  today: (x) => x.today,
  sla: (x) => x.c.sla.level === 'breach',
  people: (x) => x.kind === 'noOwner' || Boolean(x.req?.reasons.some((r) => r === 'people' || r === 'parent' || r === 'meeting')),
  referral: (x) => Boolean(x.req?.reasons.includes('referral')),
}

/** รายชื่อครูของโรงเรียน — จากผู้รับผิดชอบเคสจริง ไม่ใช่รายชื่อสมมติ */
export function teamOf(cases: FollowCase[]): string[] {
  return [...new Set(cases.map((c) => c.s.caseOwner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'))
}

/**
 * เรื่องที่ต้องการการตัดสินใจ — หน้าทำงานของ ผอ.
 *
 * ไม่ใช่ "เคสทั้งหมด": ผอ. ไม่ควรเห็นทุกเคสเป็นความสำคัญเท่ากัน ที่นี่มีแค่
 * คำขอที่ครูส่งขึ้นมา และเรื่องที่ระบบเห็นว่าไม่มีใครขยับได้นอกจาก ผอ.
 * ผอ. ตัดสินใจแล้ว งานกลับไปที่ครู — ผอ. ไม่รับเคสไปทำแทน
 */
export default function DirectorDecisions() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { push } = useToast()
  const { user, log, built } = useFollowCases()
  const loading = useSimulatedLoading(400)
  const by = byOf(user)
  const [params, setParams] = useSearchParams()
  const [tile, setTile] = useState<Tile | null>(null)
  const [openId, setOpenId] = useState<string | null>(params.get('open'))

  const cases = 'list' in built ? built.list : []
  const requests = useMemo(() => Object.values(log.requests), [log.requests])
  const inbox = useMemo(() => directorInbox(cases, requests), [cases, requests])
  const team = useMemo(() => teamOf(cases), [cases])
  const focus = params.get('focus') as BottleneckKey | null
  const focusIds = useMemo(() => (focus ? bottlenecks(cases, requests).find((b) => b.key === focus)?.ids ?? [] : []), [focus, cases, requests])

  // ติดตามผลการตัดสินใจ — งานที่ส่งกลับไปที่ครูแล้ว ผอ. ต้องเห็นว่าเดินต่อจริงไหม
  const following = useMemo(
    () =>
      requests
        .map((r) => ({ r, st: requestStatus(r), c: cases.find((c) => c.s.id === r.childId) }))
        .filter((x) => x.c && (x.st === 'withTeacher' || x.st === 'needInfo' || (x.st === 'done' && Date.now() - (x.r.doneTs ?? 0) < 14 * 86400000)))
        .sort((a, b) => (a.st === 'done' ? 1 : 0) - (b.st === 'done' ? 1 : 0) || b.r.ts - a.r.ts),
    [requests, cases],
  )

  const shown = tile ? inbox.filter(tileTest[tile]) : inbox
  const opened = openId ? inbox.find((x) => x.c.s.id === openId) ?? (cases.find((c) => c.s.id === openId) ? ({ kind: 'request', c: cases.find((c) => c.s.id === openId)!, why: 'ติดตามผลการตัดสินใจ', today: false, waitedDays: 0, req: requests.filter((r) => r.childId === openId).sort((a, b) => b.ts - a.ts)[0] } as InboxItem) : undefined) : undefined

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (openId) next.set('open', openId)
    else next.delete('open')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  const reasonMix = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of inbox.filter((i) => i.today)) {
      const k = x.c.s.parentContact !== 'ok' ? 'การติดต่อครอบครัวไม่ได้' : x.kind === 'noOwner' ? 'เคสที่ยังไม่มีครูผู้รับผิดชอบ' : x.c.refs.some((r) => r.bucket === 'breach') ? 'หน่วยงานภายนอกยังไม่ตอบรับ' : 'เคสที่ช่วยแล้วยังไม่ดีขึ้น'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]
  }, [inbox])

  return (
    <div className="pb-24">
      <PageHeader
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.decisions')]} />}
        title="เรื่องที่ต้องการการตัดสินใจ"
        subtitle="คำขอจากครูและเรื่องที่ต้องใช้อำนาจ ผอ. — ตัดสินใจแล้วงานกลับไปที่ครูพร้อมผู้รับผิดชอบและกำหนดวัน"
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ── สรุปบนสุด: กดเพื่อกรอง ──────────────────── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="group" aria-label="กรองตามประเภท">
            {(Object.keys(TILE_TH) as Tile[]).map((k) => {
              const n = inbox.filter(tileTest[k]).length
              const on = tile === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTile(on ? null : k)}
                  aria-pressed={on}
                  className={`rounded-2xl border bg-white p-4 text-left transition-colors ${on ? 'border-brand-500 ring-2 ring-brand-100' : 'border-surface-border hover:border-brand-300'}`}
                >
                  <span className={`block text-[30px] font-bold leading-none tabular ${k === 'today' && n ? 'text-red-700' : 'text-ink'}`}>{n}</span>
                  <span className="mt-1.5 block text-[14px] font-semibold text-ink">{TILE_TH[k]}</span>
                </button>
              )
            })}
          </div>

          {/* ── AI สรุป ─────────────────────────────── */}
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
            <img src={MASCOT} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5" draggable={false} />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-brand-700">AI สรุปให้ ผอ.</p>
              <p className="mt-0.5 text-[15.5px] leading-snug text-ink">
                {!inbox.length
                  ? 'จากข้อมูลล่าสุด ไม่มีเรื่องที่รอการตัดสินใจจาก ผอ. — ครูยังดูแลทุกเคสได้เอง'
                  : reasonMix && reasonMix[1] === 1 && inbox.filter((i) => i.today).length === 1
                    ? `เรื่องที่ต้องตัดสินใจวันนี้ 1 เรื่อง เกิดจาก${reasonMix[0]}`
                    : reasonMix
                    ? `เรื่องที่ต้องตัดสินใจวันนี้ ${inbox.filter((i) => i.today).length} เรื่อง ส่วนใหญ่เกิดจาก${reasonMix[0]} (${reasonMix[1]} เรื่อง)`
                    : `มี ${inbox.length} เรื่องที่ ผอ. อาจพิจารณาเมื่อสะดวก ไม่มีเรื่องที่ต้องตัดสินใจวันนี้`}
              </p>
            </div>
          </div>

          {/* ── รายการ ─────────────────────────────── */}
          <h2 className="mb-2 mt-6 text-[17px] font-bold text-ink">
            {tile ? TILE_TH[tile] : 'เรื่องที่รอ ผอ.'} <span className="font-semibold text-ink-muted">· {shown.length}</span>
          </h2>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-surface-border bg-white px-5 py-6 text-[15px] text-ink-muted">
              {inbox.length ? 'ไม่มีเรื่องในกลุ่มนี้' : 'ยังไม่มีคำขอจากครู — เมื่อครูกด "ขอการสนับสนุนจาก ผอ." ในแฟ้มเด็ก เรื่องจะมาขึ้นที่นี่'}
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {shown.map((x) => (
                <InboxCard key={`${x.kind}-${x.c.s.id}`} x={x} onOpen={() => setOpenId(x.c.s.id)} />
              ))}
            </div>
          )}

          {/* ── ติดตามผลการตัดสินใจ ───────────────────── */}
          {following.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-[17px] font-bold text-ink">
                ติดตามผลการตัดสินใจ <span className="font-semibold text-ink-muted">· {following.length}</span>
              </h2>
              <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl border border-surface-border bg-white">
                {following.map(({ r, st, c }) => {
                  const d = r.decisions.at(-1)
                  const late = st === 'withTeacher' && d?.next && d.next.due < new Date().toISOString().slice(0, 10)
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => setOpenId(c!.s.id)} className="flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-surface-muted/60 sm:flex-row sm:items-center sm:gap-4">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-ink">{c!.s.name}</span>
                          <span className="block text-[13.5px] text-ink-muted">
                            {st === 'needInfo' ? `รอครูตอบ: ${d?.reason}` : d?.next ? `${d.next.owner}: ${d.next.th}` : r.ask}
                          </span>
                        </span>
                        <span className={`shrink-0 text-[13.5px] font-semibold ${st === 'done' ? 'text-green-700' : late ? 'text-red-700' : 'text-ink'}`}>
                          {st === 'done' ? `✓ ครูทำแล้ว${r.doneNote ? ` — ${r.doneNote}` : ''}` : st === 'needInfo' ? 'รอครูตอบ' : late ? `เลยกำหนด ${fmtDay(d!.next!.due)}` : `กำหนด ${fmtDay(d!.next!.due)}`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* ── มาจากคอขวดบนหน้าแรก ─────────────────── */}
          {focus && (
            <>
              <h2 className="mb-2 mt-8 text-[17px] font-bold text-ink">
                เคสที่ค้างเพราะ{BOTTLENECK_TH[focus]} <span className="font-semibold text-ink-muted">· {focusIds.length}</span>
              </h2>
              <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl border border-surface-border bg-white">
                {focusIds.map((id) => {
                  const c = cases.find((x) => x.s.id === id)!
                  return (
                    <li key={id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-ink">{c.s.name}</span>
                        <span className="block text-[13.5px] text-ink-muted">{c.s.caseOwner || 'ยังไม่มีผู้รับผิดชอบ'} · {c.sla.text}</span>
                      </span>
                      <Link to={`/student?id=${id}`} className="text-[14px] font-semibold text-brand-700">
                        เปิดแฟ้มเด็ก
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}

      {opened && <DirectorCaseDetail x={opened} by={by} team={team} log={log} push={push} onClose={() => setOpenId(null)} onOpenFile={() => nav(`/student?id=${opened.c.s.id}`)} />}
    </div>
  )
}

/** การ์ดสั้นให้ ผอ. อ่านเร็ว — นักเรียน ความเสี่ยง ครูเจ้าของเคส ปัญหา สิ่งที่ครูทำแล้ว สิ่งที่ครูต้องการ AI สรุป */
function InboxCard({ x, onOpen }: { x: InboxItem; onOpen: () => void }) {
  const { c, req } = x
  const s = c.s
  const ai = execSummary(c, req)
  const st = req ? requestStatus(req) : undefined
  return (
    <article className="flex flex-col rounded-2xl border border-surface-border bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[16px] font-bold text-white" style={{ background: RISK_COLOR[s.riskLevel] }}>
          {s.riskScore}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold text-ink">{s.name}</p>
          <p className="text-[13.5px] text-ink-muted">
            {GRADE_LABEL(s.gradeKey, true)} · เสี่ยง{LEVEL_TH[s.riskLevel]} · {s.caseOwner || 'ยังไม่มีครูผู้รับผิดชอบ'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${x.kind === 'request' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-800'}`}>
          {x.kind === 'request' ? (st === 'answered' ? 'ครูตอบแล้ว' : st === 'new' ? 'คำขอใหม่' : 'กำลังพิจารณา') : x.kind === 'noOwner' ? 'ไม่มีเจ้าของ' : 'ค้างนาน'}
        </span>
      </div>

      <dl className="mt-3 space-y-2 text-[14.5px]">
        <div>
          <dt className="text-[12.5px] font-semibold text-ink-muted">ปัญหา</dt>
          <dd className="text-ink">{req?.summary ?? caseSummaryLine(c)}</dd>
        </div>
        {req && req.tried.length > 0 && (
          <div>
            <dt className="text-[12.5px] font-semibold text-ink-muted">ครูได้ทำแล้ว</dt>
            <dd>
              <ul className="space-y-0.5 text-ink">
                {req.tried.slice(0, 3).map((t) => (
                  <li key={t}>• {t}</li>
                ))}
                {req.tried.length > 3 && <li className="text-ink-muted">และอีก {req.tried.length - 3} อย่าง</li>}
              </ul>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[12.5px] font-semibold text-ink-muted">{req ? 'สิ่งที่ครูต้องการ' : 'ทำไมมาถึง ผอ.'}</dt>
          <dd className="font-semibold text-ink">{req ? `“${req.ask}”` : x.why}</dd>
        </div>
      </dl>

      <p className="mt-3 rounded-xl bg-brand-50/60 px-3 py-2 text-[13.5px] leading-snug text-ink">
        <span className="font-semibold text-brand-700">AI: </span>
        {ai.headline}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 pt-1">
        <span className="text-[13px] text-ink-muted">{x.kind === 'request' ? (x.waitedDays ? `รอมา ${x.waitedDays} วัน` : 'ส่งมาวันนี้') : c.sla.text}</span>
        <button type="button" onClick={onOpen} className="rounded-xl bg-brand-500 px-5 py-2.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600">
          พิจารณา
        </button>
      </div>
    </article>
  )
}

/**
 * รายละเอียดสำหรับ ผอ. — เรียงตาม brief:
 * ทำไมมาถึง ผอ. → สิ่งที่ครูทำแล้ว → สิ่งที่ครูต้องการ → AI สรุป → ทางเลือก
 * → ไทม์ไลน์ → ทีม/ผู้รับผิดชอบ → การส่งต่อ → ผลลัพธ์
 */
function DirectorCaseDetail({
  x,
  by,
  team,
  log,
  push,
  onClose,
  onOpenFile,
}: {
  x: InboxItem
  by: string
  team: string[]
  log: ReturnType<typeof useFollowCases>['log']
  push: (m: string) => void
  onClose: () => void
  onOpenFile: () => void
}) {
  const { c, req } = x
  const s = c.s
  const [mode, setMode] = useState<'view' | 'decide' | 'assign'>('view')
  const ai = useMemo(() => execSummary(c, req), [c, req])
  const st = req ? requestStatus(req) : undefined
  const entries = useMemo(() => log.entries.filter((e) => e.childId === s.id), [log.entries, s.id])

  // ผอ. เปิดอ่าน = รับเรื่อง ครูเห็นทันทีว่า ผอ. เห็นแล้ว
  useEffect(() => {
    if (req && !req.seenTs) log.markSeen(req.id, by)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id])

  const head = (
    <>
      <p className="truncate text-[19px] font-bold leading-tight text-ink">{s.name}</p>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        {GRADE_LABEL(s.gradeKey, true)} · {s.id} · <span className="font-bold" style={{ color: RISK_COLOR[s.riskLevel] }}>{s.riskScore}</span> เสี่ยง{LEVEL_TH[s.riskLevel]}
      </p>
    </>
  )

  if (mode === 'decide' && req)
    return (
      <Drawer label={`ตัดสินใจ ${s.name}`} head={head} onBack={() => setMode('view')} onClose={onClose}>
        <DirectorDecisionSheet c={c} req={req} by={by} team={team} log={log} push={push} done={onClose} />
      </Drawer>
    )
  if (mode === 'assign')
    return (
      <Drawer label={`มอบหมาย ${s.name}`} head={head} onBack={() => setMode('view')} onClose={onClose}>
        <AssignOwnerSheet c={c} by={by} team={team} log={log} push={push} done={onClose} />
      </Drawer>
    )

  const decidable = req && ['new', 'seen', 'answered'].includes(st!)
  return (
    <Drawer
      label={s.name}
      head={head}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row">
          {decidable ? (
            <button type="button" onClick={() => setMode('decide')} className="flex-1 rounded-xl bg-brand-500 px-4 py-3 text-[15px] font-semibold text-white">
              ตัดสินใจ
            </button>
          ) : !req || ['done', 'rejected'].includes(st!) ? (
            <button type="button" onClick={() => setMode('assign')} className="flex-1 rounded-xl bg-brand-500 px-4 py-3 text-[15px] font-semibold text-white">
              {s.caseOwner ? 'เตือน / เปลี่ยนผู้รับผิดชอบ' : 'มอบหมายครู'}
            </button>
          ) : null}
          <button type="button" onClick={onOpenFile} className="flex-1 rounded-xl border border-surface-border bg-white px-4 py-3 text-[15px] font-semibold text-ink">
            เปิดแฟ้มเด็ก
          </button>
        </div>
      }
    >
      {/* 1. ทำไมเรื่องนี้มาถึง ผอ. */}
      <section className="rounded-2xl border border-surface-border p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">ทำไมเรื่องนี้มาถึง ผอ.</p>
        <p className="mt-0.5 text-[16px] font-bold leading-snug text-ink">
          {req ? `${req.by} ขอการสนับสนุน — ${req.reasons.map((r) => SUPPORT_REASON_TH[r]).join(' · ')}` : x.why}
        </p>
        <p className="mt-1 text-[14px] text-ink">{req?.summary ?? caseSummaryLine(c)}</p>
        {req && <p className="mt-1 text-[13px] text-ink-muted">ส่งเมื่อ {new Date(req.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}{req.seenTs ? ' · ผอ. รับเรื่องแล้ว' : ''}</p>}
      </section>

      {/* 2–3. สิ่งที่ครูทำแล้ว / สิ่งที่ครูต้องการ */}
      {req && (
        <section className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-surface-border p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">สิ่งที่ครูทำแล้ว</p>
            <ul className="mt-1.5 space-y-1 text-[14.5px] text-ink">
              {req.tried.length ? req.tried.map((t) => <li key={t}>• {t}</li>) : <li className="text-ink-muted">ครูไม่ได้ระบุ</li>}
            </ul>
          </div>
          <div className="rounded-2xl border border-surface-border p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">สิ่งที่ครูต้องการ</p>
            <p className="mt-1.5 text-[15px] font-semibold text-ink">“{req.ask}”</p>
            {req.replies.length > 0 && (
              <div className="mt-2 border-t border-surface-border pt-2 text-[14px]">
                <p className="text-[12.5px] font-semibold text-ink-muted">คำตอบจากครู</p>
                {req.replies.map((r) => (
                  <p key={r.ts} className="text-ink">• {r.text}</p>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* การตัดสินใจที่ผ่านมา */}
      {req && req.decisions.length > 0 && (
        <section className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">การตัดสินใจล่าสุด · {st === 'withTeacher' ? 'งานอยู่ที่ครู' : st === 'done' ? 'ครูทำแล้ว' : st === 'needInfo' ? 'รอครูตอบ' : ''}</p>
          <DecisionCard req={req} />
          {st === 'done' && req.doneNote && <p className="mt-2 rounded-xl bg-green-50 px-3.5 py-2.5 text-[14px] text-ink">✓ ผลจากครู: {req.doneNote}</p>}
        </section>
      )}

      {/* 4–5. AI สรุป + ทางเลือก */}
      <section className="mt-3 rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-4">
        <div className="flex items-center gap-2">
          <img src={MASCOT} alt="" className="h-8 w-8 rounded-xl bg-white object-contain p-0.5" draggable={false} />
          <p className="text-[13px] font-semibold uppercase tracking-wide text-brand-600">AI สรุปมุมบริหาร</p>
        </div>
        <p className="mt-2 text-[15px] leading-snug text-ink">{ai.headline}</p>
        {ai.options.length > 0 && (
          <>
            <p className="mt-3 text-[13.5px] font-semibold text-ink">ทางเลือกที่อาจพิจารณา</p>
            <ol className="mt-1 space-y-1.5 text-[14.5px]">
              {ai.options.map((o, i) => (
                <li key={o.act} className="flex gap-2">
                  <span className="font-bold text-brand-700">{i + 1}.</span>
                  <span>
                    <span className="font-semibold text-ink">{o.th}</span>
                    <span className="block text-[13.5px] text-ink-muted">{o.why}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="mt-3 text-[12.5px] text-ink-muted">AI เสนอจากข้อมูลล่าสุดของเด็กคนนี้ — ผอ. เป็นผู้ตัดสินใจ</p>
      </section>

      {/* 6. ไทม์ไลน์เดียวของเด็ก (อ่านอย่างเดียว — ผอ. ไม่แก้บันทึกของครู) */}
      <section className="mt-3">
        <StudentTimeline fc={c} entries={entries} log={log} mayAct={false} onLogContact={() => undefined} />
      </section>

      {/* 7. ทีม / ผู้รับผิดชอบ */}
      <section className="mt-3 rounded-2xl border border-surface-border p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">ทีม / ผู้รับผิดชอบ</p>
        <p className="mt-1 text-[15px] font-semibold text-ink">ครูเจ้าของเคส: {s.caseOwner || 'ยังไม่มี'}</p>
        {req?.decisions.at(-1)?.next?.support.length ? <p className="mt-0.5 text-[14px] text-ink">ทีมช่วย: {req.decisions.at(-1)!.next!.support.join(' · ')}</p> : null}
      </section>

      {/* 8. การส่งต่อที่เกี่ยวข้อง */}
      {c.refs.length > 0 && (
        <section className="mt-3 rounded-2xl border border-surface-border p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">การส่งต่อที่เกี่ยวข้อง</p>
          <ul className="mt-1.5 space-y-1.5 text-[14.5px]">
            {c.refs.map((r) => (
              <li key={r.id}>
                <span className="font-semibold text-ink">{r.toName}</span> <span className="text-ink-muted">· {r.needTh} · {r.next.th}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 9. ผลลัพธ์ */}
      <section className="mt-3 rounded-2xl border border-surface-border p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">ผลลัพธ์</p>
        <dl className="mt-1.5 grid grid-cols-2 gap-3 text-[14px]">
          <div>
            <dt className="text-[12.5px] text-ink-faint">ความเสี่ยง 8 สัปดาห์</dt>
            <dd className="font-semibold text-ink">
              {s.riskHistory[0]?.score ?? s.riskScore} → {s.riskScore} ({c.riskDelta > 0 ? `+${c.riskDelta}` : c.riskDelta})
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink-faint">มาเรียนสัปดาห์นี้</dt>
            <dd className="font-semibold text-ink">
              {Math.round(s.attendance.at(-1)?.rate ?? 0)}% · ขาดติดกัน {s.absenceStreak} วัน
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink-faint">ผู้ปกครอง</dt>
            <dd className="font-semibold text-ink">{s.parentContact === 'ok' ? 'ติดต่อได้' : s.parentContact === 'delayed' ? 'ตอบช้า' : 'ติดต่อไม่ได้'}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink-faint">อัปเดตล่าสุด</dt>
            <dd className="font-semibold text-ink">{c.updatedDaysAgo === 0 ? 'วันนี้' : `${c.updatedDaysAgo} วันก่อน`}</dd>
          </div>
        </dl>
      </section>
    </Drawer>
  )
}
