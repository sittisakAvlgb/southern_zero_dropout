import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { RiskBadge } from '@/components/ui/RiskBadge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useSimulatedLoading } from '@/lib/useLoading'
import { useI18n } from '@/i18n/LanguageContext'
import { RISK_COLOR, RISK_WEIGHT_LABELS } from '@/lib/risk'
import { IconSettings, IconCheck, IconBell, IconGlobe, IconShield, IconAI, IconLock } from '@/components/icons'
import { AI_MODELS, getModel, serverHasKey, setModel } from '@/lib/ai'
import type { RiskLevel } from '@/types'
import type { ReactNode } from 'react'

/* ── Local Toggle switch ─────────────────────────────── */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-brand-500' : 'bg-surface-border'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
        style={{ marginLeft: checked ? 22 : 2 }}
      />
    </button>
  )
}

const BANDS: { level: RiskLevel; range: string; th: string; en: string }[] = [
  { level: 'normal', range: '0–39', th: 'ปกติ', en: 'Normal' },
  { level: 'watch', range: '40–69', th: 'เฝ้าระวัง', en: 'Watch' },
  { level: 'high', range: '70–84', th: 'เสี่ยงสูง', en: 'High' },
  { level: 'critical', range: '85–100', th: 'วิกฤต', en: 'Critical' },
]

const WEIGHT_LABELS: Record<string, { th: string; en: string }> = {
  attendanceRisk: { th: 'การมาเรียน', en: 'Attendance' },
  academicRisk: { th: 'ผลการเรียน', en: 'Academic' },
  behaviorRisk: { th: 'พฤติกรรม', en: 'Behavior' },
  familyRisk: { th: 'ครอบครัว', en: 'Family' },
  wellbeingRisk: { th: 'สุขภาวะ', en: 'Wellbeing' },
  parentRisk: { th: 'การติดต่อผู้ปกครอง', en: 'Parent contact' },
}

export default function Settings() {
  const { t, lang, setLang } = useI18n()
  const toast = useToast()
  const loading = useSimulatedLoading(600)

  const [notif, setNotif] = useState({
    critical: true,
    sla: true,
    digest: false,
    dataQuality: true,
  })

  // Claude API — the API key lives on the SERVER (.env); the client only picks a model
  // Card hidden per request; flip to true to bring it back.
  const SHOW_CLAUDE_API_SETTINGS = false
  const [aiModel, setAiModelState] = useState(getModel())
  const [serverKey, setServerKey] = useState<boolean | null>(null)
  useEffect(() => {
    serverHasKey().then(setServerKey)
  }, [])

  const setNotifKey = (key: keyof typeof notif, v: boolean) => {
    setNotif((p) => ({ ...p, [key]: v }))
    toast.push(
      lang === 'th'
        ? `บันทึกการตั้งค่าแล้ว: ${v ? 'เปิด' : 'ปิด'}`
        : `Preference saved: ${v ? 'On' : 'Off'}`
    )
  }

  const notifItems: { key: keyof typeof notif; th: string; en: string; sub: { th: string; en: string } }[] = [
    {
      key: 'critical',
      th: 'แจ้งเตือนระดับวิกฤต',
      en: 'Critical alerts',
      sub: { th: 'เมื่อมีนักเรียนเข้าสู่ระดับความเสี่ยงวิกฤต', en: 'When a student enters critical risk' },
    },
    {
      key: 'sla',
      th: 'เคสเกินกำหนด (SLA)',
      en: 'SLA breaches',
      sub: { th: 'เมื่อเคสเกินระยะเวลาตอบสนองที่กำหนด', en: 'When a case exceeds its response deadline' },
    },
    {
      key: 'digest',
      th: 'สรุปรายสัปดาห์',
      en: 'Weekly digest',
      sub: { th: 'อีเมลสรุปสถานการณ์ทุกสัปดาห์', en: 'A weekly situation summary email' },
    },
    {
      key: 'dataQuality',
      th: 'คุณภาพข้อมูล',
      en: 'Data quality',
      sub: { th: 'เมื่อคุณภาพข้อมูลของโรงเรียนต่ำกว่าเกณฑ์', en: 'When school data quality drops below target' },
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('nav.settings')}
        subtitle={
          lang === 'th'
            ? 'ปรับแต่งภาษา การแจ้งเตือน และการตั้งค่าระบบ'
            : 'Configure language, notifications, and system preferences'
        }
        icon={<IconSettings />}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 1. Language & Display */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="h-full">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <IconGlobe width={16} height={16} className="text-brand-600" />
                    {lang === 'th' ? 'ภาษาและการแสดงผล' : 'Language & Display'}
                  </span>
                }
                subtitle={lang === 'th' ? 'เลือกภาษาหลักของระบบ' : 'Choose the system language'}
              />
              <div className="p-5">
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { code: 'th' as const, label: 'ไทย', note: 'Thai · Kanit', font: 'Kanit, sans-serif' },
                    { code: 'en' as const, label: 'English', note: 'English · Ubuntu', font: 'Ubuntu, sans-serif' },
                    { code: 'ms' as const, label: 'Melayu', note: 'Bahasa Melayu (Rumi)', font: 'Ubuntu, sans-serif' },
                  ]).map((opt) => (
                    <button
                      key={opt.code}
                      onClick={() => setLang(opt.code)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        lang === opt.code
                          ? 'border-brand-400 bg-brand-500/8 ring-1 ring-brand-400'
                          : 'border-surface-border hover:border-brand-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-ink" style={{ fontFamily: opt.font }}>
                          {opt.label}
                        </span>
                        {lang === opt.code && (
                          <IconCheck width={16} height={16} className="text-brand-600" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-muted">{opt.note}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                  {lang === 'th'
                    ? 'ภาษามลายูถิ่น (อักษรรูมี) เป็นภาษาที่ครอบครัวส่วนใหญ่ในพื้นที่ใช้จริง — คำที่ยังไม่ได้แปลจะแสดงเป็นภาษาอังกฤษแทนการขึ้นรหัสคีย์'
                    : 'Malay (Rumi) is the home language of most families here. Terms not yet translated fall back to English rather than showing a raw key.'}
                </p>
              </div>
            </Card>
          </motion.div>

          {/* 2. Notifications */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="h-full">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <IconBell width={16} height={16} className="text-brand-600" />
                    {lang === 'th' ? 'การแจ้งเตือน' : 'Notifications'}
                  </span>
                }
                subtitle={lang === 'th' ? 'เลือกเหตุการณ์ที่ต้องการรับการแจ้งเตือน' : 'Choose which events notify you'}
              />
              <div className="flex flex-col divide-y divide-surface-border px-5 pb-2">
                {notifItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{lang === 'th' ? item.th : item.en}</p>
                      <p className="text-[11px] text-ink-muted">{lang === 'th' ? item.sub.th : item.sub.en}</p>
                    </div>
                    <Toggle
                      checked={notif[item.key]}
                      onChange={(v) => setNotifKey(item.key, v)}
                      label={lang === 'th' ? item.th : item.en}
                    />
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* 2b. Claude API (AI Command Center) — hidden for now, set SHOW_CLAUDE_API_SETTINGS to re-enable */}
          {SHOW_CLAUDE_API_SETTINGS && (
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <IconAI width={16} height={16} className="text-brand-600" />
                    {lang === 'th' ? 'Claude API (AI Command Center)' : 'Claude API (AI Command Center)'}
                  </span>
                }
                subtitle={
                  lang === 'th'
                    ? 'AI Command Center เรียก Claude ผ่านเซิร์ฟเวอร์ — API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น'
                    : 'The AI Command Center calls Claude via the server — the API key stays server-side only'
                }
                action={
                  serverKey === null ? null : serverKey ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-risk-normal/10 px-2.5 py-1 text-[11px] font-semibold text-risk-normal">
                      <span className="h-2 w-2 rounded-full bg-risk-normal" />
                      {lang === 'th' ? 'เชื่อมต่อแล้ว' : 'Connected'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-risk-high/12 px-2.5 py-1 text-[11px] font-semibold text-risk-high">
                      {lang === 'th' ? 'ยังไม่ตั้งค่า key' : 'No key on server'}
                    </span>
                  )
                }
              />
              <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {lang === 'th' ? 'สถานะ API key (ฝั่งเซิร์ฟเวอร์)' : 'API key status (server-side)'}
                  </label>
                  <div className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-muted p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/12 text-brand-600">
                      <IconLock width={18} height={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {serverKey === null
                          ? lang === 'th' ? 'กำลังตรวจสอบ…' : 'Checking…'
                          : serverKey
                            ? lang === 'th' ? 'ตั้งค่า key แล้วที่เซิร์ฟเวอร์' : 'Key configured on server'
                            : lang === 'th' ? 'ยังไม่ได้ตั้งค่า key' : 'Key not configured'}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                        {lang === 'th'
                          ? 'ผู้ดูแลระบบ: ใส่ ANTHROPIC_API_KEY ในไฟล์ .env แล้วรีสตาร์ทเซิร์ฟเวอร์ — key ไม่ถูกส่งมาที่เบราว์เซอร์ ปลอดภัยสำหรับใช้บัญชีองค์กร'
                          : 'Admin: put ANTHROPIC_API_KEY in the .env file and restart the server — the key never reaches the browser, safe for a corporate account.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {lang === 'th' ? 'รุ่นโมเดล' : 'Model'}
                  </label>
                  <div className="flex flex-col gap-2">
                    {AI_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setModel(m.id)
                          setAiModelState(m.id)
                        }}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          aiModel === m.id
                            ? 'border-brand-400 bg-brand-500/8 ring-1 ring-brand-400'
                            : 'border-surface-border hover:border-brand-200'
                        }`}
                      >
                        <span className="text-sm font-medium text-ink">{m.label}</span>
                        {aiModel === m.id && <IconCheck width={16} height={16} className="text-brand-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
          )}

          {/* 3. Risk thresholds */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <IconShield width={16} height={16} className="text-brand-600" />
                    {lang === 'th' ? 'เกณฑ์ระดับความเสี่ยง' : 'Risk thresholds'}
                  </span>
                }
                subtitle={
                  lang === 'th'
                    ? 'โมเดลความเสี่ยงและการถ่วงน้ำหนักปัจจัย (แสดงเท่านั้น)'
                    : 'Risk model bands and factor weightings (read-only)'
                }
              />
              <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
                {/* Bands */}
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {lang === 'th' ? 'ระดับคะแนนความเสี่ยง' : 'Risk score bands'}
                  </p>
                  <div className="flex flex-col gap-2">
                    {BANDS.map((b) => (
                      <div
                        key={b.level}
                        className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5"
                      >
                        <span
                          className="h-8 w-1.5 shrink-0 rounded-full"
                          style={{ background: RISK_COLOR[b.level] }}
                        />
                        <span className="tabular w-20 shrink-0 text-sm font-bold text-ink">{b.range}</span>
                        <span className="flex-1 text-sm font-medium text-ink">
                          {lang === 'th' ? b.th : b.en}
                        </span>
                        <RiskBadge level={b.level} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weightings */}
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {lang === 'th' ? 'การถ่วงน้ำหนักปัจจัยเสี่ยง' : 'Risk factor weightings'}
                  </p>
                  <div className="flex flex-col gap-3">
                    {RISK_WEIGHT_LABELS.map((w, i) => {
                      const lbl = WEIGHT_LABELS[w.key as string]
                      return (
                        <div key={w.key as string}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-ink">{lbl ? (lang === 'th' ? lbl.th : lbl.en) : (w.key as string)}</span>
                            <span className="tabular font-bold text-ink">{w.pct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                            <motion.div
                              className="h-full rounded-full bg-brand-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${w.pct}%` }}
                              transition={{ delay: 0.15 + i * 0.05, duration: 0.5 }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* 4. Data sync */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="h-full">
              <CardHeader
                title={lang === 'th' ? 'การซิงก์ข้อมูล' : 'Data sync'}
                subtitle={lang === 'th' ? 'สถานะการเชื่อมต่อแหล่งข้อมูล' : 'Status of connected data sources'}
              />
              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-risk-normal/12 px-3 py-1.5 text-xs font-semibold text-risk-normal">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-risk-normal" />
                    {t('top.realtime')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-700">
                    <IconCheck width={13} height={13} />
                    {t('top.synced')}
                  </span>
                </div>
                <p className="mt-3 text-xs text-ink-muted">
                  {t('top.lastUpdated')}:{' '}
                  {new Date().toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      toast.push(lang === 'th' ? 'เริ่มซิงก์ข้อมูลแล้ว' : 'Data sync started')
                    }
                  >
                    {lang === 'th' ? 'ซิงก์เดี๋ยวนี้' : 'Sync now'}
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* 5. About */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="h-full">
              <CardHeader title={lang === 'th' ? 'เกี่ยวกับระบบ' : 'About'} />
              <div className="flex flex-col gap-2.5 p-5 text-sm">
                <Row label={lang === 'th' ? 'แอปพลิเคชัน' : 'Application'} value={t('app.title')} />
                <Row label={lang === 'th' ? 'เวอร์ชัน' : 'Version'} value="1.0" />
                <Row label={lang === 'th' ? 'หน่วยงาน' : 'Organization'} value={t('app.org')} />
                <Row
                  label={lang === 'th' ? 'สถานะ' : 'Status'}
                  value={
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">
                      Demo Prototype
                    </span>
                  }
                />
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  )
}
