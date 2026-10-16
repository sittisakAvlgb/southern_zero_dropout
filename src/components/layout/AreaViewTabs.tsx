import { NavLink } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { inMenu, canAccess } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'

/**
 * แผนที่ (/geo) กับ เจาะลึกรายพื้นที่ (/area) เป็นเมนูเดียว สองมุมมอง
 *
 * สองเมนูติดกันตอบคำถามเดียวกัน ("พื้นที่ไหนเป็นอย่างไร") — ต่างแค่ว่าดูบนแผนที่หรือดูเป็นตาราง
 * บัญชีที่เห็นทั้งคู่ (สพฐ. · เขต) จึงเหลือเมนูเดียว และสลับมุมมองที่นี่
 * บัญชีที่มีแค่ /area (ผู้บริหารพื้นที่) ยังเห็นเมนูเดิม และไม่เห็นแถบนี้
 */
export function AreaViewTabs() {
  const { user } = useAuth()
  const { t } = useI18n()
  if (!user || !canAccess(user, '/geo') || !canAccess(user, '/area') || inMenu(user, '/area')) return null
  const tabs = [
    { to: '/geo', label: t('area.view.map') },
    { to: '/area', label: t('area.view.detail') },
  ]
  return (
    <nav aria-label={t('nav.geo')} className="mb-3 inline-flex rounded-xl bg-surface-muted p-1">
      {tabs.map((x) => (
        <NavLink
          key={x.to}
          to={x.to}
          className={({ isActive }) =>
            `rounded-lg px-4 py-2 text-[14.5px] font-semibold ${isActive ? 'bg-white text-brand-700 shadow-card' : 'text-ink-muted hover:text-ink'}`
          }
        >
          {x.label}
        </NavLink>
      ))}
    </nav>
  )
}
