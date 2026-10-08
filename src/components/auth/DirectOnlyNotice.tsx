import { motion } from 'framer-motion'
import { useAuth } from '@/auth/AuthContext'
import { canWorkCases } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { IconEye } from '@/components/icons'

/**
 * Shown on the case-level screens to a seat that reads and directs rather than
 * acts — สพฐ. ส่วนกลาง and ศอ.บต.
 *
 * The alternative was to quietly drop the action buttons, which leaves a
 * reviewer wondering whether the feature is missing or withheld. Saying it
 * makes the rule part of the product: the executive still sees every child who
 * has no plan, and still names the อำเภอ that has to fix it.
 */
export function DirectOnlyNotice() {
  const { user } = useAuth()
  const { lang } = useI18n()
  const th = lang === 'th'
  if (canWorkCases(user)) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">
        <IconEye width={13} height={13} />
        {th ? 'อ่านอย่างเดียว' : 'Read only'}
      </span>
      <span className="text-amber-900">
        {th
          ? 'บัญชีระดับกำกับดูแลไม่ลงมือกับเคสรายบุคคล — เจ้าของเคสคือเขตพื้นที่ โรงเรียน หรือครูผู้รับผิดชอบ'
          : 'A supervising account does not act on individual cases — the owner is the area office, the school or the responsible teacher.'}
      </span>
    </motion.div>
  )
}
