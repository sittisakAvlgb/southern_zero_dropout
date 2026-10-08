import { motion } from 'framer-motion'
import { useAuth } from '@/auth/AuthContext'
import { useScopedData } from '@/auth/scope'
import { ROLE_META, isAreaWide } from '@/auth/roles'
import { ESA_BY_KEY } from '@/data/esa'
import { useI18n } from '@/i18n/LanguageContext'
import { IconEye } from '@/components/icons'

/** Slim strip telling the user which role/scope they are viewing as. */
export function ScopeBanner() {
  const { user } = useAuth()
  const { schools } = useScopedData()
  const schoolName = schools[0]?.name
  const { lang, pn, pick } = useI18n()
  // The ศอ.บต. seat sees the whole area → the banner adds no information.
  // Only show it for scoped accounts, where it signals limited visibility.
  if (isAreaWide(user) || !user) return null
  const meta = ROLE_META[user.role]

  const scopeParts: string[] = []
  if (user.provinceKey) scopeParts.push(pn(user.provinceKey))
  else scopeParts.push(pick({ th: meta.scopeTh, en: meta.scopeEn }))
  // the เขต is the narrower fact, so it belongs next to the province it is in
  const esa = user.esaKey ? ESA_BY_KEY[user.esaKey] : undefined
  if (esa) scopeParts.push(pick({ th: esa.th, en: esa.en, ms: esa.ms }))
  // Name the school rather than saying "an assigned school" beside a province
  // the director does not run — the same rule the เขต line follows above.
  if (user.role === 'school')
    scopeParts.push(
      schoolName ?? (lang === 'th' ? 'โรงเรียนในสังกัด' : 'assigned school'),
    )
  if (user.role === 'teacher' && user.ownerName) scopeParts.push(user.ownerName)

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3.5 py-2.5 text-sm"
      style={{ borderColor: `${meta.color}33`, backgroundColor: `${meta.color}0d` }}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
        style={{ backgroundColor: meta.color }}
      >
        <IconEye width={13} height={13} />
        {lang === 'th' ? 'กำลังดูในฐานะ' : 'Viewing as'}
      </span>
      <span className="font-semibold text-ink">{pick({ th: meta.th, en: meta.en, ms: meta.ms })}</span>
      <span className="text-ink-faint">·</span>
      <span className="text-ink-muted">{scopeParts.join(' · ')}</span>
    </motion.div>
  )
}
