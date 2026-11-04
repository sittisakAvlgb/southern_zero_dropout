import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY, C, DISPLAY, EASE, OUT, f } from './theme'
import { DEMO_URL, MUSIC, ROLE, type RoleKey, type Scene } from './timeline.mjs'
import { DemoBadge, Pill, Reveal, RoleIcon, SceneFrame, subStyle, titleStyle } from './ui'
import geo from './thailand.json'
import qr from './qr.json'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const hexA = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')

/* ─────────────────────────── ห้องเรียน (ภาพประกอบ) ─────────────────────────── */

/** ภาพประกอบห้องเรียนแบบกราฟิก — เก้าอี้ว่างหนึ่งตัวในฉากเปิด และมีคนนั่งแล้วในฉาก "เพื่อโอกาสของเด็กทุกคน" */
export function ClassroomScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const push = interpolate(frame, [0, durationInFrames], [1, 1.22], { easing: EASE })
  const rows = [
    { y: 560, sc: 0.74, n: 6 },
    { y: 730, sc: 0.9, n: 5 },
    { y: 930, sc: 1.08, n: 4 },
  ]
  const EMPTY = { row: 1, col: 3 }
  const seat = rows[EMPTY.row]
  const seatX = 960 + (EMPTY.col - (seat.n - 1) / 2) * 330 * seat.sc
  const light = s.filled
    ? interpolate(frame, [f(0.4), f(2.6)], [0, 1], { ...clamp, easing: OUT })
    : 0.55 + 0.45 * interpolate(frame, [f(1), f(4)], [0, 1], clamp)
  const lines = s.lines ?? []
  return (
    <SceneFrame inF={20} outF={16}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${seatX}px ${seat.y - 40}px` }}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080">
          <defs>
            <radialGradient id="spot" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={C.gold} stopOpacity={s.filled ? 0.55 : 0.32} />
              <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
            </radialGradient>
            <linearGradient id="window" x1="0" x2="1">
              <stop offset="0%" stopColor="#9cc2ff" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#9cc2ff" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* ผนัง กระดาน หน้าต่างแสงเช้า */}
          <rect x={560} y={110} width={800} height={300} rx={14} fill="#0f2a3a" stroke="#2b4b5e" strokeWidth={6} />
          <path d="M610 200 h260 M610 250 h380 M610 300 h200" stroke="rgba(255,255,255,0.18)" strokeWidth={8} strokeLinecap="round" />
          <polygon points="0,80 300,140 300,600 0,700" fill="url(#window)" />
          <ellipse cx={seatX} cy={seat.y + 10} rx={260 * seat.sc} ry={190 * seat.sc} fill="url(#spot)" opacity={light} />
          {rows.map((r, ri) =>
            Array.from({ length: r.n }, (_, ci) => {
              const x = 960 + (ci - (r.n - 1) / 2) * 330 * r.sc
              const empty = ri === EMPTY.row && ci === EMPTY.col
              const sc = r.sc
              const showKid = !empty || s.filled
              const kidColor = empty ? C.gold : '#22335e'
              return (
                <g key={`${ri}-${ci}`} transform={`translate(${x} ${r.y}) scale(${sc})`}>
                  {/* เก้าอี้ */}
                  <rect x={-46} y={-118} width={92} height={70} rx={10} fill="none" stroke={empty ? `${C.gold}` : '#2c3f6e'} strokeWidth={empty ? 4 : 3} opacity={empty ? 0.9 : 1} />
                  {showKid && (
                    <g opacity={empty ? light : 1} style={empty ? { filter: `drop-shadow(0 0 18px ${C.gold})` } : undefined}>
                      <circle cx={0} cy={-150} r={30} fill={kidColor} />
                      <path d="M-52 -40 C -52 -100, 52 -100, 52 -40 Z" fill={kidColor} />
                    </g>
                  )}
                  {/* โต๊ะ */}
                  <rect x={-120} y={-40} width={240} height={28} rx={6} fill={empty ? '#33497e' : '#283b68'} />
                  <rect x={-108} y={-12} width={8} height={60} fill="#1d2c52" />
                  <rect x={100} y={-12} width={8} height={60} fill="#1d2c52" />
                  {empty && s.filled && <rect x={-40} y={-50} width={70} height={12} rx={3} fill="#f8fafc" opacity={light} />}
                </g>
              )
            }),
          )}
        </svg>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(11,23,54,0.96) 0%, rgba(11,23,54,0.5) 30%, rgba(11,23,54,0) 50%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {lines.map((l, i) => (
          <Reveal key={l} at={f(0.8 + i * 4.6)} dur={24}>
            <div style={{ ...titleStyle, fontSize: s.filled ? 76 : 62, color: s.filled ? C.gold : C.white, textAlign: 'center' }}>{l}</div>
          </Reveal>
        ))}
      </div>
    </SceneFrame>
  )
}

/* ─────────────────────────── สัญญาณที่กระจาย ─────────────────────────── */

// สัญญาณของ "นักเรียน ก." ตามข้อมูลจำลองในระบบ
const SIGNALS = [
  { t: 'ขาดเรียนต่อเนื่อง 16 วัน', c: '#dc2626', x: 320, y: 300 },
  { t: 'เกรดเฉลี่ยภาคล่าสุด 0.80', c: '#f97316', x: 1480, y: 260 },
  { t: 'ครอบครัวรายได้ 5,000 บาท/เดือน', c: '#eab308', x: 380, y: 760 },
  { t: 'เลยกำหนดติดตาม 14 วัน', c: '#f97316', x: 1500, y: 720 },
  { t: 'ความเสี่ยงเพิ่ม 13 คะแนนใน 8 สัปดาห์', c: '#dc2626', x: 960, y: 880 },
  { t: 'ส่งต่อแล้ว แต่หน่วยงานยังไม่ตอบรับ', c: '#eab308', x: 960, y: 170 },
]

export function SignalsScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const gather = interpolate(frame, [durationInFrames - f(3), durationInFrames - f(0.8)], [0, 1], { ...clamp, easing: EASE })
  const core = interpolate(frame, [durationInFrames - f(1.4), durationInFrames - f(0.4)], [0, 1], clamp)
  return (
    <SceneFrame>
      {SIGNALS.map((sig, i) => {
        const appear = spring({ frame: frame - f(0.3 + i * 0.35), fps: 30, config: { damping: 14 } })
        const dx = Math.sin(frame / 40 + i) * 14
        const dy = Math.cos(frame / 50 + i * 2) * 10
        const x = interpolate(gather, [0, 1], [sig.x + dx, 960])
        const y = interpolate(gather, [0, 1], [sig.y + dy, 540])
        return (
          <div key={sig.t} style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${appear * (1 - gather * 0.7)})`, opacity: 1 - gather * 0.9 }}>
            <Pill color={sig.c} style={{ fontSize: 28, padding: '12px 24px', background: 'rgba(19,34,74,0.9)' }}>{sig.t}</Pill>
          </div>
        )
      })}
      <div style={{ position: 'absolute', left: 960, top: 540, width: 30, height: 30, borderRadius: 30, transform: `translate(-50%,-50%) scale(${core * 3})`, background: C.gold, boxShadow: `0 0 80px 30px ${C.gold}88`, opacity: core }} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: 1 - gather }}>
        <Reveal at={f(2.4)}><div style={{ ...titleStyle, fontSize: 70, textAlign: 'center' }}>{s.title}</div></Reveal>
        <Reveal at={f(3)}><div style={{ ...subStyle, fontSize: 36, textAlign: 'center' }}>{s.sub}</div></Reveal>
      </AbsoluteFill>
    </SceneFrame>
  )
}

/* ─────────────────────────── โลโก้ ─────────────────────────── */

export function LogoScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const pop = spring({ frame, fps: 30, config: { damping: 12, mass: 0.8 } })
  const ring = interpolate(frame, [0, f(1.6)], [0, 1], { ...clamp, easing: OUT })
  return (
    <SceneFrame inF={4}>
      <div style={{ position: 'absolute', left: 960, top: 380, width: 900, height: 900, borderRadius: '50%', transform: `translate(-50%,-50%) scale(${0.2 + ring})`, border: `2px solid ${C.gold}`, opacity: 1 - ring }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
        <Img src={staticFile('Early.png')} style={{ width: 540, transform: `scale(${pop})`, filter: `drop-shadow(0 12px 55px ${C.royal}aa)` }} />
        <Reveal at={f(0.9)}><div style={{ ...titleStyle, fontSize: 68 }}>Early Warning System</div></Reveal>
        <Reveal at={f(1.3)}><div style={{ ...subStyle, fontSize: 34 }}>ระบบเฝ้าระวังและแจ้งเตือนล่วงหน้า</div></Reveal>
        <Reveal at={f(1.9)}><div style={{ ...titleStyle, fontSize: 44, color: C.gold }}>{s.title}</div></Reveal>
      </AbsoluteFill>
    </SceneFrame>
  )
}

/* ─────────────────────────── เส้นทาง 4 ระดับ ─────────────────────────── */

const ORDER: RoleKey[] = ['teacher', 'school', 'esa', 'obec']
const NODE_X = [330, 750, 1170, 1590]

export function JourneyScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const Y = 600
  // การ์ด (จุดเรืองแสง) วิ่งลากเส้นทองจากครูไป สพฐ. จุดไฟแต่ละโหนดตามทาง
  const travel = interpolate(frame, [f(1.4), f(4.6)], [0, 1], { ...clamp, easing: EASE })
  const packetX = NODE_X[0] + (NODE_X[3] - NODE_X[0]) * travel
  const act = (i: number) => interpolate(packetX, [NODE_X[i] - 80, NODE_X[i]], [0, 1], clamp)
  const burst = interpolate(frame, [f(4.6), f(5.5)], [0, 1], clamp)
  return (
    <SceneFrame>
      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Reveal at={4}><div style={{ ...titleStyle, fontSize: 66 }}>{s.title}</div></Reveal>
        <Reveal at={12}><div style={{ ...subStyle, fontSize: 36 }}>{s.sub}</div></Reveal>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {/* เส้นนำทางจาง ๆ เต็มแนว */}
        <line x1={NODE_X[0]} y1={Y} x2={NODE_X[3]} y2={Y} stroke={C.gold} strokeWidth={2} opacity={0.14} strokeDasharray="2 11" strokeLinecap="round" />
        {/* รอยทางที่การ์ดลากผ่าน — เรืองแสง + เส้นประวิ่ง */}
        <line x1={NODE_X[0]} y1={Y} x2={packetX} y2={Y} stroke={C.gold} strokeWidth={12} opacity={0.18} strokeLinecap="round" />
        <line x1={NODE_X[0]} y1={Y} x2={packetX} y2={Y} stroke={C.gold} strokeWidth={4} opacity={0.95} strokeLinecap="round" strokeDasharray="14 10" strokeDashoffset={-frame * 2.2} />
        {/* วงพัลส์ที่โหนดซึ่งทำงานแล้ว */}
        {ORDER.map((k, i) => {
          const a = act(i)
          if (a < 0.03) return null
          const pulse = ((frame + i * 11) % 42) / 42
          return <circle key={`p-${k}`} cx={NODE_X[i]} cy={Y} r={80 + pulse * 42} fill="none" stroke={ROLE[k].color} strokeWidth={2.5} opacity={(1 - pulse) * 0.7 * a} />
        })}
        {/* หัวการ์ดที่กำลังวิ่ง */}
        {travel > 0.001 && travel < 1 && (
          <g>
            <circle cx={packetX} cy={Y} r={28} fill={C.gold} opacity={0.22} />
            <circle cx={packetX} cy={Y} r={13} fill={C.gold} style={{ filter: `drop-shadow(0 0 18px ${C.gold})` }} />
            <circle cx={packetX} cy={Y} r={5} fill="#ffffff" />
          </g>
        )}
        {/* เบิร์สต์ตอนถึง สพฐ. */}
        {burst > 0 && burst < 1 && <circle cx={NODE_X[3]} cy={Y} r={42 + burst * 130} fill="none" stroke={ROLE.obec.color} strokeWidth={3} opacity={(1 - burst) * 0.85} />}
      </svg>
      {/* โหนดวงไอคอน */}
      {ORDER.map((k, i) => {
        const on = spring({ frame: frame - f(0.4 + i * 0.3), fps: 30, config: { damping: 13 } })
        const a = act(i)
        const r = ROLE[k]
        return (
          <div key={k} style={{ position: 'absolute', left: NODE_X[i], top: Y, width: 0, height: 0 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(-50%,-50%) scale(${on * (1 + 0.07 * a)})` }}>
              <div style={{ position: 'absolute', left: -115, top: -115, width: 230, height: 230, borderRadius: 230, background: `radial-gradient(circle, ${hexA(r.color, 0.42 * a)} 0%, transparent 60%)` }} />
              <div style={{ width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 150, display: 'grid', placeItems: 'center', background: hexA(r.color, 0.12 + 0.2 * a), border: `3px solid ${r.color}`, boxShadow: `0 0 ${22 + 46 * a}px ${hexA(r.color, 0.38 + 0.42 * a)}` }}>
                <RoleIcon role={k} size={74} />
              </div>
            </div>
          </div>
        )
      })}
      {/* ป้ายชื่อบทบาท */}
      {ORDER.map((k, i) => (
        <div key={`l-${k}`} style={{ position: 'absolute', left: NODE_X[i], top: Y + 98, transform: 'translate(-50%,0)', fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: act(i) > 0.5 ? C.white : C.soft, whiteSpace: 'nowrap', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>{ROLE[k].th}</div>
      ))}
    </SceneFrame>
  )
}

/* ─────────────────────────── แผนที่ (เส้นขอบจังหวัดจริงจากแอป) ─────────────────────────── */

const TARGET = ['pattani', 'yala', 'narathiwat'] as const
const TARGET_TH: Record<string, string> = { pattani: 'ปัตตานี', yala: 'ยะลา', narathiwat: 'นราธิวาส' }
const paths = (geo as { paths: Record<string, { d: string; cx: number; cy: number }> }).paths
const south = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const k of TARGET) for (const m of paths[k].d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)) {
    x0 = Math.min(x0, +m[1]); x1 = Math.max(x1, +m[1]); y0 = Math.min(y0, +m[2]); y1 = Math.max(y1, +m[2])
  }
  return { x0, y0, x1, y1 }
})()

export function MapScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const b = (geo as { bounds: { minX: number; minY: number; maxX: number; maxY: number } }).bounds
  const z = interpolate(frame, [f(0.6), f(4.2)], [0, 1], { ...clamp, easing: EASE })
  // ทั้งประเทศ → ซูมเข้าสามจังหวัดให้ใหญ่เต็มตา วางค่อนขวาเว้นที่ข้อความซ้าย
  const s0 = 980 / (b.maxY - b.minY)
  const s1 = 740 / (south.y1 - south.y0)
  const sc = s0 * Math.pow(s1 / s0, z)
  const mx = interpolate(z, [0, 1], [(b.minX + b.maxX) / 2, (south.x0 + south.x1) / 2])
  const my = interpolate(z, [0, 1], [(b.minY + b.maxY) / 2, (south.y0 + south.y1) / 2])
  const ox = interpolate(z, [0, 1], [960, 1250])
  const fill = interpolate(frame, [f(3.2), f(4.6)], [0, 1], clamp)
  const proj = (px: number, py: number): [number, number] => [ox + (px - mx) * sc, 540 + (py - my) * sc]
  const prov = TARGET.map((k) => ({ k, th: TARGET_TH[k], p: proj(paths[k].cx, paths[k].cy) }))
  const mX = (paths.pattani.cx + paths.yala.cx + paths.narathiwat.cx) / 3
  const mY = (paths.pattani.cy + paths.yala.cy + paths.narathiwat.cy) / 3
  const cen = proj(mX, mY)
  // จุดโรงเรียนนำร่องกระจายในพื้นที่ (ตำแหน่งคงที่ ไม่สุ่มใหม่ทุกเฟรม) ติดสว่างทีละจุด
  const dots = Array.from({ length: 18 }, (_, i) => {
    const a = i * 2.39996, rr = 7 + (i % 6) * 6.5
    return proj(mX + Math.cos(a) * rr, mY + Math.sin(a) * rr * 0.95)
  })
  return (
    <SceneFrame>
      {/* เรืองแสงหลังสามจังหวัด */}
      <div style={{ position: 'absolute', left: cen[0], top: cen[1], width: 860, height: 860, transform: 'translate(-50%,-50%)', background: `radial-gradient(circle, ${hexA(C.teal, 0.24 * fill)} 0%, transparent 58%)` }} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <g transform={`translate(${ox} 540) scale(${sc}) translate(${-mx} ${-my})`}>
          {Object.entries(paths).map(([k, p]) => {
            const t = (TARGET as readonly string[]).includes(k)
            return (
              <path key={k} d={p.d} fill={t ? `rgba(20,184,166,${0.2 + 0.52 * fill})` : `rgba(255,255,255,${0.05 - 0.03 * z})`} stroke={t ? C.gold : 'rgba(255,255,255,0.18)'} strokeWidth={(t ? 2.6 : 0.8) / sc} style={t ? { filter: `drop-shadow(0 0 ${9 / sc}px ${C.gold})` } : undefined} />
            )
          })}
        </g>
        {/* วงเรดาร์แจ้งเตือนขยายจากกลางสามจังหวัด */}
        {fill > 0.05 && [0, 1].map((ri) => {
          const ph = frame - f(4.2) - ri * f(0.9)
          if (ph <= 0) return null
          const local = (ph % f(1.8)) / f(1.8)
          return <circle key={ri} cx={cen[0]} cy={cen[1]} r={30 + local * 380} fill="none" stroke={C.gold} strokeWidth={3} opacity={(1 - local) * 0.5 * fill} />
        })}
        {/* จุดโรงเรียนนำร่องติดสว่างทีละจุด */}
        {dots.map((d, i) => {
          const sp = spring({ frame: frame - f(4.0) - i * 1.4, fps: 30, config: { damping: 15 } })
          return <circle key={i} cx={d[0]} cy={d[1]} r={4.6 * sp} fill={C.teal} opacity={0.9 * sp} style={{ filter: `drop-shadow(0 0 6px ${C.teal})` }} />
        })}
        {/* หมุดสามจังหวัด: วงพัลส์ + จุดทอง */}
        {prov.map((pv, i) => {
          const drop = spring({ frame: frame - f(3.6) - i * f(0.25), fps: 30, config: { damping: 12 } })
          const pulse = ((frame + i * 12) % 45) / 45
          return (
            <g key={pv.k} opacity={drop} transform={`translate(${pv.p[0]} ${pv.p[1]})`}>
              <circle r={10 + pulse * 28} fill="none" stroke={C.gold} strokeWidth={2.4} opacity={(1 - pulse) * 0.85} />
              <circle r={12} fill={C.gold} />
              <circle r={5} fill={C.navy} />
            </g>
          )
        })}
      </svg>
      {/* ป้ายชื่อจังหวัด (คมชัดด้วย div) */}
      {prov.map((pv, i) => {
        const op = interpolate(frame, [f(3.8) + i * f(0.25), f(4.2) + i * f(0.25)], [0, 1], clamp)
        return (
          <div key={pv.k} style={{ position: 'absolute', left: pv.p[0], top: pv.p[1] - 60, transform: 'translate(-50%,0)', opacity: op, fontFamily: DISPLAY, fontWeight: 700, fontSize: 31, color: C.white, whiteSpace: 'nowrap', textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>{pv.th}</div>
        )
      })}
      {/* ข้อความซ้าย */}
      <div style={{ position: 'absolute', left: 120, top: 346, display: 'flex', flexDirection: 'column', gap: 16, opacity: fill, maxWidth: 580 }}>
        <Reveal at={f(3.3)}><div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 25, color: C.gold, letterSpacing: 3 }}>พื้นที่เฝ้าระวัง</div></Reveal>
        <Reveal at={f(3.6)}><div style={{ ...titleStyle, fontSize: 60 }}>{s.title}</div></Reveal>
        <Reveal at={f(4.1)}><div style={{ ...subStyle, fontSize: 34 }}>{s.sub}</div></Reveal>
      </div>
    </SceneFrame>
  )
}

/* ─────────────────────────── เด็กหนึ่งคน ระบบเดียวที่เชื่อมกัน (ฉากหลัก) ─────────────────────────── */

const LOOP_COLS: { role: RoleKey; img: string; crop: { x: number; y: number }; can: string }[] = [
  { role: 'teacher', img: 't2-desk', crop: { x: 560, y: 180 }, can: 'ดูแลเคสของตน · บันทึก · ขอความช่วยเหลือ' },
  { role: 'school', img: 'd1-home', crop: { x: 290, y: 280 }, can: 'ทั้งโรงเรียน · ตัดสินใจ · มอบหมาย' },
  { role: 'esa', img: 'e2-request', crop: { x: 980, y: 90 }, can: 'ทั้งเขต · จัดทีมสนับสนุน · แก้เคสแทนไม่ได้' },
  { role: 'obec', img: 'o1-home', crop: { x: 280, y: 200 }, can: 'ภาพรวมทุกเขต · วางนโยบาย' },
]
const COL_X = [270, 730, 1190, 1650]
const STAGES = ['บันทึกเยี่ยมบ้าน · ส่งคำขอถึง ผอ.', 'ผอ. อนุมัติ · ยกระดับถึงเขต', 'เขตส่งทีมสนับสนุน', 'ภาพรวมสามจังหวัด']

export function LoopScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const hop = [f(1), f(3.8), f(6.6), f(9.4)]
  // ตำแหน่งการ์ด: กระโดดคอลัมน์ทีละขั้นด้วย spring
  let x = COL_X[0]
  let stage = 0
  for (let i = 1; i < 4; i++) {
    const sp = spring({ frame: frame - hop[i], fps: 30, config: { damping: 16, mass: 0.9 } })
    x += (COL_X[i] - COL_X[i - 1]) * sp
    if (frame >= hop[i] + 6) stage = i
  }
  const appear = spring({ frame: frame - hop[0], fps: 30, config: { damping: 14 } })
  const shrink = interpolate(frame, [hop[3] + f(0.9), hop[3] + f(1.8)], [1, 0], { ...clamp, easing: EASE })
  const back = interpolate(frame, [f(11.2), f(13)], [0, 1], { ...clamp, easing: EASE })
  const line2 = frame >= f(7.4)
  // สปอตไลต์ตามการ์ด: คอลัมน์ที่การ์ดอยู่ = 1 · ที่เคยผ่านแล้วหรี่ไว้ที่ 0.55 · ตอนไหลกลับ ครูสว่างอีกครั้ง
  const a2 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  const focusOf = (i: number) => {
    const near = interpolate(Math.abs(COL_X[i] - x), [0, 230, 470], [1, 0.45, 0], { ...clamp })
    return Math.max(near, frame >= hop[i] + 6 ? 0.55 : 0, i === 0 ? back : 0)
  }
  return (
    <SceneFrame>
      <div style={{ position: 'absolute', top: 92, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        {!line2 ? (
          <Reveal key="a" at={f(0.4)}><div style={{ ...titleStyle, fontSize: 64 }}>{s.lines![0]}</div></Reveal>
        ) : (
          <Reveal key="b" at={f(7.4)}><div style={{ ...titleStyle, fontSize: 64, color: C.gold }}>{s.lines![1]}</div></Reveal>
        )}
      </div>

      {/* แสงฉายหลังคอลัมน์ที่กำลังทำงาน (วิ่งตามการ์ด) */}
      {LOOP_COLS.map((c, i) => {
        const fo = focusOf(i)
        if (fo < 0.03) return null
        return <div key={`glow-${c.role}`} style={{ position: 'absolute', left: COL_X[i], top: 440, width: 640, height: 640, transform: 'translate(-50%,-50%)', background: `radial-gradient(circle, ${ROLE[c.role].color}${a2(0.3 * fo)} 0%, transparent 60%)` }} />
      })}

      {/* เส้นเชื่อมระหว่างคอลัมน์ ลากตามการ์ด + ลำแสงลงหาการ์ด + เส้นไหลกลับแบบเรืองแสง */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={COL_X[0]} y1={640} x2={x} y2={640} stroke={C.gold} strokeWidth={11} strokeLinecap="round" opacity={0.16} />
        <line x1={COL_X[0]} y1={640} x2={x} y2={640} stroke={C.gold} strokeWidth={4} strokeLinecap="round" opacity={0.95} />
        <line x1={x} y1={548} x2={x} y2={626} stroke={C.gold} strokeWidth={3} strokeLinecap="round" strokeDasharray="5 7" opacity={0.6 * (1 - shrink)} />
        <path d={`M ${COL_X[3]} 860 C ${COL_X[3] - 200} 990, ${COL_X[0] + 200} 990, ${COL_X[0]} 860`} fill="none" stroke={C.gold} strokeWidth={14} strokeDasharray="2000" strokeDashoffset={2000 * (1 - back)} strokeLinecap="round" opacity={0.18} />
        <path d={`M ${COL_X[3]} 860 C ${COL_X[3] - 200} 990, ${COL_X[0] + 200} 990, ${COL_X[0]} 860`} fill="none" stroke={C.gold} strokeWidth={5} strokeDasharray="2000" strokeDashoffset={2000 * (1 - back)} strokeLinecap="round" />
      </svg>

      {LOOP_COLS.map((c, i) => {
        const r = ROLE[c.role]
        const rise = spring({ frame: frame - i * 5, fps: 30, config: { damping: 200 } })
        const fo = focusOf(i)
        const reached = frame >= hop[i]
        return (
          <div key={c.role} style={{ position: 'absolute', left: COL_X[i] - 200, top: 250 + (1 - rise) * 80, width: 400, opacity: rise * (0.3 + 0.7 * fo), transform: `scale(${0.97 + 0.08 * fo})`, transformOrigin: 'center top', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, color: C.white }}>
              <span style={{ width: 52, height: 52, borderRadius: 52, background: r.color, display: 'grid', placeItems: 'center', boxShadow: `0 0 ${28 * fo}px ${r.color}`, outline: `${Math.round(3 * fo)}px solid ${r.color}66`, outlineOffset: 3 }}><RoleIcon role={c.role} size={30} /></span>
              {r.th}
            </div>
            <div style={{ width: 400, height: 225, borderRadius: 14, overflow: 'hidden', border: `2px solid ${reached ? r.color : C.line}`, boxShadow: `0 12px ${22 + 48 * fo}px ${r.color}${a2(0.18 + 0.5 * fo)}`, position: 'relative', background: '#fff', filter: `grayscale(${(1 - fo) * 0.55}) brightness(${0.82 + 0.18 * fo})` }}>
              <Img src={staticFile(`shots/${c.img}.png`)} style={{ position: 'absolute', width: 1600 * 0.5, left: -c.crop.x * 0.5, top: -c.crop.y * 0.5 }} />
            </div>
            <div style={{ height: 130 }} />
            <div style={{ fontFamily: BODY, fontWeight: fo > 0.8 ? 700 : 600, fontSize: 21, color: fo > 0.8 ? C.white : C.soft, textAlign: 'center', lineHeight: 1.45, padding: '0 10px' }}>{c.can}</div>
          </div>
        )
      })}

      {/* การ์ดเคสใบเดียวที่เดินทาง — ที่ สพฐ. หดเป็นจุดหนึ่งในภาพรวม */}
      <div style={{ position: 'absolute', left: x, top: 640, transform: `translate(-50%,-50%) scale(${appear * (0.25 + 0.75 * shrink)})`, opacity: appear }}>
        {shrink > 0.05 ? (
          <div style={{ width: 380, padding: '16px 20px', borderRadius: 18, background: '#ffffff', boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 3px ${C.gold}`, display: 'flex', gap: 14, alignItems: 'center', opacity: shrink }}>
            <div style={{ width: 62, height: 62, borderRadius: 14, background: '#fff1e6', color: '#ea580c', fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, display: 'grid', placeItems: 'center', flex: 'none' }}>77</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 27, color: '#0f1b2d' }}>นักเรียน ก. · ม.2</div>
              <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 18, color: '#2563eb', whiteSpace: 'nowrap' }}>{STAGES[stage]}</div>
            </div>
          </div>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: COL_X[3], top: 640, width: 26, height: 26, borderRadius: 26, transform: 'translate(-50%,-50%)', background: C.gold, boxShadow: `0 0 40px 12px ${C.gold}99`, opacity: 1 - shrink }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 960, textAlign: 'center', opacity: back, fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: C.gold }}>
        แล้วความช่วยเหลือก็ย้อนกลับลงไปถึงครู และถึงตัวเด็ก
      </div>
      <DemoBadge />
    </SceneFrame>
  )
}

/* ─────────────────────────── ข้อเสนอนำร่อง ─────────────────────────── */

const STEPS = [
  { n: '1', h: 'เริ่มที่โรงเรียนนำร่อง', b: 'ครูผู้ดูแลเคสและ ผอ. ใช้งานจริงในงานประจำวัน' },
  { n: '2', h: 'เปิดวงกับเขตพื้นที่', b: 'เมื่อคำขอจากโรงเรียนเริ่มไหลขึ้นมา' },
  { n: '3', h: 'สรุปผลให้ สพฐ.', b: 'วัดเวลาตั้งแต่พบสัญญาณจนมีแผน และเวลาตอบคำขอ' },
]

export function PilotScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  return (
    <SceneFrame>
      <div style={{ position: 'absolute', top: 130, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Reveal at={4}><div style={{ ...titleStyle, fontSize: 70 }}>{s.title}</div></Reveal>
        <Reveal at={12}><div style={{ ...subStyle, fontSize: 38, color: C.gold }}>{s.sub}</div></Reveal>
      </div>
      <div style={{ position: 'absolute', top: 400, left: 150, right: 150, display: 'flex', gap: 40 }}>
        {STEPS.map((st, i) => {
          const sp = spring({ frame: frame - f(1.4 + i * 0.9), fps: 30, config: { damping: 15 } })
          return (
            <div key={st.n} style={{ flex: 1, padding: '40px 36px', borderRadius: 26, background: 'rgba(255,255,255,0.06)', border: `1.5px solid ${C.line}`, transform: `translateY(${(1 - sp) * 60}px)`, opacity: sp, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ width: 70, height: 70, borderRadius: 70, background: C.royal, color: '#fff', fontFamily: DISPLAY, fontWeight: 700, fontSize: 36, display: 'grid', placeItems: 'center' }}>{st.n}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, color: C.white }}>{st.h}</div>
              <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 28, lineHeight: 1.5, color: C.soft }}>{st.b}</div>
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 150, right: 150, bottom: 110, opacity: interpolate(frame, [f(4.5), f(5.5)], [0, 1], clamp), fontFamily: BODY, fontWeight: 500, fontSize: 25, color: C.faint, textAlign: 'center', lineHeight: 1.5 }}>
        ก่อนใช้กับข้อมูลจริง: เชื่อมทะเบียนนักเรียน DMC และกำหนดผู้ควบคุมข้อมูลตาม PDPA
        <br />ตัวเลขในวิดีโอเป็นข้อมูลจำลอง ยังไม่ใช่ผลการใช้งานจริง
      </div>
    </SceneFrame>
  )
}

/* ─────────────────────────── ปิดท้าย ─────────────────────────── */

export function EndScene() {
  const frame = useCurrentFrame()
  const sp = spring({ frame, fps: 30, config: { damping: 16 } })
  const q = qr as unknown as { size: number; cells: [number, number][] }
  const qs = 320
  const cell = qs / (q.size + 2)
  return (
    <SceneFrame outF={30}>
      <div style={{ position: 'absolute', left: 150, top: 210, display: 'flex', flexDirection: 'column', gap: 22, width: 1050 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, transform: `scale(${0.9 + 0.1 * sp})`, transformOrigin: 'left center', opacity: sp }}>
          <Img src={staticFile('Early.png')} style={{ width: 272, display: 'block', filter: `drop-shadow(0 8px 30px rgba(0,0,0,0.45))` }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...titleStyle, fontSize: 54 }}>Early Warning System</div>
            <div style={{ ...subStyle, fontSize: 30 }}>ระบบเฝ้าระวังและแจ้งเตือนล่วงหน้า</div>
          </div>
        </div>
        <Reveal at={f(0.8)}><div style={{ ...titleStyle, fontSize: 50, color: C.gold }}>เห็นเด็กทุกคน ช่วยทันก่อนหลุด</div></Reveal>
        <Reveal at={f(1.4)}><div style={{ ...subStyle, fontSize: 34 }}>จากเด็กหนึ่งคน สู่ระบบการช่วยเหลือที่เชื่อมถึงกันทุกระดับ</div></Reveal>
      </div>
      <div style={{ position: 'absolute', right: 170, top: 230, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, opacity: interpolate(frame, [f(1.6), f(2.4)], [0, 1], clamp) }}>
        <svg width={qs} height={qs} style={{ background: '#fff', borderRadius: 18 }}>
          {q.cells.map(([cx, cy]) => <rect key={`${cx}-${cy}`} x={(cx + 1) * cell} y={(cy + 1) * cell} width={cell + 0.4} height={cell + 0.4} fill={C.navy} />)}
        </svg>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, color: C.white }}>ทดลองใช้เว็บต้นแบบ</div>
        <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 21, color: C.soft }}>{DEMO_URL.replace('https://', '')}</div>
        <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 21, color: C.faint }}>บัญชีสาธิตทุกบทบาท · รหัสผ่าน demo</div>
      </div>
      <div style={{ position: 'absolute', left: 150, right: 150, bottom: 60, fontFamily: BODY, fontSize: 21, lineHeight: 1.6, color: C.faint, opacity: interpolate(frame, [f(2.4), f(3.2)], [0, 1], clamp) }}>
        ภาพหน้าจอทั้งหมดจากแพลตฟอร์มต้นแบบ · ข้อมูลเด็ก ตัวเลข และชื่อโรงเรียนเป็นข้อมูลจำลองเพื่อสาธิต · ภาพห้องเรียนเป็นภาพประกอบ
        <br />{MUSIC.credit}
      </div>
    </SceneFrame>
  )
}

/* ─────────────────────────── ฉากเปิด: บรรยากาศโรงเรียนกลางวัน แล้วซูมเข้าห้องเรียน ─────────────────────────── */

// เมฆขาวฟู
function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#ffffff">
      <ellipse cx={0} cy={0} rx={78} ry={37} />
      <ellipse cx={60} cy={10} rx={58} ry={29} />
      <ellipse cx={-60} cy={12} rx={52} ry={27} />
      <ellipse cx={20} cy={-20} rx={48} ry={30} />
      <ellipse cx={-26} cy={-14} rx={40} ry={26} />
    </g>
  )
}

// พุ่มไม้/ต้นไม้เขียว (แนวต้นไม้หลังอาคาร + ต้นใหญ่มุมซ้าย)
function Leafy({ x, y, r, tint = '#2f7d49' }: { x: number; y: number; r: number; tint?: string }) {
  return (
    <g transform={`translate(${x} ${y})`} fill={tint}>
      <circle cx={0} cy={0} r={r} />
      <circle cx={r * 0.72} cy={r * 0.22} r={r * 0.74} />
      <circle cx={-r * 0.72} cy={r * 0.26} r={r * 0.7} />
      <circle cx={r * 0.18} cy={-r * 0.52} r={r * 0.66} />
    </g>
  )
}

// ต้นมะพร้าว กลางวัน — ลำต้นโค้ง + ทางมะพร้าวเขียว
function Coconut({ x, baseY, h, sway }: { x: number; baseY: number; h: number; sway: number }) {
  const tx = sway * 1.3, ty = -h
  const fronds = [-155, -112, -58, 0, 58, 112, 155]
  return (
    <g transform={`translate(${x} ${baseY})`}>
      <path d={`M -9 0 Q ${-14 + sway} ${-h * 0.55} ${tx - 6} ${ty} L ${tx + 6} ${ty} Q ${10 + sway} ${-h * 0.55} 9 0 Z`} fill="#9c7b4e" />
      <g transform={`translate(${tx} ${ty})`}>
        {fronds.map((a, i) => (
          <path key={i} d={`M 0 2 Q ${a * 0.5} ${-46 - Math.abs(a) * 0.08} ${a} ${22 + Math.abs(a) * 0.2}`} fill="none" stroke={i % 2 ? '#2f8a46' : '#3c9c53'} strokeWidth={13} strokeLinecap="round" />
        ))}
        <circle cx={-9} cy={13} r={7} fill="#6b5433" />
        <circle cx={9} cy={13} r={7} fill="#6b5433" />
        <circle cx={0} cy={8} r={8} fill="#6b5433" />
      </g>
    </g>
  )
}

// ธงชาติไทย โบกเบา ๆ
function ThaiFlag({ x, y, w, h, wave }: { x: number; y: number; w: number; h: number; wave: number }) {
  const b = h / 6
  const bands: [string, number][] = [['#ed1c24', b], ['#ffffff', b], ['#241d6b', 2 * b], ['#ffffff', b], ['#ed1c24', b]]
  let yy = 0
  return (
    <g transform={`translate(${x} ${y}) scale(1, ${1 + wave * 0.012})`}>
      {bands.map(([c, bh], i) => { const el = <rect key={i} x={0} y={yy} width={w + wave * 0.5} height={bh + 0.5} fill={c} />; yy += bh; return el })}
    </g>
  )
}

// โกลฟุตบอล
function Goal({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines = []
  for (let i = 1; i < 6; i++) lines.push(<line key={`v${i}`} x1={x + (w / 6) * i} y1={y} x2={x + (w / 6) * i} y2={y + h} stroke="#ffffff" strokeWidth={1.4} opacity={0.45} />)
  for (let j = 1; j < 4; j++) lines.push(<line key={`h${j}`} x1={x} y1={y + (h / 4) * j} x2={x + w} y2={y + (h / 4) * j} stroke="#ffffff" strokeWidth={1.4} opacity={0.45} />)
  return (
    <g>
      {lines}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#f3f6f8" strokeWidth={5} strokeLinejoin="round" />
    </g>
  )
}

// นักเรียน (เสื้อขาว กางเกงเข้ม)
function Kid({ x, y, s = 1, phase = 0 }: { x: number; y: number; s?: number; phase?: number }) {
  const sw = Math.sin(phase) * 3
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={20} rx={13} ry={3.5} fill="rgba(0,0,0,0.18)" />
      <circle cx={0} cy={-32} r={8} fill="#e8b98c" />
      <path d="M -11 -23 Q 0 -29 11 -23 L 9 -3 L -9 -3 Z" fill="#fbfdff" />
      <rect x={-8} y={-4} width={16} height={9} rx={2} fill="#2b3a66" />
      <rect x={-7 + sw} y={4} width={5} height={13} rx={2} fill="#223055" />
      <rect x={2 - sw} y={4} width={5} height={13} rx={2} fill="#223055" />
    </g>
  )
}

// กระถางดอกไม้
function Pot({ x, y, c = '#e23b4b', s = 1 }: { x: number; y: number; c?: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M -15 0 L 15 0 L 11 24 L -11 24 Z" fill="#b4663f" />
      <path d="M -13 0 L 13 0 L 12 5 L -12 5 Z" fill="#9c5433" />
      <path d="M -5 0 Q -3 -20 0 -26 Q 3 -20 5 0 Z" fill="#2f8a4a" />
      <circle cx={-6} cy={-20} r={7} fill={c} />
      <circle cx={7} cy={-22} r={7} fill={c} />
      <circle cx={0} cy={-29} r={7} fill={c} />
    </g>
  )
}

export function SchoolScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  // กล้องค่อย ๆ เคลื่อนเข้าหาหน้าต่างห้องเรียนชั้นบนของอาคารหลัก แล้วดิ่งเข้าช่วงท้าย
  const TX = 878, TY = 416
  const push = interpolate(frame, [0, durationInFrames], [1, 2.45], { easing: EASE })
  const pf = 1 + (push - 1) * 1.45 // ฉากหน้าขยับเร็วกว่า เพิ่มความลึก
  const wave = Math.sin(frame / 8)
  const dur = durationInFrames
  // ช่วงท้าย: ดิ่งเข้าหน้าต่าง หน้าต่างสว่างอุ่นวาบสั้น ๆ แล้วจอมืดสนิทเป็นโทนห้องเรียน (ตัดเข้าในห้อง)
  const glow = interpolate(frame, [dur - f(2.2), dur - f(0.9)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const dark = interpolate(frame, [dur - f(1.5), dur], [0, 1], { extrapolateLeft: 'clamp' })
  const textOut = interpolate(frame, [f(3.4), f(4.8)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const upperWin = Array.from({ length: 8 }, (_, i) => 560 + i * 95)
  return (
    <SceneFrame inF={18} outF={8}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <defs>
          <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f91d6" />
            <stop offset="52%" stopColor="#8ec9ef" />
            <stop offset="100%" stopColor="#dcf0fb" />
          </linearGradient>
          <radialGradient id="sunDay" cx="80%" cy="12%" r="42%">
            <stop offset="0%" stopColor="rgba(255,250,224,0.9)" />
            <stop offset="55%" stopColor="rgba(255,244,200,0.18)" />
            <stop offset="100%" stopColor="rgba(255,244,200,0)" />
          </radialGradient>
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6cb356" />
            <stop offset="100%" stopColor="#4e9a43" />
          </linearGradient>
          <radialGradient id="winGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6da" />
            <stop offset="55%" stopColor="#ffe6a6" />
            <stop offset="100%" stopColor="rgba(255,230,166,0)" />
          </radialGradient>
        </defs>

        {/* ฟ้ากลางวัน + แดด */}
        <rect x={0} y={0} width={1920} height={1080} fill="url(#skyDay)" />
        <rect x={0} y={0} width={1920} height={1080} fill="url(#sunDay)" />

        <g transform={`translate(${TX} ${TY}) scale(${push}) translate(${-TX} ${-TY})`}>
          {/* เมฆลอยช้า ๆ */}
          {[{ x: 120, y: 130, s: 1 }, { x: 1500, y: 100, s: 1.15 }, { x: 1720, y: 235, s: 0.85 }, { x: 60, y: 300, s: 0.95 }].map((c, i) => (
            <Cloud key={i} x={((c.x + frame * 0.22 * (1 + i * 0.2)) % 2200) - 140} y={c.y} s={c.s} />
          ))}

          {/* แนวต้นไม้เขียวหลังอาคาร */}
          <rect x={-60} y={560} width={2040} height={160} fill="#2c7a46" />
          {Array.from({ length: 14 }, (_, i) => <Leafy key={i} x={-20 + i * 150} y={560 + (i % 3) * 14} r={74 + (i % 4) * 10} tint={i % 2 ? '#2f8049' : '#277042'} />)}
          {/* มะพร้าวสูงเหนือแนวต้นไม้ */}
          <Coconut x={420} baseY={590} h={300} sway={wave * 10} />
          <Coconut x={1360} baseY={585} h={330} sway={wave * 12} />
          <Coconut x={1180} baseY={575} h={270} sway={wave * 9} />
          <Coconut x={620} baseY={600} h={250} sway={-wave * 8} />

          {/* สนามหญ้า */}
          <rect x={-60} y={632} width={2040} height={520} fill="url(#grass)" />
          <ellipse cx={720} cy={830} rx={520} ry={120} fill="#5aa74e" opacity={0.6} />
          {/* ทางเดินคอนกรีตโค้งเข้าหาอาคาร */}
          <path d="M 980 1080 C 980 950, 1150 820, 1150 700 L 1260 700 C 1300 840, 1540 980, 1720 1080 Z" fill="#d7d3c4" />
          <path d="M 980 1080 C 980 950, 1150 820, 1150 700 L 1180 700 C 1150 840, 1120 980, 1120 1080 Z" fill="#cbc6b6" opacity={0.6} />

          {/* อาคารเรียนหลัก ขาว-ฟ้า หลังคาเทา */}
          <g>
            <ellipse cx={930} cy={664} rx={470} ry={26} fill="rgba(0,0,0,0.12)" />
            {/* หลังคาเมทัลชีท */}
            <polygon points="500,362 580,300 1280,300 1360,362" fill="#9aa3ac" />
            <polygon points="500,362 580,300 1280,300 1360,362" fill="none" stroke="#7d868f" strokeWidth={2} />
            {Array.from({ length: 12 }, (_, i) => <line key={i} x1={520 + i * 70} y1={360} x2={560 + i * 58} y2={302} stroke="#88919b" strokeWidth={1} opacity={0.5} />)}
            <rect x={566} y={296} width={728} height={8} rx={2} fill="#727c86" />
            {/* ตัวอาคาร */}
            <rect x={520} y={360} width={820} height={304} fill="#f5f2e8" />
            {/* หน้าต่างชั้นบน กรอบฟ้า */}
            {upperWin.map((wx, i) => {
              const target = i === 3
              return (
                <g key={i}>
                  <rect x={wx} y={388} width={64} height={58} rx={3} fill={target ? '#ffe7ac' : '#cfe8f4'} stroke="#4f93c0" strokeWidth={3} />
                  <line x1={wx + 32} y1={388} x2={wx + 32} y2={446} stroke="#4f93c0" strokeWidth={2} />
                  <line x1={wx} y1={417} x2={wx + 64} y2={417} stroke="#4f93c0" strokeWidth={2} />
                </g>
              )
            })}
            {/* แถบคาดฟ้าแบ่งชั้น */}
            <rect x={520} y={468} width={820} height={16} fill="#5bb0d4" />
            {/* ระเบียง/โถงชั้นล่าง */}
            {upperWin.map((wx, i) => <rect key={i} x={wx - 2} y={502} width={68} height={100} rx={2} fill="#3c4b5c" opacity={0.85} />)}
            {Array.from({ length: 9 }, (_, i) => <rect key={i} x={544 + i * 95} y={500} width={14} height={120} fill="#f5f2e8" />)}
            {/* ฐานอาคารคาดฟ้า + บันไดกลาง */}
            <rect x={520} y={636} width={820} height={28} fill="#5bb0d4" />
            <rect x={886} y={590} width={70} height={74} fill="#2f3c4d" opacity={0.9} />
            <rect x={866} y={656} width={110} height={10} fill="#cfcabb" />
            <rect x={856} y={666} width={130} height={10} fill="#c2bdac" />
          </g>

          {/* เสาธงชาติไทย */}
          <g>
            <rect x={1448} y={300} width={6} height={364} fill="#c9d2dd" />
            <circle cx={1451} cy={298} r={6} fill="#e8c766" />
            <ThaiFlag x={1454} y={312} w={132} h={88} wave={wave * 6} />
          </g>

          {/* โกลฟุตบอล + เด็กเล่นบอลในสนาม */}
          <g transform="translate(360 548)"><Goal x={0} y={0} w={190} h={96} /></g>
          <circle cx={690} cy={690} r={9} fill="#f4f6f7" stroke="#3a4a5a" strokeWidth={1.4} />
          <Kid x={620} y={672} s={1.15} phase={frame / 5} />
          <Kid x={760} y={686} s={1.25} phase={frame / 5 + 2} />
          <Kid x={540} y={660} s={1.0} phase={frame / 6 + 1} />
          <Kid x={860} y={700} s={1.35} phase={frame / 5 + 3.5} />

          {/* ทางเดินมีหลังคาคลุม + กระถางดอกไม้ ฝั่งขวา */}
          <g>
            <path d="M 1430 1080 L 1470 648 L 1920 612 L 1920 1080 Z" fill="#cfd3cd" />
            <path d="M 1470 648 L 1920 612 L 1920 648 L 1486 684 Z" fill="#bdc2bc" />
            <path d="M 1452 452 L 1920 430 L 1920 486 L 1470 520 Z" fill="#9aa3ac" />
            <path d="M 1452 452 L 1470 520 L 1920 486 L 1920 430 Z" fill="none" stroke="#7d868f" strokeWidth={1} />
            {[1520, 1680, 1840].map((px, i) => <rect key={i} x={px} y={512} width={16} height={240 - i * 10} fill="#caa279" />)}
            {/* บันได */}
            <rect x={1486} y={792} width={420} height={16} fill="#c2bdad" />
            <rect x={1470} y={828} width={450} height={18} fill="#b4af9f" />
            {/* นักเรียนเดินตามทางเดิน */}
            <Kid x={1600 + (frame / dur) * 30} y={740} s={1.5} phase={frame / 5} />
            <Kid x={1660 + (frame / dur) * 30} y={756} s={1.55} phase={frame / 5 + 2} />
          </g>

          {/* กระถางดอกไม้เรียงริมทาง */}
          {[{ x: 1250, y: 724, c: '#e23b4b', s: 1.1 }, { x: 1330, y: 752, c: '#d6468f', s: 1.2 }, { x: 1430, y: 788, c: '#f0a52e', s: 1.35 }, { x: 1540, y: 828, c: '#e23b4b', s: 1.5 }].map((p, i) => (
            <Pot key={i} x={p.x} y={p.y} c={p.c} s={p.s} />
          ))}

          {/* ฉากหน้า (ขยับเร็วกว่า): ต้นไม้ใหญ่มุมซ้ายบน + แปลงดอกไม้มุมซ้ายล่าง */}
          <g transform={`translate(${TX} ${TY}) scale(${pf / push}) translate(${-TX} ${-TY})`}>
            {/* เรือนยอดต้นไม้ใหญ่คลุมมุมซ้ายบน */}
            <g>
              <path d="M -80 30 Q 160 90 380 150" fill="none" stroke="#5c4327" strokeWidth={30} strokeLinecap="round" />
              <path d="M 120 80 Q 60 180 20 300" fill="none" stroke="#5c4327" strokeWidth={18} strokeLinecap="round" />
              <Leafy x={120} y={70} r={195} tint="#296b3f" />
              <Leafy x={370} y={40} r={155} tint="#225f37" />
              <Leafy x={30} y={205} r={145} tint="#2c7044" />
              <Leafy x={310} y={215} r={125} tint="#235f38" />
            </g>
            {/* แปลงดอกไม้ + รั้วไม้ มุมซ้ายล่าง */}
            <g>
              <path d="M -60 1080 L -60 940 L 70 980 Q 150 880 240 960 L 360 930 L 400 1080 Z" fill="#2f8a4a" />
              <path d="M 40 1000 Q 60 930 80 1000 Z" fill="#b5324a" />
              <path d="M 110 990 Q 132 905 154 990 Z" fill="#b5324a" />
              <path d="M 190 1000 Q 210 925 230 1000 Z" fill="#c23a58" />
              <rect x={-60} y={1004} width={470} height={76} fill="#8a6a44" />
              <rect x={-60} y={1004} width={470} height={12} fill="#9c7a4f" />
              {[-20, 120, 260, 380].map((px, i) => <rect key={i} x={px} y={996} width={16} height={84} fill="#7d6240" />)}
            </g>
          </g>

          {/* ช่วงท้าย: หน้าต่างเป้าหมายสว่างอุ่น → ดิ่งเข้า (บลูมนุ่ม ไม่ทึบ) */}
          <circle cx={TX} cy={TY} r={40 + glow * 260} fill="url(#winGlow)" opacity={glow * 0.68} />
        </g>
      </svg>

      {/* จอค่อยมืดเป็นโทนห้องเรียนช่วงท้าย (เดินจากแดดเข้าในห้อง) */}
      <AbsoluteFill style={{ background: C.navy, opacity: dark }} />

      {/* ข้อความเปิด จางหายก่อนดิ่งเข้าห้อง (ใช้เงาตัวอักษรแทนสกริม เมฆจะได้ขาวจริง) */}
      <div style={{ position: 'absolute', top: 110, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: textOut, textShadow: '0 2px 10px rgba(8,16,36,0.85), 0 4px 30px rgba(8,16,36,0.6)' }}>
        <Reveal at={f(0.6)} dur={26}><div style={{ ...titleStyle, fontSize: 66, textAlign: 'center' }}>{s.title ?? 'ทุกเช้า ในโรงเรียนทั่วสามจังหวัดชายแดนใต้'}</div></Reveal>
        <Reveal at={f(1.4)} dur={26}><div style={{ ...subStyle, color: '#eef5ff', fontSize: 34, textAlign: 'center' }}>{s.sub ?? 'ห้องเรียนเริ่มต้นขึ้นอีกวัน'}</div></Reveal>
      </div>
    </SceneFrame>
  )
}

