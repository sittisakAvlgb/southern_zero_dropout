import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { IconGlobe } from '@/components/icons'

import { Logo } from '@/components/ui/Logo'

const HERO_IMG = '/Login-01.png'

/** Motes of light rising through the photograph, echoing the network glow over
 *  the map. Positions are fixed rather than random so a re-render never makes
 *  them jump mid-flight. */
const SPARKS = [
  { l: 62, t: 34, s: 3, d: 15, delay: 0 },
  { l: 71, t: 22, s: 2, d: 19, delay: 2.4 },
  { l: 78, t: 44, s: 4, d: 17, delay: 5.1 },
  { l: 84, t: 28, s: 2, d: 21, delay: 1.2 },
  { l: 90, t: 52, s: 3, d: 16, delay: 7.3 },
  { l: 67, t: 58, s: 2, d: 22, delay: 9.6 },
  { l: 74, t: 70, s: 3, d: 18, delay: 4.2 },
  { l: 95, t: 38, s: 2, d: 20, delay: 11.4 },
  { l: 57, t: 24, s: 2, d: 23, delay: 6.7 },
  { l: 88, t: 66, s: 3, d: 17, delay: 13.1 },
  { l: 24, t: 30, s: 2, d: 24, delay: 3.5 },
  { l: 12, t: 46, s: 3, d: 20, delay: 8.8 },
  { l: 38, t: 20, s: 2, d: 22, delay: 10.5 },
  { l: 46, t: 62, s: 2, d: 19, delay: 14.6 },
]

/**
 * One centred card on a light page. The half-screen photograph it replaces came
 * with a headline, a paragraph and four counters, all competing with the form
 * they wrapped; a sign-in screen only has to say what the product is and let
 * people in.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  const { lang, toggle } = useI18n()
  const th = lang === 'th'
  /** every loop below is skipped for anyone who asked the OS for less motion */
  const still = useReducedMotion()

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-50">
      {/* The photograph, drifting for ever rather than settling after one zoom:
       *  a scale-and-pan cycle long enough that the movement is felt, not seen. */}
      <motion.div
        initial={{ scale: 1.08 }}
        animate={still ? { scale: 1.04 } : { scale: [1.08, 1.16, 1.08], x: [0, -22, 0], y: [0, 10, 0] }}
        transition={still ? { duration: 1 } : { duration: 48, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute inset-0 bg-cover bg-center will-change-transform"
        style={{ backgroundImage: `url(${HERO_IMG})` }}
      />

      {/* the sunset, breathing */}
      {!still && (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(28%_26%_at_79%_63%,rgba(255,214,150,0.55),transparent_70%)]"
          animate={{ opacity: [0.45, 0.9, 0.45], scale: [1, 1.08, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* the network over the map, pulsing with it */}
      {!still && (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(24%_30%_at_80%_24%,rgba(125,211,252,0.4),transparent_72%)]"
          animate={{ opacity: [0.25, 0.75, 0.25] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        />
      )}

      {/* motes of light rising */}
      {!still && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {SPARKS.map((p, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                left: `${p.l}%`,
                top: `${p.t}%`,
                width: p.s,
                height: p.s,
                boxShadow: '0 0 10px 2px rgba(147,197,253,0.85)',
              }}
              animate={{ y: [0, -130], opacity: [0, 0.95, 0] }}
              transition={{ duration: p.d, repeat: Infinity, delay: p.delay, ease: 'easeOut' }}
            />
          ))}
        </div>
      )}

      {/* one slow diagonal sheen across the whole frame */}
      {!still && (
        <motion.div
          className="pointer-events-none absolute -inset-y-1/2 w-1/3 -rotate-12 bg-gradient-to-r from-transparent via-white/25 to-transparent blur-2xl"
          animate={{ left: ['-40%', '130%'] }}
          transition={{ duration: 17, repeat: Infinity, ease: 'linear', repeatDelay: 6 }}
        />
      )}

      {/* No blur and only a whisper of white: the image stays sharp, and the
       *  card carries its own opacity instead of dimming the whole picture. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-brand-950/12" />

      {/* language, top right */}
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-xl border border-surface-border bg-white/85 px-3 py-2 text-sm font-semibold text-ink-muted backdrop-blur transition-colors hover:bg-white"
          aria-label="toggle language"
        >
          <IconGlobe width={18} height={18} />
          {(['th', 'en', 'ms'] as const).map((l, i) => (
            <span key={l} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-faint">/</span>}
              <span className={lang === l ? 'text-brand-600' : ''}>{l.toUpperCase()}</span>
            </span>
          ))}
        </button>
      </div>

      {/* pt on small screens keeps the card clear of the floating language pill */}
      <div className="relative flex min-h-screen items-center justify-center px-4 pb-6 pt-16 sm:px-6 sm:py-6">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="w-full max-w-[520px] rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_28px_80px_rgba(4,14,38,0.32)] ring-1 ring-brand-950/[0.05] backdrop-blur-md sm:p-8"
        >
          {/* identity — mark, then the product name in two tones */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="flex items-center gap-4"
          >
            <Logo size={44} />
            <span className="h-10 w-px bg-surface-border" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                {th ? 'แพลตฟอร์มชายแดนใต้' : 'Border-provinces platform'}
              </p>
              <p className="text-[21px] font-bold leading-tight text-ink">
                Southern <span className="text-brand-600">Zero Dropout</span>
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="mt-5"
          >
            <h2 className="text-[24px] font-bold leading-tight text-ink">{title}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-5"
          >
            {children}
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

export function AuthField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  icon,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  icon?: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`w-full rounded-xl border border-surface-border bg-white py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-brand-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 ${
            icon ? 'pl-10 pr-3.5' : 'px-3.5'
          }`}
        />
      </div>
    </label>
  )
}
