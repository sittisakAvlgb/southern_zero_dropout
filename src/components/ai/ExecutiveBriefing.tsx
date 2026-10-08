import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Chart from 'react-apexcharts'
import { useScopedData } from '@/auth/scope'
import { canAccess, canWorkCases } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import { ASSUMPTION, SCENARIOS, SIGNAL_LABEL, forecast as runScenario, type Scenario } from '@/lib/decision'
import { buildBriefing, type Focus } from '@/lib/briefing'
import { aiErrorMessage, buildSystemPrompt, localAnswer, streamAnswer } from '@/lib/ai'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconAI, IconArrowRight, IconClose, IconDown, IconUp } from '@/components/icons'

const MONTHS_TH = ['ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.']
const MONTHS_EN = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
const AHEAD = ['+1', '+2', '+3', '+4', '+5', '+6']

/** Numbers are what an executive scans for, so they are lifted out of the
 *  sentence rather than left to be read word by word. Splitting on the number
 *  pattern keeps this working for the model's prose and the computed fallback
 *  alike — neither has to be written in a special format. */
function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d[\d,]*\.?\d*\s*%?)/g).map((part, i) =>
        /^\d/.test(part) ? (
          <span key={i} className="font-bold text-ink">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[12px] font-semibold text-ink-muted">{children}</p>
  )
}

/**
 * The briefing an executive reads before anything else on the dashboard.
 *
 * Two things this deliberately does not do. It does not print "AI" on every
 * section — the panel is judged on whether the reader can act, not on how
 * often it advertises the model — and it does not state a priority and then
 * repeat the same subject as a separate recommendation. Each focus card carries
 * its own problem, reason and move.
 *
 * Every number comes from `buildBriefing()`; the model is asked only to put the
 * situation into a sentence. When it cannot — no API key, the normal state of
 * the demo — the panel says so and shows the written summary instead of an
 * error where the analysis should be.
 */
export function ExecutiveBriefing() {
  const { lang, t, pn, dn } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const { user, provinces, districts, schools, stats } = useScopedData()

  const brief = useMemo(
    () =>
      buildBriefing({
        scopeKey: `${user?.esaKey ?? user?.provinceKey ?? 'area'}-${user?.role ?? 'exec'}`,
        provinces,
        districts,
        schools,
        stats,
        canWorkCases: canWorkCases(user),
      }),
    [provinces, districts, schools, stats, user],
  )

  const go = (to: string) => {
    if (!user || canAccess(user, to)) nav(to)
  }

  // ── the narrated summary ──────────────────────────────────
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'streaming' | 'live' | 'local'>('streaming')
  const ran = useRef(false)
  const [updatedAt] = useState(() => Date.now())

  const localText = useMemo(() => {
    const a = brief.alert
    const cause = brief.causes[0] ? t(`cause.${brief.causes[0].key}`) : ''
    const dir = brief.trendDelta >= 0
    return th
      ? `เด็กกลุ่มเสี่ยง ${formatNumber(brief.highRisk, lang)} คน จากนักเรียน ${formatNumber(brief.total, lang)} คน (${brief.riskShare.toFixed(1)}%)\n${a ? `หนักที่สุดที่ ${pn(a.provinceKey)} ${a.rate.toFixed(1)}% ` : ''}ปัจจัยหลักคือ${cause} แนวโน้ม 12 เดือน${dir ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(brief.trendDelta).toFixed(1)} จุด`
      : `${formatNumber(brief.highRisk, lang)} children at risk out of ${formatNumber(brief.total, lang)} students (${brief.riskShare.toFixed(1)}%).\n${a ? `${pn(a.provinceKey)} carries the most at ${a.rate.toFixed(1)}%. ` : ''}Leading factor: ${cause}. The 12-month trend is ${dir ? 'up' : 'down'} ${Math.abs(brief.trendDelta).toFixed(1)} points.`
  }, [brief, pn, t, lang, th])

  const run = async () => {
    setText('')
    setMode('streaming')
    const facts = `students ${brief.total} · at-risk ${brief.highRisk} (${brief.riskShare.toFixed(1)}%) · out of school ${brief.dropout} · worst province ${brief.alert ? pn(brief.alert.provinceKey) : '-'} · 12-month trend ${brief.trendDelta >= 0 ? '+' : ''}${brief.trendDelta.toFixed(1)} points`
    try {
      let out = ''
      for await (const chunk of streamAnswer({
        system: buildSystemPrompt(user, lang),
        history: [
          {
            role: 'user',
            text: th
              ? `สรุปให้ผู้บริหารอ่านใน 30 วินาที 2 บรรทัดสั้น ห้ามขึ้นต้นด้วยคำนำ ใช้เฉพาะตัวเลขเหล่านี้: ${facts}`
              : `Summarise for an executive in two short lines, no preamble, using only these figures: ${facts}`,
          },
        ],
      })) {
        out += chunk
        setText(out)
      }
      setMode('live')
    } catch (err) {
      setText(localText)
      setMode('local')
      if ((err as { status?: number })?.status !== 503)
        console.warn('[briefing] fell back to the computed summary:', aiErrorMessage(err, th))
    }
  }

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── ask ───────────────────────────────────────────────────
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState<{ text: string; to?: string; label?: string } | null>(null)
  const [asking, setAsking] = useState(false)

  const ask = async (raw: string) => {
    const question = raw.trim()
    if (!question || asking) return
    setAsking(true)
    setAsked(null)
    const fallback = localAnswer(question, user, lang)
    try {
      let out = ''
      for await (const chunk of streamAnswer({
        system: buildSystemPrompt(user, lang),
        history: [{ role: 'user', text: question }],
      })) {
        out += chunk
        setAsked({ text: out, to: fallback.action?.to, label: fallback.action?.label })
      }
    } catch {
      setAsked({ text: fallback.text, to: fallback.action?.to, label: fallback.action?.label })
    } finally {
      setAsking(false)
    }
  }

  const suggestions = th
    ? ['จังหวัดไหนต้องแก้ไขเร่งด่วน', 'โรงเรียนใดมีความเสี่ยงสูงสุด', 'สาเหตุหลักคืออะไร', 'ควรลงพื้นที่ไหนก่อน']
    : [
        'Which province needs action first?',
        'Which schools are at highest risk?',
        'What are the leading causes?',
        'Where should we go first?',
      ]

  // ── the evidence drawer ───────────────────────────────────
  const [panel, setPanel] = useState(false)
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  const minutesAgo = Math.max(1, Math.round((Date.now() - updatedAt) / 60000))
  const fc = brief.forecast

  // ── scenario simulator ────────────────────────────────────
  // Moved here from its own page: everything else on that page had become a
  // second copy of this panel, and a whole route for one control is a menu
  // entry an executive has to learn for no reason.
  const [scenario, setScenario] = useState<Scenario['key']>('none')
  const baseline = useMemo(() => runScenario(districts, 'none'), [districts])
  const chosen = useMemo(() => runScenario(districts, scenario), [districts, scenario])
  const saved = baseline.projected - chosen.projected

  const focusCard = (f: Focus, i: number) => (
    <motion.div
      key={f.key}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 + i * 0.08, duration: 0.35 }}
      whileHover={{ y: -2 }}
      className="flex flex-col rounded-xl border border-surface-border bg-white p-4 transition-shadow hover:shadow-card"
    >
      <div className="flex items-baseline gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RISK_COLOR[f.level] }} />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
          {th ? f.titleTh : f.titleEn}
        </p>
        <span className="shrink-0 text-[11px] text-ink-faint">
          {th ? 'เร่งด่วน' : 'Urgency'} <span className="font-bold text-ink">{f.score}</span>
        </span>
      </div>

      <p className="mt-2 text-[28px] font-bold leading-none tabular text-ink">
        <AnimatedCounter value={f.value} />
        <span className="ml-1.5 text-[13px] font-medium text-ink-faint">
          {th ? f.unitTh : f.unitEn}
        </span>
      </p>

      <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
        {th ? f.reasonTh : f.reasonEn}
      </p>

      <div className="mt-3 flex-1 border-t border-surface-border pt-2.5">
        <p className="text-[12px] leading-snug text-ink">
          <span className="font-semibold">{th ? 'ควรทำ ' : 'Do '}</span>
          {th ? f.doTh : f.doEn}
        </p>
        {(th ? f.impactTh : f.impactEn) && (
          <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
            {th ? 'ผลที่คาด — ' : 'Estimated effect — '}
            {th ? f.impactTh : f.impactEn}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {f.actions.map((a) => (
          <button
            key={a.to + a.en}
            type="button"
            onClick={() => go(a.to)}
            className={
              a.primary
                ? 'rounded-lg bg-brand-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-600'
                : 'rounded-lg border border-surface-border px-3 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-600'
            }
          >
            {th ? a.th : a.en}
          </button>
        ))}
      </div>
    </motion.div>
  )

  return (
    <>
      {/* plain white, like every other card in the app — the gradient read as a
          consumer AI template rather than a government tool */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-4 overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card"
      >
        {/* ── header ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-border px-5 py-3.5">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center">
            {/* the ring breathes only while the analysis is running, so motion
                here means "working" rather than decoration that never stops */}
            {mode === 'streaming' && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-xl bg-brand-500"
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <IconAI width={18} height={18} />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-ink">
              {th ? 'สรุปสำหรับผู้บริหาร' : 'Executive briefing'}
            </h2>
            <p className="text-[12px] text-ink-faint">
              {th
                ? 'อ่านข้อมูลล่าสุดจากทุกจังหวัด เขตพื้นที่ และโรงเรียนในขอบเขตของคุณ'
                : 'Read across every province, service area and school in your scope'}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-ink-faint">
            {mode === 'streaming'
              ? th
                ? 'กำลังวิเคราะห์…'
                : 'Analysing…'
              : mode === 'local'
                ? th
                  ? `คำนวณจากข้อมูลในระบบ · ${minutesAgo} นาทีที่ผ่านมา`
                  : `Computed · ${minutesAgo} min ago`
                : th
                  ? `วิเคราะห์ด้วย AI · ${minutesAgo} นาทีที่ผ่านมา`
                  : `AI · ${minutesAgo} min ago`}
          </span>
          <button
            type="button"
            onClick={() => setPanel(true)}
            className="shrink-0 rounded-lg border border-surface-border px-2.5 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            {th ? 'ที่มา' : 'Sources'}
          </button>
        </div>

        {/* ── headline + KPI strip ─────────────────────────── */}
        <div className="px-5 pt-4">
          {text ? (
            <p className="max-w-3xl text-[17px] leading-relaxed text-ink-muted">
              {text.split('\n').map((line, i) => (
                <span key={i} className="block">
                  <Highlighted text={line} />
                </span>
              ))}
            </p>
          ) : (
            // shimmer rather than a spinner: it shows the shape of what is
            // coming, so the panel does not visibly jump when the text lands
            <div className="max-w-3xl space-y-2" aria-live="polite">
              <Skeleton className="h-5 w-10/12" />
              <Skeleton className="h-5 w-8/12" />
            </div>
          )}

          {/* items-start, not items-end: two of the four have no note line, and
              bottom-aligning pushed their labels out of the shared row */}
          <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-3 border-y border-surface-border py-3">
            {[
              { label: th ? 'นักเรียนทั้งหมด' : 'Students', value: brief.total, tone: '#0f2a6b' },
              {
                label: th ? 'เด็กกลุ่มเสี่ยง' : 'At risk',
                value: brief.highRisk,
                tone: RISK_COLOR.high,
                note: `${brief.riskShare.toFixed(1)}%`,
                delta: brief.trendDelta,
              },
              // the registry card lower down counts everyone it knows about
              // under a similar name, so this one says which half is meant
              {
                label: th ? 'ยังอยู่นอกระบบ' : 'Still out of school',
                value: brief.dropout,
                tone: RISK_COLOR.critical,
              },
              {
                label: th ? 'ช่วยเหลือสำเร็จ' : 'Success rate',
                value: brief.successRate,
                tone: RISK_COLOR.normal,
                note: th
                  ? `ของทะเบียน ${formatNumber(brief.registry, lang)} คน`
                  : `of ${formatNumber(brief.registry, lang)}`,
                pct: true,
              },
            ].map((k) => (
              <div key={k.label}>
                <p className="text-[12px] text-ink-faint">{k.label}</p>
                <p className="text-[26px] font-bold leading-none tabular" style={{ color: k.tone }}>
                  <AnimatedCounter
                    value={k.value}
                    decimals={k.pct ? 1 : 0}
                    suffix={k.pct ? '%' : ''}
                  />
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
                  {k.delta !== undefined && (
                    <span
                      className="inline-flex items-center font-semibold"
                      style={{ color: k.delta >= 0 ? RISK_COLOR.critical : RISK_COLOR.normal }}
                    >
                      {k.delta >= 0 ? (
                        <IconUp width={10} height={10} />
                      ) : (
                        <IconDown width={10} height={10} />
                      )}
                      {Math.abs(k.delta).toFixed(1)}
                    </span>
                  )}
                  {k.note}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── the three calls ─────────────────────────────── */}
        <div className="px-5 pt-4">
          <SectionLabel>{th ? 'สามเรื่องที่ต้องตัดสินใจ' : 'Three calls to make'}</SectionLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{brief.focuses.map(focusCard)}</div>
        </div>

        {/* ── the quieter half: why, and where it is heading ─ */}
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 pt-5 lg:grid-cols-2">
          <div>
            <SectionLabel>{th ? 'สาเหตุหลัก' : 'Leading causes'}</SectionLabel>
            <div className="space-y-2 rounded-xl border border-surface-border p-4">
              {brief.causes.map((c, i) => (
                <div key={c.key}>
                  <div className="mb-1 flex items-baseline justify-between text-[12px]">
                    <span className="truncate text-ink">{t(`cause.${c.key}`)}</span>
                    <span className="ml-2 shrink-0 font-bold tabular text-ink-muted">
                      {c.share}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${c.share}%` }}
                      transition={{ duration: 0.8, delay: 0.35 + i * 0.09, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{
                        background: [
                          RISK_COLOR.critical,
                          RISK_COLOR.high,
                          RISK_COLOR.watch,
                          '#94a3b8',
                        ][i],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>{th ? 'แนวโน้ม 6 เดือนข้างหน้า' : 'Next six months'}</SectionLabel>
            <div className="rounded-xl border border-surface-border p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span
                  className="text-[26px] font-bold leading-none tabular"
                  style={{ color: fc.changePct >= 0 ? RISK_COLOR.critical : RISK_COLOR.normal }}
                >
                  {fc.changePct >= 0 ? '+' : ''}
                  {fc.changePct.toFixed(1)}%
                </span>
                <span className="text-[12px] text-ink-muted">
                  {th
                    ? `หากไม่มีมาตรการเพิ่มเติม ≈ ${formatNumber(fc.projectedHighRisk, lang)} คน`
                    : `with no new measures ≈ ${formatNumber(fc.projectedHighRisk, lang)} children`}
                </span>
              </div>
              <Chart
                type="line"
                height={116}
                series={[
                  {
                    name: th ? 'ที่ผ่านมา' : 'Observed',
                    data: [...fc.series, ...Array(fc.horizonMonths).fill(null)],
                  },
                  {
                    // repeat the last observed point so the two lines join up
                    name: th ? 'คาดการณ์' : 'Projected',
                    data: [
                      ...Array(fc.series.length - 1).fill(null),
                      fc.series[fc.series.length - 1],
                      ...fc.predicted,
                    ],
                  },
                ]}
                options={{
                  chart: {
                    toolbar: { show: false },
                    animations: { easing: 'easeinout', speed: 800 },
                  },
                  stroke: { curve: 'smooth', width: [2.5, 2.5], dashArray: [0, 5] },
                  colors: ['#0f2a6b', fc.changePct >= 0 ? RISK_COLOR.critical : RISK_COLOR.normal],
                  legend: { show: false },
                  dataLabels: { enabled: false },
                  xaxis: {
                    categories: [...(th ? MONTHS_TH : MONTHS_EN), ...AHEAD],
                    labels: { style: { fontSize: '9px' }, rotate: 0, hideOverlappingLabels: true },
                    tooltip: { enabled: false },
                  },
                  yaxis: {
                    labels: {
                      formatter: (v: number) => `${v.toFixed(0)}%`,
                      style: { fontSize: '10px' },
                    },
                  },
                  grid: { borderColor: '#e2e8f0' },
                  tooltip: {
                    shared: true,
                    y: { formatter: (v: number) => (v == null ? '-' : `${v.toFixed(1)}%`) },
                  },
                }}
              />
              {/* what an executive can do about that line, in the same card */}
              <div className="mt-1 border-t border-surface-border pt-2.5">
                <p className="mb-1.5 text-[12px] font-semibold text-ink">
                  {th ? 'ถ้าลงมือ จะต่างไปเท่าไร' : 'What acting would change'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SCENARIOS.map((sc) => (
                    <button
                      key={sc.key}
                      type="button"
                      onClick={() => setScenario(sc.key)}
                      title={th ? sc.detailTh : sc.detailEn}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        scenario === sc.key
                          ? 'bg-brand-500 text-white'
                          : 'border border-surface-border text-ink-muted hover:border-brand-300 hover:text-brand-600'
                      }`}
                    >
                      {th ? sc.axisTh : sc.axisEn}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-ink-muted">
                  {th ? 'เด็กนอกระบบสิ้นปี ' : 'Out of school at year end '}
                  <span className="font-bold tabular text-ink">
                    {formatNumber(chosen.projected, lang)}
                  </span>
                  {scenario !== 'none' && (
                    <span
                      className="ml-1.5 font-semibold"
                      style={{ color: saved > 0 ? RISK_COLOR.normal : RISK_COLOR.critical }}
                    >
                      {saved > 0 ? '−' : '+'}
                      {formatNumber(Math.abs(saved), lang)}{' '}
                      {th ? 'เทียบกับไม่ทำอะไร' : 'vs doing nothing'}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
                  {th
                    ? `ตั้งสมมติฐานว่าเด็กเสี่ยงสูงหลุดออก ${(ASSUMPTION.dropoutRate * 100).toFixed(0)}% ต่อปี และเด็กที่มีแผนกลับเข้าเรียนสำเร็จ ${(ASSUMPTION.planSuccess * 100).toFixed(0)}% — ค่าสมมติเพื่อสาธิต ต้องแทนด้วยสถิติจริงจาก DMC ก่อนใช้ตัดสินใจ`
                    : `Assumes ${(ASSUMPTION.dropoutRate * 100).toFixed(0)}% of high-risk students fall out per year and ${(ASSUMPTION.planSuccess * 100).toFixed(0)}% of planned children return — demo assumptions, to be replaced with real DMC statistics.`}
                </p>
              </div>

              {/* not a statistical confidence interval — this data cannot carry
                  one, so the panel reports the quality of its own input instead */}
              <p className="text-[11px] leading-snug text-ink-faint">
                {th
                  ? `เส้นประคือการต่อแนวโน้ม 6 เดือนหลัง ไม่ใช่แบบจำลองเชิงสถิติ · คุณภาพข้อมูลนำเข้า ${fc.dataQuality}%`
                  : `The dashed line extends the last six months; it is not a statistical model. Input data quality ${fc.dataQuality}%.`}
              </p>
            </div>
          </div>
        </div>

        {/* ── ask ─────────────────────────────────────────── */}
        <div className="border-t border-surface-border bg-surface-muted px-5 py-3.5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void ask(q)
            }}
            className="flex gap-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                th ? 'ถามเกี่ยวกับสถานการณ์ในขอบเขตของคุณ…' : 'Ask about the situation in your scope…'
              }
              className="min-w-0 flex-1 rounded-xl border border-surface-border bg-white px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
            <button
              type="submit"
              disabled={asking || !q.trim()}
              className="shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {asking ? (th ? 'กำลังคิด…' : 'Thinking…') : th ? 'ถาม' : 'Ask'}
            </button>
          </form>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQ(s)
                  void ask(s)
                }}
                className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-600"
              >
                {s}
              </button>
            ))}
          </div>

          {asked && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 rounded-xl bg-white px-3.5 py-3"
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{asked.text}</p>
              {asked.to && asked.label && (
                <button
                  type="button"
                  onClick={() => go(asked.to!)}
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-600 hover:underline"
                >
                  {asked.label}
                  <IconArrowRight width={13} height={13} />
                </button>
              )}
            </motion.div>
          )}
        </div>
      </motion.section>

      {/* ── evidence drawer ───────────────────────────────── */}
      {panel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setPanel(false)}
            aria-hidden
          />
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
            role="dialog"
            aria-label={th ? 'ที่มาของบทวิเคราะห์' : 'How this was derived'}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-border bg-white px-5 py-3.5">
              <h3 className="text-sm font-bold text-ink">
                {th ? 'ที่มาของบทวิเคราะห์' : 'How this was derived'}
              </h3>
              <button
                type="button"
                onClick={() => setPanel(false)}
                className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-surface-muted"
                aria-label={th ? 'ปิด' : 'Close'}
              >
                <IconClose width={16} height={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4 text-[13px] leading-relaxed">
              <section>
                <h4 className="mb-1 font-bold text-ink">{th ? 'แหล่งข้อมูล' : 'Data source'}</h4>
                <p className="text-ink-muted">
                  {th
                    ? `ข้อมูลจำลองเพื่อสาธิตตามโครงสร้าง TOR — ${formatNumber(provinces.length, lang)} จังหวัด · ${formatNumber(districts.length, lang)} อำเภอ · ${formatNumber(schools.length, lang)} โรงเรียนนำร่อง ทั้งหมดกรองตามสิทธิ์ของบัญชีคุณแล้ว เมื่อเชื่อม DMC จริงจะแทนที่ชุดข้อมูลนี้ได้โดยไม่ต้องแก้หน้าจอ`
                    : `Demo data shaped to the TOR — ${formatNumber(provinces.length, lang)} provinces, ${formatNumber(districts.length, lang)} districts, ${formatNumber(schools.length, lang)} pilot schools, already filtered to your account. Wiring DMC replaces the dataset without touching this screen.`}
                </p>
              </section>

              <section>
                <h4 className="mb-1 font-bold text-ink">{th ? 'วิธีคำนวณ' : 'Calculation'}</h4>
                <ul className="list-disc space-y-1 pl-4 text-ink-muted">
                  <li>
                    {th ? 'สัดส่วนเด็กเสี่ยง' : 'Risk share'} = {formatNumber(brief.highRisk, lang)}{' '}
                    ÷ {formatNumber(brief.total, lang)} = {brief.riskShare.toFixed(1)}%
                  </li>
                  {/* every term the denominator actually contains — a formula
                      that does not produce the number beside it is worse than
                      no formula at all */}
                  <li>
                    {th ? 'อัตราสำเร็จ' : 'Success rate'} = {formatNumber(brief.returned, lang)} ÷ (
                    {formatNumber(brief.dropout, lang)} + {formatNumber(brief.reengaging, lang)} +{' '}
                    {formatNumber(brief.returned, lang)}) = {formatNumber(brief.returned, lang)} ÷{' '}
                    {formatNumber(brief.registry, lang)} = {brief.successRate.toFixed(1)}%
                  </li>
                  <li>
                    {th
                      ? 'สาเหตุหลักถ่วงน้ำหนักด้วยจำนวนเด็กเสี่ยงของแต่ละจังหวัด แล้วปรับสี่อันดับแรกให้รวมเป็น 100%'
                      : 'Causes are weighted by each province at-risk count, then the top four are renormalised to 100%.'}
                  </li>
                  <li>
                    {th
                      ? `คาดการณ์ = ต่อความชันของ 6 เดือนหลังออกไปอีก ${fc.horizonMonths} เดือน (${brief.trend[brief.trend.length - 1].toFixed(1)}% → ${fc.predicted[fc.horizonMonths - 1].toFixed(1)}%) ไม่ได้ใช้ตัวแปรภายนอกใด ๆ`
                      : `Forecast extends the slope of the last six months a further ${fc.horizonMonths} months (${brief.trend[brief.trend.length - 1].toFixed(1)}% → ${fc.predicted[fc.horizonMonths - 1].toFixed(1)}%). No external variables are used.`}
                  </li>
                </ul>
              </section>

              <section>
                <h4 className="mb-1 font-bold text-ink">
                  {th ? 'ข้อจำกัดที่ต้องบอก' : 'Stated limits'}
                </h4>
                <ul className="list-disc space-y-1 pl-4 text-ink-muted">
                  <li>
                    {th
                      ? 'กราฟย้อนหลัง 12 เดือนเป็นข้อมูลจำลองแบบคงที่ต่อพื้นที่ ไม่ใช่สถิติย้อนหลังจริง'
                      : 'The 12-month history is stable mock data per area, not real history.'}
                  </li>
                  <li>
                    {th
                      ? `“คุณภาพข้อมูล ${fc.dataQuality}%” คือค่าเฉลี่ยคะแนนคุณภาพข้อมูลของโรงเรียน ไม่ใช่ระดับความเชื่อมั่นทางสถิติของการคาดการณ์`
                      : `“Data quality ${fc.dataQuality}%” is the mean school data-quality score, not a statistical confidence level for the forecast.`}
                  </li>
                  <li>
                    {th
                      ? 'ระบบยังไม่มีข้อมูลงบประมาณ คำถามเชิงงบจึงตอบได้เฉพาะว่าควรลงพื้นที่ไหนก่อน ไม่ใช่ผลตอบแทนต่อบาท'
                      : 'No budget data is wired in, so budget questions can only answer where to go first, not return per baht.'}
                  </li>
                </ul>
              </section>

              <section>
                <h4 className="mb-1 font-bold text-ink">
                  {th ? 'พื้นที่ที่คาดว่าจะเป็นปัญหา' : 'Risk prediction'}
                </h4>
                <ol className="space-y-1.5">
                  {brief.ranked.slice(0, 5).map((r, i) => (
                    <li key={r.district.key} className="flex items-center gap-2">
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                        style={{
                          background:
                            r.score >= 70
                              ? RISK_COLOR.critical
                              : r.score >= 50
                                ? RISK_COLOR.high
                                : RISK_COLOR.watch,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {dn(r.district.key)}
                        <span className="ml-1 text-ink-faint">
                          · {th ? SIGNAL_LABEL[r.lead.key].th : SIGNAL_LABEL[r.lead.key].en}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold tabular text-ink-muted">
                        {r.score.toFixed(0)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h4 className="mb-1 font-bold text-ink">{th ? 'ข้อเสนอ' : 'Recommendation'}</h4>
                <ol className="list-decimal space-y-1 pl-4 text-ink-muted">
                  {brief.focuses.map((f) => (
                    <li key={f.key}>
                      {th ? `${f.doTh}${f.impactTh ? ` — ${f.impactTh}` : ''}` : `${f.doEn}${f.impactEn ? ` — ${f.impactEn}` : ''}`}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </motion.aside>
        </div>
      )}
    </>
  )
}
