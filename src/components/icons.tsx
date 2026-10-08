import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...p,
})

export const IconOverview = (p: P) => (
  <svg {...base(p)}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
)
export const IconMap = (p: P) => (
  <svg {...base(p)}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>
)
export const IconProvince = (p: P) => (
  <svg {...base(p)}><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
)
export const IconCause = (p: P) => (
  <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
)
export const IconIntervention = (p: P) => (
  <svg {...base(p)}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
)
export const IconSchool = (p: P) => (
  <svg {...base(p)}><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M6 11v5c0 1 2.7 3 6 3s6-2 6-3v-5" /></svg>
)
export const IconStudent = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-3.9 3.6-6 8-6s8 2.1 8 6" /></svg>
)
export const IconAI = (p: P) => (
  <svg {...base(p)}><rect x="4" y="6" width="16" height="12" rx="3" /><path d="M9 11h.01M15 11h.01M9 15h6M12 3v3" /><circle cx="12" cy="3" r="0.6" fill="currentColor" /></svg>
)
export const IconReport = (p: P) => (
  <svg {...base(p)}><path d="M14 3v5h5" /><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M8 13h8M8 17h5" /></svg>
)
export const IconSettings = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 1.7V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
)
export const IconSearch = (p: P) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
)
export const IconBell = (p: P) => (
  <svg {...base(p)}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
)
export const IconGlobe = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18-2.5-2.6-2.5-15.4 0-18Z" /></svg>
)
export const IconUp = (p: P) => (
  <svg {...base(p)}><path d="m6 15 6-6 6 6" /></svg>
)
export const IconDown = (p: P) => (
  <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>
)
export const IconArrowRight = (p: P) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const IconAlert = (p: P) => (
  <svg {...base(p)}><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
)
export const IconUsers = (p: P) => (
  <svg {...base(p)}><circle cx="9" cy="8" r="3.2" /><path d="M2 20c0-3.3 3.1-5 7-5s7 1.7 7 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M22 20c0-2.6-1.6-4.2-4-4.8" /></svg>
)
export const IconShield = (p: P) => (
  <svg {...base(p)}><path d="M12 3 5 6v5c0 5 3.4 8.5 7 10 3.6-1.5 7-5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
)
export const IconReturn = (p: P) => (
  <svg {...base(p)}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
)
export const IconEye = (p: P) => (
  <svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
)
export const IconExport = (p: P) => (
  <svg {...base(p)}><path d="M12 15V3M8 7l4-4 4 4" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
)
export const IconClock = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const IconSend = (p: P) => (
  <svg {...base(p)}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>
)
/** list view — rows of text */
export const IconList = (p: P) => (
  <svg {...base(p)}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
)
/** grid view — cards in a 2×2 block */
export const IconGrid = (p: P) => (
  <svg {...base(p)}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>
)
export const IconChevronLeft = (p: P) => (
  <svg {...base(p)}><path d="m15 6-6 6 6 6" /></svg>
)
export const IconClose = (p: P) => (
  <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
)
export const IconMenu = (p: P) => (
  <svg {...base(p)}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
)
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>
)
export const IconChevronRight = (p: P) => (
  <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
)
export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconMinus = (p: P) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
)
export const IconHome = (p: P) => (
  <svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></svg>
)
export const IconSparkle = (p: P) => (
  <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
)
export const IconMail = (p: P) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
)
export const IconUser = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" /></svg>
)
export const IconLock = (p: P) => (
  <svg {...base(p)}><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
)
export const IconLogout = (p: P) => (
  <svg {...base(p)}><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
)

// ── Southern Zero Dropout modules ────────────────────────────
/** Tambon / community — a cluster of homes around a shared centre */
export const IconTambon = (p: P) => (
  <svg {...base(p)}><path d="M12 2.5 4 6.5v11L12 21.5l8-4v-11l-8-4Z" /><circle cx="12" cy="12" r="2.6" /><path d="M12 6.2v3.2M12 14.6v3.2M6.6 9.1l2.8 1.6M14.6 13.3l2.8 1.6M17.4 9.1l-2.8 1.6M9.4 13.3l-2.8 1.6" /></svg>
)
/** Out-of-school registry — a searching eye over a list */
export const IconRegistry = (p: P) => (
  <svg {...base(p)}><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H15l5 5v5.5" /><path d="M14 3v5h5" /><path d="M4 4.5V19a2 2 0 0 0 2 2h5" /><path d="M8 9h3M8 13h3" /><circle cx="17" cy="17.5" r="3.5" /><path d="m20 20.5 1.6 1.6" /></svg>
)
/** Opportunity pathway — one road that forks into destinations */
export const IconPathway = (p: P) => (
  <svg {...base(p)}><path d="M5 21v-5a4 4 0 0 1 4-4h6" /><path d="M19 4h-4a4 4 0 0 0-4 4v4" /><circle cx="5" cy="21" r="1.6" /><circle cx="19" cy="4" r="1.6" /><path d="m16.5 9.5 2.5 2.5-2.5 2.5" /><path d="M12 12h7" /></svg>
)
/** Referral — a hand-off between two organisations */
export const IconReferral = (p: P) => (
  <svg {...base(p)}><circle cx="6" cy="6.5" r="3" /><circle cx="18" cy="17.5" r="3" /><path d="M9 7.5h5a3 3 0 0 1 3 3v4" /><path d="m14.5 12 2.5 2.5 2.5-2.5" /></svg>
)
/** Agency / partner organisation */
export const IconAgency = (p: P) => (
  <svg {...base(p)}><path d="M3 21h18" /><path d="M5 21V8.5L12 4l7 4.5V21" /><path d="M9.5 21v-5h5v5" /><path d="M9 11h.01M15 11h.01" /></svg>
)
/** Education service area office (สพม.) — a columned civil-service building,
 *  kept distinct from IconAgency's pitched roof and IconSchool's cap */
export const IconEduOffice = (p: P) => (
  <svg {...base(p)}><path d="M3 21h18" /><path d="m12 3 9 4.5H3L12 3Z" /><path d="M5.5 21V11M10 21V11M14 21V11M18.5 21V11" /></svg>
)
/** Educational service area office (เขตพื้นที่การศึกษา) — a bounded area with a
 *  cluster of schools inside it */
export const IconEduArea = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2.5" strokeDasharray="3 2" /><path d="m8 11 3-1.6 3 1.6-3 1.6L8 11Z" /><path d="M9.2 12v2c0 .6 1 1.2 1.8 1.2s1.8-.6 1.8-1.2v-2" /></svg>
)
/** Consent / PDPA */
export const IconConsent = (p: P) => (
  <svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h5" /><path d="m9 16.5 1.8 1.8L15 14" /></svg>
)
