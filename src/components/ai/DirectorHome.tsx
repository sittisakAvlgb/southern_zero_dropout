import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { formatNumber } from '@/lib/format'
import { assetUrl } from '@/lib/asset'
import { LEVEL_TH, type FollowCase } from '@/lib/followOps'
import { buildSchoolOps, GRADE_LABEL } from '@/lib/schoolOps'
import {
  askDirector,
  BOTTLENECK_TH,
  bottlenecks,
  dailyBrief,
  DIRECTOR_QUESTIONS,
  directorInbox,
  isoIn,
  outcomes,
  teamLoad,
  TIER_META,
  weekCompare,
  type BottleneckKey,
  type DirectorGo,
  type DirectorQ,
  type Tier,
} from '@/lib/directorOps'
import { requestStatus } from '@/lib/caseLog'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { byOf } from '@/components/referrals/useRefCases'
import { Drawer, Label, PrimaryBtn, inputCls } from '@/components/referrals/ui'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSimulatedLoading } from '@/lib/useLoading'
import { DirectorCaseDetail, itemFor, teamOf } from '@/pages/DirectorDecisions'
import { useDirectorWork } from '@/components/director/useDirectorWork'

const MASCOT = assetUrl('ChatBot.png')

/** ส่วนที่พับไว้ — หัวบอกเรื่องและบรรทัดสรุป กดเพื่อกาง (ไม่มี hover-only) */
function Fold({ title, summary, open, onToggle, children }: { title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-muted/50">
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold text-ink">{title}</span>
          <span className="mt-0.5 block text-[14px] leading-snug text-ink-muted">{summary}</span>
        </span>
        <span className="shrink-0 text-[14px] font-semibold text-brand-700">{open ? 'ซ่อน ▴' : 'ดู ▾'}</span>
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </section>
  )
}

function TierChip({ tier }: { tier: Tier }) {
  const m = TIER_META[tier]
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.dot }} aria-hidden />
      {m.th}
    </span>
  )
}

const btnPrimary = 'rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600'
const btnSecondary = 'rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink hover:border-brand-300'

/**
 * หน้าแรกของ ผอ. — AI Executive Action Center
 *
 * DATA → AI SUMMARY → PRIORITY → DECISION → ACTION ไม่ใช่ DATA → MORE DATA
 * เปิดมาแล้วตอบได้ใน 10 วินาที: วันนี้มีปัญหาอะไร · เรื่องไหนสำคัญที่สุด · เรื่องไหนต้องใช้ ผอ.
 * · ผอ. ต้องทำอะไร · หลังตัดสินใจใครทำต่อ — ทุกปุ่มบอกว่า ผอ. ทำอะไร และเปิดงานในหน้านี้เลย
 * ตัวเลขทั้งหมดมาจาก FollowCase ชุดเดียวกับที่ครูเห็น
 */
export function DirectorHome() {
  const nav = useNavigate()
  const { push } = useToast()
  const { schools, students, cases: caseRecords, stats } = useScopedData()
  const { user, log, built } = useFollowCases()
  const work = useDirectorWork()
  const loading = useSimulatedLoading(400)
  const by = byOf(user)
  const [spread, setSpread] = useState<string | null>(null)
  const [opened, setOpened] = useState<{ id: string; start?: 'decide' | 'assign' | 'nudge' | 'escalate'; owner?: string } | null>(null)
  const [q, setQ] = useState<DirectorQ | null>(null)

  const school = useMemo(() => buildSchoolOps({ school: schools[0], students, cases: caseRecords, stats }), [schools, students, caseRecords, stats])
  const cases = 'list' in built ? built.list : []
  const requests = useMemo(() => Object.values(log.requests), [log.requests])
  const inbox = useMemo(() => directorInbox(cases, requests), [cases, requests])
  // เด็กที่ ผอ. เพิ่งลงมือไป 3 วันนี้ — ไม่ต้องเสนอเรื่องเดิมซ้ำ
  const handled = useMemo(() => {
    const since = isoIn(-3)
    return new Set(log.entries.filter((e) => e.role === 'director' && e.date >= since && !e.requestId).map((e) => e.childId))
  }, [log.entries])
  const brief = useMemo(() => dailyBrief(cases, requests, handled, (g) => GRADE_LABEL(g as never, true)), [cases, requests, handled])
  const [at, setAt] = useState(0)
  const idx = Math.min(at, Math.max(0, brief.length - 1))
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setFolds((f) => ({ ...f, [k]: !f[k] }))
  const team = useMemo(() => teamLoad(cases), [cases])
  const jams = useMemo(() => bottlenecks(cases, requests), [cases, requests])
  const out = useMemo(() => outcomes(cases), [cases])
  const week = useMemo(() => weekCompare(cases), [cases])
  const teamNames = useMemo(() => teamOf(cases), [cases])
  const open = cases.filter((c) => c.open)
  // "ผอ.อิสมาแอ" ไม่ใช่ "ผอ.นายอิสมาแอ" — ตัดคำนำหน้าออกก่อนทัก
  const firstName = (user?.name ?? '').replace(/^(นาย|นางสาว|นาง|ดร\.\s*|ว่าที่ร้อยตรี\s*)/, '').split(' ')[0]

  const go = (g: DirectorGo) => {
    if (g.kind === 'case') setOpened({ id: g.id, start: g.start, owner: g.owner })
    else if (g.kind === 'team') setSpread(g.owner)
    else nav(`/decisions?focus=${g.key}`)
  }


  // ── เรื่องที่ต้องการการตัดสินใจ: คำขอจากครูก่อน แล้วเคสที่ค้าง ──
  // เกณฑ์เดียวกับ AI Brief: เคสที่ ผอ. เพิ่งเตือน/มอบหมาย/Escalate ไม่ขึ้นซ้ำ (คำขอจากครูขึ้นเสมอ)
  // คำขอจากครูที่การ์ดยังไม่ได้ยกขึ้นมา (การ์ดแสดงคำขอที่รอนานสุดก่อน)
  const otherRequests = Math.max(0, inbox.filter((x) => x.kind === 'request').length - (brief.some((b) => b.key === 'requests') ? 1 : 0))

  if (loading || 'error' in built)
    return (
      <div className="mb-6 space-y-3">
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    )

  const opItem = opened ? itemFor(opened.id, inbox, cases, requests) : undefined
  const answer = q ? askDirector(q, cases, requests, (g) => GRADE_LABEL(g as never, true)) : null

  return (
    <div className="mb-8 space-y-4">
      {/* ── 1. เรื่องเดียวที่ต้องตัดสินใจตอนนี้ — ใคร · ทำไม · สาเหตุต้นทาง · ต้องเลือกอะไร ──
          ทีละเรื่องแบบหน้าครู remount ด้วย key อย่างเดียว ไม่ใช้ exit animation (ดู StrictMode ใน skill.md) */}
      <section aria-labelledby="brief-h" className="rounded-3xl bg-brand-50/70 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <img src={MASCOT} alt="" className="h-11 w-11 shrink-0 rounded-2xl bg-white object-contain p-1" draggable={false} />
          <h2 id="brief-h" className="min-w-0 text-[17px] font-semibold leading-snug text-ink">
            {work && work.total
              ? `สวัสดีครับ ผอ.${firstName} — งานที่รอ ผอ. วันนี้ ${work.total} เรื่อง${brief.length ? ` AI คัด ${brief.length} เรื่องที่สำคัญที่สุดให้ด้านล่าง` : ''}`
              : brief.length
                ? `สวัสดีครับ ผอ.${firstName} — วันนี้มี ${brief.length} เรื่องที่ควรดู เริ่มจากเรื่องที่สำคัญที่สุด`
                : `สวัสดีครับ ผอ.${firstName} — วันนี้ไม่มีเรื่องที่ต้องตัดสินใจเร่งด่วน`}
          </h2>
        </div>
        {/* งานที่รอ ผอ. แยกตามหน้า — ตัวเลขเดียวกับป้ายบนเมนูและ "ต้องใช้ ผอ." ในแต่ละหน้า */}
        {work && work.total > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="งานที่รอ ผอ. แยกตามหน้า">
            {[
              { to: '/decisions', th: 'เรื่องที่ต้องตัดสินใจ', n: work.decisions },
              { to: '/plan', th: 'เส้นทางโอกาส', n: work.plans },
              { to: '/referral', th: 'ส่งต่อ', n: work.referrals },
              { to: '/oosc', th: 'เด็กนอกระบบ', n: work.oosc },
            ]
              .filter((x) => x.n > 0)
              .map((x) => (
                <button key={x.to} type="button" onClick={() => nav(x.to)} className="rounded-full border border-surface-border bg-white px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-brand-300">
                  {x.th} <span className="text-red-600">{x.n}</span>
                </button>
              ))}
          </div>
        )}

        {brief.length ? (
          (() => {
            const b = brief[idx]
            const nextB = brief.length > 1 ? brief[(idx + 1) % brief.length] : undefined
            return (
              <div key={b.key} className="mt-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TierChip tier={b.tier} />
                  <p className="text-[13px] font-medium text-ink-muted">
                    เรื่องที่ {idx + 1} จาก {brief.length}
                  </p>
                </div>

                {/* ใคร + เกิดอะไร */}
                <p className="mt-2 text-[21px] font-bold leading-snug text-ink">{b.title}</p>
                <ul className="mt-2 space-y-1">
                  {b.why.map((w) => (
                    <li key={w} className="flex items-start gap-2 text-[15px] leading-snug text-ink">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>

                {/* สาเหตุต้นทาง — สิ่งที่ ผอ. แก้ได้จริง */}
                {b.rootCause && (
                  <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[14.5px] leading-snug text-ink">
                    <span className="font-semibold">AI เห็นสาเหตุ: </span>
                    {b.rootCause}
                  </p>
                )}

                {/* สิ่งที่ ผอ. ต้องตัดสินใจ — ทางเลือกพร้อมผล */}
                <div className="mt-4 border-t border-surface-border pt-4">
                  <p className="text-[16px] font-bold text-ink">{b.question}</p>
                  <div className={`mt-3 grid gap-2 ${b.options.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {b.options.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => go(o.go)}
                        className={`flex flex-col items-start rounded-2xl px-4 py-3.5 text-left ${o.recommended ? 'bg-brand-500 text-white shadow-card hover:bg-brand-600' : 'border border-surface-border bg-white text-ink hover:border-brand-300'}`}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="text-[16px] font-bold">{o.label}</span>
                          {o.recommended && b.options.length > 1 && <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-semibold">AI แนะนำ</span>}
                        </span>
                        <span className={`mt-1 text-[13.5px] leading-snug ${o.recommended ? 'text-white/90' : 'text-ink-muted'}`}>{o.effect}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[12.5px] text-ink-muted">ข้อมูลที่ AI ใช้: {b.source} · ผอ. เป็นผู้ตัดสินใจ</p>
                </div>

                {nextB && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-surface-border pt-3 sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 text-[14px] text-ink-muted">
                      ถัดไป: <span className="font-semibold text-ink">{nextB.title}</span>
                    </p>
                    <button type="button" onClick={() => setAt((idx + 1) % brief.length)} className={`${btnSecondary} inline-flex shrink-0 items-center justify-center gap-1`}>
                      เรื่องถัดไป <span aria-hidden>→</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })()
        ) : (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-[15px] leading-snug text-ink">
              ภาพรวมโรงเรียนอยู่ในเกณฑ์ปกติ
              {open.filter((c) => c.attn !== 'normal').length > 0 && ` มี ${open.filter((c) => c.attn !== 'normal').length} เคสที่ควรติดตามแต่ยังไม่ต้องดำเนินการทันที`}
            </p>
            <button type="button" onClick={() => nav('/decisions#team')} className={btnSecondary}>
              ดูเคสเฝ้าระวัง
            </button>
          </div>
        )}
      </section>

      {/* ── 2. ข้อมูลประกอบ — แผงเดียว คั่นด้วยเส้น ไม่ใช่กล่องห้าใบ ───── */}
      <p className="!mt-10 text-[13.5px] font-semibold text-ink-muted">ข้อมูลประกอบ — เปิดดูเมื่อต้องการ</p>
      <div className="divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
        {/* เรื่องทั้งหมดวันนี้ — ชุดเดียวกับการ์ดด้านบน คำแนะนำจึงตรงกันเสมอ กดแล้วเปิดเรื่องนั้นในการ์ด */}
        {brief.length > 0 && (
          <Fold title="เรื่องทั้งหมดวันนี้" summary={`${brief.length} เรื่อง · กดเพื่อเปิดในการ์ดด้านบน`} open={Boolean(folds.all)} onToggle={() => toggle('all')}>
            <ol className="-my-1 divide-y divide-surface-border">
              {brief.map((b, i) => (
                <li key={b.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setAt(i)
                      document.getElementById('brief-h')?.scrollIntoView({ block: 'start' })
                    }}
                    aria-current={i === idx}
                    className="flex w-full items-start gap-3 py-3 text-left"
                  >
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TIER_META[b.tier].dot }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-ink">{b.title}</span>
                      <span className="mt-0.5 block text-[13.5px] text-ink-muted">
                        {TIER_META[b.tier].th} · AI แนะนำ: {b.action.label}
                      </span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-[13.5px] font-semibold text-brand-700">{i === idx ? 'อยู่ในการ์ด' : 'เปิด'}</span>
                  </button>
                </li>
              ))}
            </ol>
            {otherRequests > 0 && (
              <button type="button" onClick={() => nav('/decisions')} className={`${btnSecondary} mt-3`}>
                ดูคำขออื่นจากครูอีก {otherRequests} เรื่อง
              </button>
            )}
          </Fold>
        )}

        {/* ── 4. สิ่งที่ทำให้การช่วยเหลือติด ─────────────── */}
        <Fold
          title="สิ่งที่ทำให้การช่วยเหลือติดมากที่สุด"
          summary={jams.length ? `${BOTTLENECK_TH[jams[0].key]} ${jams[0].n} เคส${jams[1] ? ` · ${BOTTLENECK_TH[jams[1].key]} ${jams[1].n} เคส` : ''}` : 'ไม่มีเคสค้าง'}
          open={Boolean(folds.jam)}
          onToggle={() => toggle('jam')}
        >
          {jams.length ? (
            <div>
              <ol className="space-y-2">
                {jams.slice(0, 3).map((j, i) => (
                  <li key={j.key} className="flex items-center gap-3 text-[15px]">
                    <span className="w-5 shrink-0 text-center font-bold text-ink-muted">{i + 1}.</span>
                    <span className={`min-w-0 flex-1 ${i === 0 ? 'font-bold text-ink' : 'text-ink'}`}>{BOTTLENECK_TH[j.key]}</span>
                    <span className="shrink-0 font-semibold tabular text-ink">{j.n} เคส</span>
                  </li>
                ))}
              </ol>
              <p className="mt-1.5 text-[12.5px] text-ink-muted">นับเฉพาะเคสที่ค้าง (เกิน SLA หรือไม่ขยับ 5 วันขึ้นไป) · เคสหนึ่งอาจติดได้หลายเรื่อง</p>
              <p className="mt-3 rounded-xl bg-brand-50/70 px-3.5 py-2.5 text-[14px] leading-snug text-ink">
                <span className="font-semibold text-brand-700">AI: </span>
                {jamAdvice(jams[0].key)}
              </p>
              <button type="button" onClick={() => go({ kind: 'focus', key: jams[0].key })} className={`${btnSecondary} mt-3`}>
                ดู {jams[0].n} เคส · {BOTTLENECK_TH[jams[0].key]}
              </button>
            </div>
          ) : (
            <p className="text-[14.5px] text-ink-muted">ไม่มีเคสค้าง — ทุกเคสมีความคืบหน้าใน 5 วันที่ผ่านมา</p>
          )}
        </Fold>

        {/* ── 5. ภาระงานทีม — AI ตีความให้ ─────────────────── */}
        <Fold
          title="ภาระงานของทีม"
          summary={team.insight ? `${team.insight.owner} รับงานหนักกว่าค่าเฉลี่ยของทีม — AI แนะนำให้กระจายเคส` : 'ภาระงานกระจายใกล้เคียงกัน'}
          open={Boolean(folds.team)}
          onToggle={() => toggle('team')}
        >
          <div>
            {team.insight ? (
              (() => {
                const r = team.rows.find((x) => x.owner === team.insight!.owner)!
                const stale = open.filter((c) => c.s.caseOwner === r.owner && c.updatedDaysAgo >= 7).length
                return (
                  <div>
                    <p className="text-[16px] font-bold text-ink">{r.owner}</p>
                    <p className="text-[14px] text-ink-muted">
                      เปิดอยู่ {r.open} เคส · เสี่ยงสูง {r.high}
                    </p>
                    <div className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[14px] leading-snug text-ink">
                      <p>
                        <span className="font-semibold">AI: </span>อาจพิจารณาเพิ่มผู้ช่วยหรือกระจายเคส เพราะ
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        <li>• {team.insight.text}</li>
                        <li>• เกิน SLA {r.sla} เคส · ไม่ขยับเกิน 7 วัน {stale} เคส</li>
                      </ul>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSpread(r.owner)} className={btnPrimary}>
                        กระจายเคส
                      </button>
                      <button type="button" onClick={() => setSpread(r.owner)} className={btnSecondary}>
                        เพิ่มผู้ช่วย
                      </button>
                    </div>
                  </div>
                )
              })()
            ) : (
              <p className="text-[14.5px] text-ink">ภาระงานกระจายใกล้เคียงกัน — ยังไม่ต้องจัดคนเพิ่ม</p>
            )}
            <ul className="mt-4 divide-y divide-surface-border border-t border-surface-border">
              {team.rows
                .filter((r) => r.owner !== team.insight?.owner)
                .map((r) => (
                  <li key={r.owner} className="flex items-center gap-3 py-2.5 text-[14.5px]">
                    <span className="min-w-0 flex-1 text-ink">{r.owner}</span>
                    <span className="shrink-0 text-ink-muted">
                      {r.open} เคส · เกิน SLA {r.sla}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </Fold>

      {/* ── 6. สถานการณ์โดยรวม + เทียบกับสัปดาห์ก่อน ─────── */}
      <Fold
        title="สถานการณ์โดยรวมและแนวโน้ม"
        summary={week.summary}
        open={Boolean(folds.sit)}
        onToggle={() => toggle('sit')}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          {[
            { n: formatNumber(school.flagged, 'th'), th: 'นักเรียนมีสัญญาณเสี่ยง', note: `จาก ${formatNumber(school.enrolled, 'th')} คน · มีแฟ้มรายบุคคล ${school.tracked}` },
            { n: String(open.length), th: 'กำลังช่วยเหลือ', note: `${out.helped} เคสทันกำหนด` },
            { n: String(out.closed), th: 'ช่วยสำเร็จ (ปิดเคส)', note: `ความเสี่ยงลดลง ${out.riskDown} คน${out.relapse ? ` · กลับมาเสี่ยงซ้ำ ${out.relapse}` : ''}` },
            { n: String(open.filter((c) => c.refs.some((r) => ['awaiting', 'near', 'breach'].includes(r.bucket))).length), th: 'รอการส่งต่อ', note: 'รอหน่วยงานภายนอกรับเรื่อง' },
          ].map((k) => (
            <div key={k.th}>
              <span className="block text-[24px] font-bold leading-none tabular text-ink">{k.n}</span>
              <span className="mt-1 block text-[14px] font-semibold text-ink">{k.th}</span>
              <span className="block text-[12.5px] leading-snug text-ink-muted">{k.note}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-surface-border pt-4">
          <p className="text-[14px] font-semibold text-ink-muted">เทียบกับสัปดาห์ก่อน</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {week.rows.map((r) => {
              const d = r.now - r.before
              const good = d === 0 ? null : (d > 0) === (r.better === 'up')
              return (
                <li key={r.th} className="text-[14.5px]">
                  <span className="block text-ink-muted">{r.th}</span>
                  <span className="font-bold tabular text-ink">
                    {r.before}
                    {r.unit} → {r.now}
                    {r.unit}
                  </span>{' '}
                  <span className={`text-[13.5px] font-semibold ${good === null ? 'text-ink-muted' : good ? 'text-green-700' : 'text-red-700'}`}>
                    {d === 0 ? 'เท่าเดิม' : `${d > 0 ? '↑' : '↓'} ${good ? 'ดีขึ้น' : 'แย่ลง'}`}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[14.5px] leading-snug text-ink">
            <span className="font-semibold text-brand-700">AI: </span>
            {week.summary}
          </p>
          <p className="mt-2 text-[12.5px] text-ink-muted">ข้อมูลจำลองเพื่อสาธิต</p>
        </div>
      </Fold>
        {/* ── ถาม AI — คำถามสำเร็จรูป ตอบจากข้อมูลจริง ลิงก์กลับไปที่เคส ── */}
        <Fold title="ถาม AI เกี่ยวกับสถานการณ์โรงเรียน" summary="เช่น เคสไหนเสี่ยงที่สุด · ทำไมเคสถึงค้าง · ถ้ามีเวลา 15 นาที ควรจัดการอะไร" open={Boolean(folds.ask)} onToggle={() => toggle('ask')}>
          <div className="flex flex-wrap gap-2">
            {DIRECTOR_QUESTIONS.map((x) => (
              <button
                key={x.k}
                type="button"
                onClick={() => setQ(q === x.k ? null : x.k)}
                aria-pressed={q === x.k}
                className={`rounded-full border px-4 py-2.5 text-left text-[14px] font-medium ${q === x.k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink'}`}
              >
                {x.th}
              </button>
            ))}
          </div>
          {answer && q && (
            <div className="mt-3 rounded-2xl bg-brand-50/70 p-4" role="status">
              <p className="text-[14px] font-semibold text-brand-700">{DIRECTOR_QUESTIONS.find((x) => x.k === q)!.th}</p>
              <div className="mt-1.5 space-y-1 text-[15px] leading-snug text-ink">
                {answer.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
              {answer.links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {answer.links.map((l) => (
                    <button key={l.label} type="button" onClick={() => go(l.go)} className={btnSecondary}>
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[12.5px] text-ink-muted">ตอบจากข้อมูลในระบบของโรงเรียน — AI เสนอ ผอ. เป็นผู้ตัดสินใจ</p>
            </div>
          )}
        </Fold>
      </div>


      {opItem && (
        <DirectorCaseDetail key={`${opened!.id}-${opened!.start}`} x={opItem} start={opened!.start} suggestOwner={opened!.owner} heavy={team.insight?.owner} load={team.rows} by={by} team={teamNames} log={log} push={push} onClose={() => setOpened(null)} onOpenFile={() => nav(`/student?id=${opItem.c.s.id}`)} />
      )}
      {spread && (
        <SpreadSheet owner={spread} cases={cases.filter((c) => c.open && c.s.caseOwner === spread)} team={teamNames} by={by} log={log} push={push} onClose={() => setSpread(null)} />
      )}
    </div>
  )
}

/** ข้อเสนอของ AI ตามคอขวดหลัก — ภาษา "อาจพิจารณา" ไม่สั่ง ผอ. */
function jamAdvice(k: BottleneckKey): string {
  switch (k) {
    case 'parent':
      return 'ปัญหาหลักตอนนี้คือการติดต่อครอบครัวไม่ได้ อาจพิจารณาใช้ผู้นำชุมชนหรือทีมเยี่ยมบ้านเป็นแนวทางร่วมของโรงเรียน'
    case 'agency':
      return 'เคสค้างเพราะรอหน่วยงานภายนอก อาจพิจารณาให้ ผอ. ประสานระดับหัวหน้าหน่วยงานแทนให้ครูทวงเอง'
    case 'noPlan':
      return 'เด็กเสี่ยงสูงหลายคนยังไม่มีแผน อาจพิจารณานัดครูทำแผนพร้อมกันในการประชุมทีมครั้งเดียว'
    case 'noOwner':
      return 'มีเคสที่ไม่มีใครรับผิดชอบ อาจพิจารณามอบหมายครูวันนี้ก่อนเรื่องอื่น'
    case 'resource':
      return 'ครูขอทรัพยากรซ้ำหลายเคส อาจพิจารณาตั้งมาตรการระดับโรงเรียนแทนการอนุมัติทีละเคส'
  }
}


/** กระจายเคส / เพิ่มผู้ช่วย — ผอ. จัดคน ไม่ได้รับเคสไปทำเอง ทุกการย้ายลงไทม์ไลน์ของเด็ก */
function SpreadSheet({
  owner,
  cases,
  team,
  by,
  log,
  push,
  onClose,
}: {
  owner: string
  cases: FollowCase[]
  team: string[]
  by: string
  log: ReturnType<typeof useFollowCases>['log']
  push: (m: string) => void
  onClose: () => void
}) {
  const others = team.filter((n) => n !== owner)
  const [moves, setMoves] = useState<Record<string, string>>({})
  const [helper, setHelper] = useState('')
  const high = cases.filter((c) => c.s.riskLevel === 'high' || c.s.riskLevel === 'critical')
  const stamp = (childId: string, note: string) => log.add({ childId, mode: 'note', date: isoIn(0), by, role: 'director', escalation: 'ผอ.', note })
  const n = Object.values(moves).filter(Boolean).length
  return (
    <Drawer label={`กระจายเคสของ ${owner}`} head={<p className="text-[19px] font-bold text-ink">ภาระงานของ {owner}</p>} onClose={onClose}>
      <p className="text-[14.5px] text-ink">
        เปิดอยู่ {cases.length} เคส · เสี่ยงสูง {high.length} · เกิน SLA {cases.filter((c) => c.sla.level === 'breach').length}
      </p>

      <Label>ย้ายเคสให้ครูคนอื่น</Label>
      <ul className="space-y-2">
        {cases.map((c) => (
          <li key={c.s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-border px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">{c.s.name}</span>
              <span className="block text-[13px] text-ink-muted">
                {c.s.riskScore} เสี่ยง{LEVEL_TH[c.s.riskLevel]} · {c.sla.text}
                {c.support && requestStatus(c.support.req) === 'withTeacher' ? ' · มีงานจาก ผอ. ค้าง' : ''}
              </span>
            </span>
            <select
              aria-label={`ผู้รับผิดชอบใหม่ของ ${c.s.name}`}
              value={moves[c.s.id] ?? ''}
              onChange={(e) => setMoves({ ...moves, [c.s.id]: e.target.value })}
              className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-[14.5px] sm:w-56"
            >
              <option value="">คงไว้กับ {owner}</option>
              {others.map((o) => (
                <option key={o} value={o}>
                  ย้ายให้ {o}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <Label>หรือเพิ่มผู้ช่วยในเคสเสี่ยงสูงของ {owner}</Label>
      <select id="spread-helper" value={helper} onChange={(e) => setHelper(e.target.value)} className={inputCls}>
        <option value="">ไม่เพิ่ม</option>
        {others.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {helper && <p className="mt-1.5 text-[13px] text-ink-muted">บันทึกในไทม์ไลน์ของเด็ก {high.length} คน · {owner} ยังเป็นผู้รับผิดชอบหลัก</p>}

      <div className="mt-5">
        <PrimaryBtn
          disabled={!n && !helper}
          onClick={() => {
            for (const [childId, to] of Object.entries(moves)) {
              if (!to) continue
              log.setOwner(childId, to)
              stamp(childId, `ผอ. ย้ายผู้รับผิดชอบจาก ${owner} เป็น ${to} — กระจายภาระงานของทีม`)
            }
            if (helper) for (const c of high) stamp(c.s.id, `ผอ. เพิ่ม ${helper} เป็นผู้ช่วยในเคสนี้ — ${owner} ยังเป็นผู้รับผิดชอบหลัก`)
            push(`${n ? `ย้าย ${n} เคสแล้ว` : ''}${n && helper ? ' · ' : ''}${helper ? `เพิ่ม ${helper} เป็นผู้ช่วยแล้ว` : ''}`)
            onClose()
          }}
        >
          ยืนยัน
        </PrimaryBtn>
      </div>
    </Drawer>
  )
}
