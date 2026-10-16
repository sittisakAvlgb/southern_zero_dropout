import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck, IconDown } from '../icons'

export interface Option {
  value: string
  label: string
  /** options sharing a group are listed under one heading */
  group?: string
}

/** keeps the author's order while collapsing runs of the same group */
function groupOptions(options: Option[]): [string | undefined, Option[]][] {
  const out: [string | undefined, Option[]][] = []
  for (const o of options) {
    const last = out[out.length - 1]
    if (last && last[0] === o.group) last[1].push(o)
    else out.push([o.group, [o]])
  }
  return out
}

type Place = { left: number; width: number; top?: number; bottom?: number; maxH: number }

/**
 * ตัวเลือกแบบรายการ — แทน <select> ของระบบปฏิบัติการ
 *
 * <select> เดิมเปิดรายการสไตล์ Windows (มุมเหลี่ยม แถบน้ำเงินเต็มแถว ตัวอักษรคนละแบบกับหน้า)
 * ที่นี่รายการเป็นการ์ดมุมมนแบบเดียวกับหน้า ตัวเลือกที่เลือกอยู่มีเครื่องหมายถูก ไม่พึ่งสีอย่างเดียว
 * ใช้ได้ด้วยแป้นพิมพ์ (↑ ↓ Home End Enter Esc และพิมพ์ตัวแรกเพื่อกระโดด) — props เดิมทุกตัว
 * รายการ render ผ่าน portal ตำแหน่ง fixed จึงไม่ถูกการ์ดที่ overflow-hidden ตัด และพลิกขึ้นเมื่อที่ด้านล่างไม่พอ
 */
export function Select({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  options: Option[]
  className?: string
}) {
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<Place | null>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  const measure = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 240 && above > below
    setPlace({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8)),
      width: r.width,
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      maxH: Math.min(360, (up ? above : below) - 6),
    })
  }

  const openList = () => {
    measure()
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const close = (focus = true) => {
    setOpen(false)
    if (focus) btn.current?.focus()
  }
  const choose = (i: number) => {
    const o = options[i]
    if (o) onChange(o.value)
    close()
  }

  useLayoutEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !list.current?.contains(t)) close(false)
    }
    const move = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return
      measure()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', move, true)
    window.addEventListener('resize', move)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('scroll', move, true)
      window.removeEventListener('resize', move)
    }
  }, [open])

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      close(e.key === 'Escape')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key.length === 1) {
      const k = e.key.toLowerCase()
      const n = options.length
      for (let s = 1; s <= n; s++) {
        const i = (active + s) % n
        if (options[i].label.toLowerCase().startsWith(k)) {
          setActive(i)
          break
        }
      }
    }
  }

  let idx = -1
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span id={`${id}-l`} className="text-[11px] font-medium text-ink-muted">
          {label}
        </span>
      )}
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-labelledby={label ? `${id}-l ${id}-v` : undefined}
        aria-activedescendant={open ? `${id}-o${active}` : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={`relative flex w-full items-center rounded-xl border bg-white py-2.5 pl-3 pr-9 text-left text-sm font-medium text-ink outline-none transition-colors hover:border-brand-200 focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100 ${open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-surface-border'}`}
      >
        <span id={`${id}-v`} className="truncate">
          {current?.label}
        </span>
        <IconDown
          width={16}
          height={16}
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={label ? `${id}-l` : undefined}
            tabIndex={-1}
            style={{ position: 'fixed', left: place.left, top: place.top, bottom: place.bottom, minWidth: Math.max(place.width, 220), maxHeight: place.maxH }}
            className="z-[80] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-surface-border bg-white p-1.5 shadow-lg"
          >
            {groupOptions(options).map(([group, rows], g) => (
              <li key={g} role="presentation">
                {group && <p className="px-3 pb-1 pt-2 text-[12px] font-semibold text-ink-muted">{group}</p>}
                <ul role="group" aria-label={group}>
                  {rows.map((o) => {
                    idx += 1
                    const i = idx
                    const sel = o.value === value
                    return (
                      <li
                        key={o.value}
                        id={`${id}-o${i}`}
                        data-i={i}
                        role="option"
                        aria-selected={sel}
                        onPointerEnter={() => setActive(i)}
                        onClick={() => choose(i)}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-[14.5px] ${i === active ? 'bg-brand-50' : ''} ${sel ? 'font-semibold text-brand-700' : 'text-ink'}`}
                      >
                        <span className="min-w-0 flex-1">{o.label}</span>
                        {sel && <IconCheck width={16} height={16} className="shrink-0 text-brand-600" />}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}
