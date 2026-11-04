import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY, C, DISPLAY, EASE, OUT, f } from './theme'
import { ROLE, type Box, type RoleKey, type Scene } from './timeline.mjs'
import { DemoBadge, Pill, Reveal, RoleIcon, SceneFrame, subStyle, titleStyle } from './ui'

const W = 1600 // viewport ตอนจับภาพ
const H = 900
const CHROME = 40 // แถบหน้าต่างเบราว์เซอร์จำลองเหนือภาพ

/**
 * หน้าจอจริงในหน้าต่างเบราว์เซอร์ลอยเอียงเล็กน้อย แล้วกล้องค่อย ๆ เคลื่อนเข้าไปที่ส่วนสำคัญ (focus)
 * จากนั้นกรอบสีทองล้อมสิ่งที่ต้องดู (mark) และหรี่ส่วนอื่น — ไม่แต่งเนื้อหาในภาพ
 */
export function ShotScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const role = ROLE[s.role as RoleKey]
  const focus: Box = s.focus ?? { x: 0, y: 0, w: W, h: H }

  // กล้อง: เริ่มเห็นทั้งหน้าต่าง → ซูมไปที่ focus ให้พอดีพื้นที่เหนือคำบรรยาย
  const S0 = 0.8
  const S1 = Math.max(S0 * 1.05, Math.min(1720 / focus.w, 700 / focus.h, 1.9))
  const p = interpolate(frame, [f(0.5), durationInFrames - f(1.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })
  const fx = interpolate(p, [0, 1], [W / 2, focus.x + focus.w / 2])
  const fy = interpolate(p, [0, 1], [H / 2 - CHROME / 2, focus.y + focus.h / 2])
  const S = interpolate(p, [0, 1], [S0, S1])
  const cx = 960
  const cy = interpolate(p, [0, 1], [470, 420])
  const tilt = interpolate(frame, [0, f(2.2)], [9, 0], { extrapolateRight: 'clamp', easing: OUT })
  const rise = spring({ frame, fps: 30, config: { damping: 200 }, durationInFrames: 30 })

  const markAt = Math.round(durationInFrames * 0.42)
  const mk = spring({ frame: frame - markAt, fps: 30, config: { damping: 18, mass: 0.7 } })
  const mOpacity = interpolate(frame, [markAt, markAt + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <SceneFrame>
      <AbsoluteFill style={{ perspective: 2200 }}>
        <div
          style={{
            position: 'absolute', left: 0, top: 0, width: W, height: H + CHROME,
            transformOrigin: '0 0',
            transform: `translate(${cx - fx * S}px, ${cy - (fy + CHROME) * S + (1 - rise) * 120}px) scale(${S}) rotateX(${tilt}deg) rotateY(${-tilt * 0.6}deg)`,
            borderRadius: 18, overflow: 'hidden', background: '#fff',
            boxShadow: '0 60px 140px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ height: CHROME, background: '#e9eef7', display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px' }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 13, background: c }} />)}
            <div style={{ marginLeft: 22, padding: '4px 18px', borderRadius: 8, background: '#fff', fontFamily: BODY, fontSize: 15, color: '#475569' }}>Early Warning System · {s.screen}</div>
          </div>
          <div style={{ position: 'relative', width: W, height: H }}>
            <Img src={staticFile(`shots/${s.img}.png`)} style={{ width: W, height: H, display: 'block' }} />
            {s.mark && (
              <div
                style={{
                  position: 'absolute', left: s.mark.x - 8, top: s.mark.y - 8, width: s.mark.w + 16, height: s.mark.h + 16,
                  borderRadius: 16, opacity: mOpacity, transform: `scale(${1.06 - 0.06 * mk})`,
                  border: `${3.2 / S}px solid ${C.gold}`,
                  boxShadow: `0 0 0 4000px rgba(11,23,54,${0.42 * mOpacity}), 0 0 ${36 / S}px ${C.gold}aa`,
                }}
              />
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* แถบคำบรรยาย: ไม่เกิน 2 บรรทัด */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(11,23,54,0.98) 0%, rgba(11,23,54,0.93) 28%, rgba(11,23,54,0.6) 38%, rgba(11,23,54,0) 50%)' }} />
      <div style={{ position: 'absolute', left: 110, right: 110, bottom: 76, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Reveal at={6}>
          <Pill color={role.color}>
            <RoleIcon role={s.role as RoleKey} size={24} />
            {role.th} · หน้าจอจริง: {s.screen}
          </Pill>
        </Reveal>
        <Reveal at={10}><div style={{ ...titleStyle, fontSize: 60 }}>{s.title}</div></Reveal>
        {s.sub && <Reveal at={16}><div style={subStyle}>{s.sub}</div></Reveal>}
      </div>
      <DemoBadge />
    </SceneFrame>
  )
}

const ORDER: RoleKey[] = ['teacher', 'school', 'esa', 'obec']

/** การ์ดขึ้นบท: เลขบทใหญ่ · ชื่อบทบาท · แถบเส้นทาง 4 ระดับที่บอกว่ากำลังอยู่ตรงไหน */
export function ChapterScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const role = ROLE[s.role as RoleKey]
  const idx = ORDER.indexOf(s.role as RoleKey)
  const sweep = interpolate(frame, [0, f(1.1)], [-0.4, 1.4], { extrapolateRight: 'clamp', easing: EASE })
  const bar = interpolate(frame, [f(0.2), f(1.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: OUT })
  return (
    <SceneFrame inF={8}>
      <AbsoluteFill style={{ background: `linear-gradient(105deg, transparent ${sweep * 100 - 12}%, rgba(255,255,255,0.10) ${sweep * 100}%, transparent ${sweep * 100 + 12}%)` }} />
      <div style={{ position: 'absolute', left: 150, top: 250, display: 'flex', alignItems: 'center', gap: 64 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 300, lineHeight: 1, color: 'transparent', WebkitTextStroke: `3px ${role.color}`, opacity: 0.9 }}>{s.no}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ height: 6, width: 160 * bar, background: role.color, borderRadius: 6 }} />
          <Reveal at={6}><div style={{ ...titleStyle, fontSize: 74 }}>{s.title}</div></Reveal>
          <Reveal at={14}><div style={{ ...subStyle, fontSize: 36 }}>{s.sub}</div></Reveal>
        </div>
      </div>
      <Track active={idx} />
    </SceneFrame>
  )
}

/** แถบเส้นทาง ครู → ผอ. → เขต → สพฐ. ด้านล่างจอ */
export function Track({ active, bottom = 120 }: { active: number; bottom?: number }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', left: 260, right: 260, bottom, display: 'flex', alignItems: 'center' }}>
      {ORDER.map((k, i) => {
        const on = i === active
        const done = i < active
        const r = ROLE[k]
        const glow = on ? 0.5 + 0.5 * Math.sin(frame / 6) : 0
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 150 }}>
              <div style={{ width: 66, height: 66, borderRadius: 66, display: 'grid', placeItems: 'center', background: on ? r.color : done ? `${r.color}55` : 'rgba(255,255,255,0.06)', border: `2px solid ${on || done ? r.color : C.line}`, boxShadow: on ? `0 0 ${24 + glow * 24}px ${r.color}` : 'none' }}>
                <RoleIcon role={k} size={34} color={on || done ? '#fff' : C.faint} />
              </div>
              <div style={{ fontFamily: BODY, fontSize: 21, fontWeight: 600, color: on ? C.white : C.faint, whiteSpace: 'nowrap' }}>{r.th}</div>
            </div>
            {i < 3 && <div style={{ flex: 1, height: 3, marginBottom: 34, background: i < active ? C.gold : C.line, borderRadius: 3 }} />}
          </div>
        )
      })}
    </div>
  )
}
