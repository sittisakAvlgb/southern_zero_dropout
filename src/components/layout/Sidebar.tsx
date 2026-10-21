import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { useAuth } from '@/auth/AuthContext'
import { canAccess, inMenu, NAV_MERGED_INTO, ROLE_META } from '@/auth/roles'
import { useScopedData } from '@/auth/scope'
import { logKeyOf, useCaseLog, waitsOnDirector } from '@/lib/caseLog'
import { useDirectorWork } from '@/components/director/useDirectorWork'
import { areaRequestStatus, useAreaLog } from '@/lib/areaLog'
import { FILTERS } from '@/lib/followOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { roleIcon } from '@/components/auth/roleIcon'
import { LogoutDialog } from '@/components/auth/LogoutDialog'
import { navLabelKey, NAV_ITEMS } from './navItems'
import { IconChevronRight, IconLogout, IconShield } from '../icons'
import { Logo } from '../ui/Logo'

const SECTIONS = ['monitor', 'design', 'action', 'system'] as const

/** เมนูของ ผอ. จัดตามงานของ ผอ. ไม่ใช่ตามขั้นของแพลตฟอร์ม — งานที่รอ ผอ. ขึ้นก่อน
 *  เดิม "เรื่องที่ต้องตัดสินใจ" อยู่กลางเมนูใต้ "ลงมือช่วยเหลือ" ทะเบียนเด็กนอกระบบอยู่ใต้ "มองเห็นทุกคน" */
const DIRECTOR_GROUPS: { key: string; items: string[] }[] = [
  { key: 'nav.section.school.today', items: ['/', '/decisions'] },
  { key: 'nav.section.school.children', items: ['/student', '/oosc', '/plan', '/referral'] },
  { key: 'nav.section.school.results', items: ['/school', '/reports'] },
  { key: 'nav.section.system', items: ['/settings'] },
]

/** เมนูของเขต จัดตามงานของเขต — เขตช่วยโรงเรียน ไม่ได้ลงมือกับเคสเอง
 *  เดิม "การช่วยเหลือ" ป้ายแดง 30 อยู่ใต้ "ลงมือช่วยเหลือ" ทั้งที่เขตลงมือกับเคสไม่ได้ (canWorkCases) และ
 *  "สถานศึกษา" ซึ่งเป็นหน่วยที่เขตดูแลจริงอยู่กลางกลุ่มนั้น ป้ายงานของเขตคือคำขอจากโรงเรียนที่รอเขตตัดสินใจ */
/** เมนูของ สพฐ. จัดตามงานของ สพฐ. เหมือนที่ ผอ. และเขตมีของตัวเอง
 *  เดิม สพฐ. ใช้กลุ่มกลาง (มองเห็นทุกคน · ออกแบบโอกาส · ลงมือช่วยเหลือ) ซึ่งเรียง
 *  ตามขั้นของแพลตฟอร์ม ไม่ใช่ตามงาน — "สถานศึกษา" ซึ่งเป็นหน่วยที่ สพฐ. กำกับจริง
 *  ไปอยู่กลางกลุ่ม "ลงมือช่วยเหลือ" ทั้งที่ สพฐ. ลงมือกับเคสไม่ได้ (canWorkCases)
 *  โครงเดียวกับ ESA_GROUPS เพราะ สพฐ. มีชุดหน้าเดียวกับเขต ต่างกันแค่ชั้นของหน่วย */
const OBEC_GROUPS: { key: string; items: string[] }[] = [
  { key: 'nav.section.obec.work', items: ['/', '/school'] },
  { key: 'nav.section.esa.children', items: ['/geo', '/oosc', '/student', '/plan', '/intervention'] },
  { key: 'nav.section.esa.results', items: ['/cause'] },
  { key: 'nav.section.system', items: ['/settings'] },
]

const ESA_GROUPS: { key: string; items: string[] }[] = [
  { key: 'nav.section.esa.work', items: ['/', '/school'] },
  { key: 'nav.section.esa.children', items: ['/geo', '/oosc', '/student', '/plan', '/intervention'] },
  { key: 'nav.section.esa.results', items: ['/cause', '/reports'] },
  { key: 'nav.section.system', items: ['/settings'] },
]

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
  const caseLog = useCaseLog(logKeyOf(user), user?.id)

  const visible = NAV_ITEMS.filter((n) => !user || inMenu(user, n.to))
  // อยู่บนหน้าที่ถูกรวมเข้าเมนูอื่น (เช่น /area ของเขต) — ให้เมนูที่รวมเข้าไปติดสถานะเลือกแทน
  const { pathname } = useLocation()
  const mergedActive = user && !inMenu(user, pathname) ? NAV_MERGED_INTO[pathname] : undefined
  // ผอ.: ตัวเลขบนเมนูมาจากแหล่งเดียวกับ "ต้องใช้ ผอ." ในแต่ละหน้า
  const work = useDirectorWork()
  const esa = user?.role === 'esa'
  const area = useAreaLog(esa ? user?.esaKey : undefined)
  const meta = ROLE_META[user?.role ?? 'exec']

  // attention badges from scoped data
  // บัญชีกำกับดูแล (เขต · สพฐ. · ศอ.บต.): หน้าการช่วยเหลือเปิดด้วย "N เคสเกิน SLA" ป้ายจึงนับแบบเดียวกัน
  // (เดิมนับเร่งด่วนหรือเกิน SLA ได้ 31 ขณะที่หน้าบอก 30) ครูยังนับแบบเดิม
  //
  // **เขตย้ายไปใช้ศูนย์ติดตามแบบเดียวกับครูแล้ว** ซึ่งนับ "เกิน SLA" จาก FollowCase
  // (รวมการส่งต่อที่เกินกำหนดด้วย) ไม่ใช่จาก `cases.slaBreached` — ป้ายจึงต้องนับ
  // จากชุดเดียวกัน ไม่งั้นเมนูบอก 30 ขณะที่หน้าบอก 32 ซึ่งเป็นอาการเดียวกับที่
  // คอมเมนต์ด้านบนเคยแก้ไว้ ใช้ `FILTERS` ตัวเดียวกับที่หน้าใช้ จะได้ไม่หลุดอีก
  //
  // **ครูก็อยู่ในกลุ่มนี้แล้ว** หน้าของครูเปิดด้วย "วันนี้ต้องติดตาม N เคส" ป้ายจึง
  // นับตัวกรอง `today` ชุดเดียวกัน เดิมนับ `urgent || slaBreached` จาก `cases` ดิบ
  // ได้ 7 ขณะที่หน้าเดียวกันไม่มีเลข 7 อยู่ที่ไหนเลย (วันนี้ 9 · เกิน SLA 8 ·
  // ทั้งหมด 11) ครูจึงเห็นป้ายที่กดเข้าไปแล้วหาไม่เจอว่าอีกสองเคสหายไปไหน
  const supervising = user?.role === 'esa' || user?.role === 'obec' || user?.role === 'exec'
  const { built: followBuilt } = useFollowCases()
  const followList = 'list' in followBuilt ? followBuilt.list : []
  const testOf = (k: 'sla' | 'today') => FILTERS.find((f) => f.k === k)!.test
  const urgent = esa
    ? followList.filter(testOf('sla')).length
    : user?.role === 'teacher'
      ? followList.filter(testOf('today')).length
      : cases.filter((c) => (supervising ? c.slaBreached : c.urgent || c.slaBreached)).length
  const highRisk = students.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical').length
  const badges: Record<string, { n: number; color: string; soft?: boolean }> = {}
  // เขต: เคสเกิน SLA เป็นข้อมูลที่ต้องรู้ ไม่ใช่งานที่เขตลงมือ — ป้ายอ่อน
  if (urgent > 0 && !work) badges['/intervention'] = esa ? { n: urgent, color: '#ea580c', soft: true } : { n: urgent, color: '#dc2626' }
  // ผอ.: ป้ายตัวเลขบนเมนูหมายถึง "งานที่รอ ผอ." อย่างเดียว — จำนวนเด็กเสี่ยงสูงไม่ใช่งานที่ต้องทำ
  if (highRisk > 0 && canAccess(user, '/student') && !work && !esa) badges['/student'] = { n: highRisk, color: '#f97316' }
  // คำขอจากครูที่รอ ผอ. — ตัวเลขเดียวกับ "ต้องตัดสินใจวันนี้" ในหน้าเรื่องที่ต้องตัดสินใจ
  const waiting = work ? work.decisions : Object.values(caseLog.requests).filter(waitsOnDirector).length
  if (waiting > 0 && canAccess(user, '/decisions')) badges['/decisions'] = { n: waiting, color: '#dc2626' }
  // ผอ.: เรื่องที่ต้องตัดสินใจเป็นป้ายทึบสีแดง (งานหลัก) หน้าอื่นเป็นป้ายอ่อน — เมนูไม่แดงส้มทั้งแถบ
  if (work) {
    if (work.plans) badges['/plan'] = { n: work.plans, color: '#ea580c', soft: true }
    if (work.referrals) badges['/referral'] = { n: work.referrals, color: '#ea580c', soft: true }
    if (work.oosc) badges['/oosc'] = { n: work.oosc, color: '#ea580c', soft: true }
  }
  // เขต: คำขอจากโรงเรียนที่รอเขตตัดสินใจ — ตัวเลขเดียวกับ "รอเขตตัดสินใจ" ในหน้าภาพรวมเขต
  const areaWaiting = area.requests.filter((r) => areaRequestStatus(r) === 'new').length
  if (esa && areaWaiting > 0) badges['/'] = { n: areaWaiting, color: '#dc2626' }
  const custom = work ? DIRECTOR_GROUPS : esa ? ESA_GROUPS : user?.role === 'obec' ? OBEC_GROUPS : null
  const groups = custom
    ? custom.map((g) => ({ key: g.key, items: g.items.map((to) => visible.find((n) => n.to === to)).filter((n): n is (typeof visible)[number] => Boolean(n)) }))
    : SECTIONS.map((s) => ({ key: `nav.section.${s}`, items: visible.filter((n) => n.section === s) }))

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
        {groups.map(({ key, items }) => {
          if (items.length === 0) return null
          return (
            <div key={key} className="mb-5">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[12px] font-semibold tracking-wide text-ink-muted">
                  {t(key)}
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
                        {({ isActive: own }) => {
                          const isActive = own || mergedActive === item.to
                          return (
                          <motion.div
                            whileHover={isActive ? undefined : { x: 2 }}
                            whileTap={{ scale: 0.985 }}
                            className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                              isActive
                                ? 'font-semibold text-brand-800'
                                : 'font-medium text-ink-muted hover:bg-surface-muted hover:text-ink'
                            } ${collapsed ? 'justify-center' : ''}`}
                          >
                            {/* แถบเลือกอยู่กับที่ ไม่เลื่อนข้ามรายการ — เดิมใช้ layoutId ให้เลื่อนจากเมนูเก่ามาเมนูใหม่
                                ระหว่างเลื่อน แถบทับข้อความของเมนูข้างบน (ดูเหมือนขีดฆ่า) และดูเหมือนเมนู "ตก" ลงมา */}
                            {isActive && (
                              <>
                                <span className="absolute inset-0 rounded-lg bg-brand-50" />
                                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-700" />
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
                                className={`relative z-10 min-w-[24px] rounded-full px-2 py-0.5 text-center text-[12px] font-bold tabular ${badge.soft ? '' : 'text-white'}`}
                                style={badge.soft ? { backgroundColor: `${badge.color}1a`, color: '#c2410c' } : { backgroundColor: badge.color }}
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
                          )
                        }}
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
