import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, motion } from 'framer-motion'
import type { District, Province, RiskLevel, School } from '@/types'
import { RISK_COLOR } from '@/lib/risk'
import { useI18n } from '@/i18n/LanguageContext'
import { formatNumber, formatPct } from '@/lib/format'
import { MAP_H, MAP_W, PROVINCE_PATHS } from '@/data/thailandPaths'
import {
  DISTRICT_BY_KEY as DISTRICT_GEO,
  SBP_PROVINCE_KEYS,
  SBP_VIEWBOX,
  projectLat,
  projectLon,
} from '@/data/geo'
import { SearchSelect, type SearchOption } from '@/components/ui/SearchSelect'
import {
  IconArrowRight,
  IconClose,
  IconHome,
  IconMinus,
  IconPlus,
  IconSchool,
} from '@/components/icons'

export type MapMetric = 'risk' | 'oos' | 'coverage'

interface Props {
  districts: District[]
  provinces: Province[]
  /** TOR ภาคผนวก ค pilot schools — drives the third drill-down level */
  schools?: School[]
  selectedKey?: string | null
  onSelect?: (d: District) => void
  onSelectProvince?: (p: Province) => void
  onSelectSchool?: (s: School) => void
  onOpen?: (d: District) => void
  onOpenProvince?: (p: Province) => void
  metric?: MapMetric
  onMetricChange?: (m: MapMetric) => void
  height?: number
  showMetricSwitch?: boolean
  showFilters?: boolean
  showCard?: boolean
  /** province key the map settles on after the opening country-wide shot */
  initialFocus?: string | null
}

const METRICS: { key: MapMetric; th: string; en: string }[] = [
  { key: 'risk', th: 'สัดส่วนเสี่ยงสูง', en: 'High-risk share' },
  // colours the still-out part on purpose — that is where a visit is needed —
  // so the label has to say so, or it reads as the whole known group
  { key: 'oos', th: 'ยังอยู่นอกระบบ', en: 'Still out of school' },
  { key: 'coverage', th: 'ความครอบคลุมของแผน', en: 'Plan coverage' },
]

/** The three TOR pilot provinces — the only openable areas on the map.
 *  Every other province is drawn as context and never receives events. */
const OPENABLE = ['pattani', 'yala', 'narathiwat'] as const
const IN_SCOPE = new Set<string>(SBP_PROVINCE_KEYS)
const ALL_PROVINCE_KEYS = Object.keys(PROVINCE_PATHS)

interface Box { x: number; y: number; w: number; h: number }
const THAILAND: Box = { x: 0, y: 0, w: MAP_W, h: MAP_H }
const SBP: Box = { x: SBP_VIEWBOX.x, y: SBP_VIEWBOX.y, w: SBP_VIEWBOX.w, h: SBP_VIEWBOX.h }
/** pins are illegible above this view width, so they fade out */
const PIN_VISIBLE_W = 360
const MIN_W = 12

/** teardrop marker: tip sits on the coordinate, head balloons above it */
const PIN_PATH =
  'M0 0 C-2.2 -3.4 -7 -8.4 -7 -12.6 A7 7 0 1 1 7 -12.6 C7 -8.4 2.2 -3.4 0 0 Z'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function clampBox(b: Box): Box {
  const w = Math.max(MIN_W, Math.min(b.w, MAP_W))
  const h = Math.max(MIN_W, Math.min(b.h, MAP_H))
  return {
    w,
    h,
    x: Math.max(-w * 0.1, Math.min(b.x, MAP_W - w + w * 0.1)),
    y: Math.max(-h * 0.1, Math.min(b.y, MAP_H - h + h * 0.1)),
  }
}

/** grow a box around its centre by `f` (0.6 = 60% more room) */
function padBox(b: Box, f: number): Box {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const w = b.w * (1 + f)
  const h = b.h * (1 + f)
  return clampBox({ x: cx - w / 2, y: cy - h / 2, w, h })
}

function boxAround(x: number, y: number, w: number): Box {
  return clampBox({ x: x - w / 2, y: y - (w * 0.85) / 2, w, h: w * 0.85 })
}

/** Thresholds per metric → the same four semantic bands everywhere. */
function levelFor(d: District, metric: MapMetric): RiskLevel {
  if (metric === 'risk') {
    if (d.riskRate >= 14) return 'critical'
    if (d.riskRate >= 11) return 'high'
    if (d.riskRate >= 8) return 'watch'
    return 'normal'
  }
  if (metric === 'oos') {
    const per1k = (d.oosCount / Math.max(1, d.totalStudents)) * 1000
    if (per1k >= 40) return 'critical'
    if (per1k >= 28) return 'high'
    if (per1k >= 18) return 'watch'
    return 'normal'
  }
  // coverage — inverted: low coverage is the bad end
  if (d.planCoverage < 40) return 'critical'
  if (d.planCoverage < 55) return 'high'
  if (d.planCoverage < 70) return 'watch'
  return 'normal'
}

/** Province band = the same thresholds applied to its districts rolled up. */
function provinceLevelFor(rows: District[], metric: MapMetric): RiskLevel {
  const total = rows.reduce((s, d) => s + d.totalStudents, 0)
  if (!rows.length || !total) return 'normal'
  const roll = {
    riskRate: rows.reduce((s, d) => s + d.riskRate * d.totalStudents, 0) / total,
    oosCount: rows.reduce((s, d) => s + d.oosCount, 0),
    totalStudents: total,
    planCoverage: rows.reduce((s, d) => s + d.planCoverage * d.totalStudents, 0) / total,
  } as District
  return levelFor(roll, metric)
}

function schoolLevel(s: School): RiskLevel {
  const rate = (s.highRiskStudents / Math.max(1, s.totalStudents)) * 100
  if (rate >= 14) return 'critical'
  if (rate >= 11) return 'high'
  if (rate >= 8) return 'watch'
  return 'normal'
}

function metricValue(d: District, metric: MapMetric): string {
  if (metric === 'risk') return formatPct(d.riskRate)
  if (metric === 'oos') return formatNumber(d.oosCount)
  return formatPct(d.planCoverage)
}

export function SouthernMap({
  districts,
  provinces,
  schools = [],
  selectedKey,
  onSelect,
  onSelectProvince,
  onSelectSchool,
  onOpen,
  onOpenProvince,
  metric: metricProp,
  onMetricChange,
  height = 470,
  showMetricSwitch = true,
  showFilters = true,
  showCard = true,
  initialFocus = null,
}: Props) {
  const { t, lang, pn, dn } = useI18n()
  const th = lang === 'th'
  const sn = (s: School) => (th ? s.name : s.nameEn ?? s.name)

  const [innerMetric, setInnerMetric] = useState<MapMetric>('risk')
  const metric = metricProp ?? innerMetric
  const setMetric = (m: MapMetric) => {
    setInnerMetric(m)
    onMetricChange?.(m)
  }

  // ── drill-down state: จังหวัด → อำเภอ → โรงเรียน ─────────────
  const [provinceKey, setProvinceKey] = useState<string>('all')
  const [districtKey, setDistrictKey] = useState<string>('all')
  const [schoolId, setSchoolId] = useState<string>('all')

  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [hoverProvince, setHoverProvince] = useState<string | null>(null)
  const [hoverSchool, setHoverSchool] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  /** live pixel size of the map box — pins are positioned against it */
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<Box>(THAILAND)
  const viewRef = useRef<Box>(THAILAND)
  const animRef = useRef<{ stop: () => void } | null>(null)

  const provinceByKey = useMemo(
    () => Object.fromEntries(provinces.map((p) => [p.key, p])),
    [provinces],
  )
  const districtsByProvince = useMemo(() => {
    const m: Record<string, District[]> = {}
    for (const d of districts) (m[d.provinceKey] ??= []).push(d)
    return m
  }, [districts])

  // bounding boxes of the in-scope provinces, derived from their path data
  const bbox = useMemo(() => {
    const m: Record<string, Box> = {}
    for (const k of ALL_PROVINCE_KEYS) {
      if (!IN_SCOPE.has(k)) continue
      const nums = (PROVINCE_PATHS[k].d.match(/-?\d+\.?\d*/g) || []).map(Number)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < nums.length - 1; i += 2) {
        minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i])
        minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1])
      }
      m[k] = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    return m
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const animateView = useCallback((target: Box) => {
    animRef.current?.stop()
    const from = { ...viewRef.current }
    animRef.current = animate(0, 1, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (p) => {
        const v = {
          x: lerp(from.x, target.x, p),
          y: lerp(from.y, target.y, p),
          w: lerp(from.w, target.w, p),
          h: lerp(from.h, target.h, p),
        }
        viewRef.current = v
        setView(v)
      },
    })
  }, [])

  const zoomToProvince = useCallback((key: string) => {
    const b = bbox[key]
    if (b) animateView(padBox(b, 0.55))
  }, [bbox, animateView])

  const zoomToDistrict = useCallback((key: string) => {
    const g = DISTRICT_GEO[key]
    if (g) animateView(boxAround(projectLon(g.lon), projectLat(g.lat), 34))
  }, [animateView])

  // ── selection helpers ───────────────────────────────────────
  const selectProvince = (key: string) => {
    setProvinceKey(key)
    setDistrictKey('all')
    setSchoolId('all')
    setFocusKey(null)
    if (key === 'all') animateView(SBP)
    else {
      zoomToProvince(key)
      const p = provinceByKey[key]
      if (p) onSelectProvince?.(p)
    }
  }

  const selectDistrict = (key: string) => {
    setDistrictKey(key)
    setSchoolId('all')
    if (key === 'all') {
      setFocusKey(null)
      if (provinceKey !== 'all') zoomToProvince(provinceKey)
      return
    }
    const d = districts.find((x) => x.key === key)
    setProvinceKey(d?.provinceKey ?? provinceKey)
    setFocusKey(key)
    zoomToDistrict(key)
    if (d) onSelect?.(d)
  }

  const selectSchool = (id: string) => {
    setSchoolId(id)
    if (id === 'all') {
      if (districtKey !== 'all') zoomToDistrict(districtKey)
      return
    }
    const s = schools.find((x) => x.id === id)
    if (!s) return
    setProvinceKey(s.provinceKey)
    setDistrictKey(s.districtKey)
    animateView(boxAround(projectLon(s.lon), projectLat(s.lat), 18))
    onSelectSchool?.(s)
  }

  const resetToCountry = () => {
    setProvinceKey('all')
    setDistrictKey('all')
    setSchoolId('all')
    setFocusKey(null)
    animateView(THAILAND)
  }

  const zoomBy = (factor: number) => {
    const v = viewRef.current
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2
    const w = Math.max(MIN_W, Math.min(v.w * factor, MAP_W))
    const h = w * (v.h / v.w)
    animateView(clampBox({ x: cx - w / 2, y: cy - h / 2, w, h }))
  }

  // opening shot: whole country, then settle on the page's province
  useEffect(() => {
    if (!initialFocus) return
    const id = setTimeout(() => {
      setProvinceKey(initialFocus)
      zoomToProvince(initialFocus)
    }, 500)
    return () => clearTimeout(id)
  }, [initialFocus, zoomToProvince])

  // external selection — a province key (heatmap) or a district key (drill-down)
  useEffect(() => {
    if (!selectedKey) return
    const geo = DISTRICT_GEO[selectedKey]
    if (geo) {
      setProvinceKey(geo.provinceKey)
      setDistrictKey(selectedKey)
      setFocusKey(selectedKey)
      zoomToDistrict(selectedKey)
    } else if (bbox[selectedKey]) {
      setProvinceKey(selectedKey)
      zoomToProvince(selectedKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  // ── pan ─────────────────────────────────────────────────────
  const isZoomed = view.w < MAP_W - 2
  const drag = useRef<{ px: number; py: number; view: Box; moved: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isZoomed) return
    drag.current = { px: e.clientX, py: e.clientY, view: { ...viewRef.current }, moved: 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!drag.current || !r) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    drag.current.moved += Math.abs(dx) + Math.abs(dy)
    animRef.current?.stop()
    const { w, h } = drag.current.view
    const scale = Math.max(w / r.width, h / r.height)
    const v = clampBox({
      x: drag.current.view.x - dx * scale,
      y: drag.current.view.y - dy * scale,
      w,
      h,
    })
    viewRef.current = v
    setView(v)
  }
  const onPointerUp = () => { setTimeout(() => { drag.current = null }, 0) }
  const wasDragged = () => !!drag.current && drag.current.moved > 6

  // ── what is on the map right now ────────────────────────────
  const visibleDistricts = useMemo(
    () => (provinceKey === 'all' ? districts : districts.filter((d) => d.provinceKey === provinceKey)),
    [districts, provinceKey],
  )
  const visibleSchools = useMemo(() => {
    if (districtKey === 'all') return []
    return schools.filter((s) => s.districtKey === districtKey)
  }, [schools, districtKey])

  const showPins = view.w < PIN_VISIBLE_W
  const showSchools = showPins && visibleSchools.length > 0
  /** view-relative scale: 1 at จชต. zoom, ~3.8 when the whole country is shown */
  const k = view.w / SBP.w

  const maxStudents = Math.max(...districts.map((d) => d.totalStudents), 1)

  /** map coordinate → pixel inside the map box, matching xMidYMid meet */
  const toScreen = (lon: number, lat: number) => {
    const scale = Math.min(box.w / view.w, box.h / view.h)
    return {
      x: (projectLon(lon) - view.x) * scale + (box.w - view.w * scale) / 2,
      y: (projectLat(lat) - view.y) * scale + (box.h - view.h * scale) / 2,
    }
  }
  /** pins just outside the frame are skipped rather than clipped mid-animation */
  const onScreen = (p: { x: number; y: number }) =>
    p.x > -70 && p.x < box.w + 70 && p.y > -70 && p.y < box.h + 70

  const activeDistrict = districts.find((d) => d.key === focusKey) ?? null
  const hovered = districts.find((d) => d.key === hoverKey) ?? null
  const hoveredProvince = hoverProvince ? provinceByKey[hoverProvince] : null
  const hoveredSchool = schools.find((s) => s.id === hoverSchool) ?? null
  const activeSchool = schools.find((s) => s.id === schoolId) ?? null
  const focusedProvince = provinceKey !== 'all' ? provinceByKey[provinceKey] ?? null : null

  // One control for the whole hierarchy — a province, an อำเภอ or a school is
  // always one action away, and the breadcrumb on the map shows where you are.
  const jumpOptions = useMemo(() => {
    const rows: SearchOption[] = []
    for (const key of OPENABLE) {
      if (!provinceByKey[key]) continue
      rows.push({
        value: `p:${key}`,
        label: pn(key),
        meta: `${schools.filter((s) => s.provinceKey === key).length} ${th ? 'โรงเรียน' : 'schools'}`,
        group: th ? 'จังหวัด' : 'Province',
        keywords: key,
      })
    }
    for (const key of OPENABLE) {
      for (const d of districts.filter((x) => x.provinceKey === key)) {
        const geo = DISTRICT_GEO[d.key]
        rows.push({
          value: `d:${d.key}`,
          label: dn(d.key),
          meta: pn(key),
          group: th ? 'อำเภอ' : 'District',
          keywords: `${d.key} ${geo?.en ?? ''} ${geo?.ms ?? ''}`,
        })
      }
    }
    for (const s of schools) {
      rows.push({
        value: `s:${s.id}`,
        label: sn(s),
        meta: dn(s.districtKey),
        group: th ? 'โรงเรียนนำร่อง' : 'Pilot school',
        keywords: `${s.nameEn ?? ''} ${s.name} ${s.id} ${s.sesao ?? ''}`,
      })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts, schools, provinceByKey, th])

  const jumpValue =
    schoolId !== 'all'
      ? `s:${schoolId}`
      : districtKey !== 'all'
        ? `d:${districtKey}`
        : provinceKey !== 'all'
          ? `p:${provinceKey}`
          : 'all'

  const onJump = (v: string) => {
    if (v === 'all') return selectProvince('all')
    const kind = v.slice(0, 1)
    const id = v.slice(2)
    if (kind === 'p') return selectProvince(id)
    if (kind === 'd') return selectDistrict(id)
    return selectSchool(id)
  }

  return (
    <div className="relative">
      {(showFilters || showMetricSwitch) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {showFilters && (
            <SearchSelect
              className="w-[280px] shrink-0"
              value={jumpValue}
              onChange={onJump}
              options={jumpOptions}
              resetValue="all"
              placeholder={
                th ? 'ค้นหาจังหวัด อำเภอ หรือโรงเรียน' : 'Search province, district or school'
              }
              emptyText={th ? 'ไม่พบพื้นที่หรือโรงเรียนที่ค้นหา' : 'No matching area or school'}
            />
          )}
          {showMetricSwitch && (
            <div className="ml-auto flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    metric === m.key
                      ? 'bg-white font-semibold text-brand-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {th ? m.th : m.en}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-sky-50/60 to-white"
        style={{ height }}
      >
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          className={`h-full w-full ${isZoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
          role="img"
          aria-label={
            th
              ? 'แผนที่ประเทศไทย เลือกดูได้เฉพาะจังหวัดชายแดนภาคใต้'
              : 'Map of Thailand — only the southern border provinces are selectable'
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <defs>
            <radialGradient id="sbpGlow" cx="46%" cy="88%" r="55%">
              <stop offset="0%" stopColor="#cddcff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#cddcff" stopOpacity="0" />
            </radialGradient>
            <filter id="sbpHoverGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#2f66f6" floodOpacity="0.75" />
            </filter>
          </defs>

          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="url(#sbpGlow)" pointerEvents="none" />

          {/* Rest of the country — context only, never interactive */}
          <g pointerEvents="none">
            {ALL_PROVINCE_KEYS.filter((key) => !IN_SCOPE.has(key)).map((key) => (
              <path
                key={key}
                d={PROVINCE_PATHS[key].d}
                fill="#eef1f6"
                stroke="#ffffff"
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {/* Country view — the จชต. footprint is the only live target */}
          {!showPins && (
            <g>
              <motion.rect
                x={SBP.x}
                y={SBP.y}
                width={SBP.w}
                height={SBP.h}
                rx={10}
                fill="#2f66f6"
                fillOpacity={0.06}
                stroke="#2f66f6"
                strokeWidth={1.4}
                strokeDasharray="7 5"
                vectorEffect="non-scaling-stroke"
                animate={{ strokeDashoffset: [0, -24] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                style={{ cursor: 'pointer' }}
                onClick={() => { if (!wasDragged()) animateView(SBP) }}
              />
              <text
                x={SBP.x + SBP.w / 2}
                y={SBP.y - 8 * k}
                textAnchor="middle"
                pointerEvents="none"
                style={{
                  fontSize: 6 * k,
                  fontWeight: 700,
                  fill: '#1d3f8f',
                  paintOrder: 'stroke',
                  stroke: '#ffffff',
                  strokeWidth: 2 * k,
                  strokeLinejoin: 'round',
                }}
              >
                {th ? 'พื้นที่ จชต. — คลิกเพื่อเข้าดู' : 'SBP area — click to open'}
              </text>
            </g>
          )}

          {/* The three openable จชต. provinces */}
          {OPENABLE.map((key) => {
            const path = PROVINCE_PATHS[key]
            if (!path) return null
            const p = provinceByKey[key]
            const rows = districtsByProvince[key] ?? []
            const openable = !!p
            const level = provinceLevelFor(rows, metric)
            const isFocused = provinceKey === key
            const isHover = hoverProvince === key
            const muted = provinceKey !== 'all' && !isFocused
            return (
              <path
                key={key}
                d={path.d}
                fill={openable ? RISK_COLOR[level] : '#e2e8f0'}
                fillOpacity={
                  !openable
                    ? 0.6
                    : muted
                      ? 0.14
                      : showPins
                        ? (isHover || isFocused ? 0.4 : 0.26)
                        : (isHover || isFocused ? 0.92 : 0.72)
                }
                stroke="#ffffff"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                filter={isHover && openable ? 'url(#sbpHoverGlow)' : undefined}
                style={{ cursor: openable ? 'pointer' : 'default', outline: 'none' }}
                pointerEvents={openable ? 'auto' : 'none'}
                tabIndex={openable ? 0 : -1}
                role={openable ? 'button' : undefined}
                aria-label={openable ? pn(key) : undefined}
                onMouseEnter={() => setHoverProvince(key)}
                onMouseLeave={() => setHoverProvince((c) => (c === key ? null : c))}
                onClick={() => { if (openable && !wasDragged()) selectProvince(key) }}
                onKeyDown={(e) => {
                  if (openable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    selectProvince(key)
                  }
                }}
              />
            )
          })}

          {/* Selected province — a dashed outline that runs around the shape */}
          {focusedProvince && PROVINCE_PATHS[focusedProvince.key] && (
            <g pointerEvents="none">
              <path
                d={PROVINCE_PATHS[focusedProvince.key].d}
                fill="none"
                stroke="#ffffff"
                strokeWidth={3.4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <motion.path
                d={PROVINCE_PATHS[focusedProvince.key].d}
                fill="none"
                stroke="#0f2a6b"
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="6 5"
                vectorEffect="non-scaling-stroke"
                animate={{ strokeDashoffset: [0, -22] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
              />
            </g>
          )}

          {/* Province labels, once the area fills the frame */}
          {showPins && SBP_PROVINCE_KEYS.map((key) => {
            const path = PROVINCE_PATHS[key]
            if (!path || !provinceByKey[key]) return null
            if (provinceKey !== 'all' && provinceKey !== key) return null
            return (
              <text
                key={`lbl-${key}`}
                x={path.cx}
                y={path.cy - 14}
                textAnchor="middle"
                className="pointer-events-none select-none"
                style={{
                  fontSize: 6.5 * k,
                  fill: '#334155',
                  fontWeight: 700,
                  paintOrder: 'stroke',
                  stroke: '#ffffff',
                  strokeWidth: 2 * k,
                  strokeLinejoin: 'round',
                }}
              >
                {pn(key)}
              </text>
            )
          })}


        </svg>

        {/* ── Pins ────────────────────────────────────────────────
            Drawn as HTML on top of the map rather than inside the SVG.
            Nested SVG transforms plus animated CSS transforms disagree about
            which coordinate space they live in, which wrecked the pins at deep
            zoom; in HTML every size below is plain pixels at every zoom. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <AnimatePresence>
            {showPins && !showSchools && visibleDistricts.map((d, i) => {
              const geo = DISTRICT_GEO[d.key]
              if (!geo) return null
              const p = toScreen(geo.lon, geo.lat)
              if (!onScreen(p)) return null
              const lvl = levelFor(d, metric)
              const h = 26 + Math.sqrt(d.totalStudents / maxStudents) * 14
              const isActive = focusKey === d.key
              const isHover = hoverKey === d.key
              return (
                <Pin
                  key={d.key}
                  x={p.x}
                  y={p.y}
                  height={h}
                  color={RISK_COLOR[lvl]}
                  mark={d.hasDistrictTeam ? 'team' : 'noTeam'}
                  label={dn(d.key)}
                  showLabel={isHover || isActive}
                  active={isActive}
                  hovered={isHover}
                  pulse={lvl === 'critical'}
                  delay={Math.min(i, 24) * 0.022}
                  onEnter={() => setHoverKey(d.key)}
                  onLeave={() => setHoverKey((c) => (c === d.key ? null : c))}
                  onSelect={() => { if (!wasDragged()) selectDistrict(d.key) }}
                />
              )
            })}

            {showSchools && visibleSchools.map((s, i) => {
              const p = toScreen(s.lon, s.lat)
              if (!onScreen(p)) return null
              const lvl = schoolLevel(s)
              const isActive = schoolId === s.id
              const isHover = hoverSchool === s.id
              return (
                <Pin
                  key={s.id}
                  x={p.x}
                  y={p.y}
                  height={30}
                  color={RISK_COLOR[lvl]}
                  mark="school"
                  label={sn(s)}
                  showLabel={isHover || isActive}
                  active={isActive}
                  hovered={isHover}
                  pulse={isActive}
                  delay={Math.min(i, 20) * 0.035}
                  onEnter={() => setHoverSchool(s.id)}
                  onLeave={() => setHoverSchool((c) => (c === s.id ? null : c))}
                  onSelect={() => { if (!wasDragged()) selectSchool(s.id) }}
                />
              )
            })}
          </AnimatePresence>
        </div>

        {/* View controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <MapBtn label={th ? 'ขยาย' : 'Zoom in'} onClick={() => zoomBy(0.65)}>
            <IconPlus width={15} height={15} />
          </MapBtn>
          <MapBtn label={th ? 'ย่อ' : 'Zoom out'} onClick={() => zoomBy(1.55)}>
            <IconMinus width={15} height={15} />
          </MapBtn>
          <MapBtn label={th ? 'ทั้งประเทศ' : 'Whole country'} onClick={resetToCountry}>
            <IconHome width={14} height={14} />
          </MapBtn>
          <button
            onClick={() => { selectProvince('all') }}
            className="rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-brand-600"
          >
            {th ? 'จชต.' : 'SBP'}
          </button>
        </div>

        {/* Breadcrumb — shows how deep the drill-down is */}
        {showFilters && provinceKey !== 'all' && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto absolute left-3 top-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium shadow-sm ring-1 ring-slate-200 backdrop-blur"
            style={{ background: 'rgba(255, 255, 255, 0.94)' }}
          >
            <button onClick={resetToCountry} className="text-slate-400 transition hover:text-brand-600">
              {th ? 'จชต.' : 'SBP'}
            </button>
            <span className="text-slate-300">›</span>
            <button
              onClick={() => selectDistrict('all')}
              className={districtKey === 'all' ? 'text-ink' : 'text-slate-400 transition hover:text-brand-600'}
            >
              {pn(provinceKey)}
            </button>
            {districtKey !== 'all' && (
              <>
                <span className="text-slate-300">›</span>
                <button
                  onClick={() => selectSchool('all')}
                  className={schoolId === 'all' ? 'text-ink' : 'text-slate-400 transition hover:text-brand-600'}
                >
                  {dn(districtKey)}
                </button>
              </>
            )}
            {activeSchool && (
              <>
                <span className="text-slate-300">›</span>
                <span className="max-w-[180px] truncate text-ink">{sn(activeSchool)}</span>
              </>
            )}
          </motion.div>
        )}

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-xl bg-white/90 p-2.5 text-[10px] shadow-sm ring-1 ring-slate-200">
          <div className="font-semibold text-slate-500">
            {showSchools
              ? (th ? 'โรงเรียนนำร่อง (TOR ภาคผนวก ค)' : 'Pilot schools (TOR Appendix C)')
              : th ? METRICS.find((m) => m.key === metric)?.th : METRICS.find((m) => m.key === metric)?.en}
          </div>
          {(['normal', 'watch', 'high', 'critical'] as RiskLevel[]).map((l) => (
            <div key={l} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: RISK_COLOR[l] }}
              />
              <span className="text-slate-600">{t(`risk.${l}`)}</span>
            </div>
          ))}
          <div className="mt-1 flex flex-col gap-1.5 border-t border-slate-100 pt-1.5">
            {showSchools ? (
              <div className="flex items-center gap-1.5">
                <PinSwatch mark="school" />
                <span className="text-slate-600">
                  {th ? 'โรงเรียนนำร่องตาม TOR' : 'TOR pilot school'}
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <PinSwatch mark="team" />
                  <span className="text-slate-600">
                    {th ? 'มีทีมสหวิชาชีพอำเภอแล้ว' : 'Has a district team'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <PinSwatch mark="noTeam" />
                  <span className="text-slate-600">
                    {th ? 'ยังไม่มีทีมสหวิชาชีพอำเภอ' : 'No district team yet'}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#eef1f6] ring-1 ring-slate-300" />
            <span className="text-slate-600">
              {th ? 'นอกพื้นที่นำร่อง (ดูอย่างเดียว)' : 'Outside pilot area (view only)'}
            </span>
          </div>
        </div>

        {/* Hover tooltip */}
        <AnimatePresence>
          {(hoveredSchool || hovered || hoveredProvince) && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-none absolute right-16 top-3 max-w-[230px] rounded-xl px-3 py-2 text-xs text-white shadow-lg"
              style={{ background: 'rgba(15, 23, 42, 0.94)' }}
            >
              {hoveredSchool ? (
                <>
                  <div className="font-semibold">{sn(hoveredSchool)}</div>
                  <div className="text-slate-300">
                    {dn(hoveredSchool.districtKey)} · {hoveredSchool.sesao}
                  </div>
                  <div className="mt-1 tabular">
                    {t('kpi.total')} {formatNumber(hoveredSchool.totalStudents)} · {t('kpi.highrisk')}{' '}
                    {formatNumber(hoveredSchool.highRiskStudents)}
                  </div>
                </>
              ) : hovered ? (
                <>
                  <div className="font-semibold">{dn(hovered.key)}</div>
                  <div className="text-slate-300">{pn(hovered.provinceKey)}</div>
                  <div className="mt-1 tabular">
                    {t('risk.rate')} {formatPct(hovered.riskRate)} · {t('kpi.stillOut')}{' '}
                    {formatNumber(hovered.oosCount)}
                  </div>
                  <div className={`mt-1 text-[10px] ${hovered.hasDistrictTeam ? 'text-slate-300' : 'text-amber-300'}`}>
                    {hovered.hasDistrictTeam
                      ? (th ? '● มีทีมสหวิชาชีพอำเภอ' : '● Has a district team')
                      : (th ? '! ยังไม่มีทีมสหวิชาชีพอำเภอ' : '! No district team yet')}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-semibold">{pn(hoveredProvince!.key)}</div>
                  <div className="mt-1 tabular">
                    {t('risk.rate')} {formatPct(hoveredProvince!.riskRate)} · {t('kpi.stillOut')}{' '}
                    {formatNumber(hoveredProvince!.oosCount)}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-300">
                    {th ? 'คลิกเพื่อเจาะลงอำเภอ' : 'Click to drill into districts'}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected school card */}
        <AnimatePresence>
          {showCard && activeSchool && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="absolute bottom-3 right-3 z-20 w-[262px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <IconSchool width={15} height={15} />
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-tight text-ink">{sn(activeSchool)}</p>
                    <p className="text-[11px] text-slate-500">
                      {dn(activeSchool.districtKey)} · {activeSchool.sesao}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => selectSchool('all')}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                  aria-label={t('common.close')}
                >
                  <IconClose width={15} height={15} />
                </button>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Stat label={t('kpi.total')} value={formatNumber(activeSchool.totalStudents)} />
                <Stat
                  label={t('kpi.highrisk')}
                  value={formatNumber(activeSchool.highRiskStudents)}
                  color={RISK_COLOR[schoolLevel(activeSchool)]}
                />
                <Stat label={t('common.openCases')} value={formatNumber(activeSchool.openCases)} />
                <Stat label={t('common.dataQuality')} value={`${activeSchool.dataQualityScore}`} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected province card — only while no deeper level is open */}
        <AnimatePresence>
          {showCard && focusedProvince && !activeDistrict && !activeSchool && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="absolute bottom-3 right-3 z-20 w-[250px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-ink">{pn(focusedProvince.key)}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatNumber(schools.filter((s) => s.provinceKey === focusedProvince.key).length)}{' '}
                    {th ? 'โรงเรียนนำร่อง' : 'pilot schools'}
                  </p>
                </div>
                <button
                  onClick={() => selectProvince('all')}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                  aria-label={t('common.close')}
                >
                  <IconClose width={15} height={15} />
                </button>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Stat label={t('kpi.total')} value={formatNumber(focusedProvince.totalStudents)} />
                <Stat
                  label={t('risk.rate')}
                  value={formatPct(focusedProvince.riskRate)}
                  color={RISK_COLOR[provinceLevelFor(districtsByProvince[focusedProvince.key] ?? [], 'risk')]}
                />
                <Stat label={t('kpi.highrisk')} value={formatNumber(focusedProvince.highRiskStudents)} />
                <Stat label={t('common.openCases')} value={formatNumber(focusedProvince.openCases)} />
              </div>
              {onOpenProvince && (
                <button
                  onClick={() => onOpenProvince(focusedProvince)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
                >
                  {t('common.viewDetail')} <IconArrowRight width={14} height={14} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Selected district card */}
      <AnimatePresence>
        {showCard && activeDistrict && !activeSchool && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">
                  {dn(activeDistrict.key)}
                </div>
                <div className="text-xs text-slate-500">
                  {pn(activeDistrict.provinceKey)} · {t(`kind.${activeDistrict.kind}`)} ·{' '}
                  {activeDistrict.tambons} {t('geo.tambons')}
                </div>
              </div>
              <button
                onClick={() => selectDistrict('all')}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label={t('common.close')}
              >
                <IconClose width={16} height={16} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: t('risk.rate'), value: formatPct(activeDistrict.riskRate) },
                { label: t('kpi.stillOut'), value: formatNumber(activeDistrict.oosCount) },
                { label: t('tambon.coverage'), value: formatPct(activeDistrict.planCoverage) },
                { label: t('ov.openReferrals'), value: formatNumber(activeDistrict.openReferrals) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-500">{s.label}</div>
                  <div className="tabular text-base font-semibold text-ink">{s.value}</div>
                </div>
              ))}
            </div>

            {!activeDistrict.hasDistrictTeam && (
              <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {th
                  ? 'อำเภอนี้ยังไม่มีทีมสหวิชาชีพที่ทำงานต่อเนื่อง — การส่งต่อจะช้ากว่าค่าเฉลี่ย'
                  : 'No standing multi-agency team here — referrals run slower than average.'}
              </div>
            )}

            {onOpen && (
              <button
                onClick={() => onOpen(activeDistrict)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                {th ? 'เปิดรายละเอียดอำเภอ' : 'Open district detail'}
                <IconArrowRight width={14} height={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The pin drawing itself — plain pixels, so it looks identical at every zoom. */
function PinShape({ height, color, mark }: { height: number; color: string; mark: PinMark }) {
  return (
    <svg
      width={height * (17 / 22)}
      height={height}
      viewBox="-8.5 -21 17 22"
      className="block drop-shadow-[0_2px_2px_rgba(15,23,42,0.3)]"
      aria-hidden
    >
      <path d={PIN_PATH} fill={color} stroke="#ffffff" strokeWidth={1.4} strokeLinejoin="round" />
      {mark === 'team' && <circle cy={-12.6} r={2.8} fill="#ffffff" />}
      {mark === 'noTeam' && (
        <>
          <rect x={-0.85} y={-16.4} width={1.7} height={4.7} rx={0.85} fill="#ffffff" />
          <circle cy={-9.9} r={0.95} fill="#ffffff" />
        </>
      )}
      {mark === 'school' && (
        <path
          d="M0 -16.6 L5.4 -12.4 L3.7 -12.4 L3.7 -8.4 L-3.7 -8.4 L-3.7 -12.4 L-5.4 -12.4 Z"
          fill="#ffffff"
        />
      )}
    </svg>
  )
}

type PinMark = 'team' | 'noTeam' | 'school'

function Pin({
  x, y, height, color, mark, label, showLabel, active, hovered, pulse, delay,
  onEnter, onLeave, onSelect,
}: {
  x: number; y: number; height: number; color: string; mark: PinMark
  label: string; showLabel: boolean; active: boolean; hovered: boolean
  pulse: boolean; delay: number
  onEnter: () => void; onLeave: () => void; onSelect: () => void
}) {
  const width = height * (17 / 22)
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      {/* ground shadow keeps the pin anchored to its place */}
      <span
        className="absolute rounded-[50%] bg-slate-900/20"
        style={{ width: width * 0.42, height: width * 0.16, left: -width * 0.21, top: -width * 0.08 }}
      />
      {pulse && (
        <motion.span
          className="absolute rounded-full border-2"
          style={{
            borderColor: color,
            width: width * 0.8,
            height: width * 0.8,
            left: -width * 0.4,
            top: -width * 0.4,
          }}
          initial={{ opacity: 0.55, scale: 0.5 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <motion.button
        type="button"
        aria-label={label}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onSelect}
        className="pointer-events-auto absolute cursor-pointer outline-none"
        style={{ left: -width / 2, top: -height, transformOrigin: 'bottom center' }}
        initial={{ opacity: 0, y: -12, scale: 0.5 }}
        animate={{
          opacity: 1,
          scale: hovered || active ? 1.14 : 1,
          y: active ? [0, -3, 0] : 0,
        }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{
          default: { type: 'spring', stiffness: 420, damping: 24, delay },
          y: active
            ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
            : { type: 'spring', stiffness: 420, damping: 24 },
        }}
      >
        <PinShape height={height} color={color} mark={mark} />
      </motion.button>
      {showLabel && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-bold text-ink shadow-sm ring-1 ring-slate-200"
          style={{ top: -height - 22 }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

/** miniature of the real pin, so the legend and the map read as one language */
function PinSwatch({ mark }: { mark: 'team' | 'noTeam' | 'school' }) {
  return (
    <svg viewBox="-9 -21.5 18 23" width={12} height={15} className="shrink-0" aria-hidden>
      <path d={PIN_PATH} fill="#94a3b8" stroke="#ffffff" strokeWidth={1.3} strokeLinejoin="round" />
      {mark === 'team' && <circle cy={-12.6} r={2.8} fill="#ffffff" />}
      {mark === 'noTeam' && (
        <>
          <rect x={-0.85} y={-16.4} width={1.7} height={4.7} rx={0.85} fill="#ffffff" />
          <circle cy={-9.9} r={0.95} fill="#ffffff" />
        </>
      )}
      {mark === 'school' && (
        <path
          d="M0 -16.6 L5.4 -12.4 L3.7 -12.4 L3.7 -8.4 L-3.7 -8.4 L-3.7 -12.4 L-5.4 -12.4 Z"
          fill="#ffffff"
        />
      )}
    </svg>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <p className="text-[9px] text-slate-400">{label}</p>
      <p className="tabular text-sm font-bold" style={{ color: color ?? '#0f1b2d' }}>{value}</p>
    </div>
  )
}

function MapBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-brand-600"
    >
      {children}
    </button>
  )
}
