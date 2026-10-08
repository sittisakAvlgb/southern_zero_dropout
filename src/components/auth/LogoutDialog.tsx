import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { useAuth } from '@/auth/AuthContext'
import { ROLE_META } from '@/auth/roles'
import { roleIcon } from './roleIcon'
import { IconClose, IconLogout } from '@/components/icons'

/**
 * Signing out drops the whole scoped session, so it asks first. Rendered through
 * a portal: the sidebar and the top bar both open it, and neither of their
 * stacking contexts should be able to clip it.
 */
export function LogoutDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  const { lang } = useI18n()
  const { user } = useAuth()
  const th = lang === 'th'
  const meta = ROLE_META[user?.role ?? 'exec']

  // Escape cancels, Enter confirms — a two-button dialog should need no mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
        className="absolute inset-0 bg-brand-950/45 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 26 }}
        className="relative w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-[0_28px_80px_rgba(4,14,38,0.4)]"
      >
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
          aria-label={th ? 'ปิด' : 'Close'}
        >
          <IconClose width={16} height={16} />
        </button>

        <div className="px-6 pb-5 pt-7 text-center">
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.05 }}
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-risk-critical/10 text-risk-critical"
          >
            <IconLogout width={26} height={26} />
          </motion.span>

          <h3 className="mt-4 text-[17px] font-bold text-ink">
            {th ? 'ออกจากระบบหรือไม่' : 'Sign out?'}
          </h3>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-ink-muted">
            {th
              ? 'งานที่กำลังทำอยู่บนหน้าจอจะไม่ถูกบันทึก และต้องเข้าสู่ระบบใหม่เพื่อดูข้อมูลพื้นที่ของคุณ'
              : 'Anything unsaved on screen is lost, and you will need to sign in again to see your area.'}
          </p>

          {user && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-surface-muted px-3 py-2.5 text-left">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                style={{ backgroundColor: meta.color }}
              >
                {roleIcon(user.role, 18)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {user.name}
                </span>
                <span className="block truncate text-[11px] text-ink-muted">
                  {th ? meta.th : meta.en}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-surface-border bg-surface-muted/40 p-3">
          <motion.button
            onClick={onCancel}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="flex-1 rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            {th ? 'อยู่ต่อ' : 'Stay'}
          </motion.button>
          <motion.button
            onClick={onConfirm}
            autoFocus
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-risk-critical px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-95"
          >
            <IconLogout width={15} height={15} />
            {th ? 'ออกจากระบบ' : 'Sign out'}
          </motion.button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
