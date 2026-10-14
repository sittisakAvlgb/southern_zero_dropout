import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { IconArrowRight, IconClose } from '@/components/icons'
import { BUCKET_META, CONSENT_META, type Bucket, type ConsentState, type Sla } from '@/lib/refOps'

/** ลิ้นชักด้านขวาแบบเดียวกับหน้าเคสในเส้นทางโอกาส — มือถือเต็มจอ */
export function Drawer({
  label,
  head,
  onBack,
  onClose,
  footer,
  children,
}: {
  label: string
  head: ReactNode
  onBack?: () => void
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="ปิด" className="absolute inset-0 bg-brand-950/35" onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0 flex-1">{head}</div>
          <button
            type="button"
            onClick={onBack ?? onClose}
            aria-label={onBack ? 'ย้อนกลับ' : 'ปิด'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted"
          >
            {onBack ? <IconArrowRight width={18} height={18} className="rotate-180" /> : <IconClose width={18} height={18} />}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">{children}</div>
        {footer && <div className="border-t border-surface-border bg-white px-5 py-3">{footer}</div>}
      </motion.aside>
    </div>
  )
}

/** ป้ายสถานะ — สีกับข้อความคู่กันเสมอ ไม่ใช้สีอย่างเดียว */
export function BucketBadge({ b }: { b: Bucket }) {
  const m = BUCKET_META[b]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: `${m.color}14`, color: m.color }}>
      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
      {m.th}
    </span>
  )
}

export const SLA_COLOR: Record<Sla['level'], string> = {
  breach: '#dc2626',
  near: '#ea580c',
  ok: '#475569',
  done: '#16a34a',
  paused: '#7c3aed',
}

export function SlaText({ sla, className = '' }: { sla: Sla; className?: string }) {
  const icon = sla.level === 'breach' ? '⚠ ' : sla.level === 'near' ? '⏰ ' : sla.level === 'done' ? '✓ ' : sla.level === 'paused' ? '⏸ ' : ''
  return (
    <span className={`font-semibold ${className}`} style={{ color: SLA_COLOR[sla.level] }}>
      {icon}
      {sla.text}
    </span>
  )
}

export function ConsentBadge({ state, daysLeft }: { state: ConsentState; daysLeft?: number }) {
  const m = CONSENT_META[state]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: `${m.color}14`, color: m.color }}>
      {m.icon} {m.th}
      {state === 'expiring' && daysLeft !== undefined && ` · เหลือ ${daysLeft} วัน`}
    </span>
  )
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 mt-4 text-[13.5px] font-semibold text-ink">{children}</p>
}

export function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex-1 rounded-xl bg-brand-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-card disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function GhostBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-surface-border bg-white px-4 py-3 text-[14px] font-medium text-ink">
      {children}
    </button>
  )
}

export function Chips<T extends string>({ items, value, onPick }: { items: { key: T; th: string }[]; value?: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onPick(it.key)}
          aria-pressed={value === it.key}
          className="rounded-full border px-4 py-2.5 text-[14px] font-medium"
          style={{ borderColor: value === it.key ? '#2f66f6' : '#e2e8f0', background: value === it.key ? '#eef3ff' : '#fff', color: value === it.key ? '#1d4ed8' : '#0f172a' }}
        >
          {it.th}
        </button>
      ))}
    </div>
  )
}

export const textareaCls =
  'w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100'
export const inputCls =
  'w-full rounded-xl border border-surface-border px-3.5 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

export const isoIn = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
