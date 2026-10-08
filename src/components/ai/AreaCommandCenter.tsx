import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { ESA_BY_KEY } from '@/data/esa'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import { SIGNAL_LABEL } from '@/lib/decision'
import { HEALTH_METRICS, PIPELINE, buildAreaOps, urgentStudents } from '@/lib/areaOps'
import { aiErrorMessage, buildSystemPrompt, localAnswer, streamAnswer } from '@/lib/ai'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconAI, IconArrowRight, IconDown, IconUp } from '@/components/icons'

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[12px] font-semibold text-ink-muted">{children}</p>
}

/**
 * The dashboard a สพท. account gets instead of the executive briefing.
 *
 * The difference is the job, not the styling. An สพฐ. seat is deciding policy
 * across three provinces, so its panel leads with trend and forecast. An area
 * office owns the caseload, so this one leads with **who is unassigned, what is
 * overdue and whether last term's work moved anything** — the questions asked
 * on a Monday morning.
 *
 * There is deliberately no map here. `/geo` already drills เขต → อำเภอ →
 * โรงเรียน → นักเรียน with layers and filters; a second map on the dashboard
 * was the duplication we just removed from this product.
 */
export function AreaCommandCenter() {
  const { lang, t, pick, dn, pn } = useI18n()
  const th = lang === 'th'
  const nav = useNavigate()
  const { user, districts, schools, students, cases, oosc, plans, stats } = useScopedData()

  const ops = useMemo(
    () =>
      buildAreaOps({
        scopeKey: `${user?.esaKey ?? user?.provinceKey ?? 'area'}-${user?.role ?? 'esa'}`,
        districts,
        schools,
        students,
        cases,
        oosc,
        plans,
        stats,
      }),
    [districts, schools, students, cases, oosc, plans, stats, user],
  )

  const areaName = user?.esaKey && ESA_BY_KEY[user.esaKey] ? pick(ESA_BY_KEY[user.esaKey]) : null
  const queue = useMemo(() => urgentStudents(students), [students])

  const go = (to: string) => {
    if (!user || canAccess(user, to)) nav(to)
  }

  // ── the narrated brief ────────────────────────────────────
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'streaming' | 'live' | 'local'>('streaming')
  const ran = useRef(false)

  const localText = useMemo(() => {
    const worstSchool = ops.schoolRisk[0]
    const worstDistrict = ops.districts[0]
    return th
      ? `เด็กกลุ่มเสี่ยง ${formatNumber(ops.atRisk, lang)} คน จากนักเรียน ${formatNumber(ops.students, lang)} คน ในโรงเรียน ${formatNumber(ops.schools, lang)} แห่ง\nเคสที่ยังไม่มีเจ้าของ ${formatNumber(ops.unassigned, lang)} เคส · เกินกำหนด ${formatNumber(ops.overdue, lang)} เคส${worstSchool ? ` · โรงเรียนที่ต้องดูก่อนคือ ${worstSchool.school.name} (${worstSchool.rate.toFixed(1)}%)` : ''}${worstDistrict ? ` · อำเภอที่ต้องเร่งคือ ${dn(worstDistrict.district.key)}` : ''}`
      : `${formatNumber(ops.atRisk, lang)} at-risk children among ${formatNumber(ops.students, lang)} students across ${formatNumber(ops.schools, lang)} schools.\n${formatNumber(ops.unassigned, lang)} cases have no owner and ${formatNumber(ops.overdue, lang)} are overdue${worstSchool ? `. Start with ${worstSchool.school.name} (${worstSchool.rate.toFixed(1)}%)` : ''}${worstDistrict ? `, district ${dn(worstDistrict.district.key)}` : ''}.`
  }, [ops, dn, lang, th])

  const run = async () => {
    setText('')
    setMode('streaming')
    const facts = `schools ${ops.schools} · students ${ops.students} · at-risk ${ops.atRisk} · out of school ${ops.outOfSchool} · unassigned cases ${ops.unassigned} · overdue ${ops.overdue}`
    try {
      let out = ''
      for await (const chunk of streamAnswer({
        system: buildSystemPrompt(user, lang),
        history: [
          {
            role: 'user',
            text: th
              ? `สรุปสถานการณ์ให้ผู้อำนวยการเขตพื้นที่ 2 บรรทัดสั้น เน้นงานที่ต้องลงมือ ห้ามขึ้นต้นด้วยคำนำ ใช้เฉพาะตัวเลขเหล่านี้: ${facts}`
              : `Brief an area director in two short lines, focused on what needs doing, no preamble, using only these figures: ${facts}`,
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
        console.warn('[area] fell back to the computed brief:', aiErrorMessage(err, th))
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
    ? ['โรงเรียนไหนเสี่ยงที่สุดในเขต', 'นักเรียนคนไหนต้องติดตามด่วน', 'อำเภอไหนต้องได้รับการช่วยเหลือ', 'เคสค้างมีกี่เคส']
    : [
        'Which school is at highest risk?',
        'Which students need urgent follow-up?',
        'Which district needs support?',
        'How many cases are overdue?',
      ]

  const kpis = [
    { label: th ? 'โรงเรียนในเขต' : 'Schools', value: ops.schools, tone: '#0f2a6b', to: '/school' },
    { label: th ? 'นักเรียนทั้งหมด' : 'Students', value: ops.students, tone: '#0f2a6b' },
    { label: th ? 'เด็กกลุ่มเสี่ยง' : 'At risk', value: ops.atRisk, tone: RISK_COLOR.high, to: '/student' },
    { label: th ? 'ยังอยู่นอกระบบ' : 'Still out', value: ops.outOfSchool, tone: RISK_COLOR.critical, to: '/oosc' },
    { label: th ? 'เคสที่ยังไม่ปิด' : 'Open cases', value: ops.activeCases, tone: RISK_COLOR.watch, to: '/intervention' },
    { label: th ? 'ปิดเคสสำเร็จ' : 'Closed', value: ops.successRate, tone: RISK_COLOR.normal, pct: true },
  ]

  const maxStage = Math.max(...PIPELINE.map((p) => ops.pipeline[p.key]), 1)

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-4 overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card"
    >
      {/* ── header ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-surface-border px-5 py-3.5">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center">
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
            {th ? 'ศูนย์ปฏิบัติการเขตพื้นที่การศึกษา' : 'Area operations centre'}
          </h2>
          <p className="text-[12px] text-ink-faint">
            {th
              ? `ติดตาม วิเคราะห์ และช่วยเหลือนักเรียนในพื้นที่รับผิดชอบ${areaName ? ` · ${areaName}` : ''}`
              : `Track, analyse and support the children in your area${areaName ? ` · ${areaName}` : ''}`}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-ink-faint">
          {mode === 'streaming'
            ? th
              ? 'กำลังวิเคราะห์…'
              : 'Analysing…'
            : mode === 'local'
              ? th
                ? 'คำนวณจากข้อมูลในระบบ'
                : 'Computed'
              : th
                ? 'วิเคราะห์ด้วย AI'
                : 'AI'}
        </span>
      </div>

      {/* ── brief + KPI ───────────────────────────────────── */}
      <div className="px-5 pt-4">
        {text ? (
          <p className="max-w-3xl text-[16px] leading-relaxed text-ink-muted">
            {text.split('\n').map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </p>
        ) : (
          <div className="max-w-3xl space-y-2" aria-live="polite">
            <Skeleton className="h-5 w-10/12" />
            <Skeleton className="h-5 w-8/12" />
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-surface-border py-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => k.to && go(k.to)}
              disabled={!k.to}
              className="text-left disabled:cursor-default"
            >
              <p className="text-[12px] text-ink-faint">{k.label}</p>
              <p className="text-[24px] font-bold leading-none tabular" style={{ color: k.tone }}>
                <AnimatedCounter
                  value={k.value}
                  decimals={k.pct ? 1 : 0}
                  suffix={k.pct ? '%' : ''}
                />
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── the caseload pipeline ─────────────────────────── */}
      <div className="px-5 pt-4">
        <SectionLabel>
          {th ? 'สถานะการช่วยเหลือนักเรียน' : 'Where the caseload stands'}
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {PIPELINE.map((p, i) => {
            const n = ops.pipeline[p.key]
            const tone =
              p.key === 'unassigned'
                ? RISK_COLOR.critical
                : p.key === 'assigned'
                  ? RISK_COLOR.watch
                  : p.key === 'working'
                    ? '#2f66f6'
                    : RISK_COLOR.normal
            return (
              <motion.button
                key={p.key}
                type="button"
                onClick={() => go(p.to)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.3 }}
                whileHover={{ y: -2 }}
                className="rounded-xl border border-surface-border p-3.5 text-left transition-shadow hover:shadow-card"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-[12px] font-semibold text-ink">{th ? p.th : p.en}</p>
                  <span className="shrink-0 text-[10px] text-ink-faint">{i + 1}/4</span>
                </div>
                <p className="mt-1 text-[26px] font-bold leading-none tabular" style={{ color: tone }}>
                  <AnimatedCounter value={n} />
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / maxStage) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.2 + i * 0.08 }}
                    className="h-full rounded-full"
                    style={{ background: tone }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
                  {th ? p.hintTh : p.hintEn}
                </p>
              </motion.button>
            )
          })}
        </div>
        {ops.overdue > 0 && (
          <p className="mt-2 text-[12px] text-ink-muted">
            {th ? 'ในจำนวนนี้เกินกำหนด SLA ' : 'Of these, overdue against SLA: '}
            <span className="font-bold" style={{ color: RISK_COLOR.critical }}>
              {formatNumber(ops.overdue, lang)}
            </span>{' '}
            {th ? 'เคส' : 'cases'}
          </p>
        )}
      </div>

      {/* ── schools · districts · students to work today ──── */}
      <div className="grid grid-cols-1 gap-4 px-5 pt-5 lg:grid-cols-3">
        <div>
          <SectionLabel>{th ? 'โรงเรียนที่ต้องติดตาม' : 'Schools to follow up'}</SectionLabel>
          <ul className="space-y-1.5">
            {ops.schoolRisk.slice(0, 5).map((s, i) => (
              <li key={s.school.id}>
                <button
                  type="button"
                  onClick={() => go(`/school?s=${s.school.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-surface-border px-2.5 py-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span
                    className="grid h-7 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                    style={{ background: RISK_COLOR[s.level] }}
                  >
                    {s.rate.toFixed(0)}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink">
                      {i + 1}. {s.school.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {dn(s.school.districtKey)} · {th ? 'เสี่ยงสูง' : 'at risk'}{' '}
                      {formatNumber(s.atRisk, lang)} · {th ? 'เคสค้าง' : 'overdue'}{' '}
                      {formatNumber(s.overdue, lang)}
                    </span>
                  </span>
                  <IconArrowRight width={13} height={13} className="shrink-0 text-ink-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <SectionLabel>{th ? 'อำเภอที่ต้องเร่งช่วย' : 'Districts needing support'}</SectionLabel>
          <ul className="space-y-1.5">
            {ops.districts.slice(0, 5).map((r, i) => (
              <li key={r.district.key}>
                <button
                  type="button"
                  onClick={() => go(`/area?p=${r.district.provinceKey}&d=${r.district.key}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-surface-border px-2.5 py-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span
                    className="grid h-7 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                    style={{
                      background:
                        r.score >= 70
                          ? RISK_COLOR.critical
                          : r.score >= 50
                            ? RISK_COLOR.high
                            : RISK_COLOR.watch,
                    }}
                  >
                    {r.score.toFixed(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink">
                      {i + 1}. {dn(r.district.key)}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {pn(r.district.provinceKey)} ·{' '}
                      {th ? SIGNAL_LABEL[r.lead.key].th : SIGNAL_LABEL[r.lead.key].en}
                    </span>
                  </span>
                  <IconArrowRight width={13} height={13} className="shrink-0 text-ink-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <SectionLabel>{th ? 'นักเรียนที่ต้องติดตามด่วน' : 'Students to follow up'}</SectionLabel>
          <ul className="space-y-1.5">
            {queue.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(`/student?id=${s.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-surface-border px-2.5 py-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span
                    className="grid h-7 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                    style={{ background: RISK_COLOR[s.riskLevel] }}
                  >
                    {s.riskScore}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink">
                      {s.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {s.id} · {dn(s.districtKey)} · {th ? 'ผู้ดูแล ' : 'owner '}
                      {s.caseOwner}
                    </span>
                  </span>
                  <IconArrowRight width={13} height={13} className="shrink-0 text-ink-faint" />
                </button>
              </li>
            ))}
            {!queue.length && (
              <li className="rounded-lg border border-surface-border px-2.5 py-3 text-[12px] text-ink-faint">
                {th ? 'ไม่มีนักเรียนเสี่ยงสูงในเขตนี้' : 'No high-risk students in this area'}
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* ── the quarter's plan, assembled from real ratios ── */}
      <div className="px-5 pt-5">
        <SectionLabel>{th ? 'แผนดำเนินงานพื้นที่ ไตรมาสนี้' : 'This quarter’s area plan'}</SectionLabel>
        <div className="rounded-xl border border-surface-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] font-semibold text-ink">
              {th
                ? 'ปิดช่องว่างแผนช่วยเหลือรายบุคคลให้ครบทุกเด็กในทะเบียน'
                : 'Close the individual-plan gap for every child in the registry'}
            </p>
            <p className="text-[12px] text-ink-faint">
              {th ? 'เป้าหมาย' : 'Target'}{' '}
              <span className="font-bold text-ink">{ops.plan.targetPct}%</span>
            </p>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ops.plan.progressPct)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{
                  background:
                    ops.plan.progressPct >= ops.plan.targetPct
                      ? RISK_COLOR.normal
                      : ops.plan.progressPct >= 60
                        ? RISK_COLOR.watch
                        : RISK_COLOR.high,
                }}
              />
            </div>
            <span className="shrink-0 text-[20px] font-bold leading-none tabular text-ink">
              {ops.plan.progressPct.toFixed(1)}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">
            {th
              ? `เด็ก ${formatNumber(ops.plan.planned, lang)} คนจาก ${formatNumber(ops.plan.known, lang)} คนในทะเบียนมีแผนแล้ว — ความคืบหน้าคือสัดส่วนนี้ ไม่ใช่ค่าที่กรอกเอง`
              : `${formatNumber(ops.plan.planned, lang)} of ${formatNumber(ops.plan.known, lang)} registry children have a plan — progress is that ratio, not a typed-in figure.`}
          </p>

          <ul className="mt-3 space-y-1.5 border-t border-surface-border pt-3">
            {ops.plan.steps.map((st, i) => {
              const pct = st.total ? (st.done / st.total) * 100 : 0
              const met = pct >= 100
              return (
                <motion.li
                  key={st.key}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
                >
                  <button
                    type="button"
                    onClick={() => go(st.to)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-50/50"
                  >
                    <span
                      className="grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] font-bold text-white"
                      style={{ background: met ? RISK_COLOR.normal : '#cbd5e1' }}
                    >
                      {met ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                      {th ? st.th : st.en}
                    </span>
                    <span className="shrink-0 text-[12px] font-bold tabular text-ink-muted">
                      {formatNumber(st.done, lang)}
                      <span className="font-normal text-ink-faint">
                        /{formatNumber(st.total, lang)}
                      </span>
                    </span>
                    <IconArrowRight width={12} height={12} className="shrink-0 text-ink-faint" />
                  </button>
                </motion.li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* ── how each school is holding up ─────────────────── */}
      <div className="px-5 pt-5">
        <SectionLabel>
          {th ? 'สุขภาพการดำเนินงานรายโรงเรียน' : 'School operating health'}
        </SectionLabel>
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-surface-border text-[11px] text-ink-faint">
                <th className="px-3 py-2 font-medium">{th ? 'โรงเรียน' : 'School'}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {th ? 'คะแนนรวม' : 'Score'}
                </th>
                {HEALTH_METRICS.map((m) => (
                  <th key={m.key} className="px-3 py-2 text-right font-medium">
                    {th ? m.th : m.en}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">
                  {th ? 'จุดที่อ่อนสุด' : 'Weakest'}
                </th>
              </tr>
            </thead>
            <tbody>
              {ops.health.map((h, i) => {
                const tone =
                  h.score >= 75
                    ? RISK_COLOR.normal
                    : h.score >= 60
                      ? RISK_COLOR.watch
                      : h.score >= 45
                        ? RISK_COLOR.high
                        : RISK_COLOR.critical
                return (
                  <motion.tr
                    key={h.school.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                    onClick={() => go(`/school?s=${h.school.id}`)}
                    className="cursor-pointer border-b border-surface-border last:border-0 transition-colors hover:bg-brand-50/40"
                  >
                    <td className="px-3 py-2.5">
                      <p className="truncate text-[12px] font-semibold text-ink">
                        {h.school.name}
                      </p>
                      <p className="truncate text-[11px] text-ink-faint">
                        {dn(h.school.districtKey)} · {formatNumber(h.school.totalStudents, lang)}{' '}
                        {th ? 'คน' : 'students'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className="inline-block rounded-md px-2 py-0.5 text-[13px] font-bold tabular text-white"
                        style={{ background: tone }}
                      >
                        {h.score.toFixed(0)}
                      </span>
                      <span className="ml-0.5 text-[10px] text-ink-faint">/100</span>
                    </td>
                    {HEALTH_METRICS.map((m) => (
                      <td key={m.key} className="px-3 py-2.5 text-right">
                        <span className="text-[12px] font-semibold tabular text-ink-muted">
                          {h.parts[m.key].toFixed(0)}
                        </span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-muted">
                          <motion.span
                            initial={{ width: 0 }}
                            animate={{ width: `${h.parts[m.key]}%` }}
                            transition={{ duration: 0.6, delay: 0.15 + i * 0.05 }}
                            className="block h-full rounded-full"
                            style={{ background: h.weakest === m.key ? RISK_COLOR.critical : '#94a3b8' }}
                          />
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right text-[11px] font-medium" style={{ color: RISK_COLOR.critical }}>
                      {th
                        ? HEALTH_METRICS.find((m) => m.key === h.weakest)?.th
                        : HEALTH_METRICS.find((m) => m.key === h.weakest)?.en}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
          {th
            ? 'คะแนนรวมถ่วงน้ำหนัก คุมความเสี่ยง 30% · ตอบสนอง 25% · ช่วยสำเร็จ 30% · คุณภาพข้อมูล 15% — คำนวณจากฟิลด์ที่มีในระเบียนโรงเรียน ไม่ใช่คะแนนประเมินจากต้นสังกัด'
            : 'Weighted: risk control 30%, response 25%, success 30%, data quality 15% — computed from fields on the school record, not an official assessment score.'}
        </p>
      </div>

      {/* ── did last term move anything ───────────────────── */}
      <div className="px-5 pt-5">
        <SectionLabel>{th ? 'ความคืบหน้า 6 เดือน' : 'Six-month progress'}</SectionLabel>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-surface-border px-4 py-3">
          <div>
            <p className="text-[11px] text-ink-faint">{th ? 'เด็กเสี่ยง 6 เดือนก่อน' : 'At risk, 6 months ago'}</p>
            <p className="text-[22px] font-bold leading-none tabular text-ink-muted">
              {formatNumber(ops.progress.before, lang)}
            </p>
          </div>
          <IconArrowRight width={16} height={16} className="text-ink-faint" />
          <div>
            <p className="text-[11px] text-ink-faint">{th ? 'ปัจจุบัน' : 'Today'}</p>
            <p className="text-[22px] font-bold leading-none tabular text-ink">
              {formatNumber(ops.progress.now, lang)}
            </p>
          </div>
          <div
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-bold"
            style={{
              background: ops.progress.changePct <= 0 ? '#dcfce7' : '#fee2e2',
              color: ops.progress.changePct <= 0 ? '#15803d' : '#b91c1c',
            }}
          >
            {ops.progress.changePct <= 0 ? (
              <IconDown width={13} height={13} />
            ) : (
              <IconUp width={13} height={13} />
            )}
            {Math.abs(ops.progress.changePct).toFixed(1)}%
          </div>
          <p className="text-[11px] leading-snug text-ink-faint">
            {th
              ? 'เทียบจากชุดแนวโน้มจำลองของเขตนี้ ไม่ใช่สถิติย้อนหลังจริง'
              : 'Compared against this area’s simulated trend series, not real history'}
          </p>
        </div>
      </div>

      {/* ── ask ───────────────────────────────────────────── */}
      <div className="mt-5 border-t border-surface-border bg-surface-muted px-5 py-3.5">
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
            placeholder={th ? 'ถามเกี่ยวกับพื้นที่ที่คุณรับผิดชอบ…' : 'Ask about your area…'}
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
  )
}
