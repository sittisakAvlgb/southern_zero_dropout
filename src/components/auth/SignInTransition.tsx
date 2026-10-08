import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { ROLE_META, type User } from '@/auth/roles'
import { roleIcon } from './roleIcon'
import { PROVINCE_PATHS } from '@/data/thailandPaths'
import {
  DISTRICTS_GEO,
  SBP_PROVINCE_KEYS,
  SBP_VIEWBOX,
  projectLat,
  projectLon,
} from '@/data/geo'

const HOLD_MS = 1750

/**
 * The screen between the click and the dashboard.
 *
 * It draws the three border provinces and lights up every district the account
 * is allowed to see — the same territory the app is about to scope everything
 * to. A spinner with a checklist said nothing about this product; watching your
 * own area come up does.
 */
export function SignInTransition({ user, onDone }: { user: User; onDone: () => void }) {
  const { lang, pn } = useI18n()
  const th = lang === 'th'
  const meta = ROLE_META[user.role]

  useEffect(() => {
    const timer = window.setTimeout(onDone, HOLD_MS)
    return () => clearTimeout(timer)
  }, [onDone])

  /** district pins, in the account's territory first so those light up first */
  const pins = useMemo(() => {
    const inScope = (d: (typeof DISTRICTS_GEO)[number]) =>
      user.districtKey ? d.key === user.districtKey : user.provinceKey ? d.provinceKey === user.provinceKey : true
    return DISTRICTS_GEO.filter((d) => SBP_PROVINCE_KEYS.includes(d.provinceKey as 'pattani'))
      .map((d) => ({
        key: d.key,
        x: projectLon(d.lon),
        y: projectLat(d.lat),
        mine: inScope(d),
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine))
  }, [user.districtKey, user.provinceKey])

  const mineCount = pins.filter((p) => p.mine).length

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[110] overflow-hidden bg-[#050d24]"
    >
      {/* ground: one slow drifting glow, nothing that reads as a spinner */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_50%_45%,rgba(47,102,246,0.42),transparent_70%)]"
        animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.12, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative flex h-full flex-col items-center justify-center px-6">
        <div className="relative h-[52vh] max-h-[420px] w-full max-w-[420px]">
          <svg viewBox={SBP_VIEWBOX.str} className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="sit-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#2f66f6" stopOpacity="0.10" />
              </linearGradient>
              <filter id="sit-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="1.6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* the coastline, drawing itself province by province */}
            {SBP_PROVINCE_KEYS.map((k, i) => (
              <motion.path
                key={k}
                d={PROVINCE_PATHS[k].d}
                fill="url(#sit-fill)"
                stroke="#7dd3fc"
                strokeWidth={0.7}
                strokeLinejoin="round"
                filter="url(#sit-glow)"
                initial={{ pathLength: 0, fillOpacity: 0 }}
                animate={{ pathLength: 1, fillOpacity: 1 }}
                transition={{
                  pathLength: { duration: 0.85, delay: i * 0.16, ease: 'easeInOut' },
                  fillOpacity: { duration: 0.5, delay: 0.5 + i * 0.16 },
                }}
              />
            ))}

            {/* every district, the account's own territory first */}
            {pins.map((p, i) => (
              <g key={p.key}>
                {p.mine && (
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={1.2}
                    fill="none"
                    stroke="#7dd3fc"
                    strokeWidth={0.4}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: [0.6, 3.2], opacity: [0.9, 0] }}
                    transition={{
                      duration: 1.4,
                      delay: 0.7 + i * 0.028,
                      repeat: Infinity,
                      repeatDelay: 0.4,
                      ease: 'easeOut',
                    }}
                    style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                  />
                )}
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  r={p.mine ? 1.15 : 0.7}
                  fill={p.mine ? '#ffffff' : '#7dd3fc'}
                  filter="url(#sit-glow)"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: p.mine ? 1 : 0.45 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 20,
                    delay: 0.7 + i * 0.028,
                  }}
                  style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* one line of copy, and who is coming in */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-2 text-center text-[22px] font-bold leading-tight text-white"
        >
          {th ? 'กำลังเปิดพื้นที่ของคุณ' : 'Opening your area'}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.02 }}
          className="mt-3 flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3.5 ring-1 ring-white/20"
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-full text-white"
            style={{ backgroundColor: meta.color }}
          >
            {roleIcon(user.role, 14)}
          </span>
          <span className="text-[12px] font-semibold text-white">{user.name}</span>
          <span className="text-[12px] text-white/55">
            {user.provinceKey ? pn(user.provinceKey) : th ? 'จชต. ทั้งพื้นที่' : 'All three provinces'}
            {' · '}
            {th ? `${mineCount} อำเภอ` : `${mineCount} districts`}
          </span>
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  )
}
