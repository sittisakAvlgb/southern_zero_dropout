import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { useAuth } from '@/auth/AuthContext'
import { ROLE_META, canAccess } from '@/auth/roles'
import { useScopedData } from '@/auth/scope'
import { roleIcon } from '@/components/auth/roleIcon'
import { LogoutDialog } from '@/components/auth/LogoutDialog'
import { formatNumber } from '@/lib/format'
import {
  IconAlert,
  IconArrowRight,
  IconBell,
  IconClock,
  IconConsent,
  IconGlobe,
  IconLogout,
  IconMenu,
  IconSearch,
  IconSettings,
} from '../icons'
import { ESA_BY_KEY } from '@/data/esa'
import { navLabelKey, NAV_BY_PATH } from './navItems'
import { SmartSearch } from './SmartSearch'

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { t, lang, toggle, pn, pick } = useI18n()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const th = lang === 'th'
  const { cases, oosc, referrals } = useScopedData()

  const [searchOpen, setSearchOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  /** Close the dropdowns on any click outside them. A full-screen catcher div
   *  cannot do this from in here: the header's backdrop-filter makes it the
   *  containing block for fixed children, so the catcher only ever covered the
   *  header strip itself. */
  useEffect(() => {
    if (!bellOpen && !profileOpen) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (bellOpen && !bellRef.current?.contains(t)) setBellOpen(false)
      if (profileOpen && !profileRef.current?.contains(t)) setProfileOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [bellOpen, profileOpen])

  const meta = user ? ROLE_META[user.role] : null
  const page = NAV_BY_PATH[pathname]

  /** where this account is standing, in one line. A สพท. seat is named by its
   *  เขต, not by the province it sits inside — the province is the level above
   *  the one it governs. */
  const scopeLine = useMemo(() => {
    if (!user) return ''
    const esa = user.esaKey ? ESA_BY_KEY[user.esaKey] : undefined
    const parts = [
      esa
        ? pick(esa)
        : user.provinceKey
          ? pn(user.provinceKey)
          : th
            ? 'จชต. ทั้งพื้นที่'
            : 'All three provinces',
    ]
    if (user.schoolKey) parts.push(user.schoolKey)
    return parts.join(' · ')
  }, [user, pn, pick, th])

  /** Alerts computed from the rows this account can actually see — the panel
   *  used to list provinces that are not even in this platform's scope. */
  const alerts = useMemo(() => {
    const overdueCases = cases.filter((c) => c.slaBreached).length
    const urgentCases = cases.filter((c) => c.urgent && !c.slaBreached).length
    const unowned = oosc.filter((r) => !r.ownerName).length
    const overdueRefs = referrals.filter((r) => r.status === 'overdue').length
    return [
      {
        key: 'sla',
        n: overdueCases,
        icon: IconClock,
        color: '#dc2626',
        title: th ? 'เคสเกินกำหนด SLA' : 'Cases past their SLA',
        body: th ? 'ต้องเร่งปิดหรือขอขยายเวลา' : 'Close them or ask for an extension',
        to: '/intervention',
      },
      {
        key: 'urgent',
        n: urgentCases,
        icon: IconAlert,
        color: '#f97316',
        title: th ? 'เคสเร่งด่วนที่ยังเปิดอยู่' : 'Urgent cases still open',
        body: th ? 'ยังอยู่ในกรอบเวลา แต่ต้องตามใกล้ชิด' : 'Inside SLA, but need close follow-up',
        to: '/intervention',
      },
      {
        key: 'unowned',
        n: unowned,
        icon: IconConsent,
        color: '#eab308',
        title: th ? 'เด็กในทะเบียนที่ยังไม่มีเจ้าภาพ' : 'Registry children with no owner',
        body: th ? 'ต้องมอบหมายก่อนจึงเริ่มงานได้' : 'Assign someone before work can start',
        to: '/oosc',
      },
      {
        key: 'refs',
        n: overdueRefs,
        icon: IconArrowRight,
        color: '#dc2626',
        title: th ? 'ส่งต่อที่เลยกำหนดรับเรื่อง' : 'Referrals past their accept-by date',
        body: th ? 'หน่วยงานปลายทางยังไม่ตอบรับ' : 'The receiving agency has not responded',
        to: '/referral',
      },
    ].filter((a) => a.n > 0)
  }, [cases, oosc, referrals, th])

  const alertTotal = alerts.reduce((s, a) => s + a.n, 0)
  const go = (to: string) => {
    setBellOpen(false)
    setProfileOpen(false)
    nav(user && !canAccess(user, to) ? '/' : to)
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-surface-border bg-white/85 px-4 backdrop-blur-md md:px-6">
      <motion.button
        onClick={onToggleSidebar}
        whileTap={{ scale: 0.92 }}
        className="hidden rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink md:block"
        aria-label="toggle sidebar"
      >
        <IconMenu />
      </motion.button>

      {/* Where you are — the header used to say nothing at all */}
      {page && (
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[13px] font-bold leading-tight text-ink">
            {t(navLabelKey(page, user))}
          </p>
          <p className="truncate text-[10.5px] leading-tight text-ink-faint">{scopeLine}</p>
        </div>
      )}

      {/* Search */}
      <motion.button
        onClick={() => setSearchOpen(true)}
        whileTap={{ scale: 0.99 }}
        className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-surface-border bg-surface-muted px-3.5 py-2.5 text-left text-sm text-ink-faint transition-all hover:border-brand-300 hover:bg-white lg:mx-auto lg:max-w-sm"
        aria-label={t('top.search')}
      >
        <IconSearch width={18} height={18} />
        <span className="truncate">{t('top.search')}</span>
        <kbd className="ml-auto hidden rounded border border-surface-border bg-white px-1.5 py-0.5 text-[10px] text-ink-faint md:block">
          Ctrl K
        </kbd>
      </motion.button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2">
        {/* what the numbers on screen are — stated, not dressed up as live data */}
        <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 ring-1 ring-amber-200 lg:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-[11px] font-semibold text-amber-700">
            {th ? 'ข้อมูลจำลองเพื่อสาธิต' : 'Demonstration data'}
          </span>
        </span>

        <motion.button
          onClick={toggle}
          whileTap={{ scale: 0.94 }}
          className="flex items-center gap-1.5 rounded-xl border border-surface-border px-2.5 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted"
          aria-label={t('top.langToggle')}
        >
          <IconGlobe width={18} height={18} />
          <span className={lang === 'th' ? 'text-brand-600' : ''}>TH</span>
          <span className="text-ink-faint">/</span>
          <span className={lang === 'en' ? 'text-brand-600' : ''}>EN</span>
        </motion.button>

        {/* Notifications */}
        <div className="relative" ref={bellRef}>
          <motion.button
            onClick={() => setBellOpen((v) => !v)}
            whileTap={{ scale: 0.92 }}
            className={`relative rounded-xl border p-2 transition-colors ${
              bellOpen
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-surface-border text-ink-muted hover:bg-surface-muted'
            }`}
            aria-label={t('top.notifications')}
          >
            <motion.span
              className="block"
              animate={alertTotal > 0 ? { rotate: [0, -12, 10, -6, 0] } : undefined}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 6 }}
            >
              <IconBell />
            </motion.span>
            {alertTotal > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-risk-critical px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">
                {alertTotal > 99 ? '99+' : alertTotal}
              </span>
            )}
          </motion.button>

          {bellOpen && (
            <>
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className="absolute right-0 top-12 z-50 w-[330px] overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card-hover"
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-surface-border px-4 py-3">
                  <p className="text-sm font-bold text-ink">{t('top.notifications')}</p>
                  <p className="truncate text-[10.5px] text-ink-faint">{scopeLine}</p>
                </div>

                {alerts.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
                    {th ? 'ไม่มีอะไรค้างในขอบเขตของคุณ' : 'Nothing outstanding in your scope'}
                  </p>
                ) : (
                  <ul>
                    {alerts.map((a, i) => {
                      const Icon = a.icon
                      return (
                        <motion.li
                          key={a.key}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.04 + i * 0.05 }}
                        >
                          <button
                            onClick={() => go(a.to)}
                            className="group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-brand-50/60"
                          >
                            <span
                              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
                              style={{ backgroundColor: a.color }}
                            >
                              <Icon width={14} height={14} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-[12.5px] font-semibold text-ink">
                                  {a.title}
                                </span>
                                <span
                                  className="tabular shrink-0 text-[13px] font-bold"
                                  style={{ color: a.color }}
                                >
                                  {formatNumber(a.n, lang)}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-faint">
                                {a.body}
                              </span>
                            </span>
                            <IconArrowRight
                              width={13}
                              height={13}
                              className="mt-1.5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                            />
                          </button>
                        </motion.li>
                      )
                    })}
                  </ul>
                )}
              </motion.div>
            </>
          )}
        </div>

        {/* Profile — the sidebar footer carries it on desktop */}
        <div className="relative md:hidden" ref={profileRef}>
          <motion.button
            onClick={() => setProfileOpen((v) => !v)}
            whileTap={{ scale: 0.94 }}
            className="flex items-center gap-2.5 rounded-xl border border-surface-border py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-muted"
            aria-label={t('top.profile')}
          >
            <span
              className="grid h-8 w-8 place-items-center rounded-lg text-white"
              style={{ backgroundColor: meta?.color ?? '#0f2a6b' }}
            >
              {user ? roleIcon(user.role, 16) : null}
            </span>
          </motion.button>

          {profileOpen && user && meta && (
            <>
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-surface-border bg-white p-3 shadow-card-hover"
              >
                <div className="flex items-center gap-3 px-1 pb-3">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-xl text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {roleIcon(user.role, 20)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    <p className="truncate text-[11px] text-ink-muted">{user.email}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-surface-muted px-3 py-2 text-[11px]">
                  <p className="font-semibold text-ink">{th ? meta.th : meta.en}</p>
                  <p className="text-ink-muted">
                    {th ? 'ขอบเขต: ' : 'Scope: '}
                    {scopeLine}
                  </p>
                </div>
                <button
                  onClick={() => go('/settings')}
                  className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  <IconSettings width={16} height={16} />
                  {t('nav.settings')}
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    setConfirmOut(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-risk-critical transition-colors hover:bg-risk-critical/10"
                >
                  <IconLogout width={16} height={16} />
                  {th ? 'ออกจากระบบ' : 'Sign out'}
                </button>
              </motion.div>
            </>
          )}
        </div>
      </div>

      {searchOpen && <SmartSearch onClose={() => setSearchOpen(false)} />}

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
    </header>
  )
}
