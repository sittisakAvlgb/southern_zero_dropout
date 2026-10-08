import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, motion } from 'framer-motion'
import type { Province, Region } from '@/types'
import { rateToLevel, RISK_COLOR } from '@/lib/risk'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber, formatPct } from '@/lib/format'
import { MAP_VIEWBOX, MAP_W, MAP_H, PROVINCE_PATHS } from '@/data/thailandPaths'
import { PROVINCE_BY_KEY } from '@/data/provinces'
import {
  IconArrowRight,
  IconClose,
  IconEye,
  IconHome,
  IconMinus,
  IconPlus,
} from '@/components/icons'

interface Props {
  provinces: Province[]
  selectedKey?: string | null
  /** fired on click (selection) — used by pages that keep a side panel */
  onSelect?: (p: Province) => void
  /** fired from the "open details" button (navigation) */
  onOpen?: (p: Province) => void
  richTooltip?: boolean
  height?: number
  showRegionFilter?: boolean
  showCard?: boolean
}

interface Box { x: number; y: number; w: number; h: number }
const ALL_KEYS = Object.keys(PROVINCE_PATHS)
const FULL: Box = { x: 0, y: 0, w: MAP_W, h: MAP_H }
const ASPECT = MAP_W / MAP_H
const MIN_W = 90
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const REGIONS: (Region | 'all')[] = ['all', 'north', 'northeast', 'central', 'east', 'west', 'south']

/** fit a box into the view keeping the map aspect ratio, with padding */
function fitView(box: Box, pad: number): Box {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  let w = box.w / pad
  let h = box.h / pad
  if (w / h > ASPECT) h = w / ASPECT
  else w = h * ASPECT
  w = Math.max(MIN_W, Math.min(w, MAP_W))
  h = Math.max(MIN_W / ASPECT, Math.min(h, MAP_H))
  let x = cx - w / 2
  let y = cy - h / 2
  x = Math.max(-w * 0.05, Math.min(x, MAP_W - w + w * 0.05))
  y = Math.max(-h * 0.05, Math.min(y, MAP_H - h + h * 0.05))
  return { x, y, w, h }
}

export function ThailandMap({
  provinces,
  selectedKey,
  onSelect,
  onOpen,
  richTooltip = false,
  height = 460,
  showRegionFilter = true,
  showCard = true,
}: Props) {
  const { t, pn } = useI18n()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [region, setRegion] = useState<Region | 'all'>('all')

  const [view, setView] = useState<Box>(FULL)
  const viewRef = useRef<Box>(FULL)
  const animRef = useRef<{ stop: () => void } | null>(null)

  // precompute per-province bounding boxes (from the path `d`)
  const bbox = useMemo(() => {
    const m: Record<string, Box> = {}
    for (const k of ALL_KEYS) {
      const nums = (PROVINCE_PATHS[k].d.match(/-?\d+\.?\d*/g) || []).map(Number)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < nums.length - 1; i += 2) {
        const x = nums[i], y = nums[i + 1]
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      m[k] = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    return m
  }, [])

  const byKey = useMemo(() => {
    const m: Record<string, Province> = {}
    for (const p of provinces) m[p.key] = p
    return m
  }, [provinces])

  const animateView = useCallback((target: Box) => {
    animRef.current?.stop()
    const from = { ...viewRef.current }
    animRef.current = animate(0, 1, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (t2) => {
        const v = {
          x: lerp(from.x, target.x, t2),
          y: lerp(from.y, target.y, t2),
          w: lerp(from.w, target.w, t2),
          h: lerp(from.h, target.h, t2),
        }
        viewRef.current = v
        setView(v)
      },
    })
  }, [])

  const setViewNow = (v: Box) => { viewRef.current = v; setView(v) }

  const zoomToProvince = useCallback((key: string) => {
    const b = bbox[key]
    if (b) animateView(fitView(b, 0.5))
  }, [bbox, animateView])

  const reset = useCallback(() => {
    setFocused(null)
    setRegion('all')
    animateView(FULL)
  }, [animateView])

  const isZoomed = view.w < MAP_W - 2

  // respond to external selectedKey (e.g. Risk Heatmap side panel)
  useEffect(() => {
    if (selectedKey && selectedKey !== focused) {
      setFocused(selectedKey)
      zoomToProvince(selectedKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  // region quick-filter → zoom to the region's extent
  const applyRegion = (r: Region | 'all') => {
    setRegion(r)
    setFocused(null)
    if (r === 'all') { animateView(FULL); return }
    const keys = ALL_KEYS.filter((k) => PROVINCE_BY_KEY[k]?.region === r)
    if (!keys.length) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const k of keys) {
      const b = bbox[k]
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h)
    }
    animateView(fitView({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 0.88))
  }

  const zoomBy = (factor: number) => {
    const v = viewRef.current
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2
    let w = Math.max(MIN_W, Math.min(v.w * factor, MAP_W))
    let h = w / ASPECT
    if (h > MAP_H) { h = MAP_H; w = h * ASPECT }
    let x = cx - w / 2, y = cy - h / 2
    x = Math.max(-w * 0.05, Math.min(x, MAP_W - w + w * 0.05))
    y = Math.max(-h * 0.05, Math.min(y, MAP_H - h + h * 0.05))
    animateView({ x, y, w, h })
  }

  // ── pan (drag) ────────────────────────────────────────────
  const drag = useRef<{ px: number; py: number; view: Box; moved: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isZoomed) return
    drag.current = { px: e.clientX, py: e.clientY, view: { ...viewRef.current }, moved: 0 }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect()
    setTip({ x: e.clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0), y: e.clientY - (wrapRef.current?.getBoundingClientRect().top ?? 0) })
    if (!drag.current || !r) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    drag.current.moved += Math.abs(dx) + Math.abs(dy)
    animRef.current?.stop()
    const fx = drag.current.view.w / r.width
    const fy = drag.current.view.h / r.height
    let x = drag.current.view.x - dx * fx
    let y = drag.current.view.y - dy * fy
    const w = drag.current.view.w, h = drag.current.view.h
    x = Math.max(-w * 0.08, Math.min(x, MAP_W - w + w * 0.08))
    y = Math.max(-h * 0.08, Math.min(y, MAP_H - h + h * 0.08))
    setViewNow({ x, y, w, h })
  }
  const onPointerUp = () => { setTimeout(() => { drag.current = null }, 0) }

  const handleProvinceClick = (prov: Province) => {
    if (drag.current && drag.current.moved > 6) return // ignore drags
    setFocused(prov.key)
    zoomToProvince(prov.key)
    onSelect?.(prov)
  }

  const maxStudents = Math.max(...provinces.map((p) => p.totalStudents), 1)

  const ordered = useMemo(() => {
    return [...ALL_KEYS].sort((a, b) => {
      const rank = (k: string) => (k === hoverKey ? 3 : k === focused ? 2 : byKey[k] ? 1 : 0)
      return rank(a) - rank(b)
    })
  }, [hoverKey, focused, byKey])

  const fp = focused ? byKey[focused] : null

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none overflow-hidden rounded-xl"
      style={{ height }}
      onMouseLeave={() => { setHoverKey(null); setTip(null) }}
    >
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className={`h-full w-full ${isZoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t('ov.heatTitle')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <radialGradient id="thGlow" cx="46%" cy="42%" r="65%">
            <stop offset="0%" stopColor="#cddcff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#cddcff" stopOpacity="0" />
          </radialGradient>
          <filter id="thHoverGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#2f66f6" floodOpacity="0.8" />
          </filter>
        </defs>

        <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="url(#thGlow)" />

        <motion.g initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.008, delayChildren: 0.1 } } }}>
          {ordered.map((k) => {
            const geo = PROVINCE_PATHS[k]
            const prov = byKey[k]
            const inRegion = region === 'all' || PROVINCE_BY_KEY[k]?.region === region
            const active = !!prov && inRegion
            const level = prov ? rateToLevel(prov.riskRate) : 'normal'
            const isFoc = focused === k
            const isHover = hoverKey === k
            const dim = !!prov && !inRegion
            const fill = active ? RISK_COLOR[level] : dim ? '#dfe6f0' : '#e6ecf5'
            const critical = active && level === 'critical'
            return (
              <motion.path
                key={k}
                d={geo.d}
                variants={{ hidden: { opacity: 0, pathLength: 0 }, visible: { opacity: active ? (isFoc || isHover ? 1 : 0.9) : dim ? 0.45 : 0.5, pathLength: 1, transition: { pathLength: { duration: 0.5 }, opacity: { duration: 0.4 } } } }}
                animate={critical && !isHover && !isFoc ? { opacity: [0.9, 0.62, 0.9] } : undefined}
                transition={critical && !isHover && !isFoc ? { duration: 1.8, repeat: Infinity } : undefined}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={isFoc ? 1.1 : isHover ? 1 : 0.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                filter={isHover ? 'url(#thHoverGlow)' : undefined}
                style={{ cursor: active ? 'pointer' : 'default', pointerEvents: active ? 'auto' : 'none', outline: 'none' }}
                onMouseEnter={() => active && setHoverKey(k)}
                onMouseLeave={() => setHoverKey((c) => (c === k ? null : c))}
                onFocus={() => active && setHoverKey(k)}
                onBlur={() => setHoverKey((c) => (c === k ? null : c))}
                onClick={() => active && handleProvinceClick(prov!)}
                tabIndex={active ? 0 : -1}
                aria-label={active ? `${pn(k)} · ${formatPct(prov!.riskRate)}` : pn(k)}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && active) { e.preventDefault(); handleProvinceClick(prov!) } }}
              />
            )
          })}
        </motion.g>

        {/* selected province — animated dashed outline that follows the shape */}
        {focused && byKey[focused] && PROVINCE_PATHS[focused] && (
          <>
            <path
              d={PROVINCE_PATHS[focused].d}
              fill="none"
              stroke="#ffffff"
              strokeWidth={3.4}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <motion.path
              d={PROVINCE_PATHS[focused].d}
              fill="none"
              stroke="#0f2a6b"
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              animate={{ strokeDashoffset: [0, -22] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
            />
          </>
        )}

        {ordered.filter((k) => byKey[k] && (region === 'all' || PROVINCE_BY_KEY[k]?.region === region) && rateToLevel(byKey[k].riskRate) === 'critical').slice(0, 12).map((k) => {
          const g = PROVINCE_PATHS[k]
          return (
            <motion.circle key={`rip-${k}`} cx={g.cx} cy={g.cy} r={5} fill="none" stroke={RISK_COLOR.critical} strokeWidth={1.4} vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0.5, scale: 0.6 }} animate={{ opacity: 0, scale: 3.4 }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }} pointerEvents="none" />
          )
        })}

        {(hoverKey || focused) && (() => {
          const k = hoverKey || focused!
          const g = PROVINCE_PATHS[k]
          if (!g || !byKey[k]) return null
          return (
            <text x={g.cx} y={g.cy} textAnchor="middle" className="pointer-events-none"
              style={{ fontSize: 13 * (view.w / MAP_W), fontWeight: 700, fill: '#0f2a6b', paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 * (view.w / MAP_W), strokeLinejoin: 'round' }}>
              {pn(k)}
            </text>
          )
        })()}
      </svg>

      {/* Region filter chips */}
      {showRegionFilter && (
        <div className="pointer-events-auto absolute left-2 top-2 flex max-w-[calc(100%-90px)] flex-wrap gap-1">
          {REGIONS.map((r) => {
            const on = region === r
            return (
              <button key={r} onClick={() => applyRegion(r)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur transition-colors ${on ? 'bg-brand-500 text-white' : 'bg-white/85 text-ink-muted hover:bg-white'}`}>
                {t(`region.${r}`)}
              </button>
            )
          })}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute right-2 top-2 flex flex-col gap-1.5">
        <ZoomBtn label="zoom in" onClick={() => zoomBy(0.65)}><IconPlus width={16} height={16} /></ZoomBtn>
        <ZoomBtn label="zoom out" onClick={() => zoomBy(1.5)}><IconMinus width={16} height={16} /></ZoomBtn>
        <ZoomBtn label="reset" onClick={reset}><IconHome width={15} height={15} /></ZoomBtn>
      </div>

      {/* Hover tooltip (hidden while a card is shown for the same province) */}
      <AnimatePresence>
        {hoverKey && tip && byKey[hoverKey] && hoverKey !== focused && (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-20 w-[220px] rounded-xl border border-surface-border bg-white/95 p-3 shadow-card-hover backdrop-blur"
            style={{ left: Math.min(tip.x + 16, (wrapRef.current?.clientWidth ?? 0) - 230), top: Math.max(tip.y - 20, 8) }}>
            <TipContent p={byKey[hoverKey]} t={t} pn={pn} rich={richTooltip} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Focused province info card */}
      <AnimatePresence>
        {showCard && fp && (
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="absolute bottom-3 right-3 z-20 w-[248px] rounded-2xl border border-surface-border bg-white p-3.5 shadow-card-hover">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-ink">{pn(fp.key)}</p>
                <p className="text-[11px] text-ink-muted">{t(`region.${fp.region}`)}</p>
              </div>
              <button onClick={() => { setFocused(null); reset() }} className="rounded-lg p-1 text-ink-faint hover:bg-surface-muted" aria-label={t('common.close')}>
                <IconClose width={15} height={15} />
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Stat label={t('kpi.total')} value={formatNumber(fp.totalStudents)} />
              <Stat label={t('risk.rate')} value={formatPct(fp.riskRate)} color={RISK_COLOR[rateToLevel(fp.riskRate)]} />
              <Stat label={t('kpi.highrisk')} value={formatNumber(fp.highRiskStudents)} />
              <Stat label={t('common.openCases')} value={formatNumber(fp.openCases)} />
            </div>
            {onOpen && (
              <button onClick={() => onOpen(fp)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-600">
                <IconEye width={14} height={14} /> {t('common.viewDetail')} <IconArrowRight width={14} height={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex flex-col gap-1 rounded-lg bg-white/85 p-2 text-[10px] backdrop-blur">
        {(['normal', 'watch', 'high', 'critical'] as const).map((lv) => (
          <div key={lv} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RISK_COLOR[lv] }} />
            <span className="text-ink-muted">{t(`risk.${lv}`)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ZoomBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg border border-surface-border bg-white/90 text-ink-muted shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-brand-600">
      {children}
    </button>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-surface-muted px-2 py-1.5">
      <p className="text-[9px] text-ink-faint">{label}</p>
      <p className="tabular text-sm font-bold" style={{ color: color ?? '#0f1b2d' }}>{value}</p>
    </div>
  )
}

function TipContent({ p, t, pn, rich }: { p: Province; t: (k: string) => string; pn: (k: string) => string; rich: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">{pn(p.key)}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: RISK_COLOR[rateToLevel(p.riskRate)] }}>{formatPct(p.riskRate)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex flex-col"><span className="text-ink-faint">{t('kpi.total')}</span><span className="font-semibold text-ink">{formatNumber(p.totalStudents)}</span></div>
        <div className="flex flex-col"><span className="text-ink-faint">{t('kpi.highrisk')}</span><span className="font-semibold text-ink">{formatNumber(p.highRiskStudents)}</span></div>
        {rich && (<>
          <div className="flex flex-col"><span className="text-ink-faint">{t('common.topCause')}</span><span className="font-semibold text-ink">{t(`cause.${p.topCauses[0].key}`)}</span></div>
          <div className="flex flex-col"><span className="text-ink-faint">{t('heat.unfollowed')}</span><span className="font-semibold text-ink">{formatNumber(p.unassignedCases)}</span></div>
        </>)}
      </div>
    </>
  )
}
