import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  secondary:
    'bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-muted',
  danger: 'bg-risk-critical text-white hover:brightness-95 shadow-sm',
}
const SIZES: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1.5 rounded-lg',
  md: 'text-sm px-4 py-2.5 gap-2 rounded-xl',
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  ariaLabel,
  type = 'button',
  disabled = false,
}: {
  children?: ReactNode
  onClick?: () => void
  variant?: Variant
  size?: Size
  icon?: ReactNode
  className?: string
  ariaLabel?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {icon}
      {children}
    </motion.button>
  )
}
