import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { useAuth } from '@/auth/AuthContext'
import { canAccess, ROLE_META } from '@/auth/roles'
import { useScopedData } from '@/auth/scope'
import { roleIcon } from '@/components/auth/roleIcon'
import { LogoutDialog } from '@/components/auth/LogoutDialog'
import { navLabelKey, NAV_ITEMS } from './navItems'
import { IconChevronRight, IconLogout, IconShield } from '../icons'
import { Logo } from '../ui/Logo'

const SECTIONS = ['monitor', 'design', 'action', 'system'] as const

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const { t, lang, pick } = useI18n()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const th = lang === 'th'
  const { cases, students } = useScopedData()
  const [confirmOut, setConfirmOut] = useState(false)

  const visible = NAV_ITEMS.filter((n) => !user || canAccess(user, n.to))
  const meta = ROLE_META[user?.role ?? 'exec']

  // attention badges from scoped data
  const urgent = cases.filter((c) => c.urgent || c.slaBreached).length
  const highRisk = students.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical').length
  const badges: Record<string, { n: number; color: string }> = {}
  if (urgent > 0) badges['/intervention'] = { n: urgent, color: '#dc2626' }
  if (highRisk > 0 && canAccess(user, '/student')) badges['/student'] = { n: highRisk, color: '#f97316' }

  return (
    <aside
      className={`sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-surface-border bg-white transition-[width] duration-300 ease-in-out md:flex ${
        collapsed ? 'w-[76px]' : 'w-[248px]'
      }`}
    >
      {/* Floating collapse toggle */}
      <button
        onClick={onToggle}
        aria-label={collapsed ? (th ? 'ขยายเมนู' : 'Expand menu') : (th ? 'ย่อเมนู' : 'Collapse menu')}
        className="absolute -right-3 top-[70px] z-40 grid h-6 w-6 place-items-center rounded-full border border-surface-border bg-white text-ink-muted shadow-sm transition-colors hover:border-brand-300 hover:text-brand-600"
      >
        <motion.span animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.25 }}>
          <IconChevronRight width={14} height={14} />
        </motion.span>
      </button>

      {/* Brand — sober navy masthead */}
      <div className="flex h-16 items-center gap-2.5 overflow-hidden bg-brand-950 px-4 text-white">
        <Logo size={44} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight">Southern Zero Dropout</p>
            <p className="truncate text-[10px] text-white/55">{t('app.tagline')}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {SECTIONS.map((section) => {
          const items = visible.filter((n) => n.section === section)
          if (items.length === 0) return null
          return (
            <div key={section} className="mb-5">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t(`nav.section.${section}`)}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const badge = badges[item.to]
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        title={collapsed ? t(navLabelKey(item, user)) : undefined}
                        className="group relative block"
                      >
                        {({ isActive }) => (
                          <motion.div
                            whileHover={isActive ? undefined : { x: 2 }}
                            whileTap={{ scale: 0.985 }}
                            className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                              isActive
                                ? 'font-semibold text-brand-800'
                                : 'font-medium text-ink-muted hover:bg-surface-muted hover:text-ink'
                            } ${collapsed ? 'justify-center' : ''}`}
                          >
                            {isActive && (
                              <>
                                <motion.span
                                  layoutId="nav-pill"
                                  className="absolute inset-0 rounded-lg bg-brand-50"
                                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                />
                                <motion.span
                                  layoutId="nav-bar"
                                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-700"
                                />
                              </>
                            )}
                            <span className={`relative z-10 ${isActive ? 'text-brand-700' : ''}`}>
                              <item.icon width={20} height={20} />
                            </span>
                            {!collapsed && (
                              <span className="relative z-10 flex-1 truncate">{t(navLabelKey(item, user))}</span>
                            )}
                            {/* badge */}
                            {badge && !collapsed && (
                              <span
                                className="relative z-10 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                                style={{ backgroundColor: badge.color }}
                              >
                                {badge.n > 99 ? '99+' : badge.n}
                              </span>
                            )}
                            {badge && collapsed && (
                              <span
                                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white"
                                style={{ backgroundColor: badge.color }}
                              />
                            )}
                          </motion.div>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* User profile */}
      <div className="border-t border-surface-border p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
              style={{ backgroundColor: meta.color }}
            >
              {user ? roleIcon(user.role, 18) : <IconShield width={18} height={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{user?.name ?? '—'}</p>
              <p className="truncate text-[10px] text-ink-muted">{pick({ th: meta.th, en: meta.en, ms: meta.ms })}</p>
            </div>
            {/* signing out drops the whole session, so it asks first */}
            <motion.button
              onClick={() => setConfirmOut(true)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              aria-label={th ? 'ออกจากระบบ' : 'Sign out'}
              title={th ? 'ออกจากระบบ' : 'Sign out'}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-risk-critical/10 hover:text-risk-critical"
            >
              <IconLogout width={17} height={17} />
            </motion.button>
          </div>
        ) : (
          <motion.button
            onClick={() => setConfirmOut(true)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            title={`${user?.name ?? ''} — ${th ? 'ออกจากระบบ' : 'Sign out'}`}
            aria-label={th ? 'ออกจากระบบ' : 'Sign out'}
            className="mx-auto grid h-9 w-9 place-items-center rounded-lg text-white"
            style={{ backgroundColor: meta.color }}
          >
            {user ? roleIcon(user.role, 18) : <IconShield width={18} height={18} />}
          </motion.button>
        )}
      </div>

      {confirmOut && (
        <LogoutDialog
          onCancel={() => setConfirmOut(false)}
          onConfirm={() => {
            setConfirmOut(false)
            logout()
            nav('/login', { replace: true })
          }}
        />
      )}
    </aside>
  )
}
