import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  /** lift on hover */
  hover?: boolean
  onClick?: () => void
  as?: 'div' | 'button'
  ariaLabel?: string
}

export function Card({
  children,
  className = '',
  hover = false,
  onClick,
  as = 'div',
  ariaLabel,
}: CardProps) {
  const Comp = motion[as] as typeof motion.div
  return (
    <Comp
      onClick={onClick}
      aria-label={ariaLabel}
      whileHover={hover ? { y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`rounded-2xl border border-surface-border bg-white shadow-card ${
        hover ? 'cursor-pointer hover:shadow-card-hover' : ''
      } ${onClick ? 'text-left' : ''} ${className}`}
    >
      {children}
    </Comp>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}
