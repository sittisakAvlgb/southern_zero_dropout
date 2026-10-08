import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IconCheck, IconClose } from '../icons'

type ToastKind = 'success' | 'info'
interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastCtx {
  push: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++idRef.current
    setItems((p) => [...p, { id, message, kind }])
    setTimeout(() => {
      setItems((p) => p.filter((t) => t.id !== id))
    }, 3200)
  }, [])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3 shadow-card-hover"
              role="status"
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  t.kind === 'success'
                    ? 'bg-risk-normal/15 text-risk-normal'
                    : 'bg-brand-500/15 text-brand-600'
                }`}
              >
                <IconCheck width={16} height={16} />
              </span>
              <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
              <button
                onClick={() =>
                  setItems((p) => p.filter((x) => x.id !== t.id))
                }
                className="text-ink-faint hover:text-ink"
                aria-label="close"
              >
                <IconClose width={16} height={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
