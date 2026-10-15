import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { School } from '@/types'
import { SCHOOLS } from '@/data/schools'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { BOTTLENECK_TH, bottlenecks, outcomes, teamLoad, weekCompare } from '@/lib/directorOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { lightestOf } from '@/components/support/DirectorDecisionSheet'
import { Drawer, Label, PrimaryBtn, textareaCls } from '@/components/referrals/ui'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { IconSchool } from '@/components/icons'
import { MASCOT, btnSecondary } from './DeskParts'

type Tone = 'good' | 'bad' | 'even'
const TONE_PILL: Record<Tone, string> = { good: 'bg-green-50 text-green-800', bad: 'bg-red-50 text-red-700', even: 'bg-surface-muted text-ink-muted' }
const TONE_BAR: Record<Tone, string> = { good: 'bg-green-600', bad: 'bg-orange-500', even: 'bg-slate-400' }

interface Metric {
  key: 'success' | 'response' | 'data' | 'risk'
  th: string
  /** ชื่อสั้นในประโยคสรุป */
  short: string
  /** ป้ายเทียบค่าเฉลี่ย [ดี, แย่] — เวลาตอบสนองใช้ เร็ว/ช้า ไม่ใช่ สูง/ต่ำ */
  words?: [string, string]
  value: number
  avg: number
  unit: string
  /** ค่ามากขึ้นดีไหม */
  higherBetter: boolean
  rank: number
  tone: Tone
  /** AI อ่านตัวเลขนี้ให้ — ทำไมเป็นแบบนี้ (จากข้อมูลจริงในระบบ) */
  read: string
  action?: { label: string; go: () => void }
}

const round1 = (n: number) => Math.round(n * 10) / 10
/** อันดับเทียบโรงเรียนนำร่องทั้งหมด (1 = ดีที่สุด) */
const rankOf = (v: number, pick: (s: School) => number, higherBetter: boolean) =>
  1 + SCHOOLS.filter((s) => (higherBetter ? pick(s) > v : pick(s) < v)).length

/**
 * ผลการดำเนินงานโรงเรียน สำหรับ ผอ. — AI อ่านตัวเลขให้ ไม่ใช่แดชบอร์ดให้ ผอ. ตีความเอง
 *
 *   AI สรุป (ดีตรงไหน · ติดตรงไหน · สาเหตุ · ปุ่มเดียว) → ตัวชี้วัดพร้อมคำอ่านของ AI → สัปดาห์นี้เทียบสัปดาห์ก่อน
 *   → อะไรทำให้เคสค้าง → ผลลัพธ์ของเด็ก → ขอสนับสนุนทรัพยากร (AI ร่างเหตุผลให้)
 *
 * ตัวเลขมีสองแหล่งและบอกชัดเสมอ: ตัวชี้วัดทั้งโรงเรียน (รายงานประจำภาค เทียบโรงเรียนนำร่อง)
 * กับเคสที่ติดตามในระบบ (แหล่งเดียวกับหน้าเรื่องที่ต้องตัดสินใจ — ตัวเลขจึงตรงกันทุกหน้า)
 * เดิมหน้านี้วาง "เคสที่เปิดอยู่ 57" จากรายงานไว้ข้าง "เกิน SLA 17" ขณะที่หน้าอื่นนับจากเคสจริง ผอ. จึงเห็นเลขไม่ตรงกัน
 */
export function DirectorSchoolDesk({ school: s, onFullView }: { school: School; onFullView: () => void }) {
  const { t } = useI18n()
  const nav = useNavigate()
  const { push } = useToast()
  const { log, built } = useFollowCases()
  const loading = useSimulatedLoading(400)
  const cases = useMemo(() => ('list' in built ? built.list : []), [built])
  const requests = useMemo(() => Object.values(log.requests), [log.requests])
  const load = useMemo(() => teamLoad(cases), [cases])
  const week = useMemo(() => weekCompare(cases), [cases])
  const jams = useMemo(() => bottlenecks(cases, requests), [cases, requests])
  const out = useMemo(() => outcomes(cases), [cases])
  const [asking, setAsking] = useState(false)
  const [asked, setAsked] = useState(false)

  const open = cases.filter((c) => c.open)
  const breach = open.filter((c) => c.sla.level === 'breach')
  const stale = open.filter((c) => c.updatedDaysAgo >= 7).length
  const breachTop = [...breach.reduce((m, c) => (c.s.caseOwner ? m.set(c.s.caseOwner, (m.get(c.s.caseOwner) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]
  const topOwner = breachTop && breachTop[1] >= 3 ? breachTop[0] : undefined
  const spreadTo = topOwner ? lightestOf(load.rows, topOwner) : undefined
  /** ครึ่งหนึ่งขึ้นไปอยู่กับคนเดียว จึงพูดได้ว่าเป็นเรื่องภาระงานของคนคนเดียว */
  const concentrated = Boolean(topOwner && breachTop![1] * 2 >= breach.length)
  const n = SCHOOLS.length

  const avg = (pick: (x: School) => number) => round1(SCHOOLS.reduce((a, x) => a + pick(x), 0) / Math.max(1, n))
  const toneOf = (v: number, a: number, higherBetter: boolean, slack: number): Tone => (Math.abs(v - a) <= slack ? 'even' : (v > a) === higherBetter ? 'good' : 'bad')

  // ── ตัวชี้วัด + คำอ่านของ AI ──
  const metrics: Metric[] = (() => {
    const aS = avg((x) => x.interventionSuccessRate)
    const aR = avg((x) => x.responseHours)
    const aD = avg((x) => x.dataQualityScore)
    const aK = avg((x) => x.riskReduction)
    const why = topOwner ? ` · เคสเกิน SLA ${concentrated ? 'กระจุกที่' : 'มากที่สุดอยู่กับ'} ${topOwner} ${breachTop![1]} จาก ${breach.length} เคส` : ''
    const goOwner = topOwner ? { label: `ดูเคสของ ${topOwner}`, go: () => nav(`/decisions?owner=${encodeURIComponent(topOwner)}`) } : undefined
    const goJam = jams[0] ? { label: `ดูเคสที่ค้างเพราะ${BOTTLENECK_TH[jams[0].key]}`, go: () => nav(`/decisions?focus=${jams[0].key}`) } : undefined
    const list: Metric[] = [
      {
        key: 'success',
        th: 'อัตราช่วยสำเร็จ',
        short: 'อัตราช่วยสำเร็จ',
        value: s.interventionSuccessRate,
        avg: aS,
        unit: '%',
        higherBetter: true,
        rank: rankOf(s.interventionSuccessRate, (x) => x.interventionSuccessRate, true),
        tone: toneOf(s.interventionSuccessRate, aS, true, 2),
        read:
          s.interventionSuccessRate < aS - 2
            ? `ต่ำกว่าค่าเฉลี่ย ${round1(aS - s.interventionSuccessRate)} จุด — ในระบบปิดเคสสำเร็จ ${out.closed} เคส ความเสี่ยงลดลงชัดเจน ${out.riskDown} คน${why}`
            : `ใกล้หรือสูงกว่าค่าเฉลี่ย — ปิดเคสสำเร็จ ${out.closed} เคส ความเสี่ยงลดลงชัดเจน ${out.riskDown} คน วิธีที่ทีมใช้อยู่ได้ผล`,
        action: s.interventionSuccessRate < aS - 2 ? goOwner ?? goJam : undefined,
      },
      {
        key: 'response',
        th: 'เวลาตอบสนองเฉลี่ย',
        short: 'ความเร็วในการตอบสนอง',
        words: ['เร็วกว่าค่าเฉลี่ย', 'ช้ากว่าค่าเฉลี่ย'],
        value: s.responseHours,
        avg: aR,
        unit: ' ชม.',
        higherBetter: false,
        rank: rankOf(s.responseHours, (x) => x.responseHours, false),
        tone: toneOf(s.responseHours, aR, false, 2),
        read:
          s.responseHours > aR + 2
            ? `ช้ากว่าค่าเฉลี่ย ${round1(s.responseHours - aR)} ชม. — ตอนนี้มี ${stale} เคสที่ไม่มีการอัปเดตเกิน 7 วัน${jams[0] ? ` ส่วนใหญ่ค้างเพราะ${BOTTLENECK_TH[jams[0].key]} (${jams[0].n} เคส)` : ''}`
            : `เร็วกว่าหรือใกล้ค่าเฉลี่ย — ครูรับเรื่องได้ทันเวลา`,
        action: s.responseHours > aR + 2 ? goJam ?? goOwner : undefined,
      },
      {
        key: 'risk',
        th: 'ลดความเสี่ยงได้ (ไตรมาสนี้)',
        short: 'การลดความเสี่ยง',
        value: s.riskReduction,
        avg: aK,
        unit: '%',
        higherBetter: true,
        rank: rankOf(s.riskReduction, (x) => x.riskReduction, true),
        tone: toneOf(s.riskReduction, aK, true, 1),
        read:
          s.riskReduction < aK - 1
            ? `ต่ำกว่าค่าเฉลี่ย — ในระบบเด็กเสี่ยงสูง ${week.rows[0].before} → ${week.rows[0].now} คนเทียบสัปดาห์ก่อน${open.filter((c) => (c.s.riskLevel === 'high' || c.s.riskLevel === 'critical') && !c.hasPlan).length ? ` · เด็กเสี่ยงสูง ${open.filter((c) => (c.s.riskLevel === 'high' || c.s.riskLevel === 'critical') && !c.hasPlan).length} คนยังไม่มีแผน` : ''}`
            : `ใกล้หรือสูงกว่าค่าเฉลี่ย — เด็กเสี่ยงสูงในระบบ ${week.rows[0].before} → ${week.rows[0].now} คนเทียบสัปดาห์ก่อน`,
        action: s.riskReduction < aK - 1 ? { label: 'ดูเด็กเสี่ยงสูงที่ยังไม่มีแผน', go: () => nav('/plan') } : undefined,
      },
      {
        key: 'data',
        th: 'คุณภาพข้อมูล',
        short: 'คุณภาพข้อมูล',
        value: s.dataQualityScore,
        avg: aD,
        unit: '/100',
        higherBetter: true,
        rank: rankOf(s.dataQualityScore, (x) => x.dataQualityScore, true),
        tone: s.dataQualityScore >= 80 ? 'good' : 'bad',
        read:
          s.dataQualityScore >= 80
            ? 'ข้อมูลครบพอให้ AI วิเคราะห์ได้แม่นยำ — คำแนะนำในหน้าอื่นเชื่อถือได้'
            : 'ข้อมูลยังไม่ครบ — AI อาจพลาดเด็กที่เสี่ยง อาจพิจารณาให้ครูอัปเดตการมาเรียนให้ครบทุกสัปดาห์',
      },
    ]
    // จุดที่แย่ที่สุดขึ้นก่อน — ผอ. อ่านแค่บนสุดก็รู้ว่าต้องดูอะไร
    const w: Record<Tone, number> = { bad: 0, even: 1, good: 2 }
    return list.sort((a, b) => w[a.tone] - w[b.tone])
  })()

  // ── AI สรุป: ดีตรงไหน · ติดตรงไหน · สาเหตุ · ทำอะไรก่อน ──
  const good = metrics.filter((m) => m.tone === 'good')
  const bad = metrics.filter((m) => m.tone === 'bad')
  const verdict =
    !bad.length
      ? 'ผลการดำเนินงานอยู่ในเกณฑ์ดี — ทุกตัวชี้วัดใกล้หรือดีกว่าโรงเรียนนำร่อง'
      : `${good.length ? `${good.map((m) => m.short).join(' · ')} ดีกว่าค่าเฉลี่ย แต่ ` : ''}${bad.map((m) => m.short).join(' · ')} ยังสู้โรงเรียนนำร่องไม่ได้`
  const cause = topOwner
    ? `สิ่งที่ AI เห็น: เคสเกิน SLA ${breach.length} เคส ${concentrated ? `กระจุกอยู่ที่ ${topOwner} ${breachTop![1]} เคส — น่าจะเป็นเรื่องภาระงานของคนคนเดียว ไม่ใช่ทั้งทีม` : `มากที่สุดอยู่กับ ${topOwner} ${breachTop![1]} เคส${jams[0] ? ` และส่วนใหญ่ค้างเพราะ${BOTTLENECK_TH[jams[0].key]} (${jams[0].n} เคส)` : ''}`}${spreadTo && topOwner === load.insight?.owner ? ` · อาจพิจารณากระจายบางเคสให้ ${spreadTo}` : ''}`
    : jams[0]
      ? `สิ่งที่ AI เห็น: เคสค้างเพราะ${BOTTLENECK_TH[jams[0].key]} ${jams[0].n} เคส`
      : undefined
  const primary = topOwner
    ? { label: `ดูเคสของ ${topOwner}`, go: () => nav(`/decisions?owner=${encodeURIComponent(topOwner)}`) }
    : jams[0]
      ? { label: `ดูเคสที่ค้างเพราะ${BOTTLENECK_TH[jams[0].key]}`, go: () => nav(`/decisions?focus=${jams[0].key}`) }
      : s.needsResources && !asked
        ? { label: 'ขอสนับสนุนทรัพยากรจากเขต', go: () => setAsking(true) }
        : undefined

  // ── AI ร่างเหตุผลขอทรัพยากร จากตัวเลขจริง ──
  const draft = [
    `${s.name} ขอรับการสนับสนุนทรัพยากรเพื่อช่วยเหลือนักเรียนกลุ่มเสี่ยง`,
    `• เคสที่ติดตามในระบบ ${open.length} เคส เกิน SLA ${breach.length} เคส${topOwner ? ` (${breachTop![1]} เคสอยู่กับ ${topOwner})` : ''}`,
    ...bad.map((m) => `• ${m.th} ${m.value}${m.unit} ${m.words?.[1] ?? 'ต่ำกว่าค่าเฉลี่ย'}โรงเรียนนำร่อง (${m.avg}${m.unit}) · อันดับ ${m.rank} จาก ${n}`),
    ...(jams[0] ? [`• สาเหตุที่เคสค้างมากที่สุด: ${BOTTLENECK_TH[jams[0].key]} ${jams[0].n} เคส`] : []),
    'สิ่งที่ขอ: บุคลากรช่วยติดตามเคส (เช่น ครูแนะแนวหรือนักจิตวิทยาเพิ่ม 1 คน) และงบเยี่ยมบ้าน',
  ].join('\n')
  const [text, setText] = useState('')

  if (loading || 'error' in built)
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )

  const Section = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
    <section className="rounded-2xl border border-surface-border bg-white p-4 sm:p-5">
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      {sub && <p className="mt-0.5 text-[13.5px] text-ink-muted">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )

  return (
    <div className="animate-page-rise pb-24">
      <PageHeader
        icon={<IconSchool width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.school')]} />}
        title="ผลการดำเนินงานโรงเรียน"
        subtitle="AI อ่านตัวเลขให้ — ดีตรงไหน ติดตรงไหน เพราะอะไร และ ผอ. อาจพิจารณาอะไรก่อน"
      />

      {/* ── AI สรุป ─────────────────────────────────────── */}
      <div className="mb-5 rounded-3xl border-2 border-brand-200 bg-gradient-to-b from-brand-50/80 to-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <img src={MASCOT} alt="" className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-card" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">AI สรุปผลการดำเนินงาน · {s.name}</p>
            <p className="mt-0.5 text-[17px] font-semibold leading-snug text-ink">{verdict}</p>
            {cause && <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink">{cause}</p>}
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{week.summary}</p>
          </div>
        </div>
        {primary && (
          <button
            type="button"
            onClick={primary.go}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600 sm:w-auto"
          >
            {primary.label} <span aria-hidden>→</span>
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* ── ตัวชี้วัด + คำอ่านของ AI ── */}
        <Section title="ตัวชี้วัดทั้งโรงเรียน — AI อ่านให้" sub={`เทียบโรงเรียนนำร่อง ${n} แห่ง · เรียงจากจุดที่ควรดูก่อน`}>
          <ul className="space-y-3">
            {metrics.map((m) => {
              const max = Math.max(m.value, m.avg) * 1.15 || 1
              return (
                <li key={m.key} className="rounded-xl border border-surface-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-[15px] font-bold text-ink">{m.th}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${TONE_PILL[m.tone]}`}>
                      {m.tone === 'good' ? (m.words?.[0] ?? 'ดีกว่าค่าเฉลี่ย') : m.tone === 'bad' ? (m.words?.[1] ?? 'ต่ำกว่าค่าเฉลี่ย') : 'ใกล้ค่าเฉลี่ย'} · อันดับ {m.rank}/{n}
                    </span>
                  </div>
                  <div className="mt-2 flex items-end gap-3">
                    <span className="text-[28px] font-bold leading-none tabular text-ink">
                      {m.value}
                      <span className="text-[15px] font-semibold text-ink-muted">{m.unit}</span>
                    </span>
                    <span className="pb-0.5 text-[13.5px] text-ink-muted">
                      ค่าเฉลี่ยนำร่อง {m.avg}
                      {m.unit}
                      {!m.higherBetter && ' (น้อยกว่าดีกว่า)'}
                    </span>
                  </div>
                  {/* แถบเทียบ: แถบสี = โรงเรียนนี้ · ขีดดำ = ค่าเฉลี่ย */}
                  <div className="relative mt-2 h-2.5 rounded-full bg-surface-muted" aria-hidden>
                    <span className={`absolute inset-y-0 left-0 rounded-full ${TONE_BAR[m.tone]}`} style={{ width: `${(m.value / max) * 100}%` }} />
                    <span className="absolute -top-1 w-0.5 bg-ink" style={{ left: `${(m.avg / max) * 100}%`, height: 18 }} />
                  </div>
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50/60 px-3 py-2.5 text-[14.5px] leading-snug text-ink">
                    <span className="shrink-0 font-semibold text-brand-700">AI:</span>
                    <span>{m.read}</span>
                  </p>
                  {m.action && (
                    <button type="button" onClick={m.action.go} className="mt-2 text-[14.5px] font-semibold text-brand-700 underline-offset-2 hover:underline">
                      {m.action.label} →
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>

        {/* ── สัปดาห์นี้เทียบสัปดาห์ก่อน (เคสในระบบ) ── */}
        <Section title="สัปดาห์นี้เทียบสัปดาห์ก่อน" sub="จากเคสที่ติดตามในระบบ — ตัวเลขเดียวกับหน้าเรื่องที่ต้องตัดสินใจ">
          <ul className="divide-y divide-surface-border">
            {week.rows.map((r) => {
              const diff = r.now - r.before
              const better = diff === 0 ? null : (diff > 0) === (r.better === 'up')
              return (
                <li key={r.th} className="flex items-center gap-3 py-2.5 text-[15px]">
                  <span className="min-w-0 flex-1 text-ink">{r.th}</span>
                  <span className="tabular text-ink-muted">
                    {r.before}
                    {r.unit} →
                  </span>
                  <span className="w-14 text-right font-bold tabular text-ink">
                    {r.now}
                    {r.unit}
                  </span>
                  <span className={`w-24 shrink-0 text-right text-[13.5px] font-semibold ${better === null ? 'text-ink-muted' : better ? 'text-green-700' : 'text-red-700'}`}>
                    {better === null ? 'เท่าเดิม' : `${better ? 'ดีขึ้น' : 'แย่ลง'} ${Math.abs(diff)}${r.unit ?? ''}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>

        {/* ── อะไรทำให้เคสค้าง ── */}
        {jams.length > 0 && (
          <Section title="อะไรทำให้เคสค้าง" sub="AI จัดกลุ่มเคสที่เกิน SLA หรือไม่ขยับ 5 วันขึ้นไป ตามสาเหตุ — กดเพื่อดูรายชื่อ">
            <ul className="space-y-2">
              {jams.map((j) => (
                <li key={j.key}>
                  <button type="button" onClick={() => nav(`/decisions?focus=${j.key}`)} className="group flex w-full items-center gap-3 rounded-xl border border-surface-border px-4 py-3 text-left hover:border-brand-300">
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{BOTTLENECK_TH[j.key]}</span>
                    <span className="h-2.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-muted sm:w-40" aria-hidden>
                      <span className="block h-full rounded-full bg-orange-500" style={{ width: `${(j.n / Math.max(1, jams[0].n)) * 100}%` }} />
                    </span>
                    <span className="w-14 shrink-0 text-right text-[15px] font-bold tabular text-ink">{j.n} เคส</span>
                    <span aria-hidden className="shrink-0 text-ink-faint group-hover:text-brand-600">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── ผลลัพธ์ของเด็ก ── */}
        <Section title="ผลลัพธ์ของเด็ก" sub="นับผลที่เกิดกับเด็ก ไม่ใช่จำนวนครั้งที่ลงมือ">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: 'ความเสี่ยงลดลงชัดเจน', v: out.riskDown, tone: 'text-green-700' },
              { k: 'มาเรียนสม่ำเสมอ (≥80%)', v: out.attending, tone: 'text-green-700' },
              { k: 'ปิดเคสสำเร็จ', v: out.closed, tone: 'text-green-700' },
              { k: 'ปิดแล้วกลับมาเสี่ยง', v: out.relapse, tone: out.relapse ? 'text-red-700' : 'text-ink' },
            ].map((x) => (
              <div key={x.k} className="rounded-xl bg-surface-muted/60 p-3.5">
                <dt className="text-[13.5px] text-ink-muted">{x.k}</dt>
                <dd className={`mt-1 text-[24px] font-bold leading-none tabular ${x.tone}`}>{x.v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* ── ขอสนับสนุนทรัพยากร ── */}
        {s.needsResources && (
          <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold text-ink">{asked ? 'ส่งคำขอทรัพยากรไปที่เขตแล้ว' : 'โรงเรียนนี้ถูกระบุว่าต้องการทรัพยากรเพิ่ม'}</p>
              <p className="mt-0.5 text-[14px] text-ink-muted">{asked ? 'เขตจะเห็นเหตุผลพร้อมตัวเลขที่ AI ร่างให้' : 'AI ร่างเหตุผลจากตัวเลขของโรงเรียนให้แล้ว — ผอ. แก้ได้ก่อนส่ง'}</p>
            </div>
            {!asked && (
              <button
                type="button"
                onClick={() => {
                  setText(draft)
                  setAsking(true)
                }}
                className="shrink-0 rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600"
              >
                ขอสนับสนุนทรัพยากร
              </button>
            )}
          </section>
        )}

        <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
          <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
              ข้อมูลโรงเรียนจากรายงานประจำภาค
            </span>
          </summary>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
            {[
              { k: 'นักเรียนทั้งหมด', v: s.totalStudents.toLocaleString('th-TH') },
              { k: 'เด็กเสี่ยงสูง (ทั้งโรงเรียน)', v: `${s.highRiskStudents} (${round1((s.highRiskStudents / Math.max(1, s.totalStudents)) * 100)}%)` },
              { k: 'เคสในรายงาน', v: `${s.openCases} · เกินกำหนด ${s.overdueCases}` },
              { k: 'เคสที่ติดตามในระบบ', v: `${open.length} · เกิน SLA ${breach.length}` },
            ].map((x) => (
              <div key={x.k}>
                <dt className="text-[12.5px] text-ink-muted">{x.k}</dt>
                <dd className="font-semibold text-ink">{x.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[13px] text-ink-muted">ตัวเลขในรายงานนับทั้งโรงเรียน ส่วนหน้าอื่นนับเฉพาะเคสที่ครูติดตามในระบบ จึงไม่เท่ากัน</p>
          <button type="button" onClick={onFullView} className={`${btnSecondary} mt-3`}>
            เปิดหน้าเดิม (ส่งออก CSV)
          </button>
        </details>
      </div>

      {asking && (
        <Drawer label="ขอสนับสนุนทรัพยากร" head={<p className="text-[19px] font-bold text-ink">ขอสนับสนุนทรัพยากรจากเขต</p>} onClose={() => setAsking(false)}>
          <p className="text-[14px] text-ink-muted">AI ร่างจากตัวเลขของโรงเรียน — ผอ. แก้ได้ทุกบรรทัด</p>
          <Label>เหตุผลที่ส่งถึงเขต</Label>
          <textarea id="res-why" value={text || draft} onChange={(e) => setText(e.target.value)} rows={9} className={textareaCls} />
          <div className="mt-5">
            <PrimaryBtn
              disabled={(text || draft).trim().length < 10}
              onClick={() => {
                setAsked(true)
                setAsking(false)
                push(`ส่งคำขอสนับสนุนทรัพยากรของ ${s.name} ไปยังเขตพื้นที่แล้ว`)
              }}
            >
              ส่งคำขอไปที่เขต
            </PrimaryBtn>
          </div>
        </Drawer>
      )}
    </div>
  )
}
