import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/auth/AuthContext'
import { LOGIN_ROLES, ROLE_META, type Role } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { PROVINCES } from '@/data/provinces'
import { SCHOOLS } from '@/data/schools'
import { AuthShell, AuthField } from '@/components/auth/AuthShell'
import { roleIcon } from '@/components/auth/roleIcon'
import { Select } from '@/components/ui/Select'
import {
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconLock,
  IconMail,
  IconUser,
} from '@/components/icons'

/** territory value meaning "the whole จชต. area" — only executives may pick it */
const AREA_WIDE = 'all'

type Status = 'idle' | 'submitting' | 'success'

export default function Register() {
  const { register } = useAuth()
  const { lang, pn } = useI18n()
  const nav = useNavigate()
  const th = lang === 'th'

  const [step, setStep] = useState<1 | 2>(1)
  const [dir, setDir] = useState(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(LOGIN_ROLES[0])
  const [provinceKey, setProvinceKey] = useState(AREA_WIDE)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  const meta = ROLE_META[role]

  // The two executive-family roles may cover the whole จชต. area — ศอ.บต. for
  // `exec`, สพฐ. ส่วนกลาง for `obec` — or a single province, which turns the
  // latter into a สพม. seat. Every other role belongs to one province.
  const canBeAreaWide = role === 'exec' || role === 'obec'
  const provinceOptions = useMemo(() => {
    const provs = [...PROVINCES]
      .map((p) => ({ value: p.key, label: pn(p.key) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th'))
    return canBeAreaWide
      ? [
          {
            value: AREA_WIDE,
            label: th ? 'ทั้งพื้นที่ จชต. (3 จังหวัด)' : 'Whole SBP area (3 provinces)',
          },
          ...provs,
        ]
      : provs
  }, [canBeAreaWide, pn, th])

  /** keep the territory valid when the role changes */
  const chooseRole = (r: Role) => {
    setRole(r)
    const rCanBeAreaWide = r === 'exec' || r === 'obec'
    if (!rCanBeAreaWide && provinceKey === AREA_WIDE) setProvinceKey('pattani')
  }

  const goStep = (s: 1 | 2) => {
    setError('')
    setDir(s > step ? 1 : -1)
    setStep(s)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (status !== 'idle') return
    setError('')
    if (!name.trim() || !email.trim() || !password) {
      setError(th ? 'กรุณากรอกข้อมูลให้ครบ' : 'Please fill in all fields')
      return
    }
    setStatus('submitting')
    window.setTimeout(() => {
      const territory = provinceKey === AREA_WIDE ? undefined : provinceKey
      // a school account must point at a real pilot school, because students,
      // cases and the school page all join on that id
      const pilot = SCHOOLS.find((s) => s.provinceKey === (territory ?? 'pattani')) ?? SCHOOLS[0]
      const res = register({
        name,
        email,
        password,
        role,
        provinceKey: territory,
        districtKey: role === 'school' || role === 'teacher' ? pilot.districtKey : undefined,
        schoolKey: role === 'school' || role === 'teacher' ? pilot.id : undefined,
      })
      if (!res.ok) {
        setStatus('idle')
        setError(th ? 'อีเมลนี้ถูกใช้แล้ว' : 'This email is already registered')
        return
      }
      setStatus('success')
      window.setTimeout(() => nav('/'), 1100)
    }, 700)
  }

  return (
    <AuthShell
      title={th ? 'สร้างบัญชีผู้ใช้' : 'Create your account'}
      subtitle={
        step === 1
          ? th ? 'ขั้นที่ 1 — เลือกบทบาทของคุณ' : 'Step 1 — choose your role'
          : th ? 'ขั้นที่ 2 — กรอกข้อมูลบัญชี' : 'Step 2 — account details'
      }
    >
      {/* Progress */}
      <div className="mb-5 flex items-center gap-3">
        <Dot n={1} active={step >= 1} done={step > 1} label={th ? 'บทบาท' : 'Role'} />
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-border">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-brand-500"
            animate={{ width: step >= 2 ? '100%' : '0%' }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <Dot n={2} active={step >= 2} done={false} label={th ? 'ข้อมูลบัญชี' : 'Details'} />
      </div>

      <div className="relative overflow-hidden">
        {/* enter-only slide keyed by step — deadlock-proof (no exit to interrupt) */}
        <motion.div
          key={step}
          initial={{ opacity: 0, x: dir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {step === 1 ? (
            /* ── STEP 1 · Role ─────────────────────────── */
            <div className="flex flex-col gap-2">
              {LOGIN_ROLES.map((r) => {
                const m = ROLE_META[r]
                const active = role === r
                return (
                  <motion.button
                    key={r}
                    type="button"
                    onClick={() => chooseRole(r)}
                    onDoubleClick={() => goStep(2)}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.99 }}
                    className={`relative flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left ${
                      active ? 'border-transparent' : 'border-surface-border hover:bg-surface-muted'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="reg-role-ring"
                        className="pointer-events-none absolute inset-0 rounded-xl"
                        style={{ boxShadow: `0 0 0 2px ${m.color}`, backgroundColor: `${m.color}0f` }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span
                      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white"
                      style={{ backgroundColor: m.color }}
                    >
                      {roleIcon(r, 20)}
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{th ? m.th : m.en}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{th ? m.descTh : m.descEn}</span>
                    </span>
                    <span
                      className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full"
                      style={active ? { backgroundColor: m.color, color: '#fff' } : { color: '#cbd5e1' }}
                    >
                      {active ? <IconCheck width={14} height={14} /> : <IconChevronRight width={16} height={16} />}
                    </span>
                  </motion.button>
                )
              })}

              <motion.button
                type="button"
                onClick={() => goStep(2)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                {th ? 'ถัดไป' : 'Continue'}
                <IconArrowRight width={16} height={16} />
              </motion.button>
            </div>
          ) : (
            /* ── STEP 2 · Details ──────────────────────── */
            <form onSubmit={submit} className="flex flex-col gap-4">
              {/* chosen role chip */}
              <button
                type="button"
                onClick={() => goStep(1)}
                className="flex items-center gap-2.5 rounded-xl border border-surface-border bg-surface-muted px-3 py-2.5 text-left transition-colors hover:bg-white"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundColor: meta.color }}>
                  {roleIcon(role, 16)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{th ? meta.th : meta.en}</span>
                  <span className="block text-[11px] text-ink-muted">{th ? 'แตะเพื่อเปลี่ยนบทบาท' : 'Tap to change role'}</span>
                </span>
                <span className="text-[11px] font-semibold text-brand-600">{th ? 'เปลี่ยน' : 'Change'}</span>
              </button>

              <AuthField label={th ? 'ชื่อ-นามสกุล' : 'Full name'} value={name} onChange={setName} required icon={<IconUser width={18} height={18} />} />
              <AuthField label={th ? 'อีเมล' : 'Email'} type="email" value={email} onChange={setEmail} placeholder="name@obec.go.th" required icon={<IconMail width={18} height={18} />} />
              <AuthField label={th ? 'รหัสผ่าน' : 'Password'} type="password" value={password} onChange={setPassword} placeholder="••••••••" required icon={<IconLock width={18} height={18} />} />

              <Select
                label={th ? 'ขอบเขตที่รับผิดชอบ' : 'Territory'}
                value={provinceKey}
                onChange={setProvinceKey}
                options={provinceOptions}
              />

              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }} exit={{ opacity: 0 }} className="rounded-lg bg-risk-critical/10 px-3 py-2 text-xs font-medium text-risk-critical">
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="mt-1 flex gap-2">
                <button type="button" onClick={() => goStep(1)} className="flex h-11 items-center justify-center rounded-xl border border-surface-border px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted">
                  {th ? 'ย้อนกลับ' : 'Back'}
                </button>
                <motion.button
                  type="submit"
                  disabled={status !== 'idle'}
                  whileHover={status === 'idle' ? { scale: 1.02 } : undefined}
                  whileTap={status === 'idle' ? { scale: 0.97 } : undefined}
                  className="relative flex h-11 flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-500 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-100"
                >
                  <AnimatePresence mode="wait">
                    {status === 'idle' && (
                      <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        {th ? 'สร้างบัญชี' : 'Create account'}
                        <IconArrowRight width={16} height={16} />
                      </motion.span>
                    )}
                    {status === 'submitting' && (
                      <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <span className="block h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      </motion.span>
                    )}
                    {status === 'success' && (
                      <motion.span key="s" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                        <IconCheck width={18} height={18} />{th ? 'สำเร็จ' : 'Done'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </form>
          )}
        </motion.div>
      </div>

      <p className="mt-4 text-center text-sm text-ink-muted">
        {th ? 'มีบัญชีอยู่แล้ว?' : 'Already have an account?'}{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:underline">
          {th ? 'เข้าสู่ระบบ' : 'Sign in'}
        </Link>
      </p>

      {/* Success overlay */}
      <AnimatePresence>
        {status === 'success' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-950/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="flex flex-col items-center gap-4 rounded-3xl bg-white px-10 py-9 shadow-card-hover">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <motion.circle cx="36" cy="36" r="32" fill="none" stroke="#16a34a" strokeWidth="4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
                <motion.path d="M22 37l10 10 18-20" fill="none" stroke="#16a34a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.35 }} />
              </svg>
              <div className="text-center">
                <p className="text-lg font-bold text-ink">{th ? 'สร้างบัญชีสำเร็จ' : 'Account created'}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{th ? `กำลังเข้าสู่ระบบในฐานะ ${meta.th}…` : `Signing in as ${meta.en}…`}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}

function Dot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <motion.span
        animate={{
          backgroundColor: active ? '#2f66f6' : '#eef2f8',
          color: active ? '#ffffff' : '#94a3b8',
        }}
        className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
      >
        {done ? <IconCheck width={14} height={14} /> : n}
      </motion.span>
      <span className={`text-xs font-medium ${active ? 'text-ink' : 'text-ink-faint'}`}>{label}</span>
    </div>
  )
}
