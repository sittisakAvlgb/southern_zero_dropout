import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Select } from '@/components/ui/Select'
import { TypingText } from '@/components/ui/TypingText'
import { SkeletonKpi, SkeletonCard } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useSimulatedLoading } from '@/lib/useLoading'
import { useI18n } from '@/i18n/LanguageContext'
import { REASON_GROUP, isDropCause, reasonFor, type ReasonGroup } from '@/data/dropReasons'
import { formatNumber, formatPct, makeRng, hashSeed } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import type { CauseKey } from '@/types'
import { useScopedData } from '@/auth/scope'
import { atRiskOf, byDistrict, causeMix, stillOutOf } from '@/lib/causeOps'
import { ownerOfCause } from '@/data/dropReasons'
import { ESA_BY_KEY } from '@/data/esa'
import { ScopeBanner } from '@/components/auth/ScopeBanner'
import {
  IconCause,
  IconExport,
  IconAI,
  IconSparkle,
} from '@/components/icons'

// Brand-forward palette for categorical slices/series
const PALETTE = [
  '#2f66f6',
  '#0f2a6b',
  '#f97316',
  '#16a34a',
  '#eab308',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
]
const OTHER_COLOR = '#cbd5e1'
const GRID = '#eef2f8'

/** The four bands `intensityColor` puts each bar into — spelled out so the
 *  colours on the ranking chart are readable rather than decorative. */
const TIERS = [
  { key: 'critical' as const, th: 'สาเหตุนำ', en: 'Leading driver' },
  { key: 'high' as const, th: 'สาเหตุหลัก', en: 'Major driver' },
  { key: 'watch' as const, th: 'สาเหตุรอง', en: 'Secondary' },
  { key: 'normal' as const, th: 'พบประปราย', en: 'Occasional' },
]

/** Concern color for a bar based on its share relative to the leader. */
function intensityColor(ratio: number): string {
  if (ratio > 0.85) return RISK_COLOR.critical
  if (ratio > 0.62) return RISK_COLOR.high
  if (ratio > 0.38) return RISK_COLOR.watch
  return RISK_COLOR.normal
}

export default function CauseAnalysis() {
  const { t, lang, pn, dn, pick } = useI18n()
  const th = lang === 'th'
  const toast = useToast()
  const loading = useSimulatedLoading(600)
  const [provinceKey, setProvinceKey] = useState<string>('all')

  const { provinces: scopedProvinces, students, oosc, user } = useScopedData()

  // The scope is three border provinces, all in one region — so the filter and
  // the comparison chart work at province level. A region filter here offered
  // "all" and "south", which are the same set.
  const scopeProvinces = useMemo(
    () =>
      provinceKey === 'all'
        ? scopedProvinces
        : scopedProvinces.filter((p) => p.key === provinceKey),
    [provinceKey, scopedProvinces],
  )

  /** สัดส่วนสาเหตุคิดจาก `causeKeys` ของเด็กที่อยู่ในขอบเขตบัญชีนี้จริง ไม่ใช่
   *  `Province.topCauses` ที่เป็นค่าระดับจังหวัด — เขตเคยเห็นสัดส่วนของทั้ง
   *  ปัตตานีอยู่ข้างจำนวนเด็กเสี่ยงสูงของเขตเอง (ดูหมายเหตุใน lib/causeOps.ts)
   *  ตัวกรองจังหวัดยังกรองเด็กตามจังหวัดเหมือนเดิม */
  const inScope = useMemo(() => {
    const keys = new Set(scopeProvinces.map((p) => p.key))
    return {
      students: students.filter((s) => keys.has(s.provinceKey)),
      oosc: oosc.filter((r) => keys.has(r.provinceKey)),
    }
  }, [scopeProvinces, students, oosc])
  const mix = useMemo(() => causeMix(inScope.students, inScope.oosc), [inScope])
  const dist = mix.dist

  const totalHighRisk = useMemo(
    () => scopeProvinces.reduce((s, p) => s + p.highRiskStudents, 0),
    [scopeProvinces],
  )

  const maxShare = dist.length ? dist[0].value : 1

  /** how concentrated the problem is — five causes out of eighteen */
  const topFiveShare = useMemo(
    () => dist.slice(0, 5).reduce((s, c) => s + c.value, 0),
    [dist],
  )

  // Donut: the eight named drivers plus the diffuse tail
  const pieData = useMemo(() => {
    const top8 = dist.slice(0, 8).map((c) => ({
      key: c.key as string,
      name: t(`cause.${c.key}`),
      value: c.value,
    }))
    const otherVal = dist.slice(8).reduce((s, c) => s + c.value, 0)
    if (otherVal > 0.05) {
      top8.push({
        key: 'other',
        name: th ? 'อื่นๆ' : 'Other',
        value: Math.round(otherVal * 10) / 10,
      })
    }
    return top8
  }, [dist, t, th])

  // Ranking: all 12 causes desc
  const rankingData = useMemo(
    () =>
      dist.map((c) => {
        const r = reasonFor(c.key)
        return {
          key: c.key,
          name: t(`cause.${c.key}`),
          value: c.value,
          // รหัสจริงจากตาราง สพฐ. ใช้ตอน export และตอนเทียบกับรายงานราชการ
          code: r?.id,
          official: r?.th,
        }
      }),
    [dist, t],
  )

  /** สาเหตุรวมตามกลุ่มรหัส สพฐ. — คำถามเปลี่ยนจาก "สาเหตุไหนเยอะที่สุด"
   *  เป็น "หน่วยงานไหนต้องรับไปแก้มากที่สุด" ซึ่งเป็นคำถามที่สั่งงานได้
   *
   *  รหัสหลักแรกในตาราง สพฐ. บอกเจ้าภาพอยู่แล้ว (3xx = พมจ./ท้องถิ่น ฯลฯ)
   *  การรวมจึงไม่ใช่การตีความของเรา แต่เป็นโครงสร้างของตารางเอง */
  const byOwner = useMemo(() => {
    const sum = new Map<ReasonGroup, number>()
    for (const c of dist) {
      const r = reasonFor(c.key)
      if (!r || !isDropCause(r)) continue
      sum.set(r.group, (sum.get(r.group) ?? 0) + c.value)
    }
    const total = [...sum.values()].reduce((a, b) => a + b, 0) || 1
    return [...sum.entries()]
      .map(([group, value]) => ({
        group,
        value,
        share: (value / total) * 100,
        label: REASON_GROUP[group].th,
        owner: REASON_GROUP[group].ownerTh,
      }))
      .sort((a, b) => b.value - a.value)
  }, [dist])

  /** เทียบรายอำเภอ ไม่ใช่รายจังหวัด
   *
   *  เขตมีจังหวัดเดียว กราฟ "เปรียบเทียบรายจังหวัด" จึงมีแท่งเดียวให้เทียบ และ
   *  ค่าของมันมาจาก `causeDistributionFor()` ระดับจังหวัด ซึ่งขัดกับกราฟจัด
   *  อันดับด้านบนที่ตอนนี้คิดจากเด็กจริง — เลขชุดเดียวกันสองค่าบนหน้าเดียว
   *  อำเภอคือหน่วยที่เขตลงไปหนุนได้จริง และนับจากชุดเดียวกับทั้งหน้า */
  const top4 = useMemo(() => dist.slice(0, 4).map((c) => c.key), [dist])
  const byAreaData = useMemo(() => {
    const rows = [...atRiskOf(inScope.students), ...stillOutOf(inScope.oosc)]
    const acc = new Map<string, { total: number; counts: Record<string, number> }>()
    for (const r of rows) {
      const k = r.causeKeys[0]
      if (!k) continue
      const e = acc.get(r.districtKey) ?? { total: 0, counts: {} }
      e.total++
      e.counts[k] = (e.counts[k] ?? 0) + 1
      acc.set(r.districtKey, e)
    }
    return [...acc.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([key, e]) => {
        const row: Record<string, string | number> = { area: dn(key) }
        for (const k of top4) row[k] = Math.round(((e.counts[k] ?? 0) / Math.max(1, e.total)) * 1000) / 10
        return row
      })
  }, [inScope, top4, dn])

  /** "ทั้ง 3 จังหวัด" is only a real choice for an account without a territory.
   *  Offering it to a เขต or province seat promised data the scope filter was
   *  always going to withhold — a control that cannot do what it says. */
  const provinceOptions = [
    ...(user?.provinceKey ? [] : [{ value: 'all', label: th ? 'ทั้ง 3 จังหวัด' : 'All 3 provinces' }]),
    ...scopedProvinces.map((p) => ({ value: p.key, label: pn(p.key) })),
  ]

  const lead = dist[0]

  /** ขอบเขตของบัญชีนี้ตามชื่อจริง — เขตเคยอ่านว่า "ในพื้นที่นำร่อง 3 จังหวัด"
   *  ทั้งที่ดูอยู่ 4 อำเภอของเขตเดียว ซึ่งเป็นบั๊กแบบเดียวกับ "ทั้งประเทศ /
   *  77 จังหวัด" ที่ CLAUDE.md สั่งให้ไล่เก็บ */
  const scopeTh = useMemo(() => {
    if (provinceKey !== 'all') return `ใน${pn(provinceKey)}`
    if (user?.esaKey && ESA_BY_KEY[user.esaKey]) return `ใน${pick(ESA_BY_KEY[user.esaKey])}`
    if (user?.provinceKey) return `ใน${pn(user.provinceKey)}`
    return 'ในพื้นที่นำร่อง 3 จังหวัด'
  }, [provinceKey, user, pn, pick])
  const scopeEn = provinceKey !== 'all' ? `in ${pn(provinceKey)}` : user?.provinceKey ? `in ${pn(user.provinceKey)}` : 'across the three pilot provinces'

  /** สาเหตุนำกระจุกอยู่อำเภอไหน และใครเป็นเจ้าภาพแก้ — สองอย่างนี้คือสิ่งที่
   *  ทำให้บรรทัดนี้ใช้ตัดสินใจได้ แทนที่จะบอกแค่ว่าสาเหตุอันดับ 1 คืออะไร */
  const leadWhere = useMemo(
    () => (lead ? byDistrict(lead.key, inScope.students, inScope.oosc).slice(0, 2) : []),
    [lead, inScope],
  )
  const leadOwner = lead ? ownerOfCause(lead.key) : undefined

  const aiText =
    lead === undefined
      ? ''
      : lang === 'th'
        ? `สาเหตุหลักอันดับ 1 คือ “${t(`cause.${lead.key}`)}” ${formatPct(lead.value)} ของเด็ก ${formatNumber(mix.base.total, lang)} คน${scopeTh}` +
          (leadWhere.length
            ? ` · กระจุกที่อำเภอ${leadWhere.map((w) => `${dn(w.districtKey)} ${w.n} คน`).join(' และ ')}`
            : '') +
          (leadOwner ? ` · เจ้าภาพหลักของสาเหตุกลุ่มนี้คือ${leadOwner}` : '') +
          ' — อาจพิจารณาเริ่มจากอำเภอที่กระจุกมากที่สุด'
        : `The leading primary cause is “${t(`cause.${lead.key}`)}” — ${formatPct(lead.value)} of ${formatNumber(mix.base.total, lang)} children ${scopeEn}` +
          (leadWhere.length ? `, concentrated in ${leadWhere.map((w) => `${dn(w.districtKey)} (${w.n})`).join(' and ')}` : '') +
          '.'

  const pctTooltip = (v: number | string) => formatPct(Number(v))

  return (
    <div>
      <ScopeBanner />
      <PageHeader
        title={t('cause.title')}
        subtitle={t('cause.sub')}
        icon={<IconCause />}
        actions={
          <Button
            variant="secondary"
            icon={<IconExport width={16} height={16} />}
            onClick={() => toast.push(t('toast.exported'))}
          >
            {t('common.export')}
          </Button>
        }
      />

      {/* Province filter */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {provinceOptions.map((o) => {
            const on = provinceKey === o.value
            return (
              <motion.button
                key={o.value}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setProvinceKey(o.value)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                    : 'border-surface-border bg-white text-ink-muted hover:border-brand-300'
                }`}
              >
                {o.label}
              </motion.button>
            )
          })}
        </div>
        <span className="text-[11px] font-medium text-ink-faint">
          {formatNumber(scopeProvinces.length, lang)} {t('common.province')} ·{' '}
          {t('cause.shareOfCases')}
        </span>
      </div>

      {/* Top-3 drivers, on one panel with the population they came from —
          separate tiles with accent bars gave four things equal weight and no
          way to compare the three shares. */}
      <Card className="mt-4">
        <div className="grid divide-y divide-surface-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <p className="text-xs font-medium text-ink-muted">
              {th ? 'เด็กที่ใช้คิดสัดส่วนสาเหตุ' : 'Children behind every share'}
            </p>
            <p
              className="tabular mt-1 text-[32px] font-bold leading-none"
              style={{ color: RISK_COLOR.high }}
            >
              <AnimatedCounter value={mix.base.total} />
            </p>
            {/* ตัวหารจริงต้องอยู่บนหน้า ไม่ใช่ให้เดา — เดิมบรรทัดนี้โชว์จำนวน
                เด็กเสี่ยงสูงรวมของพื้นที่ แล้วบอกว่าเป็น "ฐานที่ใช้คิดสัดส่วน
                ด้านขวา" ทั้งที่สัดส่วนมาจากค่าระดับจังหวัดคนละชุด */}
            <p className="mt-2 text-[11px] leading-snug text-ink-faint">
              {th
                ? `เสี่ยงสูงในระบบ ${formatNumber(mix.base.atRisk, lang)} · ยังอยู่นอกระบบ ${formatNumber(mix.base.stillOut, lang)} · นับสาเหตุหลักคนละหนึ่ง`
                : `${formatNumber(mix.base.atRisk, lang)} at risk in school · ${formatNumber(mix.base.stillOut, lang)} still out · one primary cause each`}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-ink-faint">
              {th
                ? `เด็กเสี่ยงสูงทั้งพื้นที่ตามรายงาน ${formatNumber(totalHighRisk, lang)} คน`
                : `${formatNumber(totalHighRisk, lang)} high-risk students reported area-wide`}
            </p>
          </div>

          <div className="p-5 lg:col-span-2">
            <p className="text-xs font-medium text-ink-muted">
              {th ? 'สาเหตุที่พบมากที่สุด 3 อันดับ' : 'Top three drivers'}
            </p>
            <div className="mt-3 space-y-3">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <SkeletonKpi key={i} />)
                : dist.slice(0, 3).map((c, r) => (
                    <motion.div
                      key={c.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + r * 0.08 }}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="tabular w-4 shrink-0 text-[11px] font-bold text-ink-faint">
                            {r + 1}
                          </span>
                          <span className="truncate text-sm font-semibold text-ink">
                            {t(`cause.${c.key}`)}
                          </span>
                        </span>
                        <span
                          className="tabular shrink-0 text-sm font-bold"
                          style={{ color: PALETTE[r] }}
                        >
                          {formatPct(c.value)}
                        </span>
                      </div>
                      {/* all three drawn against the leader, so the gaps are readable */}
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: PALETTE[r] }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(c.value / maxShare) * 100}%` }}
                          transition={{ duration: 0.7, delay: 0.15 + r * 0.08, ease: 'easeOut' }}
                        />
                      </div>
                    </motion.div>
                  ))}
            </div>
          </div>
        </div>
      </Card>

      {/* AI insight strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-4"
      >
        <Card className="overflow-hidden bg-gradient-to-br from-brand-900 to-brand-700 text-white">
          <div className="flex items-start gap-3 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
              <IconAI width={20} height={20} />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <IconSparkle width={15} height={15} /> {t('ai.title')}
              </p>
              {loading ? (
                <p className="mt-1 text-[13px] text-white/70">…</p>
              ) : (
                <TypingText
                  text={aiText}
                  speed={10}
                  className="mt-1 text-[13.5px] leading-relaxed text-white/95"
                />
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Charts */}
      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : dist.length === 0 ? (
        <div className="mt-6 grid place-items-center rounded-2xl border border-surface-border bg-white py-16">
          <p className="text-sm font-medium text-ink-muted">{t('common.empty')}</p>
          <p className="mt-1 text-xs text-ink-faint">{t('common.emptyHint')}</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Donut and ranking sit side by side; the donut card fills whatever
              height the ranking sets, so the pair always lines up. */}
          <div className="lg:col-span-5">
            <ChartCard
              title={t('cause.distribution')}
              delay={0.05}
              subtitle={th ? 'สัดส่วนของกรณีเสี่ยงทั้งหมด' : 'Share of all at-risk cases'}
              fill
            >
              <div className="relative flex min-h-[420px] flex-1 flex-col">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="46%"
                      innerRadius="52%"
                      outerRadius="78%"
                      paddingAngle={2}
                      stroke="none"
                      animationDuration={900}
                    >
                      {pieData.map((d, i) => (
                        <Cell
                          key={d.key}
                          fill={d.key === 'other' ? OTHER_COLOR : PALETTE[i % PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={pctTooltip} />
                    <Legend
                      verticalAlign="bottom"
                      height={64}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* centre figure follows the province filter, like every other number here */}
                <div className="pointer-events-none absolute inset-x-0 top-[42%] -translate-y-1/2 text-center">
                  <p className="tabular text-[24px] font-bold leading-none text-ink">
                    {formatNumber(totalHighRisk, lang)}
                  </p>
                  <p className="mt-1 text-[10.5px] font-medium text-ink-muted">
                    {t('kpi.highrisk')}
                  </p>
                </div>
              </div>
            </ChartCard>
          </div>

          <div className="lg:col-span-7">
          <ChartCard
            title={t('cause.ranking')}
            delay={0.1}
            subtitle={
              th
                ? `5 สาเหตุแรกอธิบาย ${formatPct(topFiveShare)} ของกรณีเสี่ยงทั้งหมด`
                : `The top five drivers account for ${formatPct(topFiveShare)} of all at-risk cases`
            }
            legend={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {TIERS.map((tier) => (
                  <span key={tier.key} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: RISK_COLOR[tier.key] }}
                    />
                    {th ? tier.th : tier.en}
                  </span>
                ))}
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={Math.max(340, rankingData.length * 34)}>
              <BarChart
                data={rankingData}
                layout="vertical"
                margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
                barCategoryGap={4}
              >
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  tick={{ fontSize: 11, fill: '#334155' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={pctTooltip} cursor={{ fill: '#f1f5f9' }} />
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  label={{
                    position: 'right',
                    fontSize: 10,
                    fill: '#475569',
                    formatter: (v: ReactNode) => `${v}%`,
                  }}
                >
                  {rankingData.map((d) => (
                    <Cell key={d.key} fill={intensityColor(d.value / maxShare)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          </div>

          {/* ใครต้องรับไปแก้ — รวมตามกลุ่มรหัส สพฐ. */}
          <div className="lg:col-span-12">
            <ChartCard
              title={th ? 'ใครต้องรับไปแก้' : 'Who has to fix it'}
              delay={0.12}
              subtitle={
                th
                  ? 'รวมสาเหตุตามกลุ่มรหัส สพฐ. — หลักแรกของรหัสบอกหน่วยงานเจ้าภาพอยู่แล้ว'
                  : 'Causes grouped by the official OBEC code families; the first digit names the responsible agency'
              }
            >
              <div className="grid grid-cols-1 gap-2.5 p-1 sm:grid-cols-2 lg:grid-cols-3">
                {byOwner.map((row, i) => (
                  <motion.div
                    key={row.group}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                    className="rounded-xl border border-surface-border p-3.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[14px] font-semibold text-ink">{row.label}</p>
                      <p className="shrink-0 text-[20px] font-bold tabular text-ink">
                        {row.share.toFixed(0)}%
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${row.share}%` }}
                        transition={{ duration: 0.7, delay: 0.1 + 0.05 * i }}
                        className="h-full rounded-full"
                        style={{ background: intensityColor(row.share / (byOwner[0]?.share || 1)) }}
                      />
                    </div>
                    <p className="mt-2 text-[12px] text-ink-muted">
                      {th ? 'เจ้าภาพ: ' : 'Owner: '}
                      <span className="font-medium text-ink">{row.owner}</span>
                    </p>
                  </motion.div>
                ))}
              </div>
              <p className="px-1 pt-2 text-[11px] leading-snug text-ink-faint">
                {th
                  ? 'นับเฉพาะรหัส 1xx–5xx ซึ่งเป็นสาเหตุที่ทำให้เด็กออกจริง — 6xx–8xx เป็นสถานะผลการติดตาม (จบการศึกษา · อยู่ในทะเบียนบ้านกลาง · ไม่ตกหล่น) ไม่ใช่สาเหตุ'
                  : 'Counts codes 1xx–5xx only — 6xx–8xx are follow-up outcomes (completed, central registry, not missing), not reasons for leaving.'}
              </p>
            </ChartCard>
          </div>

          {/* 4. Compare by district — the unit an area office can actually go to */}
          <div className="lg:col-span-12">
          <ChartCard title={th ? 'เปรียบเทียบรายอำเภอ' : 'By district'} delay={0.2} fill>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byAreaData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="area"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <Tooltip formatter={pctTooltip} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {top4.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={t(`cause.${k}`)}
                    fill={PALETTE[i]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          </div>
        </div>
      )}
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  legend,
  delay,
  fill,
  children,
}: {
  title: string
  subtitle?: string
  legend?: ReactNode
  delay: number
  /** stretch to the tallest card in the row instead of hugging its content */
  fill?: boolean
  children: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={fill ? 'h-full' : undefined}
    >
      <Card className={fill ? 'flex h-full flex-col' : undefined}>
        <CardHeader title={title} subtitle={subtitle} action={legend} />
        <div className={`px-2 pb-3 pt-1 ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
          {children}
        </div>
      </Card>
    </motion.div>
  )
}

