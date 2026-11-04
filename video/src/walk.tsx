import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY, C, EASE, f } from './theme'
import { CLICK_AT, ROLE, type Box, type RoleKey, type Scene, type Step } from './timeline.mjs'
import boxesRaw from './boxes.json'
import { DemoBadge, Pill, RoleIcon, SceneFrame, subStyle, titleStyle } from './ui'

const boxes = boxesRaw as Record<string, Box>

const W = 1600 // viewport ตอนจับภาพ
const H = 900
const CHROME = 40 // แถบหน้าต่างเบราว์เซอร์จำลองเหนือภาพ

// หน้าต่างล็อกอยู่กับที่ตลอด role — เห็นทั้งบานเป็นการ์ดลอยบนพื้นหลัง กล้องไม่ขยับ
// ดึงสายตาด้วยกรอบทอง+หรี่รอบข้าง ไม่ใช่การซูม จึงไม่มีความรู้สึก "แว้บ/กระโดด"
const OV_S = 0.86 // สเกลที่หน้าต่าง 1600×940 พอดีเฟรม 1920×1080 โดยเหลือขอบและที่ให้คำบรรยาย
const STAGE_CY = 406 // ยกหน้าต่างขึ้นเล็กน้อยให้มีที่สำหรับแถบคำบรรยายด้านล่าง
const TX = 960 - (W / 2) * OV_S
const TY = STAGE_CY - ((H + CHROME) / 2) * OV_S
const XF = 0.45 // วินาทีครอสเฟดเปลี่ยนหน้าจอหลังกด

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** เคอร์เซอร์ลูกศร วาดเป็น SVG ปลายชี้อยู่ที่ (0,0) — ห่อด้วย counter-scale ให้ขนาดคงที่ไม่ว่ากล้องซูมแค่ไหน */
function Cursor({ x, y, scale, press }: { x: number; y: number; scale: number; press: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${1 / scale})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
      <div style={{ transform: `scale(${1 - 0.18 * press})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))' }}>
        <svg width={40} height={46} viewBox="0 0 40 46">
          <path d="M3 2 L3 34 L11 27 L16 39 L22 36 L17 24 L28 24 Z" fill="#fff" stroke="#0B1736" strokeWidth={2.4} strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

/**
 * หนึ่ง role = หนึ่งหน้าจอต่อเนื่อง หน้าต่างเบราว์เซอร์วางครั้งเดียวแล้วอยู่กับที่ (ไม่บินเข้ามาใหม่ทุกฉาก)
 * เคอร์เซอร์เดินไปกดปุ่มจริงทีละขั้น กดแล้วหน้าจอครอสเฟดไปขั้นถัดไป — เห็น "วิธีใช้งาน" ไม่ใช่ภาพนิ่งแว้บไปมา
 */
export function WalkScene({ s }: { s: Scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const role = ROLE[s.role as RoleKey]
  const steps = s.steps as Step[]
  const n = steps.length
  const local0 = steps[0].start // เวลาเริ่มของ step แรก = เวลาเริ่มของฉาก

  // เวลาเริ่มของแต่ละขั้น (อิงศูนย์ที่ต้นฉาก)
  const st = steps.map((step) => step.start - local0)
  // เวลาที่ "เปลี่ยนหน้าจอ" จากขั้น i-1 ไป i — ตอนกดปุ่ม (ถ้ามี) หรือปลายขั้นถ้าเป็นขั้นดูเฉย ๆ
  const advance = steps.map((step, i) => {
    if (i === 0) return 0
    const p = steps[i - 1]
    const pStart = st[i - 1]
    return p.click ? pStart + p.dur * CLICK_AT : pStart + p.dur - XF - 0.15
  })

  // ขั้นปัจจุบัน
  let cur = 0
  for (let i = 0; i < n; i++) if (t >= st[i]) cur = i
  const step = steps[cur]
  const localT = t - st[cur]

  // เคอร์เซอร์ของขั้นปัจจุบัน (เฉพาะขั้นที่มีปุ่มกด)
  const target = step.click && boxes[step.click] ? center(boxes[step.click]) : null
  const rest = step.focus ? center(step.focus) : { x: W / 2, y: H / 2 }
  const cmove = interpolate(localT, [step.dur * 0.3, step.dur * 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })
  const cx = target ? lerp(rest.x, target.x, cmove) : rest.x
  const cy = target ? lerp(rest.y, target.y, cmove) : rest.y
  const clickT = step.dur * CLICK_AT
  const press = interpolate(localT, [clickT - 0.08, clickT, clickT + 0.12], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const cursorOp = target ? interpolate(localT, [0.15, 0.4, step.dur - 0.25, step.dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0
  const ripple = target ? interpolate(localT, [clickT, clickT + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0

  // กรอบทองของขั้นปัจจุบัน — ขึ้นหลังกล้องนิ่ง
  const mk = step.mark
  const mkSpring = spring({ frame: frame - f(st[cur]) - f(0.95), fps, config: { damping: 18, mass: 0.7 } })
  const mkOp = interpolate(localT, [0.95, 1.25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // คำบรรยาย: อนิเมชันขึ้นใหม่ทุกครั้งที่เปลี่ยนขั้น
  const capIn = interpolate(localT, [0, 0.45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })

  return (
    <SceneFrame>
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute', left: 0, top: 0, width: W, height: H + CHROME,
            transformOrigin: '0 0', transform: `translate(${TX}px, ${TY}px) scale(${OV_S})`,
            borderRadius: 18, overflow: 'hidden', background: '#fff',
            boxShadow: '0 60px 140px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ height: CHROME, background: '#e9eef7', display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px' }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 13, background: c }} />)}
            <div style={{ marginLeft: 22, padding: '4px 18px', borderRadius: 8, background: '#fff', fontFamily: BODY, fontSize: 15, color: '#475569' }}>Early Warning System · {step.screen}</div>
          </div>
          <div style={{ position: 'relative', width: W, height: H }}>
            {/* ภาพหน้าจอแต่ละขั้นซ้อนกัน แล้วครอสเฟดเมื่อ "กด" เปลี่ยนไปขั้นถัดไป */}
            {steps.map((step2, i) => {
              const op = i === 0 ? 1 : interpolate(t, [advance[i], advance[i] + XF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })
              if (op <= 0) return null
              return <Img key={step2.img} src={staticFile(`shots/${step2.img}.png`)} style={{ position: 'absolute', inset: 0, width: W, height: H, opacity: op }} />
            })}

            {mk && (
              <div
                style={{
                  position: 'absolute', left: mk.x - 8, top: mk.y - 8, width: mk.w + 16, height: mk.h + 16,
                  borderRadius: 16, opacity: mkOp, transform: `scale(${1.06 - 0.06 * mkSpring})`,
                  border: `${3.2 / OV_S}px solid ${C.gold}`,
                  boxShadow: `0 0 0 4000px rgba(11,23,54,${0.4 * mkOp}), 0 0 ${36 / OV_S}px ${C.gold}aa`,
                }}
              />
            )}

            {target && ripple > 0 && ripple < 1 && (
              <div style={{ position: 'absolute', left: target.x, top: target.y, transform: `translate(-50%,-50%) scale(${(0.4 + ripple * 1.8) / OV_S})`, width: 90, height: 90, marginLeft: 0, borderRadius: 90, border: `${4 / OV_S}px solid ${C.gold}`, opacity: 1 - ripple }} />
            )}
            {cursorOp > 0 && (
              <div style={{ position: 'absolute', inset: 0, opacity: cursorOp }}>
                <Cursor x={cx} y={cy} scale={OV_S} press={press} />
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* แถบคำบรรยาย: ไม่เกิน 2 บรรทัด + ตัวนับขั้น */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(11,23,54,0.98) 0%, rgba(11,23,54,0.93) 26%, rgba(11,23,54,0.6) 36%, rgba(11,23,54,0) 48%)' }} />
      <div style={{ position: 'absolute', left: 110, right: 110, bottom: 74, opacity: capIn, transform: `translateY(${(1 - capIn) * 34}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <Pill color={role.color}>
            <RoleIcon role={s.role as RoleKey} size={24} />
            {role.th} · หน้าจอจริง: {step.screen}
          </Pill>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: BODY, fontWeight: 600, fontSize: 20, color: C.faint }}>
            {steps.map((_, i) => (
              <span key={i} style={{ width: i === cur ? 30 : 10, height: 10, borderRadius: 10, background: i === cur ? role.color : i < cur ? `${role.color}88` : 'rgba(255,255,255,0.18)', transition: 'all .2s' }} />
            ))}
            <span style={{ marginLeft: 6 }}>ขั้น {cur + 1}/{n}</span>
          </div>
        </div>
        <div style={{ ...titleStyle, fontSize: 60 }}>{step.title}</div>
        {step.sub && <div style={{ ...subStyle, marginTop: 10 }}>{step.sub}</div>}
      </div>

      {/* ภาพมือถือซ้อน (PiP): ครูบันทึกผ่านมือถือระหว่างลงพื้นที่ — ขึ้นเฉพาะขั้นที่ตั้ง pip */}
      {step.pip && (() => {
        const pin = spring({ frame: frame - f(st[cur]) - f(0.4), fps, config: { damping: 15, mass: 0.8 } })
        const pout = interpolate(localT, [step.dur - 0.6, step.dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const op = Math.min(pin, pout)
        const PW = 300, PH = 616
        return (
          <div style={{ position: 'absolute', left: 1640, top: 404, transform: `translate(-50%,-50%) translateX(${(1 - pin) * 70}px) rotate(-4deg)`, opacity: op }}>
            <div style={{ width: PW, height: PH, borderRadius: 42, background: '#0a0f1c', padding: 12, boxShadow: '0 40px 90px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.08)' }}>
              <div style={{ width: '100%', height: PH - 24, borderRadius: 32, overflow: 'hidden', position: 'relative', background: '#fff' }}>
                <Img src={staticFile(`shots/${step.pip}.png`)} style={{ width: '100%', display: 'block' }} />
                <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 92, height: 20, borderRadius: 20, background: '#0a0f1c' }} />
              </div>
            </div>
            <div style={{ position: 'absolute', left: '50%', bottom: -44, transform: 'translateX(-50%) rotate(4deg)', whiteSpace: 'nowrap', padding: '8px 18px', borderRadius: 999, background: 'rgba(11,23,54,0.92)', border: `1px solid ${role.color}aa`, color: '#fff', fontFamily: BODY, fontWeight: 600, fontSize: 19, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: role.color }} />ครูบันทึกผ่านมือถือ ระหว่างลงพื้นที่
            </div>
          </div>
        )
      })()}
      <DemoBadge />
    </SceneFrame>
  )
}
