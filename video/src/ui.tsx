import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY, C, DISPLAY, OUT, f } from './theme'
import type { RoleKey } from './timeline.mjs'

/** พื้นหลังของทั้งเรื่อง — ลุค "ศูนย์เฝ้าระวัง": ไล่สีมีทิศ · วงเรดาร์แจ้งเตือนมุมขวาล่าง ·
 *  ตารางข้อมูลละเอียด · ขอบมืดโฟกัสกลางจอ (ตั้งใจออกแบบ ไม่ใช่บลอบลอย + ลายจุดแบบเทมเพลต) */
export function Backdrop() {
  const frame = useCurrentFrame()
  const breathe = 1 + Math.sin(frame / 90) * 0.045
  const ping = (frame % 150) / 150 // วงแจ้งเตือนขยายทุก 5 วินาที
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(153deg, #0a1733 0%, #0d1f40 48%, #081330 100%)' }}>
      {/* แสงนุ่มดวงเดียวจากขอบบน คุมทิศไว้ ไม่ลอยสุ่ม */}
      <div style={{ position: 'absolute', left: '50%', top: -440, width: 1540, height: 1040, transform: `translateX(-50%) scale(${breathe})`, background: `radial-gradient(ellipse at center, ${C.royal}2b 0%, transparent 60%)` }} />
      {/* วงเรดาร์เฝ้าระวังมุมขวาล่าง — มอทีฟของ "แจ้งเตือนล่วงหน้า" */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <g transform="translate(1660 1010)" fill="none" stroke={C.gold}>
          {[200, 400, 620, 860].map((r) => <circle key={r} cx={0} cy={0} r={r} strokeWidth={1.2} opacity={0.1} />)}
          <circle cx={0} cy={0} r={70 + ping * 820} strokeWidth={2} opacity={(1 - ping) * 0.26} />
          <line x1={-900} y1={0} x2={70} y2={0} strokeWidth={1} opacity={0.08} />
          <line x1={0} y1={-900} x2={0} y2={70} strokeWidth={1} opacity={0.08} />
        </g>
      </svg>
      {/* ตารางข้อมูลละเอียด (แทนลายจุดแบบ ai) จางลงที่ขอบ */}
      <AbsoluteFill style={{ backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`, backgroundSize: '92px 92px', opacity: 0.4, maskImage: 'radial-gradient(ellipse 82% 72% at 50% 44%, black 15%, transparent 86%)' }} />
      {/* ขอบมืดโฟกัสกลางจอ */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 92% 82% at 50% 44%, transparent 54%, rgba(4,10,26,0.6) 100%)' }} />
    </AbsoluteFill>
  )
}

/** ห่อทุกฉาก: เข้าแบบชัดขึ้นจากเบลอ ออกแบบจางลง — ฉากต่อกันผ่านพื้นหลังมืด จึงไม่มีรอยตัด */
export function SceneFrame({ children, inF = 14, outF = 12 }: { children: ReactNode; inF?: number; outF?: number }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const i = interpolate(frame, [0, inF], [0, 1], { extrapolateRight: 'clamp', easing: OUT })
  const o = interpolate(frame, [durationInFrames - outF, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  return (
    <AbsoluteFill style={{ opacity: Math.min(i, o), filter: `blur(${(1 - i) * 14}px)`, transform: `scale(${1.04 - 0.04 * i})` }}>
      {children}
    </AbsoluteFill>
  )
}

/** ข้อความที่ค่อย ๆ ลอยขึ้นจากใต้เส้น — ใช้กับหัวเรื่องและคำบรรยายทุกตัว */
export function Reveal({ at = 0, children, style, dur = 18 }: { at?: number; children: ReactNode; style?: CSSProperties; dur?: number }) {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [at, at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: OUT })
  return (
    <div style={{ overflow: 'hidden', paddingBottom: 8, marginBottom: -8 }}>
      <div style={{ transform: `translateY(${(1 - p) * 70}%)`, opacity: p, ...style }}>{children}</div>
    </div>
  )
}

export const titleStyle: CSSProperties = { fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, lineHeight: 1.28, color: C.white, letterSpacing: 0 }
export const subStyle: CSSProperties = { fontFamily: BODY, fontWeight: 500, fontSize: 32, lineHeight: 1.5, color: C.soft }

/** ป้ายมุมจอ: ข้อมูลในภาพเป็นข้อมูลจำลอง — แสดงทุกฉากที่มีหน้าจอ */
export function DemoBadge() {
  return (
    <div style={{ position: 'absolute', top: 36, right: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderRadius: 999, background: 'rgba(11,23,54,0.78)', border: `1px solid ${C.gold}66`, fontFamily: BODY, fontSize: 20, fontWeight: 600, color: C.gold }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: C.gold }} />
      ข้อมูลจำลองเพื่อสาธิต · ชื่อเด็กและโรงเรียนเป็นนามสมมติ
    </div>
  )
}

/** ไอคอนบทบาทแบบเส้น — วาดเองเป็น SVG ไม่ใช้ emoji */
export function RoleIcon({ role, size = 64, color = C.white }: { role: RoleKey; size?: number; color?: string }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      {role === 'teacher' && (<><circle cx="16" cy="10" r="5" {...p} /><path d="M6 27c1.5-6 5.5-9 10-9s8.5 3 10 9" {...p} /><path d="M22 6h6v4" {...p} /></>)}
      {role === 'school' && (<><path d="M4 14l12-8 12 8" {...p} /><path d="M7 13v13h18V13" {...p} /><path d="M13 26v-6h6v6" {...p} /><path d="M16 6V2l4 1.5L16 5" {...p} /></>)}
      {role === 'esa' && (<><circle cx="16" cy="7" r="3.5" {...p} /><circle cx="7" cy="24" r="3.5" {...p} /><circle cx="25" cy="24" r="3.5" {...p} /><path d="M14 10l-5 11M18 10l5 11M10.5 24h11" {...p} /></>)}
      {role === 'obec' && (<><path d="M5 27h22" {...p} /><path d="M8 27V17M14 27V11M20 27V14M26 27V7" {...p} /></>)}
    </svg>
  )
}

export function Pill({ children, color, style }: { children: ReactNode; color: string; style?: CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderRadius: 999, background: `${color}26`, border: `1.5px solid ${color}aa`, color: C.white, fontFamily: BODY, fontWeight: 600, fontSize: 22, ...style }}>
      <span style={{ width: 10, height: 10, borderRadius: 10, background: color }} />
      {children}
    </div>
  )
}

export const seconds = f
