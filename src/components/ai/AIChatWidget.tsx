import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { useAuth } from '@/auth/AuthContext'
import { ROLE_META, canAccess } from '@/auth/roles'
import { overviewStats, scopedCases } from '@/auth/scope'
import { oosSplit } from '@/lib/oos'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import {
  buildSystemPrompt,
  getModel,
  localAnswer,
  serverHasKey,
  streamAnswer,
  type ChatMsg,
} from '@/lib/ai'
import { IconArrowRight, IconChevronRight, IconClose, IconSend } from '@/components/icons'

/** the platform's own mascot — public/ChatBot.png, copied from assets/image */
const MASCOT = '/ChatBot.png'

const CHIPS = [
  { th: 'พื้นที่ไหนเสี่ยงสูงสุด', en: 'Which areas carry the most risk' },
  { th: 'สาเหตุหลักคืออะไร', en: 'What is driving it' },
  { th: 'เคสเกิน SLA มีกี่เคส', en: 'How many cases are overdue' },
  { th: 'สัปดาห์นี้ควรลงพื้นที่ที่ไหน', en: 'Where to visit this week' },
  { th: 'โรงเรียนไหนต้องตามด่วน', en: 'Which school needs chasing' },
  { th: 'สรุปตัวเลขสำหรับรายงาน', en: 'Numbers for a report' },
]

/** Numbers are the payload of every answer, so they get the tabular treatment
 *  instead of sitting inside a wall of prose. */
function AnswerLine({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,.]*%?)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^\d[\d,.]*%?$/.test(p) ? (
          <span key={i} className="tabular font-bold text-ink">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

/** three dots, walking — only shown while a real stream is in flight */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-brand-400"
          animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

function Mascot({ size, className = '' }: { size: number; className?: string }) {
  return (
    <img
      src={MASCOT}
      alt=""
      width={size}
      height={size}
      className={`select-none object-contain ${className}`}
      draggable={false}
    />
  )
}

export function AIChatWidget() {
  const { t, lang, pn } = useI18n()
  const { user } = useAuth()
  const nav = useNavigate()
  const th = lang === 'th'

  const [open, setOpen] = useState(false)
  const [realAI, setRealAI] = useState(false) // true when a server key is configured
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    serverHasKey().then(setRealAI)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  /** what this panel can see — stated so the figures cannot be mistaken for
   *  area-wide ones when the account only covers a district or a school */
  const scopeLine = useMemo(() => {
    if (!user) return th ? 'พื้นที่ จชต.' : 'The three provinces'
    const meta = ROLE_META[user.role]
    const where = user.provinceKey
      ? pn(user.provinceKey)
      : th
        ? 'จชต. ทั้งพื้นที่'
        : 'All three provinces'
    return `${where} · ${th ? meta.shortTh : meta.shortEn}`
  }, [user, pn, th])

  /** first destination this account can actually open, so no row is a dead end */
  const firstAllowed = (...paths: string[]) =>
    paths.find((p) => !user || canAccess(user, p)) ?? '/'

  /** The opening message carries real numbers, so saying hello is also useful.
   *  Only built while the panel is open — it walks the scoped datasets. */
  const brief = useMemo(() => {
    if (!open) return []
    const stats = overviewStats(user)
    const cases = scopedCases(user)
    const split = oosSplit({
      oosCount: stats.dropout,
      reengagedCount: stats.reengaging,
      outcomeCount: stats.returned,
    })
    const overdue = cases.filter((c) => c.slaBreached).length
    return [
      {
        key: 'oos',
        label: th ? 'เด็กนอกระบบในทะเบียน' : 'On the registry',
        value: split.known,
        tone: undefined as string | undefined,
        to: firstAllowed('/oosc', '/student', '/'),
      },
      {
        key: 'still',
        label: th ? 'ยังไม่มีอะไรขับเคลื่อน' : 'Nothing moving yet',
        value: split.stillOut,
        tone: split.stillOut > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
        to: firstAllowed('/oosc', '/student', '/'),
      },
      {
        key: 'risk',
        label: th ? 'เด็กเสี่ยงสูงในระบบ' : 'High-risk, still enrolled',
        value: stats.highRisk,
        tone: undefined,
        to: firstAllowed('/risk-map', '/school', '/student', '/'),
      },
      {
        key: 'overdue',
        label: th ? 'เคสเกินกำหนด' : 'Cases past due',
        value: overdue,
        tone: overdue > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
        to: firstAllowed('/intervention', '/referral', '/'),
      },
    ]
  }, [open, user, th])

  const goTo = (to: string) => {
    nav(user && !canAccess(user, to) ? '/' : to)
    setOpen(false)
  }

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || streaming) return
    setInput('')
    const userMsg: ChatMsg = { role: 'user', text: q }

    if (realAI) {
      setMessages((m) => [...m, userMsg, { role: 'assistant', text: '' }])
      setStreaming(true)
      const apiHistory = [...messages, userMsg]
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const system = buildSystemPrompt(user, lang)
        let acc = ''
        for await (const delta of streamAnswer({
          system,
          history: apiHistory,
          model: getModel(),
          signal: controller.signal,
        })) {
          acc += delta
          setMessages((m) => {
            const next = [...m]
            next[next.length - 1] = { role: 'assistant', text: acc }
            return next
          })
        }
        if (!acc.trim()) throw { status: 0, message: 'empty' }
      } catch (err) {
        if ((err as { status?: number })?.status === 503) setRealAI(false)
        const local = localAnswer(q, user, lang)
        setMessages((m) => {
          const next = [...m]
          next[next.length - 1] = { role: 'assistant', text: local.text, action: local.action }
          return next
        })
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
      return
    }

    // Built-in engine: a lookup over data already in memory, so it lands
    // immediately. Faking a thinking pause only made it feel slower.
    const local = localAnswer(q, user, lang)
    setMessages((m) => [
      ...m,
      userMsg,
      { role: 'assistant', text: local.text, action: local.action },
    ])
  }

  return (
    <>
      {/* Launcher — a navy disc so the pale mascot has something to sit against.
       *  On white cards it used to vanish into the page. */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.4 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label={th ? 'เปิดผู้ช่วย Zero Dropout' : 'Open the Zero Dropout assistant'}
        className="group fixed bottom-20 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full md:bottom-6 md:right-6"
      >
        {/* one slow halo — enough to catch the eye, quiet enough to ignore */}
        {!open && (
          <motion.span
            className="absolute inset-0 rounded-full bg-brand-500/25"
            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* the disc itself */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-600 via-brand-800 to-brand-900 shadow-[0_6px_20px_rgba(15,42,107,0.42)] ring-1 ring-white/25" />

        {open ? (
          <motion.span
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            className="relative text-white"
          >
            <IconClose width={22} height={22} />
          </motion.span>
        ) : (
          <motion.span
            className="relative"
            animate={{ y: [0, -2.5, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Mascot size={40} className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />
          </motion.span>
        )}

        {/* name tag, on hover */}
        {!open && (
          <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full bg-brand-900 px-3 py-1.5 text-[12px] font-semibold text-white opacity-0 shadow-lg transition-all duration-200 group-hover:-translate-x-0.5 group-hover:opacity-100">
            {th ? 'ถามผู้ช่วย Zero Dropout' : 'Ask the Zero Dropout assistant'}
          </span>
        )}
      </motion.button>

      {open && (
        <motion.div
          key="assistant-panel"
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          style={{ transformOrigin: 'bottom right' }}
          /* clears the 56px launcher plus a 12px gap, at both breakpoints. Height
           * follows the content up to a ceiling, so a short brief does not leave
           * a wall of empty white above the suggestions. */
          className="fixed bottom-[148px] right-4 z-[60] flex max-h-[min(560px,70vh)] w-[min(384px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-surface-border bg-white shadow-card-hover md:bottom-[92px] md:right-6"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-br from-brand-700 to-brand-900 px-4 py-3.5 text-white">
            <motion.span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/95 ring-1 ring-white/40"
              animate={{ rotate: [-3, 3, -3] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Mascot size={34} />
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {th ? 'ผู้ช่วย Zero Dropout' : 'Zero Dropout assistant'}
              </p>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-white/80">
                <motion.span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300"
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                {scopeLine}
                {' · '}
                {realAI
                  ? th
                    ? 'ตอบด้วย Claude'
                    : 'via Claude'
                  : th
                    ? 'ตอบจากข้อมูลในระบบ'
                    : 'from the data'}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  abortRef.current?.abort()
                  setMessages([])
                  setInput('')
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {th ? 'เริ่มใหม่' : 'Reset'}
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10"
              aria-label={t('common.close')}
            >
              <IconClose width={18} height={18} />
            </button>
          </div>

          {/* Conversation */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-muted/40 p-3.5"
          >
            {/* Greeting — and the four numbers worth acting on, already filled in */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex gap-2"
            >
              <motion.span
                className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-xl bg-white ring-1 ring-surface-border"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.05 }}
              >
                <Mascot size={24} />
              </motion.span>
              <div className="min-w-0 max-w-[86%] rounded-2xl rounded-tl-md border border-surface-border bg-white p-2.5">
                <p className="text-[13px] leading-relaxed text-ink">
                  {th
                    ? 'สวัสดีครับ นี่คือสถานะพื้นที่ของคุณตอนนี้ — กดบรรทัดไหนก็เข้าไปทำงานต่อได้เลย'
                    : 'Here is where your area stands right now — tap any line to go and work on it.'}
                </p>
                <div className="mt-2 space-y-0.5">
                  {brief.map((row, i) => (
                    <motion.button
                      key={row.key}
                      onClick={() => goTo(row.to)}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 + i * 0.06 }}
                      whileHover={{ x: 2 }}
                      className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-brand-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">
                        {row.label}
                      </span>
                      <span
                        className="tabular shrink-0 text-[13px] font-bold"
                        style={{ color: row.tone ?? '#0f1b2d' }}
                      >
                        {formatNumber(row.value, lang)}
                      </span>
                      <IconChevronRight
                        width={12}
                        height={12}
                        className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                      />
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>

            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {m.role === 'assistant' && (
                  <motion.span
                    className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-xl bg-white ring-1 ring-surface-border"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                  >
                    <Mascot size={24} />
                  </motion.span>
                )}
                <div className="min-w-0 max-w-[86%] space-y-2">
                  <div
                    className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === 'user'
                        ? 'rounded-tr-md bg-brand-600 text-white'
                        : 'rounded-tl-md border border-surface-border bg-white text-ink-muted'
                    }`}
                  >
                    {m.role === 'user' ? (
                      m.text
                    ) : m.text ? (
                      <div className="space-y-1">
                        {m.text.split('\n').map((line, k) =>
                          line.trim() ? (
                            <p key={k} className={k === 0 ? 'font-semibold text-ink' : undefined}>
                              <AnswerLine text={line} />
                            </p>
                          ) : (
                            <div key={k} className="h-1" />
                          ),
                        )}
                      </div>
                    ) : (
                      <TypingDots />
                    )}
                  </div>
                  {m.action && (
                    <motion.button
                      onClick={() => goTo(m.action!.to)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 }}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      className="group flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                    >
                      {m.action.label}
                      <IconArrowRight
                        width={14}
                        height={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Suggestions — always reachable, stagger in on open */}
          <div className="flex flex-wrap gap-1.5 border-t border-surface-border px-3 pb-1 pt-2">
            {CHIPS.filter((c) => !messages.some((m) => m.text === (th ? c.th : c.en))).map(
              (c, i) => (
                <motion.button
                  key={c.th}
                  onClick={() => send(th ? c.th : c.en)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + i * 0.04 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  {th ? c.th : c.en}
                </motion.button>
              ),
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 p-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={th ? 'พิมพ์คำถาม…' : 'Type a question…'}
              className="min-w-0 flex-1 rounded-full border border-surface-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand-400"
            />
            <motion.button
              type="submit"
              disabled={streaming || !input.trim()}
              whileHover={input.trim() ? { scale: 1.08 } : undefined}
              whileTap={input.trim() ? { scale: 0.9 } : undefined}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              aria-label={t('ai.send')}
            >
              <IconSend width={18} height={18} />
            </motion.button>
          </form>
        </motion.div>
      )}
    </>
  )
}
