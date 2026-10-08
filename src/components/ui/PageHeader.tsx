import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

/** Standard page title block with optional breadcrumb + actions. */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  icon,
}: {
  title: string
  subtitle?: string
  breadcrumb?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
    >
      <div>
        {breadcrumb && <div className="mb-1.5">{breadcrumb}</div>}
        <div className="flex items-center gap-3">
          {icon && (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600">
              {icon}
            </span>
          )}
          <div>
            <h1 className="text-xl font-bold text-ink md:text-2xl">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  )
}

export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-ink-muted" aria-label="breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className={i === items.length - 1 ? 'font-semibold text-brand-600' : ''}>
            {it}
          </span>
          {i < items.length - 1 && <span className="text-ink-faint">/</span>}
        </span>
      ))}
    </nav>
  )
}
