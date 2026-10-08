import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { canAccess } from '@/auth/roles'
import { useScopedData } from '@/auth/scope'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import { navLabelKey, NAV_ITEMS } from './navItems'
import {
  IconArrowRight,
  IconClose,
  IconProvince,
  IconSchool,
  IconSearch,
  IconStudent,
  IconTambon,
} from '../icons'

type Kind = 'page' | 'province' | 'district' | 'tambon' | 'school' | 'student'

interface Hit {
  kind: Kind
  label: string
  sub: string
  to: string
  /** dot colour for risk-bearing rows */
  tone?: string
}

const KIND_ICON: Record<Kind, (p: { width?: number; height?: number }) => JSX.Element> = {
  page: IconArrowRight as never,
  province: IconProvince as never,
  district: IconProvince as never,
  tambon: IconTambon as never,
  school: IconSchool as never,
  student: IconStudent as never,
}

/**
 * Command palette over the account's own data.
 *
 * Everything here comes from useScopedData, so a school director cannot search
 * their way to a child in another district — the previous version queried the
 * raw datasets and happily returned any student in the country.
 */
export function SmartSearch({ onClose }: { onClose: () => void }) {
  const { t, lang, pn, dn, tn } = useI18n()
  const nav = useNavigate()
  const th = lang === 'th'
  const { provinces, districts, tambons, schools, students, user } = useScopedData()
  const can = (path: string) => !user || canAccess(user, path)

  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /** pages this account may open — the fastest thing most searches want */
  const pageHits = useMemo<Hit[]>(
    () =>
      NAV_ITEMS.filter((n) => can(n.to)).map((n) => ({
        kind: 'page' as const,
        label: t(navLabelKey(n, user)),
        sub: th ? 'ไปที่หน้านี้' : 'Go to this page',
        to: n.to,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, th, user],
  )

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    const has = (s: string) => s.toLowerCase().includes(query)

    const pages = pageHits.filter((p) => has(p.label)).slice(0, 4)

    const prov: Hit[] = provinces.filter((p) => has(pn(p.key)) || has(p.key)).slice(0, 3).map((p) => ({
      kind: 'province',
      label: pn(p.key),
      sub: `${p.districts} ${t('geo.districts')} · ${formatNumber(p.highRiskStudents, lang)} ${t('kpi.highrisk')}`,
      to: can('/area') ? `/area?p=${p.key}` : '/',
      tone: p.riskRate >= 13 ? RISK_COLOR.critical : RISK_COLOR.high,
    }))

    const dist: Hit[] = districts
      .filter((d) => has(dn(d.key)) || has(d.key))
      .slice(0, 5)
      .map((d) => ({
        kind: 'district',
        label: dn(d.key),
        sub: `${pn(d.provinceKey)} · ${t('risk.rate')} ${d.riskRate.toFixed(1)}%`,
        to: can('/area') ? `/area?p=${d.provinceKey}&d=${d.key}` : '/',
        tone: d.riskRate >= 13 ? RISK_COLOR.critical : d.riskRate >= 10 ? RISK_COLOR.high : RISK_COLOR.watch,
      }))

    const tam: Hit[] = can('/tambon')
      ? tambons
          .filter((x) => has(tn(x.key)) || has(x.key))
          .slice(0, 5)
          .map((x) => ({
            kind: 'tambon',
            label: tn(x.key),
            sub: `${dn(x.districtKey)} · ${pn(x.provinceKey)}`,
            to: `/tambon?t=${x.key}`,
          }))
      : []

    const sch: Hit[] = can('/school')
      ? schools
          .filter((s) => has(s.name) || has(s.id) || has(s.nameEn ?? ''))
          .slice(0, 5)
          .map((s) => ({
            kind: 'school',
            label: th ? s.name : s.nameEn ?? s.name,
            sub: `${s.id} · ${dn(s.districtKey)} · ${formatNumber(s.totalStudents, lang)} ${t('common.students')}`,
            to: `/school?s=${s.id}`,
          }))
      : []

    const std: Hit[] = can('/student')
      ? students
          .filter((s) => has(s.name) || has(s.id))
          .slice(0, 6)
          .map((s) => ({
            kind: 'student',
            label: s.name,
            sub: `${s.id} · ${t(`risk.${s.riskLevel}`)} · ${dn(s.districtKey)}`,
            to: `/student?id=${s.id}`,
            tone: RISK_COLOR[s.riskLevel],
          }))
      : []

    return [...pages, ...prov, ...dist, ...tam, ...sch, ...std]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, provinces, districts, tambons, schools, students, pn, dn, tn, t, lang, th, user])

  // the cursor always lands on a row that exists
  useEffect(() => setCursor(0), [q])

  const go = (h: Hit) => {
    nav(h.to)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (!hits.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => (c + 1) % hits.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => (c - 1 + hits.length) % hits.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const hit = hits[cursor]
        if (hit) go(hit)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // keep the highlighted row in view while arrowing through a long list
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const KIND_LABEL: Record<Kind, string> = {
    page: th ? 'หน้าจอ' : 'Pages',
    province: th ? 'จังหวัด' : 'Provinces',
    district: th ? 'อำเภอ' : 'Districts',
    tambon: th ? 'ตำบล' : 'Tambons',
    school: th ? 'สถานศึกษา' : 'Schools',
    student: th ? 'เด็กรายบุคคล' : 'Children',
  }

  /** examples drawn from the data actually in scope, so they always return hits */
  const examples = useMemo(
    () =>
      [
        districts[0] && { label: dn(districts[0].key), q: dn(districts[0].key) },
        tambons[0] && can('/tambon') && { label: tn(tambons[0].key), q: tn(tambons[0].key) },
        schools[0] && can('/school') && { label: schools[0].id, q: schools[0].id },
      ].filter(Boolean) as { label: string; q: string }[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [districts, tambons, schools, dn, tn, user],
  )

  // Rendered into document.body: the top bar it is opened from has a
  // backdrop-filter, which makes it the containing block for any fixed child —
  // the overlay stopped short of the viewport and left the header lit up.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[10vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        onClick={onClose}
        className="absolute inset-0 bg-brand-950/35 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, y: -18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 26 }}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-surface-border bg-white shadow-[0_28px_80px_rgba(4,14,38,0.32)]"
      >
        {/* query line — the row carries the focus state for the bare input */}
        <div className="flex items-center gap-3 border-b-2 border-surface-border px-4 transition-colors focus-within:border-brand-400">
          <motion.span
            animate={{ scale: q ? [1, 1.15, 1] : 1 }}
            transition={{ duration: 0.3 }}
            className="text-brand-500"
          >
            <IconSearch width={20} height={20} />
          </motion.span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              th ? 'พิมพ์ชื่ออำเภอ ตำบล โรงเรียน เด็ก หรือชื่อหน้า' : 'District, tambon, school, child or page'
            }
            className="flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-ink-faint"
          />
          {q && (
            <span className="tabular hidden rounded-md bg-surface-muted px-2 py-0.5 text-[10.5px] font-semibold text-ink-muted sm:block">
              {formatNumber(hits.length, lang)} {th ? 'รายการ' : 'hits'}
            </span>
          )}
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
            aria-label={t('common.close')}
          >
            <IconClose width={16} height={16} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto">
          {/* empty state: the pages you can reach, and searches that will work */}
          {!q && (
            <div className="p-2">
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                {th ? 'ไปที่หน้า' : 'Jump to a page'}
              </p>
              {pageHits.slice(0, 5).map((h, i) => (
                <motion.button
                  key={h.to}
                  onClick={() => go(h)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.02 + i * 0.04 }}
                  whileHover={{ x: 2 }}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-brand-50/70"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-muted text-ink-muted transition-colors group-hover:bg-brand-100 group-hover:text-brand-700">
                    <IconArrowRight width={15} height={15} />
                  </span>
                  <span className="flex-1 truncate text-[13px] font-medium text-ink">{h.label}</span>
                </motion.button>
              ))}

              {examples.length > 0 && (
                <>
                  <p className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                    {th ? 'ลองค้นหา' : 'Try searching'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    {examples.map((ex, i) => (
                      <motion.button
                        key={ex.label}
                        onClick={() => setQ(ex.q)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.22 + i * 0.05 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-700"
                      >
                        {ex.label}
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {q && hits.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-10 text-center"
            >
              <p className="text-sm font-semibold text-ink">
                {th ? `ไม่พบ “${q}” ในขอบเขตของคุณ` : `No “${q}” in your scope`}
              </p>
              <p className="mt-1 text-[11.5px] text-ink-muted">
                {th
                  ? 'ค้นได้เฉพาะพื้นที่ โรงเรียน และเด็กที่บัญชีของคุณรับผิดชอบ'
                  : 'Search only covers the areas, schools and children your account owns'}
              </p>
            </motion.div>
          )}

          {/* results, grouped, keyed by query so each search re-animates */}
          {q && hits.length > 0 && (
            <div key={q} className="p-2">
              {(['page', 'province', 'district', 'tambon', 'school', 'student'] as Kind[]).map(
                (kind) => {
                  const rows = hits.filter((h) => h.kind === kind)
                  if (!rows.length) return null
                  const Icon = KIND_ICON[kind]
                  return (
                    <div key={kind} className="mb-1">
                      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        {KIND_LABEL[kind]}
                        <span className="ml-1.5 font-medium normal-case text-ink-faint/70">
                          {rows.length}
                        </span>
                      </p>
                      {rows.map((h) => {
                        const idx = hits.indexOf(h)
                        const active = idx === cursor
                        return (
                          <motion.button
                            key={`${h.kind}-${h.to}-${h.label}`}
                            data-row={idx}
                            onClick={() => go(h)}
                            onMouseEnter={() => setCursor(idx)}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(0.2, idx * 0.02) }}
                            className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                              active ? 'bg-brand-50' : ''
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="search-cursor"
                                className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600"
                                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                              />
                            )}
                            <span
                              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
                                active ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
                              }`}
                            >
                              <Icon width={17} height={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                {h.tone && (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ background: h.tone }}
                                  />
                                )}
                                <span className="truncate text-[13px] font-semibold text-ink">
                                  {h.label}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                                {h.sub}
                              </span>
                            </span>
                            {active && (
                              <span className="shrink-0 rounded-md border border-brand-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                                ↵
                              </span>
                            )}
                          </motion.button>
                        )
                      })}
                    </div>
                  )
                },
              )}
            </div>
          )}
        </div>

        {/* keyboard legend — the palette is meant to be driven without a mouse */}
        <div className="flex items-center gap-4 border-t border-surface-border bg-surface-muted/40 px-4 py-2 text-[10.5px] text-ink-faint">
          <span className="flex items-center gap-1">
            <Key>↑</Key>
            <Key>↓</Key>
            {th ? 'เลือก' : 'navigate'}
          </span>
          <span className="flex items-center gap-1">
            <Key>↵</Key>
            {th ? 'เปิด' : 'open'}
          </span>
          <span className="flex items-center gap-1">
            <Key>esc</Key>
            {th ? 'ปิด' : 'close'}
          </span>
          <span className="ml-auto hidden truncate sm:block">
            {th ? 'ค้นเฉพาะขอบเขตของบัญชีคุณ' : 'Scoped to your account'}
          </span>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-surface-border bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink-muted">
      {children}
    </kbd>
  )
}
