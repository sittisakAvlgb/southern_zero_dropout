import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IconClose, IconDown, IconSearch } from '../icons'

export interface SearchOption {
  value: string
  label: string
  /** right-aligned context — what tells near-identical labels apart */
  meta?: string
  /** rows sharing a group sit under one heading */
  group?: string
  /** extra text to match on (romanised names, codes) but never displayed */
  keywords?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SearchOption[]
  /** value that means "nothing selected" — the clear button returns to it */
  resetValue?: string
  placeholder?: string
  emptyText?: string
  className?: string
}

const norm = (s: string) => s.toLowerCase().replace(/[\s"'’.·-]/g, '')

/** split `label` so the matched run can be emphasised */
function highlight(label: string, query: string): ReactNode {
  if (!query) return label
  const n = norm(query)
  const i = norm(label).indexOf(n)
  if (i < 0) return label
  // map the normalised index back onto the original string
  let seen = 0
  let start = -1
  let end = label.length
  for (let c = 0; c < label.length; c++) {
    if (norm(label[c]).length === 0) continue
    if (seen === i && start < 0) start = c
    if (seen === i + n.length) { end = c; break }
    seen += norm(label[c]).length
  }
  if (start < 0) return label
  return (
    <>
      {label.slice(0, start)}
      <mark className="bg-transparent font-bold text-brand-600">{label.slice(start, end)}</mark>
      {label.slice(end)}
    </>
  )
}

export function SearchSelect({
  value,
  onChange,
  options,
  resetValue = '',
  placeholder = 'ค้นหา…',
  emptyText = 'ไม่พบรายการที่ค้นหา',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  /** false until the user actually types — until then the full list stays browsable */
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(0)
  const [dropUp, setDropUp] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const hasSelection = !!selected && value !== resetValue

  const matches = useMemo(() => {
    if (!typed || !q.trim()) return options
    const n = norm(q)
    return options.filter(
      (o) =>
        norm(o.label).includes(n) ||
        (o.meta && norm(o.meta).includes(n)) ||
        (o.keywords && norm(o.keywords).includes(n)),
    )
  }, [options, q, typed])

  const rows = useMemo(() => {
    const out: { option: SearchOption; index: number; heading?: string }[] = []
    let lastGroup: string | undefined
    matches.forEach((option, index) => {
      const heading = option.group && option.group !== lastGroup ? option.group : undefined
      lastGroup = option.group
      out.push({ option, index, heading })
    })
    return out
  }, [matches])

  /** true for the click that opened the list, so that same click cannot close it again */
  const justOpened = useRef(false)

  const openList = () => {
    if (open) return
    justOpened.current = true
    setOpen(true)
    setTyped(false)
    setQ(selected?.label ?? '')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const close = () => {
    setOpen(false)
    setTyped(false)
    setQ('')
  }

  // Flip above the trigger only when there is genuinely less room below.
  // Re-measured on scroll because the page may still be smooth-scrolling when
  // the panel opens, which would otherwise lock in a stale decision.
  useEffect(() => {
    if (!open) return
    const measure = () => {
      const r = rootRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom
      setDropUp(below < 300 && r.top > below)
    }
    measure()
    const frame = requestAnimationFrame(measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // keep the highlighted row in view while arrowing through a long list
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const commit = (option: SearchOption) => {
    onChange(option.value)
    close()
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { close(); inputRef.current?.blur(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openList()
      if (!matches.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (a + step + matches.length) % matches.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const option = matches[active]
      if (option) commit(option)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-xl border bg-white pl-3 pr-2 transition-colors ${
          open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-surface-border hover:border-brand-200'
        }`}
      >
        <IconSearch width={15} height={15} className="shrink-0 text-ink-faint" />
        <input
          ref={inputRef}
          value={open ? q : selected?.label ?? ''}
          onFocus={openList}
          onClick={() => {
            // a click on the field toggles the list, except while the user is
            // mid-search — then it just moves the caret
            if (justOpened.current) { justOpened.current = false; return }
            if (open && !typed) close()
            else openList()
          }}
          onChange={(e) => { setQ(e.target.value); setTyped(true); setActive(0); setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
        />
        {hasSelection && !open && (
          <button
            type="button"
            onClick={() => onChange(resetValue)}
            className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
            aria-label="clear"
          >
            <IconClose width={13} height={13} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? close() : inputRef.current?.focus())}
          className="shrink-0 p-1 text-ink-faint"
          aria-label="toggle"
        >
          <IconDown
            width={15}
            height={15}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: dropUp ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dropUp ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            // nothing inside the panel may steal focus from the input, or the
            // caret vanishes and the next keystroke goes nowhere
            onMouseDown={(e) => e.preventDefault()}
            className={`absolute z-40 w-full min-w-[250px] overflow-hidden rounded-xl border border-surface-border bg-white shadow-card-hover ${
              dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}
          >
            <div ref={listRef} role="listbox" className="max-h-[292px] overflow-y-auto py-1">
              {!rows.length && (
                <p className="px-3 py-6 text-center text-xs text-ink-muted">{emptyText}</p>
              )}
              {rows.map(({ option, index, heading }) => (
                <div key={option.value}>
                  {heading && (
                    <p className="sticky top-0 bg-white/95 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint backdrop-blur">
                      {heading}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(option)}
                    className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left transition-colors ${
                      index === active ? 'bg-brand-50' : ''
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] ${
                        option.value === value ? 'font-bold text-brand-700' : 'text-ink'
                      }`}
                    >
                      {highlight(option.label, typed ? q : '')}
                    </span>
                    {option.meta && (
                      <span className="shrink-0 text-[11px] text-ink-faint">{option.meta}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
