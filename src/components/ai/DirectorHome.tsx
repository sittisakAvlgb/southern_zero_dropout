import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { formatNumber } from '@/lib/format'
import { assetUrl } from '@/lib/asset'
import { RISK_COLOR } from '@/lib/risk'
import { LEVEL_TH, type FollowCase } from '@/lib/followOps'
import { buildSchoolOps, GRADE_LABEL } from '@/lib/schoolOps'
import { requestStatus } from '@/lib/caseLog'
import { BOTTLENECK_TH, bottlenecks, directorInbox, execSummary, isoIn, outcomes, teamLoad } from '@/lib/directorOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { byOf } from '@/components/referrals/useRefCases'
import { Drawer, Label, PrimaryBtn, inputCls } from '@/components/referrals/ui'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSimulatedLoading } from '@/lib/useLoading'
import { teamOf } from '@/pages/DirectorDecisions'

const MASCOT = assetUrl('ChatBot.png')

function H2({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-[17px] font-bold text-ink">{children}</h2>
      {right}
    </div>
  )
}

/**
 * หน้าแรกของ ผอ. — "วันนี้โรงเรียนต้องสนใจอะไร"
 *
 * ผอ. ไม่ได้ทำงานรายเด็กแทนครู หน้านี้จึงไม่เริ่มด้วยรายชื่อเด็ก แต่เริ่มด้วยเรื่องที่ต้องใช้ ผอ.
 * (คำขอจากครู · เคสไม่มีเจ้าของ · เกิน SLA) แล้วตามด้วยสิ่งที่ ผอ. แก้ได้ในระดับโรงเรียน:
 * ภาระงานของทีม คอขวด และผลลัพธ์จริง — ไม่ใช่จำนวนครั้งที่ลงมือ
 */
export function DirectorHome() {
  const nav = useNavigate()
  const { push } = useToast()
  const { schools, students, cases: caseRecords, stats } = useScopedData()
  const { user, log, built } = useFollowCases()
  const loading = useSimulatedLoading(400)
  const by = byOf(user)
  const [spread, setSpread] = useState<string | null>(null)

  const school = useMemo(() => buildSchoolOps({ school: schools[0], students, cases: caseRecords, stats }), [schools, students, caseRecords, stats])
  const cases = 'list' in built ? built.list : []
  const requests = useMemo(() => Object.values(log.requests), [log.requests])
  const inbox = useMemo(() => directorInbox(cases, requests), [cases, requests])
  const team = useMemo(() => teamLoad(cases), [cases])
  const jams = useMemo(() => bottlenecks(cases, requests), [cases, requests])
  const out = useMemo(() => outcomes(cases), [cases])
  const open = cases.filter((c) => c.open)

  const kpis: { n: number; th: string; note: string; to?: string; hot?: boolean }[] = [
    { n: school.flagged, th: 'นักเรียนเสี่ยง', note: `จากนักเรียนทั้งโรงเรียน ${formatNumber(school.enrolled, 'th')} คน` },
    { n: Math.max(0, school.flagged - school.tracked), th: 'ยังไม่ได้เริ่มช่วย', note: 'มีสัญญาณเสี่ยงแต่ยังไม่มีแฟ้มรายบุคคล' },
    { n: open.filter((c) => c.sla.level === 'breach').length, th: 'เกิน SLA', note: `จาก ${open.length} เคสที่เปิดอยู่`, to: '/intervention' },
    { n: open.filter((c) => !c.s.caseOwner).length, th: 'ไม่มีผู้รับผิดชอบ', note: 'ต้องมอบหมายครู', to: '/decisions' },
    { n: inbox.filter((x) => x.today).length, th: 'รอการตัดสินใจจาก ผอ.', note: 'คำขอจากครูและเรื่องเร่งด่วน', to: '/decisions', hot: true },
    { n: open.filter((c) => c.refs.some((r) => ['awaiting', 'near', 'breach'].includes(r.bucket))).length, th: 'รอการส่งต่อ', note: 'รอหน่วยงานภายนอกรับเรื่อง', to: '/referral' },
  ]

  const todayN = inbox.filter((x) => x.today).length
  const parentHeavy = inbox.filter((x) => x.today && x.c.s.parentContact !== 'ok').length
  const aiLine = !inbox.length
    ? 'จากข้อมูลล่าสุด วันนี้ไม่มีเรื่องที่รอการตัดสินใจจาก ผอ. — ครูยังดูแลทุกเคสได้เอง'
    : todayN === 1
      ? `เรื่องที่ต้องตัดสินใจวันนี้ 1 เรื่อง — ${inbox.find((x) => x.today)!.c.s.name}: ${inbox.find((x) => x.today)!.why}`
      : todayN && parentHeavy * 2 >= todayN
      ? `เรื่องที่ต้องตัดสินใจวันนี้ ${todayN} เรื่อง ส่วนใหญ่เกิดจากการติดต่อครอบครัวไม่ได้ (${parentHeavy} เรื่อง)`
      : todayN
        ? `เรื่องที่ต้องตัดสินใจวันนี้ ${todayN} เรื่อง${jams[0] ? ` · คอขวดใหญ่ของโรงเรียนคือ${BOTTLENECK_TH[jams[0].key]} (${jams[0].n} เคส)` : ''}`
        : `ไม่มีเรื่องที่ต้องตัดสินใจวันนี้ มี ${inbox.length} เรื่องที่ ผอ. อาจพิจารณาเมื่อสะดวก`

  if (loading || 'error' in built)
    return (
      <div className="mb-6 space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    )

  return (
    <div className="mb-6 space-y-6">
      {/* ── วันนี้โรงเรียนต้องสนใจอะไร ───────────────────── */}
      <section>
        <H2>วันนี้โรงเรียนต้องสนใจอะไร</H2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => {
            const body = (
              <>
                <span className={`block text-[28px] font-bold leading-none tabular ${k.hot && k.n ? 'text-red-700' : 'text-ink'}`}>{formatNumber(k.n, 'th')}</span>
                <span className="mt-1.5 block text-[14px] font-semibold leading-tight text-ink">{k.th}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">{k.note}</span>
              </>
            )
            return k.to ? (
              <button key={k.th} type="button" onClick={() => nav(k.to!)} className="rounded-2xl border border-surface-border bg-white p-4 text-left hover:border-brand-300">
                {body}
              </button>
            ) : (
              <div key={k.th} className="rounded-2xl border border-surface-border bg-white p-4">
                {body}
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 sm:flex-row sm:items-center">
          <img src={MASCOT} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-brand-700">AI สรุปให้ ผอ.</p>
            <p className="mt-0.5 text-[15.5px] leading-snug text-ink">{aiLine}</p>
          </div>
          {inbox.length > 0 && (
            <button type="button" onClick={() => nav('/decisions')} className="shrink-0 rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600">
              ดู {todayN || inbox.length} เรื่องที่ต้องจัดการ
            </button>
          )}
        </div>

        {/* การ์ดสั้นแบบมือถือ — พิจารณาได้ทันทีจากหน้าแรก */}
        {inbox.length > 0 && (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inbox.slice(0, 3).map((x) => (
              <article key={`${x.kind}-${x.c.s.id}`} className="flex flex-col rounded-2xl border border-surface-border bg-white p-4">
                <p className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-bold text-ink">{x.c.s.name}</span>
                  <span className="shrink-0 text-[13px] text-ink-muted">{GRADE_LABEL(x.c.s.gradeKey, true)}</span>
                  <span className="shrink-0 text-[13px] font-semibold" style={{ color: RISK_COLOR[x.c.s.riskLevel] }}>
                    ● เสี่ยง{LEVEL_TH[x.c.s.riskLevel]}
                  </span>
                </p>
                <p className="mt-1.5 text-[14px] text-ink">
                  <span className="text-ink-muted">{x.req ? 'ครูขอ: ' : ''}</span>
                  <span className="font-semibold">{x.req ? `“${x.req.ask}”` : x.why}</span>
                </p>
                <p className="mt-1.5 flex-1 text-[13px] leading-snug text-ink-muted">AI: {execSummary(x.c, x.req).headline}</p>
                <button type="button" onClick={() => nav(`/decisions?open=${x.c.s.id}`)} className="mt-3 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-[14.5px] font-semibold text-brand-700">
                  พิจารณา
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── ภาระงานของทีม ───────────────────────────── */}
        <section className="min-w-0">
          <H2>ภาระงานของทีม</H2>
          <div className="overflow-hidden rounded-2xl border border-surface-border bg-white">
            {team.insight && (
              <p className="border-b border-surface-border bg-amber-50 px-4 py-3 text-[14px] leading-snug text-ink">
                <span className="font-semibold">AI: </span>
                {team.insight.text}
              </p>
            )}
            <ul className="divide-y divide-surface-border">
              {team.rows.map((r) => {
                const max = Math.max(...team.rows.map((x) => x.open), 1)
                return (
                  <li key={r.owner} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{r.owner}</span>
                      <span className="block text-[13px] text-ink-muted">
                        เสี่ยงสูง {r.high} · เกิน SLA {r.sla} · ปิดแล้ว {r.closed}
                      </span>
                      <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-surface-muted">
                        <span className="block h-full rounded-full bg-slate-400" style={{ width: `${(r.open / max) * 100}%` }} />
                      </span>
                    </span>
                    <span className="w-14 shrink-0 text-right">
                      <span className="block text-[20px] font-bold leading-none tabular text-ink">{r.open}</span>
                      <span className="text-[12px] text-ink-muted">เคส</span>
                    </span>
                    {(r.owner === team.insight?.owner || r.sla >= 3) && (
                      <button type="button" onClick={() => setSpread(r.owner)} className="w-full rounded-xl border border-surface-border px-3 py-2 text-[14px] font-semibold text-ink sm:w-auto">
                        กระจายเคส / เพิ่มผู้ช่วย
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* ── คอขวดของโรงเรียน ───────────────────────── */}
        <section className="min-w-0">
          <H2>ปัญหาที่ทำให้เคสค้างมากที่สุด</H2>
          {jams.length ? (
            <ol className="overflow-hidden rounded-2xl border border-surface-border bg-white">
              {jams.map((j, i) => (
                <li key={j.key} className="border-t border-surface-border first:border-t-0">
                  <button type="button" onClick={() => nav(`/decisions?focus=${j.key}`)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-muted/60">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-muted text-[14px] font-bold text-ink">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{BOTTLENECK_TH[j.key]}</span>
                    <span className="shrink-0 text-[14px] font-semibold text-ink">{j.n} เคส</span>
                    <span className="shrink-0 text-[13.5px] font-semibold text-brand-700">ดูเคส</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-2xl border border-dashed border-surface-border bg-white px-4 py-5 text-[14.5px] text-ink-muted">ไม่มีเคสค้าง — ทุกเคสมีความคืบหน้าใน 5 วันที่ผ่านมา</p>
          )}
          <p className="mt-2 text-[12.5px] text-ink-muted">นับเฉพาะเคสที่เกิน SLA หรือไม่ขยับ 5 วันขึ้นไป · เคสหนึ่งอาจติดได้หลายเรื่อง</p>
        </section>
      </div>

      {/* ── ผลลัพธ์ ─────────────────────────────────── */}
      <section>
        <H2 right={<span className="text-[13px] text-ink-muted">จาก {cases.length} คนที่มีแฟ้มรายบุคคล</span>}>ผลลัพธ์ของการช่วยเหลือ</H2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { n: out.helped, th: 'ได้รับการช่วยเหลือทันกำหนด' },
            { n: out.riskDown, th: 'ความเสี่ยงลดลง (8 คะแนนขึ้นไป)' },
            { n: out.attending, th: 'กลับมาเรียนสม่ำเสมอ' },
            { n: out.closed, th: 'ปิดเคสสำเร็จ' },
            { n: out.relapse, th: 'กลับมาเสี่ยงซ้ำ', bad: true },
          ].map((k) => (
            <div key={k.th} className="rounded-2xl border border-surface-border bg-white p-4">
              <span className={`block text-[26px] font-bold leading-none tabular ${k.bad && k.n ? 'text-red-700' : 'text-ink'}`}>{k.n}</span>
              <span className="mt-1.5 block text-[13.5px] font-semibold leading-tight text-ink">{k.th}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-muted">วัดที่ตัวเด็ก ไม่ใช่จำนวนครั้งที่ลงมือ · ข้อมูลจำลองเพื่อสาธิต</p>
      </section>

      {spread && (
        <SpreadSheet
          owner={spread}
          cases={cases.filter((c) => c.open && c.s.caseOwner === spread)}
          team={teamOf(cases)}
          by={by}
          log={log}
          push={push}
          onClose={() => setSpread(null)}
        />
      )}
    </div>
  )
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
