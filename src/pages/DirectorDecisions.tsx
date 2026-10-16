import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { requestStatus, type SupportRequest } from '@/lib/caseLog'
import { ATTN_META, HEALTH_META, LEVEL_TH, type FollowCase, type Health } from '@/lib/followOps'
import { RISK_COLOR } from '@/lib/risk'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { BOTTLENECK_TH, bottlenecks, directorInbox, fmtDay, isoIn, teamLoad, type BottleneckKey, type InboxItem, type TeamRow } from '@/lib/directorOps'
import { decisionBrief, directorQueue, handledBy, type DecisionBrief, type DecisionStart } from '@/lib/directorDeskOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { StudentTimeline } from '@/components/followup/StudentFollow'
import { byOf } from '@/components/referrals/useRefCases'
import { Drawer } from '@/components/referrals/ui'
import { DecisionCard } from '@/components/support/TeacherSupportSheets'
import { AssignOwnerSheet, DirectorDecisionSheet, lightestOf } from '@/components/support/DirectorDecisionSheet'
import { DeskCard, MASCOT, btnSecondary } from '@/components/director/DeskParts'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'
import { IconShield } from '@/components/icons'
import { staffOf } from '@/data/staff'

/** เรื่องของเด็กคนหนึ่งในมุม ผอ. — ใช้รายการในกล่องถ้ามี ไม่มีก็สร้างจากเคส (ติดตามผล · ลิงก์จาก AI) */
export function itemFor(id: string, inbox: InboxItem[], cases: FollowCase[], requests: SupportRequest[]): InboxItem | undefined {
  const hit = inbox.find((x) => x.c.s.id === id)
  if (hit) return hit
  const c = cases.find((x) => x.s.id === id)
  if (!c) return undefined
  const req = requests.filter((r) => r.childId === id).sort((a, b) => b.ts - a.ts)[0]
  return { kind: req ? 'request' : c.s.caseOwner ? 'stuck' : 'noOwner', c, req, why: c.because, today: false, waitedDays: 0 }
}

/** รายชื่อที่ ผอ. มอบหมายได้ — ผู้รับผิดชอบเคสปัจจุบัน + บุคลากรทั้งโรงเรียน (รวมคนที่ยังไม่มีเคส)
 *  คนที่มีเคสอยู่ขึ้นก่อน (เรียงตามชื่อ) แล้วตามด้วยคนที่ยังไม่มีเคส — ผอ. เห็นภาระงานของคนที่ทำอยู่ก่อน */
export function teamOf(cases: FollowCase[], schoolKey?: string): string[] {
  const owners = [...new Set(cases.map((c) => c.s.caseOwner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'))
  const rest = staffOf(schoolKey).filter((n) => !owners.includes(n))
  return [...owners, ...rest]
}

const todayIso = () => isoIn(0)

/** ป้ายสถานะท้ายแถว — ข้อความเสมอ ไม่ใช้สีอย่างเดียว */
export function Pill({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'brand' | 'muted'; children: ReactNode }) {
  const cls = { red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-800', green: 'bg-green-50 text-green-800', brand: 'bg-brand-50 text-brand-700', muted: 'bg-surface-muted text-ink-muted' }[tone]
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${cls}`}>{children}</span>
}

/** แถวของเด็กหนึ่งคน — โครงเดียวกับแถวบนหน้าแผนและการส่งต่อ (หน้าติดตามการช่วยเหลือใช้ด้วย) */
export function Row({ c, line, meta, pill, onOpen }: { c: FollowCase; line: ReactNode; meta: ReactNode; pill?: ReactNode; onOpen: () => void }) {
  const s = c.s
  return (
    <li className="border-b border-surface-border last:border-0">
      <button type="button" onClick={onOpen} className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-muted/60">
        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: RISK_COLOR[s.riskLevel] }} aria-label={`คะแนนเสี่ยง ${s.riskScore}`}>
          {s.riskScore}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[16px] font-bold text-ink">{s.name}</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] font-semibold text-ink-muted">
              {GRADE_LABEL(s.gradeKey, true)} · เสี่ยง{LEVEL_TH[s.riskLevel]}
            </span>
            {pill}
          </span>
          <span className="mt-1 line-clamp-2 text-[14.5px] font-medium leading-snug text-ink">{line}</span>
          <span className="mt-0.5 block text-[13px] text-ink-muted">{meta}</span>
        </span>
        <span aria-hidden className="shrink-0 self-center text-[16px] text-ink-faint group-hover:text-brand-600">
          →
        </span>
      </button>
    </li>
  )
}

export function Group({ title, dot, n, hint, children }: { title: string; dot: string; n: number; hint?: string; children: ReactNode }) {
  if (!n) return null
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <span className={`h-3 w-3 rounded-full ${dot}`} />
        {title}
        <span className="font-medium text-ink-faint">· {n}</span>
      </h2>
      {hint && <p className="mt-0.5 text-[13.5px] text-ink-muted">{hint}</p>}
      <ul className="mt-2 overflow-hidden rounded-2xl border border-surface-border bg-white">{children}</ul>
    </section>
  )
}

/**
 * เรื่องที่ต้องตัดสินใจ — หน้าทำงานของ ผอ. หน้าตาเดียวกับเส้นทางโอกาส · การส่งต่อ · ทะเบียนเด็กนอกระบบ
 *
 *   ผู้ช่วย AI (ตัวเลข → ข้อสังเกต → ปุ่มเดียว) → ครูขอให้ ผอ. ช่วย → AI พบว่าค้าง → ผอ. ตัดสินใจแล้ว รอครู → ครูทำเสร็จแล้ว (พับไว้)
 *
 * หน้าเดียวของ ผอ. สำหรับเคสรายคน — รวม "การช่วยเหลือ" เข้ามาแล้ว (ดูทีละครู · เคสที่ครูดูแลอยู่พับไว้ท้ายหน้า)
 * ข้างบนมีแค่คำขอที่ครูส่งขึ้นมา และเรื่องที่ไม่มีใครขยับได้นอกจาก ผอ. ตัวเลข "เรื่องรอ ผอ." ตรงกับป้ายบนเมนู
 * แต่ละแถวบอกว่าติดอะไรและ AI แนะนำอะไร กดแล้วเปิดลิ้นชักที่ทางเลือกพาไปขั้นที่ตรงเรื่องทันที
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
  const [openId, setOpenId] = useState<string | null>(params.get('open'))
  const [start, setStart] = useState<{ start: DecisionStart; owner?: string } | null>(null)
  // ดูทีละครู — ย้ายมาจากหน้าการช่วยเหลือ เพราะเคสค้างมักมาจากภาระงานของคนคนเดียว
  const [owner, setOwner] = useState<string | null>(() => params.get('owner'))
  const [query, setQuery] = useState('')

  const cases = 'list' in built ? built.list : []
  const requests = useMemo(() => Object.values(log.requests), [log.requests])
  const inbox = useMemo(() => directorInbox(cases, requests), [cases, requests])
  const team = useMemo(() => teamOf(cases), [cases])
  const load = useMemo(() => teamLoad(cases), [cases])
  const heavy = load.insight?.owner
  const focus = params.get('focus') as BottleneckKey | null
  const focusIds = useMemo(() => (focus ? bottlenecks(cases, requests).find((b) => b.key === focus)?.ids ?? [] : []), [focus, cases, requests])

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (openId) next.set('open', openId)
    else next.delete('open')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  const briefOf = (x: InboxItem): DecisionBrief => decisionBrief(x.kind, x.c, x.req, heavy, lightestOf(load.rows, x.c.s.caseOwner || undefined))

  // ── แบ่งกลุ่ม ──
  // คิวเดียวกับตัวเลขบนเมนู — เคสที่ ผอ. เพิ่งเตือน/มอบหมาย/Escalate (3 วัน) ย้ายไปอยู่ "รอผล"
  const all = directorQueue(inbox, log.entries)
  const allFollowing = requests
    .map((r) => ({ r, st: requestStatus(r), c: cases.find((c) => c.s.id === r.childId) }))
    .filter((x) => x.c && (x.st === 'withTeacher' || x.st === 'needInfo'))
    .sort((a, b) => b.r.ts - a.r.ts)
  const allFinished = requests
    .map((r) => ({ r, st: requestStatus(r), c: cases.find((c) => c.s.id === r.childId) }))
    .filter((x) => x.c && x.st === 'done' && Date.now() - (x.r.doneTs ?? 0) < 14 * 86400000)

  // ── กรองตามครู · ชื่อเด็ก (ตัวเลขในกล่อง AI นับทั้งโรงเรียนเสมอ) ──
  const match = (c: FollowCase) => (!owner || (owner === '—' ? !c.s.caseOwner : c.s.caseOwner === owner)) && (!query.trim() || c.s.name.includes(query.trim()))
  const asks = all.asks.filter((x) => match(x.c))
  const found = all.found.filter((x) => match(x.c))
  const nudged = all.nudged.filter((x) => match(x.c))
  const following = allFollowing.filter((x) => match(x.c!))
  const finished = allFinished.filter((x) => match(x.c!))

  // ── ครูดูแลอยู่: เคสที่เปิดอยู่ซึ่งไม่ได้อยู่ในกลุ่มข้างบน — ผอ. ดูเมื่อต้องการ ไม่ต้องทำอะไร ──
  const shownIds = new Set([...all.asks, ...all.found, ...all.nudged].map((x) => x.c.s.id).concat(allFollowing.map((x) => x.c!.s.id)))
  const openCases = cases.filter((c) => c.open)
  const teamCases = openCases.filter((c) => !shownIds.has(c.s.id) && match(c))
  const HEALTH_ORDER: Health[] = ['now', 'stuck', 'watch', 'ok']
  const teamGroups = HEALTH_ORDER.map((h) => ({ h, items: teamCases.filter((c) => c.health === h) })).filter((g) => g.items.length)

  // ── เคสเกิน SLA กระจุกที่ใคร ──
  const breach = openCases.filter((c) => c.sla.level === 'breach')
  const breachTop = [...breach.reduce((m, c) => (c.s.caseOwner ? m.set(c.s.caseOwner, (m.get(c.s.caseOwner) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]
  const topOwner = breachTop && breachTop[1] >= 3 ? breachTop[0] : undefined
  const chips = [
    { k: null as string | null, th: 'ทุกคน', n: openCases.length },
    ...load.rows.map((r) => ({ k: r.owner as string | null, th: r.owner, n: r.open })),
    ...(openCases.some((c) => !c.s.caseOwner) ? [{ k: '—' as string | null, th: 'ยังไม่มีผู้รับผิดชอบ', n: openCases.filter((c) => !c.s.caseOwner).length }] : []),
  ]
  const [teamOpen, setTeamOpen] = useState(() => window.location.hash === '#team')
  const lateOf = (r: SupportRequest) => {
    const d = r.decisions.at(-1)?.next
    return Boolean(d && requestStatus(r) === 'withTeacher' && d.due < todayIso())
  }
  const queue = [...all.asks, ...all.found]
  const first = queue[0]
  const lateAll = allFollowing.filter((x) => lateOf(x.r)).length

  // ── ข้อสังเกตของ AI: พูดตรง ๆ ว่าอะไรรอ ผอ. ไม่ขัดกับรายการด้านล่าง ──
  const insight = (() => {
    const parts: string[] = []
    const aAsks = all.asks
    const aFound = all.found
    if (!queue.length && !lateAll) {
      const waitingN = allFollowing.length + all.nudged.length
      parts.push(waitingN ? `ไม่มีเรื่องใหม่ที่รอ ผอ. — ${waitingN} เรื่องที่ ผอ. ดำเนินการแล้วยังอยู่ในกำหนด` : 'ไม่มีเรื่องที่รอ ผอ.')
    }
    if (aAsks.length) {
      const oldest = [...aAsks].sort((a, b) => b.waitedDays - a.waitedDays)[0]
      parts.push(`ครูขอให้ช่วย ${aAsks.length} เรื่อง${oldest.waitedDays ? ` (นานสุดรอ ${oldest.waitedDays} วัน)` : ''}`)
    }
    if (aFound.length) {
      const noOwner = aFound.filter((x) => !x.c.s.caseOwner).length
      parts.push([noOwner && `${noOwner} คนยังไม่มีผู้รับผิดชอบ`, aFound.length - noOwner && `${aFound.length - noOwner} เคสค้างนานจนครูขยับเองไม่ได้`].filter(Boolean).join(' · '))
    }
    if (lateAll) parts.push(`งานที่ ผอ. ส่งกลับเลยกำหนด ${lateAll} เรื่อง`)
    // เคสเกิน SLA กระจุกที่ครูคนเดียว = ปัญหาภาระงาน ไม่ใช่รายเคส
    if (topOwner) {
      const sug = lightestOf(load.rows, topOwner)
      parts.push(`เคสเกิน SLA ${breach.length} เคส มากที่สุดอยู่กับ ${topOwner} ${breachTop![1]} เคส${topOwner === heavy && sug ? ` — น่าจะเป็นเรื่องภาระงาน อาจพิจารณากระจายบางเคสให้ ${sug}` : ''}`)
    } else if (breach.length) parts.push(`เคสเกิน SLA ${breach.length} เคส ครูกำลังดูแล`)
    return parts.join(' · ')
  })()

  const opened = openId ? itemFor(openId, inbox, cases, requests) : undefined
  const open = (id: string, s?: { start: DecisionStart; owner?: string }) => {
    setStart(s ?? null)
    setOpenId(id)
  }

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconShield width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.decisions')]} />}
        title={t('nav.decisions')}
        subtitle="คำขอจากครูและเรื่องที่ต้องใช้อำนาจ ผอ. — ตัดสินใจแล้วงานกลับไปที่ครูพร้อมผู้รับผิดชอบและกำหนดวัน"
      />

      {/* ── NUMBER → INSIGHT → ACTION (เหมือนหน้าอื่นของ ผอ.) ─────── */}
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
                  <span className={queue.length ? 'text-red-600' : ''}>{queue.length} เรื่องรอ ผอ.</span>
                  {allFollowing.length + all.nudged.length > 0 && <> · {allFollowing.length + all.nudged.length} เรื่องรอครู</>}
                  {breach.length > 0 && <> · เกิน SLA {breach.length}</>}
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{insight}</p>
              </>
            )}
          </div>
        </div>
        {!loading && (first || (topOwner && owner !== topOwner)) && (
          <button
            type="button"
            onClick={() => (first ? open(first.c.s.id) : setOwner(topOwner!))}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600 sm:w-auto"
          >
            {first ? `เปิดเรื่องแรก · ${first.c.s.name}` : `ดูเคสของ ${topOwner}`} <span aria-hidden>→</span>
          </button>
        )}
      </div>

      {/* ── ดูทีละครู — ตัวเลขพร้อมชื่อ ไม่ใช่สีอย่างเดียว ── */}
      {!loading && 'list' in built && (
        <div className="mb-5 space-y-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="ดูตามผู้รับผิดชอบ">
            {chips.map((x) => {
              const on = owner === x.k
              return (
                <button
                  key={x.th}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setOwner(on ? null : x.k)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[14px] font-semibold ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink hover:border-brand-300'}`}
                >
                  {x.th} <span className={on ? 'text-brand-700' : 'text-ink-muted'}>{x.n}</span>
                </button>
              )
            })}
          </div>
          {openCases.length > 8 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อเด็ก"
              aria-label="ค้นหาชื่อเด็ก"
              className="w-full rounded-xl border border-surface-border bg-white px-4 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
          )}
          {owner && owner !== '—' && (
            <p className="rounded-xl bg-surface-muted/70 px-4 py-2.5 text-[14px] text-ink">
              {(() => {
                const r = load.rows.find((x) => x.owner === owner)
                return r ? `${owner}: เปิดอยู่ ${r.open} เคส · เสี่ยงสูง ${r.high} · เกิน SLA ${r.sla}${owner === heavy ? ' — ภาระงานสูงที่สุดในทีม' : ''}` : owner
              })()}
            </p>
          )}
        </div>
      )}

      {loading || 'error' in built ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6 pb-24">
          {!asks.length && !found.length && !following.length && !nudged.length && (owner || query.trim()) && (
            <p className="rounded-2xl border border-dashed border-surface-border bg-white px-5 py-4 text-[15px] text-ink-muted">ไม่มีเรื่องที่รอ ผอ. สำหรับที่เลือก — ดูเคสที่ครูดูแลอยู่ด้านล่าง</p>
          )}
          {!queue.length && !allFollowing.length && !all.nudged.length && !owner && !query.trim() && (
            <p className="rounded-2xl border border-dashed border-surface-border bg-white px-5 py-6 text-[15px] text-ink-muted">
              ยังไม่มีเรื่องที่รอ ผอ. — เมื่อครูกด "ขอการสนับสนุนจาก ผอ." ในแฟ้มเด็ก หรือมีเคสเสี่ยงสูงที่ค้างนาน เรื่องจะมาขึ้นที่นี่
            </p>
          )}

          <Group title="ครูขอให้ ผอ. ช่วย" dot="bg-red-600" n={asks.length} hint="ครูกดขอการสนับสนุนจากแฟ้มเด็ก — ตัดสินใจแล้วงานกลับไปที่ครูทันที">
            {asks.map((x) => {
              const b = briefOf(x)
              return (
                <Row
                  key={x.c.s.id}
                  c={x.c}
                  onOpen={() => open(x.c.s.id)}
                  pill={<Pill tone={b.tag === 'คำขอใหม่' ? 'red' : 'brand'}>{b.tag}</Pill>}
                  line={
                    <>
                      <span className="text-ink-muted">{b.headline}:</span> “{x.req!.ask}”
                    </>
                  }
                  meta={
                    <>
                      <span className="font-semibold text-brand-700">{x.c.s.caseOwner || 'ยังไม่มีผู้รับผิดชอบ'}</span> · {x.waitedDays ? `รอ ผอ. มา ${x.waitedDays} วัน` : 'ส่งมาวันนี้'}
                    </>
                  }
                />
              )
            })}
          </Group>

          <Group title="AI พบว่าค้าง" dot="bg-orange-500" n={found.length} hint="ครูยังไม่ได้ขอ แต่ไม่มีใครขยับได้นอกจาก ผอ.">
            {found.map((x) => {
              const b = briefOf(x)
              const rec = b.options[0]
              return (
                <Row
                  key={x.c.s.id}
                  c={x.c}
                  onOpen={() => open(x.c.s.id)}
                  pill={<Pill tone={b.tone === 'red' ? 'red' : 'amber'}>{b.tag}</Pill>}
                  line={
                    <>
                      <span className="text-ink-muted">{b.headline} —</span> {rec ? `AI แนะนำ: ${rec.label}` : 'ดูรายละเอียด'}
                    </>
                  }
                  meta={<span className={x.c.s.caseOwner ? 'font-semibold text-brand-700' : 'font-semibold text-red-700'}>{x.c.s.caseOwner || 'ยังไม่มีผู้รับผิดชอบ'}</span>}
                />
              )
            })}
          </Group>

          <Group title="ผอ. ตัดสินใจแล้ว รอครู" dot="bg-amber-500" n={following.length + nudged.length} hint="งานกลับไปที่ครูแล้ว — ดูว่าเดินต่อจริงไหม">
            {following.map(({ r, st, c }) => {
              const d = r.decisions.at(-1)
              const late = lateOf(r)
              return (
                <Row
                  key={r.id}
                  c={c!}
                  onOpen={() => open(c!.s.id)}
                  pill={st === 'needInfo' ? <Pill tone="brand">รอครูตอบ</Pill> : late ? <Pill tone="red">เลยกำหนด</Pill> : <Pill tone="muted">ในกำหนด</Pill>}
                  line={st === 'needInfo' ? `ผอ. ขอข้อมูลเพิ่ม: ${d?.reason ?? ''}` : d?.next ? d.next.th : r.ask}
                  meta={
                    <>
                      <span className="font-semibold text-brand-700">{d?.next?.owner ?? c!.s.caseOwner}</span>
                      {d?.next && <span className={late ? 'font-semibold text-red-700' : ''}> · กำหนด {fmtDay(d.next.due)}</span>}
                    </>
                  }
                />
              )
            })}
            {nudged.map((x) => {
              const last = log.entries.find((e) => e.childId === x.c.s.id && e.role === 'director')
              return (
                <Row
                  key={`n-${x.c.s.id}`}
                  c={x.c}
                  onOpen={() => open(x.c.s.id)}
                  pill={<Pill tone="muted">รอผล</Pill>}
                  line={last?.note ?? 'ผอ. ดำเนินการแล้ว'}
                  meta={<span className="font-semibold text-brand-700">{x.c.s.caseOwner || 'ยังไม่มีผู้รับผิดชอบ'}</span>}
                />
              )
            })}
          </Group>

          {/* ── ครูดูแลอยู่ — ย้ายมาจากหน้าการช่วยเหลือ พับไว้: ผอ. ดูเมื่อต้องการ ไม่ต้องทำอะไร ── */}
          {teamCases.length > 0 && (
            <details id="team" open={teamOpen || Boolean(owner) || Boolean(query.trim())} onToggle={(e) => setTeamOpen((e.target as HTMLDetailsElement).open)} className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
              <summary className="cursor-pointer list-none marker:hidden">
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                  <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
                  ครูดูแลอยู่ · {teamCases.length}
                </span>
                <span className="mt-0.5 block pl-4 text-[13.5px] text-ink-muted">เคสที่เปิดอยู่และครูกำลังดำเนินการ — ไม่ต้องใช้ ผอ. ตอนนี้</span>
              </summary>
              <div className="mt-3 space-y-4">
                {teamGroups.map((g) => (
                  <div key={g.h}>
                    <p className="mb-1.5 text-[13.5px] font-semibold" style={{ color: HEALTH_META[g.h].color }}>
                      {HEALTH_META[g.h].th} · {g.items.length}
                    </p>
                    <ul className="overflow-hidden rounded-xl border border-surface-border">
                      {g.items.map((c) => (
                        <Row
                          key={c.s.id}
                          c={c}
                          onOpen={() => open(c.s.id)}
                          pill={c.attn !== 'normal' ? <Pill tone={c.attn === 'critical' || c.attn === 'sla' ? 'red' : c.attn === 'closing' ? 'green' : 'amber'}>{ATTN_META[c.attn].th.split(' — ')[0]}</Pill> : undefined}
                          line={
                            <>
                              <span className="text-ink-muted">ครูดูแลอยู่:</span> {c.next.th}
                            </>
                          }
                          meta={
                            <>
                              <span className={c.s.caseOwner ? 'font-semibold text-brand-700' : 'font-semibold text-red-700'}>{c.s.caseOwner || 'ยังไม่มีผู้รับผิดชอบ'}</span>
                              <span className={c.sla.level === 'breach' ? 'font-semibold text-red-700' : ''}> · {c.sla.text}</span>
                              <span> · อัปเดต{c.updatedDaysAgo === 0 ? 'วันนี้' : ` ${c.updatedDaysAgo} วันก่อน`}</span>
                            </>
                          }
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}

          {finished.length > 0 && (
            <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
              <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
                  ครูทำเสร็จแล้ว · {finished.length}
                </span>
              </summary>
              <ul className="mt-2 overflow-hidden rounded-xl border border-surface-border">
                {finished.map(({ r, c }) => (
                  <Row
                    key={r.id}
                    c={c!}
                    onOpen={() => open(c!.s.id)}
                    pill={<Pill tone="green">✓ ครูทำแล้ว</Pill>}
                    line={r.decisions.at(-1)?.next?.th ?? r.ask}
                    meta={r.doneNote ? `ผลจากครู: ${r.doneNote}` : `${r.by}`}
                  />
                ))}
              </ul>
            </details>
          )}

          {/* มาจากคอขวดบนหน้าภาพรวม */}
          {focus && (
            <Group title={`เคสที่ค้างเพราะ${BOTTLENECK_TH[focus]}`} dot="bg-slate-400" n={focusIds.length}>
              {focusIds.map((id) => {
                const c = cases.find((x) => x.s.id === id)!
                return <Row key={id} c={c} onOpen={() => nav(`/student?id=${id}`)} line="เปิดแฟ้มเด็ก" meta={`${c.s.caseOwner || 'ยังไม่มีผู้รับผิดชอบ'} · ${c.sla.text}`} />
              })}
            </Group>
          )}

          {focus && (
            <Link to="/decisions" className="inline-block text-[14px] font-semibold text-brand-700 underline">
              ซ่อนรายชื่อนี้
            </Link>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => nav('/intervention?view=full')} className={btnSecondary}>
              ตารางเคสทั้งหมด (ค้นหา · กรองตามขั้น · ส่งออก CSV)
            </button>
          </div>
        </div>
      )}

      {opened && (
        <DirectorCaseDetail
          key={`${opened.c.s.id}-${start?.start ?? 'view'}`}
          x={opened}
          start={start?.start}
          suggestOwner={start?.owner}
          heavy={heavy}
          load={load.rows}
          by={by}
          team={team}
          log={log}
          push={push}
          onClose={() => {
            setOpenId(null)
            setStart(null)
          }}
          onOpenFile={() => nav(`/student?id=${opened.c.s.id}`)}
        />
      )}
    </div>
  )
}

/** หัวข้อพับ — รายละเอียดที่ ผอ. อาจอยากดู แต่ไม่ต้องอ่านก่อนตัดสินใจ */
function More({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group mt-3 rounded-2xl border border-surface-border bg-white px-4 py-3">
      <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
          {title}
        </span>
      </summary>
      <div className="mt-2.5">{children}</div>
    </details>
  )
}

/**
 * ลิ้นชักของ ผอ. — โครงเดียวกับลิ้นชักหน้าอื่นของ ผอ.:
 * การ์ดสถานะ (ติดอะไร · ข้อเท็จจริง) → AI มองว่า → ทางเลือกที่พาไปขั้นที่ตรงเรื่อง →
 * รายละเอียดพับไว้ (สิ่งที่ครูทำแล้ว · ไทม์ไลน์ · ทีมและการส่งต่อ · ผลลัพธ์)
 */
export function DirectorCaseDetail({
  x,
  start,
  suggestOwner,
  heavy,
  load,
  by,
  team,
  log,
  push,
  onClose,
  onOpenFile,
}: {
  x: InboxItem
  /** เปิดตรงขั้นที่ AI แนะนำ — ไม่ต้องกดผ่านหน้ารายละเอียดก่อน */
  start?: DecisionStart
  /** ครูที่ AI เสนอให้รับเคส — เลือกไว้ให้ก่อน ผอ. เปลี่ยนได้ */
  suggestOwner?: string
  /** ครูที่ภาระงานล้น — AI เสนอแบบเดียวกับหน้าแรก */
  heavy?: string
  /** ภาระงานของทีม — แสดงในตัวเลือกครู */
  load?: TeamRow[]
  by: string
  team: string[]
  log: ReturnType<typeof useFollowCases>['log']
  push: (m: string) => void
  onClose: () => void
  onOpenFile: () => void
}) {
  const { c, req } = x
  const s = c.s
  const st = req ? requestStatus(req) : undefined
  const canDecide = Boolean(req && ['new', 'seen', 'answered'].includes(st!))
  const [step, setStep] = useState<{ mode: 'view' | 'decide' | 'assign'; start?: DecisionStart; owner?: string }>(() =>
    start === 'decide' && canDecide ? { mode: 'decide' } : start && start !== 'decide' ? { mode: 'assign', start, owner: suggestOwner } : { mode: 'view' },
  )
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
        {GRADE_LABEL(s.gradeKey, true)} · {s.id} · <span className="font-bold" style={{ color: RISK_COLOR[s.riskLevel] }}>{s.riskScore}</span> เสี่ยง{LEVEL_TH[s.riskLevel]} · {s.caseOwner || 'ยังไม่มีผู้รับผิดชอบ'}
      </p>
    </>
  )
  const back = () => setStep({ mode: 'view' })

  if (step.mode === 'decide' && req)
    return (
      <Drawer label={`ตัดสินใจ ${s.name}`} head={head} onBack={back} onClose={onClose}>
        <DirectorDecisionSheet c={c} req={req} by={by} team={team} load={load} heavy={heavy} log={log} push={push} done={onClose} />
      </Drawer>
    )
  if (step.mode === 'assign')
    return (
      <Drawer label={`ขยับเคส ${s.name}`} head={head} onBack={back} onClose={onClose}>
        <AssignOwnerSheet c={c} by={by} team={team} log={log} push={push} done={onClose} start={step.start === 'decide' ? undefined : step.start} suggestOwner={step.owner} load={load} />
      </Drawer>
    )

  // ── การ์ดสถานะตามสถานะของเรื่อง ──
  const lightest = lightestOf(load, s.caseOwner || undefined)
  const d = req?.decisions.at(-1)
  const late = Boolean(d?.next && st === 'withTeacher' && d.next.due < todayIso())
  // ผอ. เพิ่งเตือน/มอบหมาย/Escalate ใน 3 วัน — รอผล ไม่เสนอให้ทำซ้ำ (ทางอื่นยังกดได้จากปุ่มด้านล่าง)
  const lastAct = !req && handledBy(log.entries, s.id) ? entries.find((e) => e.role === 'director') : undefined
  const brief: DecisionBrief = lastAct
    ? {
        tag: 'รอผล',
        tone: 'green',
        headline: 'ผอ. ดำเนินการแล้ว รอผล',
        why: [lastAct.note ?? 'ผอ. ดำเนินการแล้ว', `เมื่อ ${fmtDay(lastAct.date)} · ผู้รับผิดชอบตอนนี้ ${s.caseOwner || 'ยังไม่มี'}`],
        question: 'ผอ. ดำเนินการแล้ว รอผล — ผอ. อาจพิจารณาทางไหน',
        options: [],
      }
    : canDecide || !req
      ? decisionBrief(canDecide ? 'request' : x.kind === 'noOwner' || !s.caseOwner ? 'noOwner' : 'stuck', c, req, heavy, lightest)
      : st === 'withTeacher' || st === 'needInfo'
        ? {
            tag: st === 'needInfo' ? 'รอครูตอบ' : late ? 'เลยกำหนด' : 'งานอยู่ที่ครู',
            tone: late ? 'red' : 'green',
            headline: st === 'needInfo' ? 'ผอ. ขอข้อมูลเพิ่มจากครู' : late ? 'งานที่ ผอ. ส่งกลับเลยกำหนด' : 'ผอ. ตัดสินใจแล้ว งานอยู่ที่ครู',
            why: [
              st === 'needInfo' ? `ผอ. ถาม: ${d?.reason ?? ''}` : d?.next ? `${d.next.owner}: ${d.next.th}` : `ครูขอ: “${req.ask}”`,
              ...(d?.next ? [`กำหนด ${fmtDay(d.next.due)}`] : []),
            ],
            question: late ? 'งานที่ ผอ. ส่งกลับเลยกำหนด — จะติดตามกับครูไหม?' : 'ผอ. อาจพิจารณาทางไหน',
            options: late ? [{ label: `ติดตามกับ${d?.next?.owner ?? s.caseOwner}`, effect: 'ข้อความจาก ผอ. ขึ้นในงานวันนี้ของครู', start: 'nudge', recommended: true }] : [],
          }
        : {
            tag: st === 'done' ? 'ครูทำแล้ว' : 'ปิดเรื่องแล้ว',
            tone: 'green',
            headline: st === 'done' ? 'ครูทำตามที่ ผอ. ตัดสินใจแล้ว' : 'ผอ. ไม่อนุมัติคำขอนี้',
            why: [req.doneNote ? `ผลจากครู: ${req.doneNote}` : `ครูขอ: “${req.ask}”`],
            question: 'ผอ. อาจพิจารณาทางไหน',
            options: [],
          }
  const position = req ? (x.waitedDays ? `รอ ผอ. ${x.waitedDays} วัน` : st === 'done' ? 'ปิดเรื่องแล้ว' : '') : c.sla.text

  return (
    <Drawer
      label={s.name}
      head={head}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setStep({ mode: 'assign' })} className={`${btnSecondary} flex-1`}>
            ทางอื่น: เตือน · เปลี่ยนผู้รับผิดชอบ · Escalate
          </button>
          <button type="button" onClick={onOpenFile} className={`${btnSecondary} flex-1`}>
            เปิดแฟ้มเด็ก
          </button>
        </div>
      }
    >
      <DeskCard
        b={{ ...brief, question: brief.question.includes(' — ') ? brief.question : `${brief.headline} — ${brief.question}` }}
        position={position}
        sources="คำขอจากครู · ไทม์ไลน์ของเด็ก · การส่งต่อ · ภาระงานของทีม"
        onPick={(o) => setStep(o.start === 'decide' ? { mode: 'decide' } : { mode: 'assign', start: o.start, owner: o.owner })}
        empty={lastAct ? 'รอผู้รับผิดชอบแจ้งผลภายใน 3 วัน — AI จะยกเรื่องนี้ขึ้นมาอีกครั้งถ้ายังไม่ขยับ' : st === 'done' ? 'เรื่องนี้จบแล้ว — ไม่มีอะไรที่ ผอ. ต้องทำต่อ' : 'งานอยู่ที่ครูและยังอยู่ในกำหนด — ไม่มีอะไรที่ ผอ. ต้องทำตอนนี้'}
      />

      {req && req.decisions.length > 0 && (
        <More title="การตัดสินใจของ ผอ." open>
          <DecisionCard req={req} />
        </More>
      )}

      {req && (
        <More title="สิ่งที่ครูทำแล้วและสิ่งที่ขอ">
          <p className="text-[13px] font-semibold text-ink-muted">สิ่งที่ครูทำแล้ว</p>
          <ul className="mt-1 space-y-1 text-[14.5px] text-ink">{req.tried.length ? req.tried.map((t) => <li key={t}>• {t}</li>) : <li className="text-ink-muted">ครูไม่ได้ระบุ</li>}</ul>
          <p className="mt-3 text-[13px] font-semibold text-ink-muted">สิ่งที่ครูขอ</p>
          <p className="mt-1 text-[15px] font-semibold text-ink">“{req.ask}”</p>
          {req.summary && <p className="mt-1 text-[14px] text-ink-muted">{req.summary}</p>}
          {req.replies.length > 0 && (
            <>
              <p className="mt-3 text-[13px] font-semibold text-ink-muted">คำตอบจากครู</p>
              {req.replies.map((r) => (
                <p key={r.ts} className="text-[14.5px] text-ink">
                  • {r.text}
                </p>
              ))}
            </>
          )}
        </More>
      )}

      <More title="ไทม์ไลน์ของเด็ก">
        <StudentTimeline fc={c} entries={entries} log={log} mayAct={false} onLogContact={() => undefined} />
      </More>

      <More title="ทีม · การส่งต่อ · ผลลัพธ์">
        <p className="text-[14.5px] text-ink">
          <span className="font-semibold">ครูเจ้าของเคส:</span> {s.caseOwner || 'ยังไม่มี'}
        </p>
        {d?.next?.support.length ? (
          <p className="mt-0.5 text-[14.5px] text-ink">
            <span className="font-semibold">ทีมช่วย:</span> {d.next.support.join(' · ')}
          </p>
        ) : null}
        {c.refs.length > 0 && (
          <ul className="mt-2 space-y-1 text-[14.5px]">
            {c.refs.map((r) => (
              <li key={r.id}>
                <span className="font-semibold text-ink">{r.toName}</span> <span className="text-ink-muted">· {r.needTh} · {r.sla.text}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-surface-border pt-3 text-[14px]">
          <div>
            <dt className="text-[12.5px] text-ink-muted">ความเสี่ยง 8 สัปดาห์</dt>
            <dd className="font-semibold text-ink">
              {s.riskHistory[0]?.score ?? s.riskScore} → {s.riskScore} ({c.riskDelta > 0 ? `+${c.riskDelta}` : c.riskDelta})
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink-muted">มาเรียนสัปดาห์นี้</dt>
            <dd className="font-semibold text-ink">
              {Math.round(s.attendance.at(-1)?.rate ?? 0)}% · ขาดติดกัน {s.absenceStreak} วัน
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink-muted">ผู้ปกครอง</dt>
            <dd className="font-semibold text-ink">{s.parentContact === 'ok' ? 'ติดต่อได้' : s.parentContact === 'delayed' ? 'ตอบช้า' : 'ติดต่อไม่ได้'}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink-muted">อัปเดตล่าสุด</dt>
            <dd className="font-semibold text-ink">{c.updatedDaysAgo === 0 ? 'วันนี้' : `${c.updatedDaysAgo} วันก่อน`}</dd>
          </div>
        </dl>
      </More>
    </Drawer>
  )
}
