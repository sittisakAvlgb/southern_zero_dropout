import { NavLink } from 'react-router-dom'
import { useI18n } from '@/i18n/LanguageContext'
import { useAuth } from '@/auth/AuthContext'
import { canAccess } from '@/auth/roles'
import { BOTTOM_NAV, navLabelKey } from './navItems'

export function BottomNav() {
  const { t } = useI18n()
  const { user } = useAuth()
  const items = BOTTOM_NAV.filter((n) => !user || canAccess(user, n.to))
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-surface-border bg-white/95 backdrop-blur-md md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex flex-1 flex-col items-center justify-center gap-0.5"
        >
          {({ isActive }) => (
            <>
              <span className={isActive ? 'text-brand-600' : 'text-ink-faint'}>
                <item.icon width={22} height={22} />
              </span>
              <span
                className={`text-[9px] font-medium ${
                  isActive ? 'text-brand-600' : 'text-ink-faint'
                }`}
              >
                {t(navLabelKey(item, user))}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
