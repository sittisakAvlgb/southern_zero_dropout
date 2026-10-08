import { motion } from 'framer-motion'

export interface SegOption {
  value: string
  label: string
}

export function Segmented({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: string
  onChange: (v: string) => void
  options: SegOption[]
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-xl border border-surface-border bg-surface-muted p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`relative rounded-lg font-medium transition-colors ${
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
            } ${active ? 'text-brand-700' : 'text-ink-muted hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((x) => x.value).join('')}`}
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
