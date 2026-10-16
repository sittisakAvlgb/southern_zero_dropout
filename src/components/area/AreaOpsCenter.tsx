import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { assetUrl } from '@/lib/asset'
import { formatNumber } from '@/lib/format'
import { isoIn, fmtDay } from '@/lib/directorOps'
import { buildAreaOps } from '@/lib/areaOps'
import {
  AREA_ACT_TH,
  AREA_NEED_TH,
  AREA_VERDICT_TH,
  areaRequestStatus,
  useAreaLog,
  type AreaAct,
  type AreaRequest,
  type AreaVerdict,
} from '@/lib/areaLog'
import {
  TIER_META,
  areaBrief,
  compareSchools,
  crossSchoolPatterns,
  districtViews,
  requestBrief,
  schoolViews,
  suggestOwner,
  teamRows,
  type BriefGo,
  type DistrictView,
  type Pattern,
  type SchoolView,
  type TeamRow,
  type Tier,
} from '@/lib/areaDeskOps'
import { Drawer, Label, PrimaryBtn, inputCls, textareaCls } from '@/components/referrals/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useSimulatedLoading } from '@/lib/useLoading'

const MASCOT = assetUrl('ChatBot.png')
const btnSecondary = 'rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink hover:border-brand-300'
const TONE_DOT = { red: 'bg-red-600', orange: 'bg-orange-500', yellow: 'bg-yellow-500' } as const

function TierPill({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${TIER_META[tier].pill}`}>
      <span className={`h-2 w-2 rounded-full ${TIER_META[tier].dot}`} aria-hidden />
      {TIER_META[tier].th}
    </span>
  )
}

function Section({ id, title, hint, right, children }: { id: string; title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[13.5px] text-ink-muted">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

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

type Sheet =
  | { kind: 'request'; r: AreaRequest }
  | { kind: 'decide'; r: AreaRequest; acts: AreaAct[] }
  | { kind: 'district'; v: DistrictView }
  | { kind: 'support'; v: SchoolView }
  | { kind: 'measure'; p: Pattern }

const ACT_ORDER: AreaAct[] = ['psychologist', 'sendTeam', 'coordinateAgency', 'budget', 'meeting', 'escalate', 'measure', 'advise']

/**
 * ภาพรวมเขตพื้นที่ — AI Area Support & Operations Center
 *
 *   AI สรุปสถานการณ์เขตวันนี้ → ตัวเลขที่ต้องตัดสินใจ 4 ตัว → พื้นที่ที่ต้องดูแลก่อน →
 *   เรื่องที่รอการตัดสินใจจากเขต → โรงเรียนที่ต้องช่วยก่อน → ข้อมูลประกอบ (ปัญหาซ้ำ · ทีม · ตัวเลข · แนวโน้ม · ถาม AI · บันทึกการตัดสินใจ)
 *
 * ครูดูแลเด็ก ผอ. ปลดอุปสรรคในโรงเรียน เขตเข้ามาช่วยเมื่อโรงเรียนแก้ต่อเองไม่ไหว หรือปัญหาเกิดซ้ำหลายโรงเรียน
 * หน้าเดิมเปิดด้วย KPI หกช่อง pipeline สี่ช่อง และรายการสามคอลัมน์ ไม่บอกว่าเขตต้องทำอะไรวันนี้
 * ที่นี่ทุกเรื่องที่ AI ยกขึ้นมาบอกเหตุผล และปุ่มหลักเป็น action ของเขตจริง ผลกลับไปที่ ผอ. แล้ววนกลับมาให้เขตติดตาม
 */
export function AreaOpsCenter() {
  const { dn } = useI18n()
  const nav = useNavigate()
  const { push } = useToast()
  const { user, districts, schools, students, cases, oosc, plans, referrals, stats } = useScopedData()
  const loading = useSimulatedLoading(450)
  const area = useAreaLog(user?.esaKey)
  const by = user?.name ?? 'ผู้บริหารเขต'

  const ops = useMemo(
    () => buildAreaOps({ scopeKey: `${user?.esaKey ?? 'area'}-esa`, districts, schools, students, cases, oosc, plans, stats }),
    [user, districts, schools, students, cases, oosc, plans, stats],
  )
  const views = useMemo(() => schoolViews(schools, cases, students), [schools, cases, students])
  const dviews = useMemo(() => districtViews(districts, views, cases, oosc), [districts, views, cases, oosc])
  const patterns = useMemo(() => crossSchoolPatterns(schools, students, referrals), [schools, students, referrals])
  const team = useMemo(() => teamRows(area), [area])
  const brief = useMemo(() => areaBrief({ districts: dviews, schools: views, state: area, patterns, team, dn }), [dviews, views, area, patterns, team, dn])
  const compare = useMemo(() => compareSchools(views), [views])

  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setFolds((f) => ({ ...f, [k]: !f[k] }))
  const [ask, setAsk] = useState<string | null>(null)
  const [allBrief, setAllBrief] = useState(false)
  const [allSchools, setAllSchools] = useState(false)

  const waiting = area.requests.filter((r) => areaRequestStatus(r) === 'new').sort((a, b) => Number(b.urgency === 'high') - Number(a.urgency === 'high') || a.ts - b.ts)
  const withSchools = area.requests.filter((r) => ['decided', 'needInfo', 'sentBack'].includes(areaRequestStatus(r)))
  const reported = [...area.requests.filter((r) => r.done), ...area.actions.filter((a) => a.done)]
  const urgentAreas = dviews.filter((v) => v.tier === 'urgent')
  const supportSchools = views.filter((v) => v.tier === 'urgent' || v.tier === 'follow')

  const go = (g: BriefGo) => {
    if (g.kind === 'request') {
      const r = area.requests.find((x) => x.id === g.id)
      if (r) setSheet({ kind: 'request', r })
    } else if (g.kind === 'district') {
      const v = dviews.find((x) => x.d.key === g.key)
      if (v) setSheet({ kind: 'district', v })
    } else if (g.kind === 'school') {
      const v = views.find((x) => x.s.id === g.id)
      if (v) setSheet({ kind: 'support', v })
    } else if (g.kind === 'pattern') {
      setFolds((f) => ({ ...f, pattern: true }))
      window.setTimeout(() => document.getElementById('more')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    } else {
      setFolds((f) => ({ ...f, team: true }))
      window.setTimeout(() => document.getElementById('more')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
  }
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const link = (to: string) => (!user || canAccess(user, to) ? nav(to) : undefined)

  if (loading)
    return (
      <div className="mb-6 space-y-3">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    )

  // ── ถาม AI: คำถามสำเร็จรูป ตอบจากข้อมูลจริง พร้อมลิงก์กลับไปที่พื้นที่/โรงเรียน ──
  const QUESTIONS: { k: string; q: string; a: () => { text: string; go?: () => void; goLabel?: string } }[] = [
    {
      k: 'where',
      q: 'อำเภอไหนต้องดูแลก่อน?',
      a: () => (dviews[0] ? { text: `อำเภอ${dn(dviews[0].d.key)} (${TIER_META[dviews[0].tier].th}) เพราะ ${dviews[0].why.join(' · ')}`, go: () => setSheet({ kind: 'district', v: dviews[0] }), goLabel: `ดูอำเภอ${dn(dviews[0].d.key)}` } : { text: 'ยังไม่มีข้อมูลอำเภอ' }),
    },
    {
      k: 'school',
      q: 'โรงเรียนไหนมีปัญหาหนักที่สุด?',
      a: () => (views[0] ? { text: `${views[0].s.name} — ${views[0].why.join(' · ')} AI: ${views[0].ai}`, go: () => setSheet({ kind: 'support', v: views[0] }), goLabel: 'วางแผนสนับสนุน' } : { text: 'ยังไม่มีข้อมูลโรงเรียน' }),
    },
    {
      k: 'compare',
      q: 'โรงเรียนไหนต้องช่วยก่อน และทำไม?',
      a: () => {
        const v = views[0]
        if (!v) return { text: '—' }
        return { text: compare ?? `${v.s.name} — ${v.ai}`, go: () => setSheet({ kind: 'support', v }), goLabel: 'วางแผนสนับสนุน' }
      },
    },
    {
      k: 'pattern',
      q: 'ปัญหาอะไรเกิดซ้ำหลายโรงเรียน?',
      a: () => (patterns.length ? { text: patterns.map((p) => `${p.th} (${p.schools.length} โรงเรียน)`).join(' · ') + ` — ${patterns[0].rec}`, go: () => setSheet({ kind: 'measure', p: patterns[0] }), goLabel: 'สร้างมาตรการ' } : { text: 'ยังไม่พบปัญหาที่เกิดซ้ำตั้งแต่ 2 โรงเรียนขึ้นไป' }),
    },
    {
      k: 'psych',
      q: 'ควรส่งนักจิตวิทยาไปที่ไหน?',
      a: () => {
        const v = [...views].sort((a, b) => b.rate - a.rate)[0]
        const psych = team.find((t) => t.acts.includes('psychologist'))
        return v ? { text: `${v.s.name} มีสัดส่วนเด็กเสี่ยงสูงที่สุด (${v.rate.toFixed(1)}%)${psych ? ` · ${psych.name} ตอนนี้รับงาน ${psych.pct}% ของ capacity${psych.pct > 100 ? ' อาจต้องเพิ่มคนก่อน' : ''}` : ''}`, go: () => setSheet({ kind: 'support', v }), goLabel: 'จัดสรรนักจิตวิทยา' } : { text: '—' }
      },
    },
    {
      k: 'sla',
      q: 'โรงเรียนไหนเกิน SLA มากผิดปกติ?',
      a: () => {
        const avg = views.reduce((a, v) => a + v.overdue, 0) / Math.max(1, views.length)
        const odd = views.filter((v) => v.overdue >= avg * 1.5 && v.overdue >= 3)
        return odd.length ? { text: `${odd.map((v) => `${v.s.name} ${v.overdue} เคส`).join(' · ')} — ค่าเฉลี่ยเขต ${avg.toFixed(1)} เคสต่อโรงเรียน`, go: () => setSheet({ kind: 'support', v: odd[0] }), goLabel: 'วางแผนสนับสนุน' } : { text: `ไม่มีโรงเรียนที่เกิน SLA สูงผิดปกติ (ค่าเฉลี่ย ${avg.toFixed(1)} เคสต่อโรงเรียน)` }
      },
    },
    {
      k: 'today',
      q: 'วันนี้มีอะไรที่ฉันต้องตัดสินใจ?',
      a: () => (waiting.length ? { text: waiting.map((r) => `${r.schoolName}: ${AREA_NEED_TH[r.need]}`).join(' · '), go: () => setSheet({ kind: 'request', r: waiting[0] }), goLabel: 'เปิดเรื่องแรก' } : { text: 'ไม่มีคำขอจากโรงเรียนที่รอเขตตัดสินใจ' }),
    },
    {
      k: 'limited',
      q: 'ถ้าทรัพยากรจำกัด ควรลงที่ไหนก่อน?',
      a: () => {
        const v = supportSchools[0]
        const free = [...team].sort((a, b) => a.pct - b.pct)[0]
        return v ? { text: `${v.s.name} ก่อน (${TIER_META[v.tier].th}) — ${v.ai}${free ? ` · คนในทีมที่ยังรับงานได้: ${free.name} (${free.pct}%)` : ''}`, go: () => setSheet({ kind: 'support', v }), goLabel: 'วางแผนสนับสนุน' } : { text: 'ทุกโรงเรียนอยู่ในเกณฑ์ ยังไม่ต้องลงทรัพยากรเพิ่ม' }
      },
    },
  ]
  const answer = ask ? QUESTIONS.find((x) => x.k === ask)?.a() : undefined

  return (
    <div className="mb-8 space-y-8">
      {/* ── 1. AI สรุปวันนี้ — 3 เรื่องแรกเท่านั้น ที่เหลือพับไว้ อ่านจบใน 20 วินาที ── */}
      <section aria-labelledby="area-brief-h" className="rounded-2xl bg-white p-4 ring-1 ring-brand-200 sm:p-5">
        <div className="flex items-center gap-3">
          <img src={MASCOT} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 object-contain p-0.5" draggable={false} />
          <h2 id="area-brief-h" className="min-w-0 text-[17px] font-bold leading-snug text-ink">
            {brief.length ? `AI สรุปวันนี้ · ${brief.length} เรื่องที่ควรดู` : 'วันนี้ไม่มีเรื่องเร่งด่วน — ทุกโรงเรียนดูแลเองได้'}
          </h2>
        </div>
        {brief.length > 0 && (
          <>
            <ul className="mt-2 divide-y divide-surface-border">
              {(allBrief ? brief : brief.slice(0, 3)).map((b) => (
                <li key={b.key}>
                  <button type="button" onClick={() => go(b.go)} className="group flex w-full items-start gap-3 py-3 text-left">
                    <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[b.tone]}`} aria-hidden />
                    <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink group-hover:text-brand-700">{b.text}</span>
                    <span aria-hidden className="shrink-0 text-ink-faint group-hover:text-brand-600">→</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={() => go(brief[0].go)} className="rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white hover:bg-brand-600">
                ดูเรื่องที่ต้องจัดการวันนี้ →
              </button>
              {brief.length > 3 && (
                <button type="button" onClick={() => setAllBrief((x) => !x)} className="text-[14.5px] font-semibold text-brand-700">
                  {allBrief ? 'ย่อ' : `ดูอีก ${brief.length - 3} เรื่อง`}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── 2. ตัวเลขที่ต้องตัดสินใจ — แถบเดียว ไม่ใช่สี่กล่อง ── */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border lg:grid-cols-4">
        {[
          { k: 'areas', th: 'พื้นที่เร่งด่วน', n: urgentAreas.length, red: urgentAreas.length > 0 },
          { k: 'requests', th: 'รอเขตตัดสินใจ', n: waiting.length, red: waiting.length > 0 },
          { k: 'schools', th: 'โรงเรียนที่ต้องช่วย', n: supportSchools.length, red: false },
          { k: 'schools', th: 'เคสเกิน SLA', n: ops.overdue, red: false },
        ].map((x, i) => (
          <button
            key={x.th}
            type="button"
            onClick={() => scrollTo(x.k)}
            className={`px-4 py-3 text-left hover:bg-surface-muted/50 ${i % 2 ? 'border-l border-surface-border' : ''} ${i > 1 ? 'border-t border-surface-border lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
          >
            <span className={`block text-[24px] font-bold leading-none tabular ${x.red ? 'text-red-600' : 'text-ink'}`}>{formatNumber(x.n)}</span>
            <span className="mt-1 block text-[14px] text-ink-muted">{x.th}</span>
          </button>
        ))}
      </div>

      {/* ── 3. พื้นที่ที่ต้องดูแลก่อน — ชื่อ สถานะ และเหตุผลข้อเดียว รายละเอียดอยู่ในลิ้นชัก ── */}
      <Section id="areas" title="พื้นที่ที่ต้องดูแลก่อน">
        <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
          {dviews.map((v) => (
            <li key={v.d.key}>
              <button type="button" onClick={() => setSheet({ kind: 'district', v })} className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-bold text-ink">อำเภอ{dn(v.d.key)}</span>
                    <TierPill tier={v.tier} />
                  </span>
                  <span className="mt-0.5 block text-[14px] text-ink-muted">เกิน SLA {v.overdue} · {v.why[0]?.split(' — ')[0]}</span>
                </span>
                <span aria-hidden className="shrink-0 text-ink-faint group-hover:text-brand-600">→</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── 4. เรื่องที่รอการตัดสินใจจากเขต ── */}
      <Section id="requests" title="เรื่องที่รอการตัดสินใจจากเขต" hint="ผอ. ส่งขึ้นมาเมื่อโรงเรียนแก้ต่อเองไม่ไหว">
        {waiting.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-surface-border bg-white px-5 py-4 text-[15px] text-ink-muted">ไม่มีคำขอที่รอเขตตัดสินใจ</p>
        ) : (
          <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
            {waiting.map((r) => {
              const b = requestBrief(r, team, patterns)
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setSheet({ kind: 'request', r })} className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-bold text-ink">{r.schoolName}</span>
                        {r.urgency === 'high' && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[12.5px] font-bold text-red-700">เร่งด่วน</span>}
                      </span>
                      <span className="mt-0.5 block text-[14px] text-ink-muted">
                        {AREA_NEED_TH[r.need]}
                        {r.childName ? ` · ${r.childName}` : ''} · {b.waitedDays ? `รอ ${b.waitedDays} วัน` : 'ส่งมาวันนี้'}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-ink-faint group-hover:text-brand-600">→</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {(withSchools.length > 0 || reported.length > 0 || waiting.some((r) => r.sample)) && (
          <p className="mt-2 text-[13.5px] text-ink-muted">
            {[
              withSchools.length ? `ตัดสินใจแล้ว รอโรงเรียน ${withSchools.length} เรื่อง` : '',
              reported.length ? `โรงเรียนรายงานผลแล้ว ${reported.length} เรื่อง` : '',
              waiting.some((r) => r.sample) ? 'มีคำขอตัวอย่างสำหรับเดโม' : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </Section>

      {/* ── 5. โรงเรียนที่ต้องช่วยก่อน — 3 แห่งแรก ที่เหลือพับไว้ ── */}
      <Section id="schools" title="โรงเรียนที่ต้องช่วยก่อน">
        <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
          {(allSchools ? views : views.slice(0, 3)).map((v) => (
            <li key={v.s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-bold text-ink">{v.s.name}</span>
                  <TierPill tier={v.tier} />
                </span>
                <span className="mt-0.5 block text-[14px] leading-snug text-ink-muted">
                  เกิน SLA {v.overdue} · {v.ai}
                </span>
              </span>
              {v.tier !== 'ok' && (
                <button
                  type="button"
                  onClick={() => setSheet({ kind: 'support', v })}
                  className={`shrink-0 self-start rounded-xl px-4 py-2.5 text-[14.5px] font-semibold sm:self-center ${v.tier === 'urgent' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-surface-border bg-white text-ink hover:border-brand-300'}`}
                >
                  วางแผนสนับสนุน
                </button>
              )}
            </li>
          ))}
        </ul>
        {views.length > 3 && (
          <button type="button" onClick={() => setAllSchools((x) => !x)} className="mt-2 text-[14.5px] font-semibold text-brand-700">
            {allSchools ? 'ย่อ' : `ดูอีก ${views.length - 3} โรงเรียน`}
          </button>
        )}
      </Section>

      {/* ── 6. ข้อมูลประกอบ — เปิดดูเมื่อต้องการ ── */}
      <div id="more" className="scroll-mt-20">
        <p className="text-[13.5px] font-semibold text-ink-muted">ข้อมูลประกอบ — เปิดดูเมื่อต้องการ</p>
        <div className="mt-3 divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
          <Fold
            title="ปัญหาที่เกิดซ้ำหลายโรงเรียน"
            summary={patterns.length ? patterns.slice(0, 3).map((p) => `${p.th} ${p.schools.length} โรงเรียน`).join(' · ') : 'ยังไม่พบปัญหาที่เกิดซ้ำตั้งแต่ 2 โรงเรียนขึ้นไป'}
            open={Boolean(folds.pattern)}
            onToggle={() => toggle('pattern')}
          >
            <ul className="space-y-2.5">
              {patterns.map((p) => {
                const made = area.measures.find((m) => m.pattern === p.key)
                return (
                  <li key={p.key} className="rounded-xl border border-surface-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[15.5px] font-bold text-ink">{p.th}</p>
                      <span className="text-[13.5px] text-ink-muted">
                        พบใน {p.schools.length} โรงเรียน · {p.n} {p.key === 'agency' ? 'การส่งต่อ' : 'คน'}
                      </span>
                    </div>
                    <p className="mt-1 text-[13.5px] text-ink-muted">{p.schools.join(' · ')}</p>
                    <p className="mt-1.5 text-[14.5px] leading-snug text-ink">
                      <span className="font-semibold text-brand-700">AI: </span>
                      {p.rec}
                    </p>
                    {made ? (
                      <p className="mt-2 text-[14px] font-semibold text-green-800">
                        ✓ มีมาตรการแล้ว: {made.title} · {made.owner} · กำหนด {fmtDay(made.due)}
                      </p>
                    ) : (
                      <button type="button" onClick={() => setSheet({ kind: 'measure', p })} className={`${btnSecondary} mt-2.5`}>
                        สร้างมาตรการระดับเขต
                      </button>
                    )}
                  </li>
                )
              })}
              {!patterns.length && <li className="text-[14.5px] text-ink-muted">ปัญหาแต่ละโรงเรียนต่างกัน ช่วยรายโรงเรียนเหมาะกว่ามาตรการรวม</li>}
            </ul>
          </Fold>

          <Fold
            title="ทีมและทรัพยากรของเขต"
            summary={(() => {
              const over = team.filter((t) => t.pct > 100)
              return over.length ? `${over.map((t) => `${t.role} ${t.pct}%`).join(' · ')} — เกิน capacity` : 'ทุกคนในทีมยังรับงานได้'
            })()}
            open={Boolean(folds.team)}
            onToggle={() => toggle('team')}
          >
            <ul className="space-y-3">
              {team.map((t) => (
                <li key={t.name}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[14.5px]">
                    <span className="font-semibold text-ink">{t.name}</span>
                    <span className={`tabular ${t.pct > 100 ? 'font-bold text-red-700' : 'text-ink-muted'}`}>
                      {t.load}/{t.capacity} งาน · {t.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                    <div className={`h-full rounded-full ${t.pct > 100 ? 'bg-red-500' : t.pct > 85 ? 'bg-orange-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, t.pct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {(() => {
              const over = [...team].filter((t) => t.pct > 100).sort((a, b) => b.pct - a.pct)[0]
              const free = [...team].sort((a, b) => a.pct - b.pct)[0]
              return over ? (
                <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[14.5px] leading-snug text-ink">
                  <span className="font-semibold">AI: </span>
                  {over.role}มีภาระงานเกิน capacity {over.pct - 100}% — อาจพิจารณาเพิ่มอัตราชั่วคราว หรือให้{free.name}ช่วยงานที่ไม่ต้องใช้ผู้เชี่ยวชาญ
                </p>
              ) : null
            })()}
            <p className="mt-2 text-[12.5px] text-ink-muted">ทีมเขตและงานเดิมในมือเป็นข้อมูลจำลอง · งานที่เขตมอบหมายในหน้านี้นับเพิ่มจริง</p>
          </Fold>

          <Fold
            title="ภาพรวมตัวเลขของเขต"
            summary={`นักเรียน ${formatNumber(ops.students)} · เด็กเสี่ยงสูง ${formatNumber(ops.atRisk)} · เคสเปิดอยู่ ${ops.activeCases} · ปิดสำเร็จ ${ops.successRate.toFixed(1)}%`}
            open={Boolean(folds.kpi)}
            onToggle={() => toggle('kpi')}
          >
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { k: 'โรงเรียนนำร่องในเขต', v: formatNumber(ops.schools) },
                { k: 'นักเรียนทั้งหมด', v: formatNumber(ops.students) },
                { k: 'เด็กเสี่ยงสูง', v: formatNumber(ops.atRisk) },
                { k: 'ยังอยู่นอกระบบ', v: formatNumber(ops.outOfSchool) },
                { k: 'เคสที่ยังเปิดอยู่', v: `${ops.activeCases} (ไม่มีเจ้าของ ${ops.unassigned})` },
                { k: 'กำลังช่วยเหลือ', v: formatNumber(ops.pipeline.working) },
                { k: 'ปิดเคสสำเร็จ', v: `${ops.successRate.toFixed(1)}%` },
                { k: 'เด็กนอกระบบที่มีแผนแล้ว', v: `${ops.plan.planned}/${ops.plan.known}` },
              ].map((x) => (
                <div key={x.k} className="rounded-xl bg-surface-muted/60 p-3">
                  <dt className="text-[13px] text-ink-muted">{x.k}</dt>
                  <dd className="mt-0.5 text-[18px] font-bold tabular text-ink">{x.v}</dd>
                </div>
              ))}
            </dl>
          </Fold>

          <Fold
            title="แนวโน้ม"
            summary={`เด็กเสี่ยงสูง ${formatNumber(ops.progress.before)} → ${formatNumber(ops.progress.now)} เทียบ 6 เดือนก่อน (${ops.progress.changePct > 0 ? '+' : ''}${ops.progress.changePct.toFixed(1)}%)`}
            open={Boolean(folds.trend)}
            onToggle={() => toggle('trend')}
          >
            <ul className="divide-y divide-surface-border text-[15px]">
              <li className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-ink">เด็กเสี่ยงสูง (6 เดือน)</span>
                <span className="tabular text-ink-muted">{formatNumber(ops.progress.before)} →</span>
                <span className="w-16 text-right font-bold tabular text-ink">{formatNumber(ops.progress.now)}</span>
                <span className={`w-20 text-right text-[13.5px] font-semibold ${ops.progress.changePct <= 0 ? 'text-green-700' : 'text-red-700'}`}>{ops.progress.changePct <= 0 ? 'ดีขึ้น' : 'แย่ลง'}</span>
              </li>
              <li className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-ink">เคสเกิน SLA ตอนนี้</span>
                <span className="w-16 text-right font-bold tabular text-ink">{ops.overdue}</span>
                <span className="w-20 text-right text-[13.5px] text-ink-muted">จาก {ops.activeCases}</span>
              </li>
            </ul>
            <p className="mt-3 rounded-xl bg-brand-50/60 px-4 py-3 text-[14.5px] leading-snug text-ink">
              <span className="font-semibold text-brand-700">AI: </span>
              {ops.progress.changePct <= 0 && ops.overdue > ops.activeCases * 0.4
                ? 'จำนวนเด็กเสี่ยงสูงลดลง แต่เคสค้างยังมาก — อาจพิจารณาเน้นเร่งติดตามเคสเดิมมากกว่าค้นหาเคสใหม่'
                : ops.progress.changePct <= 0
                  ? 'ทิศทางดีขึ้น — รักษาจังหวะเดิมไว้'
                  : 'เด็กเสี่ยงสูงเพิ่มขึ้น — อาจพิจารณาดูอำเภอที่ AI ยกขึ้นมาก่อน'}
            </p>
            <p className="mt-2 text-[12.5px] text-ink-muted">ชุดแนวโน้มย้อนหลังเป็นข้อมูลจำลอง</p>
          </Fold>

          <Fold title="ถาม AI เกี่ยวกับเขต" summary="เช่น อำเภอไหนต้องดูแลก่อน · ปัญหาอะไรเกิดซ้ำ · ทรัพยากรจำกัดควรลงที่ไหน" open={Boolean(folds.ask)} onToggle={() => toggle('ask')}>
            <div className="flex flex-wrap gap-2">
              {QUESTIONS.map((x) => (
                <button key={x.k} type="button" onClick={() => setAsk(x.k)} aria-pressed={ask === x.k} className={`rounded-full border px-3.5 py-2 text-[14px] font-medium ${ask === x.k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink hover:border-brand-300'}`}>
                  {x.q}
                </button>
              ))}
            </div>
            {answer && (
              <div className="mt-3 rounded-xl bg-brand-50/60 px-4 py-3">
                <p className="text-[15px] leading-relaxed text-ink">{answer.text}</p>
                {answer.go && (
                  <button type="button" onClick={answer.go} className="mt-2 text-[14.5px] font-semibold text-brand-700 underline-offset-2 hover:underline">
                    {answer.goLabel} →
                  </button>
                )}
              </div>
            )}
          </Fold>

          <Fold
            title="บันทึกการตัดสินใจของเขต"
            summary={`ตัดสินใจคำขอ ${area.requests.filter((r) => r.decision).length} · สนับสนุนโรงเรียน ${area.actions.length} · มาตรการ ${area.measures.length} · ผลกลับมาแล้ว ${reported.length}`}
            open={Boolean(folds.log)}
            onToggle={() => toggle('log')}
          >
            <DecisionLog area={area} />
          </Fold>

          <Fold title="ข้อมูลเชิงลึก" summary="แผนที่อัจฉริยะ · เจาะลึกเขต / อำเภอ · ผลการดำเนินงานโรงเรียน · รายงาน" open={Boolean(folds.links)} onToggle={() => toggle('links')}>
            <div className="flex flex-wrap gap-2">
              {[
                { to: '/geo', th: 'แผนที่อัจฉริยะเชิงพื้นที่' },
                { to: '/area', th: 'เจาะลึกเขต / อำเภอ' },
                { to: '/school', th: 'ผลการดำเนินงานโรงเรียน' },
                { to: '/reports', th: 'รายงาน' },
              ].map((x) => (
                <button key={x.to} type="button" onClick={() => link(x.to)} className={btnSecondary}>
                  {x.th}
                </button>
              ))}
            </div>
          </Fold>
        </div>
      </div>

      {sheet?.kind === 'request' && (
        <RequestDrawer
          r={sheet.r}
          team={team}
          patterns={patterns}
          onClose={() => setSheet(null)}
          onDecide={(acts) => setSheet({ kind: 'decide', r: sheet.r, acts })}
        />
      )}
      {sheet?.kind === 'decide' && (
        <SupportSheet
          title={`ตัดสินใจ · ${sheet.r.schoolName}`}
          sub={AREA_NEED_TH[sheet.r.need]}
          withVerdict
          acts0={sheet.acts}
          expected0={requestBrief(sheet.r, team, patterns).expected}
          team={team}
          onClose={() => setSheet(null)}
          onSave={(d) => {
            area.decide(sheet.r.id, { by, ...d })
            setSheet(null)
            push(d.verdict === 'approve' ? `ส่งการตัดสินใจถึง ผอ.${sheet.r.schoolName} แล้ว — ${d.owner} รับผิดชอบฝั่งเขต` : `ส่ง "${AREA_VERDICT_TH[d.verdict]}" ถึงโรงเรียนแล้ว`)
          }}
        />
      )}
      {sheet?.kind === 'district' && (
        <DistrictDrawer v={sheet.v} name={dn(sheet.v.d.key)} onClose={() => setSheet(null)} onSupport={(sv) => setSheet({ kind: 'support', v: sv })} onOpenArea={() => link(`/area?d=${sheet.v.d.key}`)} />
      )}
      {sheet?.kind === 'support' && (
        <SupportSheet
          title={`วางแผนสนับสนุน · ${sheet.v.s.name}`}
          sub={`${TIER_META[sheet.v.tier].th} · ${sheet.v.why[1]}`}
          context={
            <div className="rounded-2xl border border-surface-border p-4">
              <ul className="space-y-1">
                {sheet.v.why.map((w) => (
                  <li key={w} className="flex gap-2 text-[14.5px] text-ink">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
              <p className="mt-2 rounded-xl bg-brand-50/60 px-3 py-2.5 text-[14.5px] leading-snug text-ink">
                <span className="font-semibold text-brand-700">AI: </span>
                {sheet.v.ai}
              </p>
            </div>
          }
          acts0={sheet.v.suggest}
          expected0={sheet.v.overdue ? `เคสเกิน SLA ของโรงเรียนลดลงครึ่งหนึ่งภายใน 1 เดือน (ตอนนี้ ${sheet.v.overdue})` : 'เด็กเสี่ยงสูงทุกคนมีผู้รับผิดชอบและแผนภายใน 1 เดือน'}
          team={team}
          onClose={() => setSheet(null)}
          onSave={(d) => {
            area.addAction({ schoolId: sheet.v.s.id, schoolName: sheet.v.s.name, by, acts: d.acts, owner: d.owner, due: d.due, expected: d.expected, note: d.note })
            setSheet(null)
            push(`ส่งการสนับสนุนถึง ผอ.${sheet.v.s.name} แล้ว — ${d.owner} รับผิดชอบฝั่งเขต`)
          }}
        />
      )}
      {sheet?.kind === 'measure' && (
        <MeasureSheet
          p={sheet.p}
          team={team}
          onClose={() => setSheet(null)}
          onSave={(m) => {
            area.addMeasure({ by, pattern: sheet.p.key, ...m })
            setSheet(null)
            push(`สร้างมาตรการ "${m.title}" แล้ว`)
          }}
        />
      )}
    </div>
  )
}

// ── ลิ้นชัก ─────────────────────────────────────────────────

/**
 * คำขอจาก ผอ. — อ่านจากบนลงล่างตามลำดับที่เขตคิด:
 *   ขออะไร → โรงเรียนทำอะไรไปแล้ว / ติดตรงไหน → AI แนะนำอะไร (ปุ่มเดียว) → หรือทางอื่น
 * ไม่มีกรอบซ้อนกรอบ และ AI ไม่เล่าคำขอซ้ำ บอกเฉพาะสิ่งที่เพิ่มจากคำขอ (ใครรับ · งานในมือ)
 */
export function RequestDrawer({ r, team, patterns, onClose, onDecide }: { r: AreaRequest; team: TeamRow[]; patterns: Pattern[]; onClose: () => void; onDecide: (acts: AreaAct[]) => void }) {
  const b = requestBrief(r, team, patterns)
  const rec = b.acts.map((a) => AREA_ACT_TH[a]).join(' + ')
  const others: { acts: AreaAct[]; label: string }[] = [
    { acts: ['meeting'], label: 'เรียกประชุม ผอ. ก่อน' },
    { acts: ['advise'], label: 'ส่งคำแนะนำกลับโรงเรียน' },
  ]
  return (
    <Drawer
      label={`คำขอจาก ${r.schoolName}`}
      head={
        <>
          <p className="truncate text-[19px] font-bold leading-tight text-ink">{r.schoolName}</p>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            {r.by} · {b.waitedDays ? `ส่งมา ${b.waitedDays} วันก่อน` : 'ส่งมาวันนี้'}
          </p>
        </>
      }
      onClose={onClose}
    >
      {/* 1 · ขออะไร */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[20px] font-bold leading-snug text-ink">
          {AREA_NEED_TH[r.need]}
          {r.childName ? ` · ${r.childName}` : ''}
        </h3>
        {r.urgency === 'high' && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[13px] font-bold text-red-700">เร่งด่วน</span>}
      </div>
      <p className="mt-1.5 whitespace-pre-line text-[15.5px] leading-relaxed text-ink">{r.ask}</p>

      {/* 2 · ทำแล้ว / ติดที่ */}
      <dl className="mt-5 space-y-3 border-t border-surface-border pt-4 text-[15px] leading-snug">
        {r.tried.length > 0 && (
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 font-semibold text-green-800">ทำแล้ว</dt>
            <dd className="min-w-0 space-y-1 text-ink">
              {r.tried.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 font-semibold text-red-700">ติดที่</dt>
          <dd className="min-w-0 text-ink">{r.blocked}</dd>
        </div>
      </dl>

      {/* 3 · AI แนะนำ — ทางเดียว ปุ่มเดียว */}
      <section className="mt-6 rounded-2xl bg-brand-50/70 p-4">
        <div className="flex items-center gap-2.5">
          <img src={MASCOT} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-0.5" draggable={false} />
          <p className="text-[14px] font-semibold text-brand-700">AI แนะนำ</p>
        </div>
        <p className="mt-2 text-[17px] font-bold leading-snug text-ink">{rec}</p>
        {b.owner && <p className="mt-0.5 text-[15px] text-ink">ผู้รับผิดชอบ: {b.owner}</p>}
        {b.capacityNote && (
          <p className="mt-2 flex gap-2 text-[14.5px] leading-snug text-red-700">
            <span aria-hidden>⚠</span>
            <span>{b.capacityNote}</span>
          </p>
        )}
        <button type="button" onClick={() => onDecide(b.acts)} className="mt-4 w-full rounded-xl bg-brand-500 px-5 py-3.5 text-[15.5px] font-semibold text-white hover:bg-brand-600">
          ตัดสินใจตามนี้ →
        </button>
      </section>

      {/* 4 · หรือทางอื่น */}
      <p className="mt-5 text-[14px] font-semibold text-ink-muted">หรือ</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {others.map((o) => (
          <button key={o.label} type="button" onClick={() => onDecide(o.acts)} className={btnSecondary}>
            {o.label}
          </button>
        ))}
      </div>
    </Drawer>
  )
}

function DistrictDrawer({ v, name, onClose, onSupport, onOpenArea }: { v: DistrictView; name: string; onClose: () => void; onSupport: (s: SchoolView) => void; onOpenArea: () => void }) {
  return (
    <Drawer
      label={`อำเภอ${name}`}
      head={
        <>
          <p className="truncate text-[19px] font-bold leading-tight text-ink">อำเภอ{name}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {v.schools.length} โรงเรียนนำร่อง · เด็กเสี่ยงสูง {formatNumber(v.d.highRiskStudents)} คน
          </p>
        </>
      }
      onClose={onClose}
    >
      <section className="rounded-2xl border border-surface-border bg-white px-4 py-4 shadow-card">
        <TierPill tier={v.tier} />
        <p className="mt-2.5 text-[17px] font-bold leading-snug text-ink">ทำไมอำเภอ{name}ต้องได้รับการดูแล{v.tier === 'urgent' ? 'ก่อน' : ''}</p>
        <ul className="mt-2 space-y-1.5">
          {v.why.map((w) => (
            <li key={w} className="flex gap-2 text-[14.5px] leading-snug text-ink">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
              {w}
            </li>
          ))}
          {v.mainProblem && (
            <li className="flex gap-2 text-[14.5px] leading-snug text-ink">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
              ปัญหาหลักในโรงเรียน: {v.mainProblem}
            </li>
          )}
        </ul>
      </section>
      <div className="mt-4 rounded-2xl bg-brand-50/80 px-4 py-3.5 text-[14.5px] leading-relaxed text-ink">
        <span className="block text-[12.5px] font-semibold text-brand-700">AI แนะนำ</span>
        {v.rec}
      </div>
      <h3 className="mt-6 text-[16px] font-bold text-ink">โรงเรียนในอำเภอ</h3>
      <ul className="mt-2 space-y-2">
        {v.schools.map((s) => (
          <li key={s.s.id} className="rounded-xl border border-surface-border p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold text-ink">{s.s.name}</span>
              <TierPill tier={s.tier} />
            </div>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              เด็กเสี่ยงสูง {formatNumber(s.s.highRiskStudents)} · เกิน SLA {s.overdue}
            </p>
            <p className="mt-1 text-[14px] leading-snug text-ink">AI: {s.ai}</p>
            {s.tier !== 'ok' && (
              <button type="button" onClick={() => onSupport(s)} className={`${btnSecondary} mt-2`}>
                วางแผนสนับสนุน
              </button>
            )}
          </li>
        ))}
        {!v.schools.length && <li className="text-[14.5px] text-ink-muted">ยังไม่มีโรงเรียนนำร่องในอำเภอนี้ — ดูเด็กนอกระบบและหน่วยงานในพื้นที่ที่หน้าเจาะลึก</li>}
      </ul>
      <button type="button" onClick={onOpenArea} className={`${btnSecondary} mt-6 w-full`}>
        เจาะลึกอำเภอ{name} (แผนที่ · สาเหตุ · เด็กนอกระบบ)
      </button>
    </Drawer>
  )
}

/** ตัดสินใจคำขอ หรือวางแผนสนับสนุนโรงเรียน — action ของเขต · ผู้รับผิดชอบ · กำหนด · ผลที่คาดหวัง */
export function SupportSheet({
  title,
  sub,
  context,
  withVerdict,
  acts0,
  expected0,
  team,
  onClose,
  onSave,
}: {
  title: string
  sub: string
  context?: ReactNode
  withVerdict?: boolean
  acts0: AreaAct[]
  expected0: string
  team: TeamRow[]
  onClose: () => void
  onSave: (d: { verdict: AreaVerdict; acts: AreaAct[]; owner: string; due: string; expected: string; note: string }) => void
}) {
  const [verdict, setVerdict] = useState<AreaVerdict>('approve')
  const [acts, setActs] = useState<AreaAct[]>(acts0)
  const [owner, setOwner] = useState(suggestOwner(team, acts0) ?? team[0]?.name ?? '')
  const [due, setDue] = useState(isoIn(14))
  const [expected, setExpected] = useState(expected0)
  const [note, setNote] = useState('')
  const approve = verdict === 'approve'
  const noteDefault = approve ? `เขตจะ${acts.map((a) => AREA_ACT_TH[a]).join(' และ')} — ${owner} จะติดต่อโรงเรียนภายใน 3 วัน` : ''
  const noteValue = note || noteDefault
  const ready = approve ? acts.length > 0 && Boolean(owner) && noteValue.trim().length >= 5 : noteValue.trim().length >= 5
  const toggle = (a: AreaAct) => setActs((xs) => (xs.includes(a) ? xs.filter((x) => x !== a) : [...xs, a]))

  return (
    <Drawer label={title} head={<><p className="truncate text-[19px] font-bold leading-tight text-ink">{title}</p><p className="mt-0.5 text-[13px] text-ink-muted">{sub}</p></>} onClose={onClose}>
      {context}
      {withVerdict && (
        <>
          <Label>ผลการพิจารณา</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ผลการพิจารณา">
            {(Object.keys(AREA_VERDICT_TH) as AreaVerdict[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={verdict === v} onClick={() => setVerdict(v)} className={`rounded-xl border px-3 py-3 text-[14.5px] font-semibold ${verdict === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink'}`}>
                {AREA_VERDICT_TH[v]}
              </button>
            ))}
          </div>
        </>
      )}
      {approve && (
        <>
          <Label>สิ่งที่เขตทำ (เลือกได้หลายข้อ — AI เลือกไว้ให้แล้ว)</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="สิ่งที่เขตทำ">
            {ACT_ORDER.map((a) => (
              <button key={a} type="button" aria-pressed={acts.includes(a)} onClick={() => toggle(a)} className={`rounded-full border px-3.5 py-2 text-[14px] font-semibold ${acts.includes(a) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink'}`}>
                {acts.includes(a) ? '✓ ' : ''}
                {AREA_ACT_TH[a]}
              </button>
            ))}
          </div>
          <p id="area-owner-label" className="mb-1.5 mt-4 text-[14px] font-semibold text-ink">
            ผู้รับผิดชอบฝั่งเขต
          </p>
          <div role="radiogroup" aria-labelledby="area-owner-label" className="space-y-2">
            {team.map((t) => {
              const on = owner === t.name
              const sug = suggestOwner(team, acts) === t.name
              return (
                <button key={t.name} type="button" role="radio" aria-checked={on} onClick={() => setOwner(t.name)} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-surface-border bg-white hover:border-brand-300'}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand-500' : 'border-slate-400'}`} aria-hidden>
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">{t.name}</span>
                      {sug && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[12px] font-semibold text-white">AI แนะนำ</span>}
                    </span>
                    <span className={`block text-[13.5px] ${t.pct > 100 ? 'font-semibold text-red-700' : 'text-ink-muted'}`}>
                      {t.role} · งานในมือ {t.load}/{t.capacity} ({t.pct}%)
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <Label>กำหนดเสร็จ</Label>
          <input id="area-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
          <Label>ผลที่คาดหวัง (ใช้ติดตามว่าการช่วยระดับเขตได้ผลไหม)</Label>
          <input id="area-expected" value={expected} onChange={(e) => setExpected(e.target.value)} className={inputCls} />
        </>
      )}
      <Label>{approve ? 'ข้อความถึง ผอ. โรงเรียน' : verdict === 'needInfo' ? 'เขตต้องการข้อมูลอะไรเพิ่ม' : 'เหตุผลและคำแนะนำถึงโรงเรียน'}</Label>
      <textarea id="area-note" value={noteValue} onChange={(e) => setNote(e.target.value)} rows={3} className={textareaCls} />
      <div className="mt-5">
        <PrimaryBtn disabled={!ready} onClick={() => onSave({ verdict, acts: approve ? acts : [], owner: approve ? owner : '', due: approve ? due : '', expected: approve ? expected : '', note: noteValue.trim() })}>
          {approve ? 'ยืนยันและส่งถึง ผอ. โรงเรียน' : 'ส่งถึง ผอ. โรงเรียน'}
        </PrimaryBtn>
      </div>
    </Drawer>
  )
}

function MeasureSheet({ p, team, onClose, onSave }: { p: Pattern; team: TeamRow[]; onClose: () => void; onSave: (m: { title: string; schools: string[]; owner: string; due: string; expected: string }) => void }) {
  const titles: Record<string, string> = {
    travel: 'ทุนค่าเดินทางระดับเขตสำหรับนักเรียนที่บ้านไกล',
    noContact: 'ช่องทางติดต่อครอบครัวผ่านผู้นำชุมชน / อสม. ทั้งเขต',
    poverty: 'รายการเด็กยากจนของทั้งเขตส่ง พมจ. ครั้งเดียว',
    agency: 'ประชุมหัวหน้าหน่วยงานระดับจังหวัดเรื่องการส่งต่อที่ค้าง',
    childLabour: 'เส้นทางเรียนควบทำงาน (สกร. · ทวิภาคี) ระดับเขต',
  }
  const [title, setTitle] = useState(titles[p.key] ?? `มาตรการระดับเขต: ${p.th}`)
  const [owner, setOwner] = useState(suggestOwner(team, ['measure', 'coordinateAgency']) ?? team[0]?.name ?? '')
  const [due, setDue] = useState(isoIn(30))
  const [expected, setExpected] = useState(`ปัญหา "${p.th}" ลดลงในทุก ${p.schools.length} โรงเรียนภายใน 1 ภาคเรียน`)
  return (
    <Drawer label="สร้างมาตรการระดับเขต" head={<><p className="text-[19px] font-bold leading-tight text-ink">สร้างมาตรการระดับเขต</p><p className="mt-0.5 text-[13px] text-ink-muted">{p.th} · พบใน {p.schools.length} โรงเรียน</p></>} onClose={onClose}>
      <p className="rounded-xl bg-brand-50/60 px-4 py-3 text-[14.5px] leading-snug text-ink">
        <span className="font-semibold text-brand-700">AI: </span>
        {p.rec}
      </p>
      <Label>ชื่อมาตรการ</Label>
      <input id="measure-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      <p className="mb-1.5 mt-4 text-[14px] font-semibold text-ink">โรงเรียนที่ได้รับ</p>
      <p className="text-[14.5px] text-ink">{p.schools.join(' · ')}</p>
      <Label>ผู้รับผิดชอบฝั่งเขต</Label>
      <select id="measure-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}>
        {team.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name} ({t.pct}%)
          </option>
        ))}
      </select>
      <Label>กำหนดเริ่มใช้</Label>
      <input id="measure-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
      <Label>ผลที่คาดหวัง</Label>
      <input id="measure-expected" value={expected} onChange={(e) => setExpected(e.target.value)} className={inputCls} />
      <div className="mt-5">
        <PrimaryBtn disabled={title.trim().length < 5 || !owner} onClick={() => onSave({ title: title.trim(), schools: p.schools, owner, due, expected: expected.trim() })}>
          สร้างมาตรการ
        </PrimaryBtn>
      </div>
    </Drawer>
  )
}

function DecisionLog({ area }: { area: ReturnType<typeof useAreaLog> }) {
  const rows = [
    ...area.requests
      .filter((r) => r.decision)
      .map((r) => ({
        ts: r.decision!.ts,
        school: r.schoolName,
        what: `${AREA_VERDICT_TH[r.decision!.verdict]}: ${r.decision!.acts.map((a) => AREA_ACT_TH[a]).join(' · ') || r.decision!.note}`,
        owner: r.decision!.owner,
        due: r.decision!.due,
        expected: r.decision!.expected,
        outcome: r.done?.note,
      })),
    ...area.actions.map((a) => ({ ts: a.ts, school: a.schoolName, what: `สนับสนุน: ${a.acts.map((x) => AREA_ACT_TH[x]).join(' · ')}`, owner: a.owner, due: a.due, expected: a.expected, outcome: a.done?.note })),
    ...area.measures.map((m) => ({ ts: m.ts, school: `${m.schools.length} โรงเรียน`, what: `มาตรการ: ${m.title}`, owner: m.owner, due: m.due, expected: m.expected, outcome: undefined as string | undefined })),
  ].sort((a, b) => b.ts - a.ts)
  if (!rows.length) return <p className="text-[14.5px] text-ink-muted">ยังไม่มีการตัดสินใจของเขต — การตัดสินใจทุกครั้งบันทึกที่นี่พร้อมผู้รับผิดชอบ กำหนด และผลที่คาดหวัง</p>
  return (
    <ul className="divide-y divide-surface-border">
      {rows.map((r, i) => (
        <li key={i} className="py-3">
          <p className="text-[15px] font-semibold text-ink">
            {r.school} · {r.what}
          </p>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            {new Date(r.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
            {r.owner ? ` · ${r.owner}` : ''}
            {r.due ? ` · กำหนด ${fmtDay(r.due)}` : ''}
            {r.expected ? ` · คาดหวัง: ${r.expected}` : ''}
          </p>
          {r.outcome ? <p className="mt-1 text-[14px] text-green-800">✓ ผลจากโรงเรียน: {r.outcome}</p> : r.due ? <p className="mt-1 text-[13.5px] text-ink-muted">รอโรงเรียนรายงานผล</p> : null}
        </li>
      ))}
    </ul>
  )
}
