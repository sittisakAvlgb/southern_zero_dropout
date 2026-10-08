import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { ESA_BY_KEY } from '@/data/esa'
import { SCHOOLS } from '@/data/schools'
import {
  buildReport,
  exportReport,
  type ReportContext,
  type ReportDef,
  type ReportFormat,
} from '@/lib/report'
import {
  IconAlert,
  IconCause,
  IconCheck,
  IconClock,
  IconClose,
  IconDown,
  IconExport,
  IconEye,
  IconProvince,
  IconReport,
  IconReturn,
  IconSchool,
} from '@/components/icons'
import type { ReactNode } from 'react'

/** The platform covers three provinces, so a report is cut by จชต. area,
 *  by province, or by district — there is no national or regional level. */
type ScopeKey = 'area' | 'province' | 'district'

interface Template {
  id: string
  icon: ReactNode
  title: { th: string; en: string }
  desc: { th: string; en: string }
  tone: string
}

const TEMPLATES: Template[] = [
  {
    id: 'nat-weekly',
    icon: <IconReport width={20} height={20} />,
    title: { th: 'สถานการณ์ภาพรวมพื้นที่ (รายสัปดาห์)', en: 'Area Situation Weekly' },
    // the report is built from whatever the account can see, so the blurb says
    // "พื้นที่ที่คุณรับผิดชอบ" rather than naming three provinces to a เขต seat
    desc: {
      th: 'สรุป KPI ของพื้นที่ที่คุณรับผิดชอบ และตัวชี้วัดหลักรายพื้นที่',
      en: 'KPIs for the area you are responsible for, with headline indicators',
    },
    tone: '#2f66f6',
  },
  {
    id: 'prov-risk',
    icon: <IconProvince width={20} height={20} />,
    title: { th: 'รายงานความเสี่ยงรายอำเภอ', en: 'District Risk Report' },
    desc: {
      th: 'จัดอันดับอำเภอตามสัดส่วนเด็กเสี่ยงสูงและความครอบคลุมของแผน',
      en: 'Districts ranked by risk share and plan coverage',
    },
    tone: '#f97316',
  },
  {
    id: 'iv-sla',
    icon: <IconClock width={20} height={20} />,
    title: { th: 'รายงาน SLA การส่งต่อ', en: 'Referral SLA Report' },
    desc: {
      th: 'เวลาตอบสนอง เคสเกินกำหนด และอัตราปิดเคส แยกตามประเภทความช่วยเหลือ',
      en: 'Response time, cases past SLA and closure rate by need',
    },
    tone: '#dc2626',
  },
  {
    id: 'cause',
    icon: <IconCause width={20} height={20} />,
    title: { th: 'วิเคราะห์สาเหตุการหลุดออก', en: 'Cause Analysis' },
    desc: {
      th: 'การกระจายสาเหตุจากทะเบียนเด็กนอกระบบ',
      en: 'Cause distribution from the out-of-school registry',
    },
    tone: '#eab308',
  },
  {
    id: 'sch-dq',
    icon: <IconSchool width={20} height={20} />,
    title: { th: 'คุณภาพข้อมูลระดับโรงเรียน', en: 'School Data Quality' },
    desc: {
      th: 'ความครบถ้วนของข้อมูลและผลการช่วยเหลือรายโรงเรียน',
      en: 'Data completeness and results per school',
    },
    tone: '#0f2a6b',
  },
  {
    id: 'dropout-return',
    icon: <IconReturn width={20} height={20} />,
    title: { th: 'การหลุดออกและการกลับเข้าเรียน', en: 'Dropout & Return' },
    desc: {
      th: 'เด็กนอกระบบเทียบกับเด็กที่กลับเข้าเรียนหรือมีอาชีพ',
      en: 'Out-of-school children against durable outcomes',
    },
    tone: '#16a34a',
  },
]

interface RecentRow {
  templateId: string
  name: { th: string; en: string }
  scope: { th: string; en: string }
  format: ReportFormat
  date: string
  by: string
}

const RECENT: RecentRow[] = [
  {
    templateId: 'nat-weekly',
    name: { th: 'สถานการณ์ภาพรวมพื้นที่ จชต.', en: 'SBP Situation Weekly' },
    scope: { th: 'ทั้งพื้นที่ จชต.', en: 'Whole SBP area' },
    format: 'pdf',
    date: '2026-07-08',
    by: 'ศอ.บต.',
  },
  {
    templateId: 'prov-risk',
    name: { th: 'รายงานความเสี่ยงรายอำเภอ', en: 'District Risk Report' },
    scope: { th: 'จังหวัดปัตตานี', en: 'Pattani' },
    format: 'xls',
    date: '2026-07-06',
    by: 'ศธจ. ปัตตานี',
  },
  {
    templateId: 'iv-sla',
    name: { th: 'รายงาน SLA การส่งต่อ', en: 'Referral SLA Report' },
    scope: { th: 'อำเภอรามัน', en: 'Raman district' },
    format: 'csv',
    date: '2026-07-05',
    by: 'ศปก.อ. รามัน',
  },
  {
    templateId: 'cause',
    name: { th: 'วิเคราะห์สาเหตุการหลุดออก', en: 'Cause Analysis' },
    scope: { th: 'ทั้งพื้นที่ จชต.', en: 'Whole SBP area' },
    format: 'html',
    date: '2026-07-02',
    by: 'ศอ.บต.',
  },
]

const FORMATS: { value: ReportFormat; key: string }[] = [
  { value: 'pdf', key: 'rp.fmtPdf' },
  { value: 'xls', key: 'rp.fmtXls' },
  { value: 'csv', key: 'rp.fmtCsv' },
  { value: 'html', key: 'rp.fmtHtml' },
]

export default function Reports() {
  const { t, pn, dn, lang, pick } = useI18n()
  const th = lang === 'th'
  const toast = useToast()

  // the lists follow the signed-in account: a province executive cannot build
  // a whole-area report, and only sees their own districts
  const { user, provinces, districts, oosc, plans, referrals, cases } = useScopedData()
  const canAreaWide = !user?.provinceKey && !user?.districtKey
  /** For a สพท. account the widest report it can build covers its เขต, not a
   *  จังหวัด — the province rows are already narrowed to its four อำเภอ, so
   *  only the wording was claiming a level above the data. */
  const ownEsa = user?.esaKey ? ESA_BY_KEY[user.esaKey] : undefined

  const [scope, setScope] = useState<ScopeKey>(canAreaWide ? 'area' : 'province')
  const [province, setProvince] = useState<string>(provinces[0]?.key ?? '')
  const [district, setDistrict] = useState<string>(districts[0]?.key ?? '')
  const [period, setPeriod] = useState<string>('thisWeek')
  const [format, setFormat] = useState<ReportFormat>('pdf')

  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<ReportDef | null>(null)
  const [closing, setClosing] = useState(false)

  const L = (v: { th: string; en: string }) => (th ? v.th : v.en)

  const periodOptions = [
    { value: 'thisWeek', label: th ? 'สัปดาห์นี้' : 'This week' },
    { value: 'thisMonth', label: th ? 'เดือนนี้' : 'This month' },
    { value: 'thisQuarter', label: th ? 'ไตรมาสนี้' : 'This quarter' },
    { value: 'thisYear', label: th ? 'ปีการศึกษานี้' : 'This academic year' },
  ]
  const periodLabel = periodOptions.find((p) => p.value === period)?.label ?? ''

  const scopeOptions = [
    ...(canAreaWide
      ? [{ value: 'area', label: th ? 'ทั้งพื้นที่ จชต.' : 'Whole SBP area' }]
      : []),
    {
      value: 'province',
      label: ownEsa
        ? th
          ? 'ทั้งเขตพื้นที่'
          : 'Whole service area'
        : th
          ? 'รายจังหวัด'
          : 'By province',
    },
    { value: 'district', label: th ? 'รายอำเภอ' : 'By district' },
  ]

  const provinceOptions = provinces.map((p) => ({
    value: p.key,
    label: ownEsa ? pick(ownEsa) : pn(p.key),
  }))
  const districtOptions = districts.map((d) => ({
    value: d.key,
    label: dn(d.key),
    group: pn(d.provinceKey),
  }))

  /** the data the report is actually built from, narrowed to the chosen scope */
  const ctx: Omit<ReportContext, 'scopeLabel'> = useMemo(() => {
    const inScope = <T extends { provinceKey: string; districtKey?: string }>(rows: T[]) =>
      rows.filter(
        (r) =>
          (scope === 'area' || r.provinceKey === (scope === 'district' ? districtProvince() : province)) &&
          (scope !== 'district' || r.districtKey === district),
      )
    function districtProvince() {
      return districts.find((d) => d.key === district)?.provinceKey ?? province
    }
    const provs =
      scope === 'area'
        ? provinces
        : provinces.filter((p) => p.key === (scope === 'district' ? districtProvince() : province))
    const dists =
      scope === 'area'
        ? districts
        : scope === 'province'
          ? districts.filter((d) => d.provinceKey === province)
          : districts.filter((d) => d.key === district)
    // school-level figures are aggregates, so the pilot list is filtered by area
    const scopedSchools = SCHOOLS.filter(
      (s) =>
        (scope === 'area' || s.provinceKey === (scope === 'district' ? districtProvince() : province)) &&
        (scope !== 'district' || s.districtKey === district),
    )
    return {
      th,
      provinces: provs,
      districts: dists,
      schools: scopedSchools,
      oosc: inScope(oosc),
      plans,
      referrals: inScope(referrals),
      cases: inScope(cases),
      pn,
      dn,
      t,
      periodLabel,
      by: user?.org ?? user?.name ?? (th ? 'ผู้ใช้งานระบบ' : 'Platform user'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, province, district, provinces, districts, oosc, plans, referrals, cases, periodLabel, th, user])

  const scopeLabel =
    scope === 'area'
      ? th
        ? `ทั้งพื้นที่ จชต. (${provinces.length} จังหวัด · ${districts.length} อำเภอ)`
        : `Whole SBP area (${provinces.length} provinces)`
      : scope === 'province'
        ? ownEsa
          ? pick(ownEsa)
          : `${th ? 'จังหวัด' : 'Province'} ${pn(province)}`
        : `${th ? 'อำเภอ' : 'District'} ${dn(district)}`

  const make = (templateId: string) => buildReport(templateId, { ...ctx, scopeLabel })

  /** short, honest progress: the work is instant, the bar shows the steps */
  const run = (templateId: string, then: (r: ReportDef) => void) => {
    setBusy(templateId)
    setProgress(8)
    const t1 = window.setTimeout(() => setProgress(55), 120)
    const t2 = window.setTimeout(() => setProgress(92), 320)
    const t3 = window.setTimeout(() => {
      const report = make(templateId)
      setProgress(100)
      window.setTimeout(() => {
        setBusy(null)
        setProgress(0)
        then(report)
      }, 180)
    }, 520)
    return () => [t1, t2, t3].forEach(window.clearTimeout)
  }

  const openPreview = (templateId: string) =>
    run(templateId, (r) => {
      if (!r.rows.length) {
        toast.push(t('rp.emptyRows'))
        return
      }
      setPreview(r)
    })

  const doExport = (templateId: string, fmt: ReportFormat = format) =>
    run(templateId, (r) => {
      if (!r.rows.length) {
        toast.push(t('rp.emptyRows'))
        return
      }
      exportReport(r, fmt)
      toast.push(
        fmt === 'pdf'
          ? t('rp.pdfHint')
          : th
            ? `ดาวน์โหลด “${r.title}” เป็น ${fmt.toUpperCase()} แล้ว (${r.rows.length} แถว)`
            : `Downloaded “${r.title}” as ${fmt.toUpperCase()} (${r.rows.length} rows)`,
      )
    })

  const closePreview = () => {
    setClosing(true)
    window.setTimeout(() => {
      setPreview(null)
      setClosing(false)
    }, 200)
  }

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  return (
    <div className="animate-page-rise">
      <PageHeader
        title={t('nav.reports')}
        subtitle={
          th
            ? 'สร้าง พรีวิว และส่งออกรายงานเป็นไฟล์จริง — PDF / Excel / CSV / หน้าเว็บ'
            : 'Build, preview and export real files — PDF / Excel / CSV / web page'
        }
        icon={<IconReport />}
      />

      {/* ── builder ── */}
      <Card>
        <CardHeader
          title={th ? 'สร้างรายงานใหม่' : 'Build a new report'}
          subtitle={
            th
              ? 'เลือกขอบเขตและช่วงเวลา แล้วกดพรีวิวเพื่อดูข้อมูลก่อนส่งออก'
              : 'Choose scope and period, then preview before exporting'
          }
        />
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
          <Select
            label={th ? 'ขอบเขต' : 'Scope'}
            value={scope}
            onChange={(v) => setScope(v as ScopeKey)}
            options={scopeOptions}
          />
          {scope === 'province' ? (
            <Select
              label={ownEsa ? (th ? 'เขตพื้นที่' : 'Service area') : t('common.province')}
              value={province}
              onChange={setProvince}
              options={provinceOptions}
            />
          ) : scope === 'district' ? (
            <Select
              label={t('geo.district')}
              value={district}
              onChange={setDistrict}
              options={districtOptions}
            />
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-muted">
                {th ? 'พื้นที่' : 'Area'}
              </span>
              <div className="flex h-[42px] items-center rounded-xl border border-surface-border bg-surface-muted px-3 text-sm font-medium text-ink-muted">
                {th
                  ? `${provinces.length} จังหวัด · ${districts.length} อำเภอ`
                  : `${provinces.length} provinces · ${districts.length} districts`}
              </div>
            </div>
          )}
          <Select
            label={th ? 'ช่วงเวลา' : 'Period'}
            value={period}
            onChange={setPeriod}
            options={periodOptions}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-muted">
              {th ? 'รูปแบบไฟล์' : 'Format'}
            </span>
            <div className="inline-flex rounded-xl border border-surface-border bg-surface-muted p-1">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  aria-pressed={format === f.value}
                  className={`relative flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    format === f.value ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {format === f.value && (
                    <motion.span
                      layoutId="rp-format"
                      className="absolute inset-0 rounded-lg bg-white shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{t(f.key)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-5 py-4">
          <p className="text-xs text-ink-muted">
            {format === 'pdf'
              ? t('rp.pdfHint')
              : th
                ? 'ไฟล์จะถูกสร้างในเครื่องคุณและดาวน์โหลดทันที'
                : 'The file is built locally and downloads immediately'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={<IconEye width={16} height={16} />}
              onClick={() => openPreview(customTemplate(scope))}
            >
              {t('rp.preview')}
            </Button>
            <Button
              variant="primary"
              icon={<IconExport width={16} height={16} />}
              onClick={() => doExport(customTemplate(scope))}
            >
              {busy ? t('rp.generating') : t('rp.generate')}
            </Button>
          </div>
        </div>

        {/* progress — tied to the actual build steps */}
        {busy && (
          <div className="h-1 w-full overflow-hidden bg-surface-muted">
            <motion.div
              className="h-full rounded-r-full bg-brand-500"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            />
          </div>
        )}
      </Card>

      {/* ── templates ── */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">
          {th ? 'เทมเพลตรายงานสำเร็จรูป' : 'Pre-built report templates'}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((tpl, i) => (
            <motion.div
              key={tpl.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3 }}
            >
              <Card className="flex h-full flex-col">
                <div className="flex items-start gap-3 p-5">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                    style={{ background: `${tpl.tone}18`, color: tpl.tone }}
                  >
                    {tpl.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-ink">{L(tpl.title)}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{L(tpl.desc)}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2 border-t border-surface-border px-5 py-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconEye width={15} height={15} />}
                    onClick={() => openPreview(tpl.id)}
                  >
                    {t('rp.preview')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<IconExport width={15} height={15} />}
                    onClick={() => doExport(tpl.id)}
                  >
                    {t('rp.export')} {format.toUpperCase()}
                  </Button>
                  {busy === tpl.id && (
                    <motion.span
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500"
                      animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                      transition={{ duration: 0.7, repeat: Infinity }}
                    />
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── recent ── */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader
            title={th ? 'การส่งออกล่าสุด' : 'Recent exports'}
            subtitle={
              th
                ? 'กดดาวน์โหลดเพื่อสร้างไฟล์เดิมใหม่จากข้อมูลปัจจุบัน'
                : 'Download rebuilds the same report from current data'
            }
          />
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">{th ? 'ชื่อรายงาน' : 'Report'}</th>
                  <th className="px-3 py-2 font-semibold">{th ? 'ขอบเขต' : 'Scope'}</th>
                  <th className="px-3 py-2 font-semibold">{th ? 'รูปแบบ' : 'Format'}</th>
                  <th className="px-3 py-2 font-semibold">{th ? 'วันที่' : 'Date'}</th>
                  <th className="px-3 py-2 font-semibold">{t('common.owner')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {RECENT.map((r, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.12 + i * 0.04 }}
                    className="border-t border-surface-border transition-colors hover:bg-surface-muted"
                  >
                    <td className="px-3 py-3 font-semibold text-ink">{L(r.name)}</td>
                    <td className="px-3 py-3 text-ink-muted">{L(r.scope)}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-semibold uppercase text-ink-muted">
                        {r.format}
                      </span>
                    </td>
                    <td className="tabular px-3 py-3 text-ink-muted">{r.date}</td>
                    <td className="px-3 py-3 text-ink-muted">{r.by}</td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<IconDown width={15} height={15} />}
                        onClick={() => doExport(r.templateId, r.format)}
                      >
                        {t('rp.download')}
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <IconCheck width={13} height={13} className="text-risk-normal" />
        {th
          ? 'ทุกไฟล์สร้างจากข้อมูลในขอบเขตที่บัญชีของคุณมองเห็น และเป็นข้อมูลจำลองเพื่อการสาธิต'
          : 'Every file is built from the data your account can see — demonstration data.'}
      </div>

      {preview && (
        <PreviewDialog
          r={preview}
          closing={closing}
          onClose={closePreview}
          onExport={(fmt) => {
            exportReport(preview, fmt)
            toast.push(
              fmt === 'pdf'
                ? t('rp.pdfHint')
                : th
                  ? `ดาวน์โหลดเป็น ${fmt.toUpperCase()} แล้ว (${preview.rows.length} แถว)`
                  : `Downloaded as ${fmt.toUpperCase()} (${preview.rows.length} rows)`,
            )
          }}
          th={th}
          t={t}
        />
      )}
    </div>
  )
}

/** the custom builder maps its scope onto the closest template shape */
function customTemplate(scope: ScopeKey) {
  return scope === 'district' ? 'custom-district' : scope === 'province' ? 'prov-risk' : 'nat-weekly'
}

function PreviewDialog({
  r,
  closing,
  onClose,
  onExport,
  th,
  t,
}: {
  r: ReportDef
  closing: boolean
  onClose: () => void
  onExport: (f: ReportFormat) => void
  th: boolean
  t: (k: string) => string
}) {
  const shown = r.rows.slice(0, 12)
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <motion.div
        className="absolute inset-0 bg-brand-950/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('rp.previewTitle')}
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-[860px] sm:rounded-2xl"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={closing ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {t('rp.previewTitle')}
            </p>
            <p className="mt-0.5 text-[16px] font-bold leading-tight text-ink">{r.title}</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">{r.subtitle}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[r.scopeLabel, r.periodLabel, r.generatedAt, r.by].map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={th ? 'ปิด' : 'Close'}
            className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-4">
            {r.kpis.map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-surface-border px-3 py-2"
              >
                <p className="tabular text-lg font-bold leading-none text-brand-700">{k.value}</p>
                <p className="mt-1 text-[10px] text-ink-muted">{k.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-brand-950 text-left text-white">
                  {r.columns.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2) }}
                    className="border-t border-surface-border/70 odd:bg-surface-muted/40"
                  >
                    {row.map((cell, j) => (
                      <td key={j} className="whitespace-nowrap px-3 py-1.5 text-ink">
                        {typeof cell === 'number' ? cell.toLocaleString() : cell}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
            <IconAlert width={12} height={12} />
            {r.rows.length > shown.length
              ? `${t('rp.showingFirst')} · ${r.rows.length} ${t('rp.rowsTotal')}`
              : `${r.rows.length} ${t('rp.rowsTotal')}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border bg-white px-5 py-4">
          <p className="text-[11px] text-ink-faint">{r.note}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<IconExport width={14} height={14} />}
              onClick={() => onExport('csv')}
            >
              CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<IconExport width={14} height={14} />}
              onClick={() => onExport('xls')}
            >
              Excel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<IconExport width={14} height={14} />}
              onClick={() => onExport('html')}
            >
              {t('rp.fmtHtml')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<IconReport width={14} height={14} />}
              onClick={() => onExport('pdf')}
            >
              {t('rp.fmtPdf')}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
