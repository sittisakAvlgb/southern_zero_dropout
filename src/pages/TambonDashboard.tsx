import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Tambon } from '@/types'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { KPICard } from '@/components/ui/KPICard'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { DISTRICT_BY_KEY as DISTRICT_GEO } from '@/data/geo'
import { formatNumber, formatPct } from '@/lib/format'
import { oosSplit } from '@/lib/oos'
import { RISK_COLOR } from '@/lib/risk'
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconEye,
  IconShield,
  IconTambon,
  IconUsers,
} from '@/components/icons'

function coverageLevel(v: number) {
  if (v < 40) return 'critical' as const
  if (v < 55) return 'high' as const
  if (v < 70) return 'watch' as const
  return 'normal' as const
}

export default function TambonDashboard() {
  const { t, lang, pn, dn, tn } = useI18n()
  const th = lang === 'th'
  const { tambons, oosc, students, user } = useScopedData()
  const { push } = useToast()

  // /tambon?t=<key> arrives with that tambon already open, filters included
  const [params] = useSearchParams()
  const seededTambon = useMemo(() => {
    const key = params.get('t')
    return key ? tambons.find((x) => x.key === key) : undefined
  }, [params, tambons])
  const [province, setProvince] = useState(seededTambon?.provinceKey ?? 'all')
  const [district, setDistrict] = useState(seededTambon?.districtKey ?? 'all')
  const [selected, setSelected] = useState<string | null>(seededTambon?.key ?? null)

  const provinceOptions = useMemo(() => {
    const keys = Array.from(new Set(tambons.map((x) => x.provinceKey)))
    return [
      { value: 'all', label: t('geo.allProvinces') },
      ...keys.map((k) => ({ value: k, label: pn(k) })),
    ]
  }, [tambons, pn, t])

  const districtOptions = useMemo(() => {
    const keys = Array.from(
      new Set(
        tambons
          .filter((x) => province === 'all' || x.provinceKey === province)
          .map((x) => x.districtKey),
      ),
    )
    return [
      { value: 'all', label: t('geo.allDistricts') },
      ...keys.map((k) => ({ value: k, label: dn(k) })),
    ]
  }, [tambons, province, dn, t])

  const inScope = useMemo(
    () =>
      tambons.filter(
        (x) =>
          (province === 'all' || x.provinceKey === province) &&
          (district === 'all' || x.districtKey === district),
      ),
    [tambons, province, district],
  )

  useEffect(() => {
    if (!inScope.length) setSelected(null)
    else if (!inScope.some((x) => x.key === selected)) {
      // default to the tambon that needs help most, not the first alphabetically
      const worst = [...inScope].sort((a, b) => a.planCoverage - b.planCoverage)[0]
      setSelected(worst.key)
    }
  }, [inScope, selected])

  const current: Tambon | null = inScope.find((x) => x.key === selected) ?? inScope[0] ?? null

  /** the shared out-of-school split for this tambon */
  const tambonOos = useMemo(
    () =>
      oosSplit(
        current ?? { oosCount: 0, reengagedCount: 0, outcomeCount: 0 },
      ),
    [current],
  )

  const siblings = useMemo(
    () =>
      current
        ? tambons
            .filter((x) => x.districtKey === current.districtKey)
            .map((x) => ({
              key: x.key,
              name: tn(x.key),
              coverage: x.planCoverage,
              oos: x.oosCount,
              isCurrent: x.key === current.key,
            }))
            .sort((a, b) => a.coverage - b.coverage)
        : [],
    [tambons, current, tn],
  )

  const coldSpots = useMemo(
    () => [...inScope].sort((a, b) => a.planCoverage - b.planCoverage).slice(0, 6),
    [inScope],
  )

  const childrenHere = useMemo(() => {
    if (!current) return { oos: [], atRisk: [] }
    return {
      oos: oosc.filter((r) => r.tambonKey === current.key).slice(0, 8),
      atRisk: students.filter((s) => s.tambonKey === current.key).slice(0, 8),
    }
  }, [current, oosc, students])

  const staleCount = inScope.filter((x) => x.lastSurveyDaysAgo > 90).length
  const noCommittee = inScope.filter((x) => !x.hasChildProtectionCommittee).length

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconTambon width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.tambon')]} />}
        title={t('tambon.title')}
        subtitle={t('tambon.subtitle')}
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          label={t('geo.province')}
          value={province}
          onChange={(v) => {
            setProvince(v)
            setDistrict('all')
          }}
          options={provinceOptions}
        />
        <Select label={t('geo.district')} value={district} onChange={setDistrict} options={districtOptions} />
        <Select
          label={t('tambon.select')}
          value={current?.key ?? ''}
          onChange={setSelected}
          options={inScope.map((x) => ({
            value: x.key,
            label: `${tn(x.key)} — ${formatPct(x.planCoverage, 0)}`,
          }))}
        />
      </div>

      {current ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-ink">{tn(current.key)}</h2>
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-muted">
              {dn(current.districtKey)} · {pn(current.provinceKey)}
            </span>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">
              {t(`kind.${DISTRICT_GEO[current.districtKey]?.kind ?? 'rural'}`)}
            </span>
            {current.hasChildProtectionCommittee ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-risk-normal/10 px-2.5 py-1 text-xs text-risk-normal">
                <IconShield width={12} height={12} />
                {t('tambon.committee')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                <IconAlert width={12} height={12} />
                {t('tambon.noCommittee')}
              </span>
            )}
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KPICard index={0} label={t('tambon.childrenHere')} value={current.totalStudents} icon={<IconUsers width={18} height={18} />} />
            <KPICard index={1} label={t('kpi.highrisk')} value={current.highRiskStudents} level="high" icon={<IconAlert width={18} height={18} />} />
            {/* the known group, then how many of it came back — not two rival totals */}
            <KPICard index={2} label={t('kpi.oosKnown')} value={tambonOos.known} level="critical" icon={<IconEye width={18} height={18} />} />
            {/* not deltaPct — that slot is labelled "จากเดือนก่อน", and this is a
                share of the known group, not a month-over-month change */}
            <KPICard index={3} label={t('kpi.outcome')} value={tambonOos.succeeded} level="normal" icon={<IconCheck width={18} height={18} />} />
            <KPICard index={4} label={t('tambon.coverage')} value={current.planCoverage} decimals={1} suffix="%" level={coverageLevel(current.planCoverage)} icon={<IconShield width={18} height={18} />} />
            <KPICard index={5} label={t('tambon.volunteers')} value={current.volunteers} icon={<IconUsers width={18} height={18} />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Comparison inside the district */}
            <Card className="lg:col-span-2">
              <CardHeader title={t('tambon.compare')} subtitle={t('tambon.coverageHint')} />
              <div className="px-3 pb-4 pt-2">
                <ResponsiveContainer width="100%" height={Math.max(220, siblings.length * 26)}>
                  <BarChart data={siblings} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 10, fill: '#5b6b82' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#f6f8fc' }}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e6ebf3', fontSize: 12 }}
                      formatter={(v: number) => [formatPct(v), t('tambon.coverage')]}
                    />
                    <Bar dataKey="coverage" radius={[0, 6, 6, 0]} barSize={13}>
                      {siblings.map((s) => (
                        <Cell
                          key={s.key}
                          fill={RISK_COLOR[coverageLevel(s.coverage)]}
                          fillOpacity={s.isCurrent ? 1 : 0.42}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="px-2 text-[11px] leading-relaxed text-ink-faint">
                  {th
                    ? 'แถบทึบคือตำบลที่กำลังดูอยู่ ตำบลข้างเคียงในอำเภอเดียวกันมักมีบริบทใกล้กัน — ช่องว่างจึงเป็นเรื่องการจัดการ ไม่ใช่โชคชะตา'
                    : 'The solid bar is the tambon you are viewing. Neighbours share the same context, so a gap here is a management gap, not fate.'}
                </p>
              </div>
            </Card>

            {/* Field readiness */}
            <Card>
              <CardHeader
                title={th ? 'ความพร้อมของพื้นที่' : 'Field readiness'}
                subtitle={th ? 'คนและกลไกที่มีอยู่จริงในตำบล' : 'The people and machinery actually present'}
              />
              <div className="space-y-3 px-5 pb-5 pt-3">
                <div className="rounded-xl border border-surface-border px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">{t('tambon.lastSurvey')}</span>
                    <span
                      className={`tabular text-sm font-semibold ${
                        current.lastSurveyDaysAgo > 90 ? 'text-risk-critical' : 'text-ink'
                      }`}
                    >
                      {current.lastSurveyDaysAgo} {t('tambon.daysAgo')}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (current.lastSurveyDaysAgo / 180) * 100)}%`,
                        background: current.lastSurveyDaysAgo > 90 ? '#dc2626' : '#16a34a',
                      }}
                    />
                  </div>
                  {current.lastSurveyDaysAgo > 90 && (
                    <p className="mt-2 text-[11px] text-risk-critical">
                      {th
                        ? 'ข้อมูลเด็กนอกระบบในตำบลนี้อาจล้าสมัย ควรจัดรอบสำรวจใหม่'
                        : 'The out-of-school picture here is likely stale — schedule a new sweep.'}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-surface-border px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">{t('tambon.volunteers')}</span>
                    <span className="tabular text-sm font-semibold text-ink">{current.volunteers}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-faint">
                    {th
                      ? `ประมาณ 1 คน ต่อเด็กนอกระบบ ${Math.max(1, Math.round(current.oosCount / Math.max(1, current.volunteers)))} คน`
                      : `About one volunteer per ${Math.max(1, Math.round(current.oosCount / Math.max(1, current.volunteers)))} out-of-school children`}
                  </div>
                </div>

                <div className="rounded-xl bg-surface-muted px-3.5 py-3">
                  <div className="text-xs text-ink-muted">{t('tambon.coverage')}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="tabular text-2xl font-bold text-ink">
                      {formatPct(current.planCoverage)}
                    </span>
                    <span className="text-[11px] text-ink-faint">
                      {formatNumber(current.reengagedCount)} / {formatNumber(current.reengagedCount + current.oosCount)}
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    push(
                      th
                        ? `จัดรอบสำรวจเชิงรุกในตำบล${tn(current.key)}แล้ว`
                        : `Active search scheduled for ${tn(current.key)}`,
                    )
                  }
                >
                  {th ? 'จัดรอบสำรวจเชิงรุก' : 'Schedule an active search'}
                </Button>
              </div>
            </Card>
          </div>

          {/* Children in this tambon */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title={th ? 'เด็กนอกระบบในตำบลนี้' : 'Out-of-school children here'}
                subtitle={t('common.restricted')}
              />
              <div className="space-y-1.5 px-3 pb-4 pt-2">
                {childrenHere.oos.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{r.name}</div>
                      <div className="text-[11px] text-ink-faint">
                        {r.ageYears} {th ? 'ปี' : 'yrs'} · {t(`source.${r.source}`)} ·{' '}
                        {r.yearsOut.toFixed(1)} {t('oosc.years')}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: r.planId ? '#16a34a18' : '#dc262618',
                        color: r.planId ? '#16a34a' : '#dc2626',
                      }}
                    >
                      {r.planId ? t('plan.title') : t('oosc.noPlan')}
                    </span>
                  </div>
                ))}
                {!childrenHere.oos.length && (
                  <p className="px-3 py-6 text-center text-sm text-ink-faint">{t('common.noData')}</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title={th ? 'เด็กในระบบที่ต้องเฝ้าระวัง' : 'At-risk children still in school'}
                subtitle={th ? 'ป้องกันไม่ให้กลายเป็นเด็กนอกระบบรายต่อไป' : 'Preventing the next entry in the registry'}
              />
              <div className="space-y-1.5 px-3 pb-4 pt-2">
                {childrenHere.atRisk.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                      <div className="text-[11px] text-ink-faint">
                        {t(`grade.${s.gradeKey}`)} · {th ? 'ขาดเรียนต่อเนื่อง' : 'absent'}{' '}
                        {s.absenceStreak} {th ? 'วัน' : 'days'}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: `${RISK_COLOR[s.riskLevel]}18`,
                        color: RISK_COLOR[s.riskLevel],
                      }}
                    >
                      {t(`risk.${s.riskLevel}`)}
                    </span>
                  </div>
                ))}
                {!childrenHere.atRisk.length && (
                  <p className="px-3 py-6 text-center text-sm text-ink-faint">{t('common.noData')}</p>
                )}
              </div>
            </Card>
          </div>

          {/* Cold spots across the scope */}
          <Card className="mt-4">
            <CardHeader
              title={t('tambon.coldSpots')}
              subtitle={t('tambon.coldSpotsHint')}
              action={
                <div className="flex gap-2 text-[11px]">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    {t('tambon.staleSurvey')}: {staleCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                    {t('tambon.noCommittee')}: {noCommittee}
                  </span>
                </div>
              }
            />
            <div className="grid gap-2 px-5 pb-5 pt-3 sm:grid-cols-2 lg:grid-cols-3">
              {coldSpots.map((x, i) => (
                <motion.button
                  key={x.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => {
                    setProvince(x.provinceKey)
                    setDistrict(x.districtKey)
                    setSelected(x.key)
                  }}
                  className="rounded-xl border border-surface-border px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium text-ink">{tn(x.key)}</span>
                    <span
                      className="tabular shrink-0 text-xs font-semibold"
                      style={{ color: RISK_COLOR[coverageLevel(x.planCoverage)] }}
                    >
                      {formatPct(x.planCoverage, 0)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-faint">
                    {dn(x.districtKey)} · {t('kpi.stillOut')} {formatNumber(x.oosCount)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-faint">
                    <IconClock width={10} height={10} />
                    {t('tambon.lastSurvey')} {x.lastSurveyDaysAgo} {t('tambon.daysAgo')}
                  </div>
                </motion.button>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <div className="grid h-64 place-items-center text-sm text-ink-faint">
            {t('common.noData')}
          </div>
        </Card>
      )}

      {user?.provinceKey && (
        <p className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-xs text-teal-800">
          {th
            ? 'ตำบลคือหน่วยที่เล็กที่สุดที่ยังเห็นเด็กเป็นรายคน — ตัวเลขทุกยอดในระดับอำเภอและจังหวัดคือผลรวมของหน้านี้ สิ่งที่ท้องถิ่นบันทึกจึงเปลี่ยนภาพรวมได้จริง'
            : 'The tambon is the smallest unit that still sees children one by one — every district and province figure is a sum of this page, so what is recorded locally moves the whole picture.'}
        </p>
      )}
    </div>
  )
}
