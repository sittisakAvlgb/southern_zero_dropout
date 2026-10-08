import type { ReactNode } from 'react'
import {
  IconCause,
  IconGlobe,
  IconIntervention,
  IconMap,
  IconOverview,
  IconPathway,
  IconProvince,
  IconReferral,
  IconRegistry,
  IconReport,
  IconSchool,
  IconSettings,
  IconStudent,
  IconTambon,
} from '../icons'

export interface NavItem {
  to: string
  labelKey: string
  /** Used instead when the account governs an เขต rather than a whole province.
   *  A สพท. seat never sees a full จังหวัด, so "เจาะลึกจังหวัด" named a level
   *  above the one it works at. */
  esaLabelKey?: string
  icon: (p: { width?: number; height?: number }) => ReactNode
  section: 'monitor' | 'design' | 'action' | 'system'
}

/** The label to render for this item and this account. Every surface that
 *  prints a nav label goes through here so they cannot drift apart. */
export function navLabelKey(item: NavItem, user: { esaKey?: string } | null): string {
  return user?.esaKey && item.esaLabelKey ? item.esaLabelKey : item.labelKey
}

// The four sections narrate the platform's promise in order:
// see every child → design their opportunity → act → run the system.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.overview', esaLabelKey: 'nav.overview.esa', icon: IconOverview, section: 'monitor' },
  { to: '/geo', labelKey: 'nav.geo', icon: IconGlobe, section: 'monitor' },
  { to: '/risk-map', labelKey: 'nav.riskmap', icon: IconMap, section: 'monitor' },
  { to: '/area', labelKey: 'nav.area', esaLabelKey: 'nav.area.esa', icon: IconProvince, section: 'monitor' },
  { to: '/tambon', labelKey: 'nav.tambon', icon: IconTambon, section: 'monitor' },
  { to: '/oosc', labelKey: 'nav.oosc', icon: IconRegistry, section: 'monitor' },
  { to: '/cause', labelKey: 'nav.cause', icon: IconCause, section: 'monitor' },
  { to: '/plan', labelKey: 'nav.plan', icon: IconPathway, section: 'design' },
  { to: '/referral', labelKey: 'nav.referral', icon: IconReferral, section: 'design' },
  { to: '/intervention', labelKey: 'nav.intervention', icon: IconIntervention, section: 'action' },
  { to: '/school', labelKey: 'nav.school', icon: IconSchool, section: 'action' },
  { to: '/student', labelKey: 'nav.student', icon: IconStudent, section: 'action' },
  { to: '/reports', labelKey: 'nav.reports', icon: IconReport, section: 'system' },
  { to: '/settings', labelKey: 'nav.settings', icon: IconSettings, section: 'system' },
]

export const NAV_BY_PATH: Record<string, NavItem> = Object.fromEntries(
  NAV_ITEMS.map((n) => [n.to, n]),
)

/** compact set for the mobile bottom bar (AI lives in the floating chat widget) */
export const BOTTOM_NAV: NavItem[] = [
  NAV_ITEMS.find((n) => n.to === '/')!,
  NAV_ITEMS.find((n) => n.to === '/oosc')!,
  NAV_ITEMS.find((n) => n.to === '/plan')!,
  NAV_ITEMS.find((n) => n.to === '/referral')!,
  NAV_ITEMS.find((n) => n.to === '/tambon')!,
]
