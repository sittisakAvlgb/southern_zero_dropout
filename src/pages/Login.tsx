import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/auth/AuthContext'
import {
  DEMO_BY_ROLE,
  DEMO_TERRITORY_EXEC,
  LOGIN_ROLES,
  isHiddenRole,
  ROLE_META,
  type User,
} from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { AuthShell, AuthField } from '@/components/auth/AuthShell'
import { SignInTransition } from '@/components/auth/SignInTransition'
import { roleIcon } from '@/components/auth/roleIcon'
import { Button } from '@/components/ui/Button'
import {
  IconArrowRight,
  IconDown,
  IconLock,
  IconMail,
  IconSparkle,
} from '@/components/icons'

export default function Login() {
  const { user, login } = useAuth()
  const { lang, pick } = useI18n()
  const nav = useNavigate()
  const th = lang === 'th'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  /** true once credentials check out — the transition screen owns the navigation */
  const [signedIn, setSignedIn] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // A window-level listener rather than a full-screen backdrop div: a backdrop
  // is trapped by any ancestor with a backdrop-filter and then swallows clicks
  // on the page behind it instead of closing the list.
  useEffect(() => {
    if (!rolesOpen) return
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setRolesOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRolesOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [rolesOpen])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const res = login(email, password)
    if (res.ok) setSignedIn(true)
    else
      setError(
        res.error === 'notFound'
          ? th ? 'ไม่พบบัญชีอีเมลนี้' : 'No account with this email'
          : th ? 'รหัสผ่านไม่ถูกต้อง' : 'Incorrect password',
      )
  }

  /** demo cards sign in straight away — picking a role then hunting for the
   *  sign-in button was two steps for something that has no credentials */
  const enterAs = (u: User & { password: string }) => {
    setError('')
    if (login(u.email, u.password).ok) setSignedIn(true)
  }

  return (
    <>
      {signedIn && user && (
        <SignInTransition user={user} onDone={() => nav('/', { replace: true })} />
      )}
      <AuthShell
        title={th ? 'เข้าสู่ระบบ' : 'Sign in'}
        subtitle={
          th
            ? 'ระบบจะเปิดเฉพาะพื้นที่และเด็กที่บัญชีของคุณรับผิดชอบ'
            : 'You will see only the area and the children your account is responsible for'
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <AuthField
            label={th ? 'อีเมล' : 'Email'}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@obec.go.th"
            required
            icon={<IconMail width={18} height={18} />}
          />
          <AuthField
            label={th ? 'รหัสผ่าน' : 'Password'}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            icon={<IconLock width={18} height={18} />}
          />
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg bg-risk-critical/10 px-3 py-2 text-xs font-medium text-risk-critical"
            >
              {error}
            </motion.p>
          )}
          <Button type="submit" size="md" icon={<IconArrowRight width={16} height={16} />}>
            {th ? 'เข้าสู่ระบบ' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-3 text-center text-sm text-ink-muted">
          {th ? 'ยังไม่มีบัญชี?' : 'No account yet?'}{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline">
            {th ? 'ลงทะเบียน' : 'Register'}
          </Link>
        </p>

        {/* ── Demo access ──────────────────────────────────────
            One entry per role, and picking one signs in. The list names roles
            only — which เขต or จังหวัด a demo account happens to sit in is a
            property of the account, not of the job, and putting it here made
            the picker read as a list of places. The executive seat still
            appears a second time below, scoped to a province, because what an
            executive may see is decided by their territory, not their title. */}
        <div className="mt-5 border-t border-surface-border pt-5">
          <div className="mb-2 flex items-center gap-2">
            <IconSparkle width={15} height={15} className="text-brand-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {th ? 'เข้าใช้งานตามบทบาท' : 'Enter as a role'}
            </p>
          </div>

          <div ref={pickerRef} className="relative">
            <button
              type="button"
              onClick={() => setRolesOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={rolesOpen}
              className={`flex w-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors ${
                rolesOpen ? 'border-brand-400 ring-4 ring-brand-100' : 'border-surface-border hover:border-brand-300'
              }`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500">
                <IconSparkle width={16} height={16} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-muted">
                {th ? 'เลือกบทบาทเพื่อเข้าใช้งาน' : 'Choose a role to enter'}
              </span>
              <IconDown
                width={16}
                height={16}
                className={`shrink-0 text-ink-faint transition-transform ${rolesOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Opens upward: the trigger is the last thing on the card, so a
                downward list runs off the bottom of the viewport. Enter-only
                animation, unmounted on close — StrictMode swallows
                AnimatePresence exits and would leave the list stuck open. */}
            {rolesOpen && (
              <motion.ul
                role="listbox"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                className="absolute bottom-full left-0 right-0 z-20 mb-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-surface-border bg-white p-1.5 shadow-lg"
              >
                {LOGIN_ROLES.map((role) => {
                  const meta = ROLE_META[role]
                  return (
                    <li key={role}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => enterAs(DEMO_BY_ROLE[role])}
                        className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-brand-50/60"
                      >
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-sm transition-transform group-hover:scale-105"
                          style={{ backgroundColor: meta.color }}
                        >
                          {roleIcon(role, 16)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                          {pick({ th: meta.th, en: meta.en, ms: meta.ms })}
                        </span>
                        <IconArrowRight
                          width={14}
                          height={14}
                          className="shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </button>
                    </li>
                  )
                })}
              </motion.ul>
            )}
          </div>

          {/* same role, different territory — the PDPA rule in one click.
              Withheld along with the ศอ.บต. seat it is meant to contrast. */}
          {!isHiddenRole('exec') && (
          <button
            type="button"
            onClick={() => enterAs(DEMO_TERRITORY_EXEC)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-600"
          >
            {th ? 'หรือเข้าเป็นผู้บริหารระดับจังหวัด' : 'or as a province executive'}
            <IconArrowRight width={13} height={13} />
          </button>
          )}
        </div>
        </AuthShell>
    </>
  )
}
