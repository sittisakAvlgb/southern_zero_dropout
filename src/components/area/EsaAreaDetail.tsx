import { useMemo, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { ESA_BY_KEY } from '@/data/esa'
import { formatNumber } from '@/lib/format'
import { oosSplit } from '@/lib/oos'
import { TIER_META, districtViews, schoolViews, type DistrictView, type Tier } from '@/lib/areaDeskOps'
import { SouthernMap } from '@/components/map/SouthernMap'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { IconProvince } from '@/components/icons'

const pct = (n: number) => `${n.toFixed(1)}%`
const TIER_BAR: Record<Tier, string> = { urgent: '#dc2626', follow: '#f97316', watch: '#eab308', ok: '#16a34a' }

function Panel({ title, hint, right, children, className = '' }: { title: string; hint?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 ring-1 ring-surface-border sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[13.5px] text-ink-muted">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** แถบเทียบกับค่าเฉลี่ยเขต — เส้นตั้งสีเข้มคือค่าเฉลี่ย อ่านได้โดยไม่ต้องดูตัวเลข */
function MeterRow({ label, value, avg, max, color, text }: { label: string; value: number; avg?: number; max: number; color: string; text: string }) {
  const w = Math.min(100, (value / Math.max(0.0001, max)) * 100)
  const a = avg !== undefined ? Math.min(100, (avg / Math.max(0.0001, max)) * 100) : undefined
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="text-ink-muted">{label}</span>
        <span className="font-semibold tabular text-ink">{text}</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-surface-muted">
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
        {a !== undefined && <span className="absolute -top-1 h-4 w-[2px] rounded bg-ink/60" style={{ left: `${a}%` }} aria-hidden />}
      </div>
    </div>
  )
}

/**
 * เจาะลึกรายพื้นที่ — มุมมองของเขต (สพท.)
 *
 * หน้าเดิมเริ่มจาก "จังหวัด" (ตัวเลือกปัตตานี) ทั้งที่เขตดูแลแค่ 4 อำเภอ และตอบ "อำเภอไหนก่อน" ด้วย scatter
 * ที่ต้องอ่านแกนสองแกน ที่นี่เริ่มจากเขต: ชิปเลือกอำเภอ · การ์ดอำเภอเทียบค่าเฉลี่ยเขตทีละด้าน · แผนที่ ·
 * โรงเรียน · สาเหตุเทียบค่าเฉลี่ยเขต · ตำบลที่ต้องเร่ง — เลือกอำเภอแล้วทุกส่วนด้านล่างตามไปด้วย
 */
export function EsaAreaDetail({ tabs }: { tabs: ReactNode }) {
  const { t, pn, dn, tn, pick } = useI18n()
  const nav = useNavigate()
  const { user, provinces, districts, tambons, schools, students, cases, oosc } = useScopedData()
  const [params, setParams] = useSearchParams()
  const esa = user?.esaKey ? ESA_BY_KEY[user.esaKey] : undefined
  const sel = districts.find((d) => d.key === params.get('d')) ?? null
  const pickDistrict = (key: string | null) => {
    const next = new URLSearchParams(params)
    if (key) next.set('d', key)
    else next.delete('d')
    setParams(next, { replace: true })
  }

  const views = useMemo(() => schoolViews(schools, cases, students), [schools, cases, students])
  const dviews = useMemo(() => districtViews(districts, views, cases, oosc), [districts, views, cases, oosc])
  const byKey = useMemo(() => new Map(dviews.map((v) => [v.d.key, v])), [dviews])
  const scope = sel ? [sel] : districts

  const totals = useMemo(() => {
    const total = scope.reduce((a, d) => a + d.totalStudents, 0)
    const high = scope.reduce((a, d) => a + d.highRiskStudents, 0)
    const split = oosSplit(scope)
    return { total, high, rate: total ? (high / total) * 100 : 0, split }
  }, [scope])

  // ค่าเฉลี่ยเขต (ถ่วงด้วยจำนวนนักเรียน) — เส้นอ้างอิงของทุกแถบ
  const avg = useMemo(() => {
    const total = districts.reduce((a, d) => a + d.totalStudents, 0) || 1
    return {
      risk: districts.reduce((a, d) => a + d.riskRate * d.totalStudents, 0) / total,
      cover: districts.reduce((a, d) => a + d.planCoverage * d.totalStudents, 0) / total,
      maxRisk: Math.max(...districts.map((d) => d.riskRate), 1) * 1.15,
      maxOverdue: Math.max(...dviews.map((v) => v.overdue), 1),
    }
  }, [districts, dviews])

  const causes = useMemo(() => {
    const esaAvg = new Map<string, number[]>()
    for (const d of districts) for (const c of d.topCauses) esaAvg.set(c.key, [...(esaAvg.get(c.key) ?? []), c.value])
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    if (sel) return sel.topCauses.slice(0, 6).map((c) => ({ key: c.key, value: c.value, avg: mean(esaAvg.get(c.key) ?? []) }))
    return [...esaAvg.entries()]
      .map(([key, xs]) => ({ key, value: mean(xs), avg: undefined as number | undefined }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [districts, sel])
  const causeMax = Math.max(...causes.map((c) => Math.max(c.value, c.avg ?? 0)), 1) * 1.1

  const tambonRows = useMemo(
    () => [...tambons.filter((x) => !sel || x.districtKey === sel.key)].sort((a, b) => a.planCoverage - b.planCoverage).slice(0, 6),
    [tambons, sel],
  )
  const schoolRows = views.filter((v) => !sel || v.s.districtKey === sel.key)
  const ordered = [...dviews].sort((a, b) => TIER_META[a.tier].rank - TIER_META[b.tier].rank)
  const selView: DistrictView | undefined = sel ? byKey.get(sel.key) : undefined
  const province = provinces.find((p) => p.key === (sel?.provinceKey ?? districts[0]?.provinceKey)) ?? provinces[0]

  const stats = [
    { k: 'นักเรียนทั้งหมด', v: totals.total, sub: `${formatNumber(scope.reduce((a, d) => a + d.schools, 0))} สถานศึกษา` },
    { k: 'เด็กเสี่ยงสูง', v: totals.high, sub: `${pct(totals.rate)} ของนักเรียน` },
    { k: 'ยังอยู่นอกระบบ', v: totals.split.stillOut, sub: `จากที่รู้ตัว ${formatNumber(totals.split.known)} คน` },
    { k: 'กลับเข้าเรียน / มีอาชีพ', v: totals.split.succeeded, sub: `${pct(totals.split.successRate)} ของเด็กนอกระบบ` },
  ]

  return (
    <div className="animate-page-rise space-y-5 pb-8">
      {tabs}

      {/* ── หัวหน้า: เขต + ตัวเลขหลัก ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-500 p-5 text-white sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/5" aria-hidden />
        <div className="relative">
          <p className="text-[13.5px] font-medium text-white/85">
            {t('app.areaShort')}
            {province ? ` · ${pn(province.key)}` : ''}
            {sel && esa ? ` · ${pick(esa)}` : ''}
          </p>
          <h1 className="mt-1 text-[24px] font-bold leading-tight sm:text-[28px]">{sel ? `อำเภอ${dn(sel.key)}` : esa ? pick(esa) : 'เขตพื้นที่'}</h1>
          <p className="mt-1 text-[14.5px] text-white/85">
            {sel
              ? `${sel.tambons} ตำบล · ${formatNumber(sel.schools)} สถานศึกษา · ${sel.hasDistrictTeam ? 'มีทีมสหวิชาชีพอำเภอ' : 'ยังไม่มีทีมสหวิชาชีพอำเภอ'}`
              : `${districts.length} อำเภอ · ${tambons.length} ตำบล · ${schools.length} โรงเรียนนำร่อง`}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.k} className="rounded-2xl bg-white/12 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
                <dt className="text-[13.5px] text-white/85">{s.k}</dt>
                <dd className="mt-0.5 text-[26px] font-bold leading-tight tabular">
                  <AnimatedCounter value={s.v} />
                </dd>
                <dd className="text-[13px] text-white/80">{s.sub}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── เลือกอำเภอ ── */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="เลือกอำเภอ">
        {[null, ...ordered.map((v) => v.d.key)].map((k) => {
          const v = k ? byKey.get(k) : undefined
          const on = (sel?.key ?? null) === k
          return (
            <button
              key={k ?? 'all'}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pickDistrict(k)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[14.5px] font-semibold transition-colors ${on ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-surface-border hover:ring-brand-300'}`}
            >
              {v && <span className={`h-2.5 w-2.5 rounded-full ${TIER_META[v.tier].dot}`} aria-hidden />}
              {k ? dn(k) : 'ทั้งเขต'}
            </button>
          )
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        {/* ── อำเภอ: การ์ดเทียบค่าเฉลี่ยเขต หรือรายละเอียดอำเภอที่เลือก ── */}
        <div className="xl:col-span-7">
          {selView ? (
            <Panel title={`ทำไมอำเภอ${dn(selView.d.key)}${selView.tier === 'ok' ? 'อยู่ในเกณฑ์' : 'ต้องได้รับการดูแล'}`} right={<span className={`rounded-full px-3 py-1 text-[13px] font-bold ${TIER_META[selView.tier].pill}`}>{TIER_META[selView.tier].th}</span>}>
              <ul className="space-y-1.5">
                {selView.why.map((w) => (
                  <li key={w} className="flex gap-2 text-[15px] leading-snug text-ink">
                    <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-3.5">
                <MeterRow label="สัดส่วนเด็กเสี่ยงสูง (เส้นตั้ง = ค่าเฉลี่ยเขต)" value={selView.d.riskRate} avg={avg.risk} max={avg.maxRisk} color={TIER_BAR[selView.tier]} text={pct(selView.d.riskRate)} />
                <MeterRow label="เด็กนอกระบบที่มีแผนแล้ว" value={selView.d.planCoverage} avg={avg.cover} max={100} color="#2f66f6" text={pct(selView.d.planCoverage)} />
                <MeterRow label="เคสเกิน SLA" value={selView.overdue} max={avg.maxOverdue} color="#f97316" text={`${selView.overdue} เคส`} />
              </div>
              <p className="mt-4 rounded-xl bg-brand-50/70 px-4 py-3 text-[14.5px] leading-snug text-ink">
                <span className="font-semibold text-brand-700">AI: </span>
                {selView.rec}
              </p>
            </Panel>
          ) : (
            <Panel title="อำเภอในเขต" hint="แถบเทียบกับค่าเฉลี่ยเขต (เส้นตั้ง) · กดการ์ดเพื่อดูอำเภอนั้น">
              <div className="grid gap-3 sm:grid-cols-2">
                {ordered.map((v, i) => (
                  <motion.button
                    key={v.d.key}
                    type="button"
                    onClick={() => pickDistrict(v.d.key)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="group rounded-2xl border border-surface-border p-4 text-left transition-shadow hover:border-brand-300 hover:shadow-card"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[16px] font-bold text-ink">อำเภอ{dn(v.d.key)}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${TIER_META[v.tier].pill}`}>{TIER_META[v.tier].th}</span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      <MeterRow label="เด็กเสี่ยงสูง" value={v.d.riskRate} avg={avg.risk} max={avg.maxRisk} color={TIER_BAR[v.tier]} text={pct(v.d.riskRate)} />
                      <MeterRow label="แผนครอบคลุม" value={v.d.planCoverage} avg={avg.cover} max={100} color="#2f66f6" text={pct(v.d.planCoverage)} />
                    </div>
                    <p className="mt-3 text-[13.5px] text-ink-muted">
                      เกิน SLA {v.overdue} · {v.schools.length} โรงเรียนนำร่อง · {v.d.hasDistrictTeam ? 'มีทีมอำเภอ' : 'ยังไม่มีทีมอำเภอ'}
                    </p>
                  </motion.button>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* ── แผนที่ ── */}
        <div className="xl:col-span-5">
          <Panel title="ตำแหน่งบนแผนที่" hint="กดอำเภอบนแผนที่เพื่อเลือก" className="h-full">
            {province && (
              <SouthernMap
                districts={sel ? [sel] : districts}
                provinces={[province]}
                schools={schools}
                showFilters={false}
                showCard={false}
                selectedKey={sel?.key ?? null}
                initialFocus={province.key}
                onSelect={(d) => pickDistrict(d.key)}
                height={sel ? 360 : 420}
              />
            )}
          </Panel>
        </div>

        {/* ── โรงเรียน ── */}
        <div className="xl:col-span-7">
          <Panel title={sel ? `โรงเรียนนำร่องในอำเภอ${dn(sel.key)}` : 'โรงเรียนนำร่องในเขต'} right={<span className="text-[13.5px] font-semibold text-ink-muted">{schoolRows.length} โรงเรียน</span>}>
            {schoolRows.length === 0 ? (
              <p className="rounded-xl bg-surface-muted/60 px-4 py-4 text-[14.5px] text-ink-muted">ยังไม่มีโรงเรียนนำร่องในอำเภอนี้</p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {schoolRows.map((v) => (
                  <li key={v.s.id}>
                    <button
                      type="button"
                      onClick={() => canAccess(user, '/school') && nav('/school')}
                      className="group flex w-full items-center gap-3 py-3 text-left"
                    >
                      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: TIER_BAR[v.tier] }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-semibold text-ink group-hover:text-brand-700">{v.s.name}</span>
                        <span className="block text-[13.5px] text-ink-muted">
                          อำเภอ{dn(v.s.districtKey)} · เกิน SLA {v.overdue} · {TIER_META[v.tier].th}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[17px] font-bold tabular text-ink">{pct(v.rate)}</span>
                        <span className="block text-[12.5px] text-ink-muted">เด็กเสี่ยงสูง</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── สาเหตุ ── */}
        <div className="xl:col-span-5">
          <Panel title="สาเหตุหลัก" hint={sel ? 'แถบ = อำเภอนี้ · เส้นตั้ง = ค่าเฉลี่ยเขต' : 'ค่าเฉลี่ยของอำเภอในเขต'} className="h-full">
            <div className="space-y-3">
              {causes.map((c) => (
                <MeterRow key={c.key} label={t(`cause.${c.key}`)} value={c.value} avg={c.avg} max={causeMax} color={c.avg !== undefined && c.value > c.avg * 1.1 ? '#f97316' : '#2f66f6'} text={pct(c.value)} />
              ))}
            </div>
          </Panel>
        </div>

        {/* ── ตำบล ── */}
        <div className="xl:col-span-12">
          <Panel title="ตำบลที่ต้องเร่ง" hint="แผนครอบคลุมต่ำ = มีเด็กในทะเบียนที่ยังไม่มีใครดูแล">
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {tambonRows.map((x) => (
                <li key={x.key} className="flex items-center gap-3 border-b border-surface-border py-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                  <IconProvince width={16} height={16} className="shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">ต.{tn(x.key)}</span>
                    <span className="block text-[13px] text-ink-muted">
                      อ.{dn(x.districtKey)} · นอกระบบ {formatNumber(x.oosCount)} · อาสาสมัคร {x.volunteers}
                    </span>
                  </span>
                  <span className="w-24 shrink-0">
                    <span className="block h-2 overflow-hidden rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, x.planCoverage)}%`, background: x.planCoverage < 40 ? '#dc2626' : x.planCoverage < 55 ? '#f97316' : x.planCoverage < 70 ? '#eab308' : '#16a34a' }} />
                    </span>
                    <span className="mt-0.5 block text-right text-[12.5px] tabular text-ink-muted">แผน {x.planCoverage.toFixed(0)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
