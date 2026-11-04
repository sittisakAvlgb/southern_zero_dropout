// สังเคราะห์ดนตรีประกอบแบบ cinematic ambient + เสียงประกอบ UI เป็น WAV — ไม่ใช้ไฟล์เพลงจากภายนอก จึงไม่มีปัญหาลิขสิทธิ์
// ใช้: node scripts/music.mjs  →  public/audio/score.wav, whoosh.wav, tick.wav, chime.wav
// โครงอารมณ์ตาม brief: เริ่มกังวล (ไมเนอร์ โปร่ง) → สร้างความมั่นใจ (จังหวะชีพจร) → จุดพีคฉาก "เด็กหนึ่งคน" → จบอย่างมีความหวัง (เมเจอร์)
import { mkdirSync, writeFileSync } from 'node:fs'
import { SCORE_SECONDS, CUES } from '../src/timeline.mjs'

const SR = 44100
mkdirSync('public/audio', { recursive: true })

function wav(path, L, R = L) {
  const n = L.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4)
  }
  writeFileSync(path, buf)
  console.log('✓', path, (n / SR).toFixed(1) + 's')
}

const midi = (m) => 440 * 2 ** ((m - 69) / 12)
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

// ── โน้ต: คอร์ดละ 2 ห้อง ที่ 72 BPM (ห้องละ 3.33 วินาที) ──
const BPM = 72
const BEAT = 60 / BPM
const BAR = BEAT * 4
// ไมเนอร์ช่วงต้น · ยกขึ้นช่วงกลาง · เมเจอร์ช่วงท้าย
const MINOR = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] // Am F C G
const LIFT = [[53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66 - 1], [57, 60, 64, 67]] // Fmaj7 Cmaj7 G Am7
const HOPE = [[48, 52, 55, 59], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]] // Cmaj7 G Am F

// ระดับความเข้ม 0..1 ตามช่วงเวลา (จาก CUES ใน timeline)
function intensity(t) {
  const { teacher, climax, pilot, end } = CUES
  if (t < teacher) return 0.25 + 0.15 * (t / teacher)
  if (t < climax) return 0.45 + 0.25 * ((t - teacher) / (climax - teacher))
  if (t < pilot) return 0.95
  if (t < end - 6) return 0.7
  return 0.7 * Math.max(0, (end - t) / 6)
}
function chordAt(t) {
  const bar = Math.floor(t / (BAR * 2))
  const set = t < CUES.teacher ? MINOR : t < CUES.climax ? LIFT : HOPE
  return set[bar % set.length]
}

const N = Math.ceil(SCORE_SECONDS * SR)
const L = new Float32Array(N)
const R = new Float32Array(N)

// 1) Pad: คลื่นฟันเลื่อยจูนเพี้ยนเล็กน้อย กรองความถี่สูงด้วย one-pole lowpass — เปลี่ยนคอร์ดแบบ crossfade
{
  const voices = 3
  const phase = new Float64Array(8 * voices)
  let lpL = 0, lpR = 0
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const seg = BAR * 2
    const local = t % seg
    const chord = chordAt(t)
    const prev = chordAt(Math.max(0, t - seg))
    const x = Math.min(1, local / 1.2) // crossfade 1.2 วินาที
    let sL = 0, sR = 0
    for (const [ci, notes] of [[0, chord], [1, prev]]) {
      const w = ci === 0 ? x : 1 - x
      if (w <= 0) continue
      notes.forEach((m, k) => {
        for (let v = 0; v < voices; v++) {
          const det = (v - 1) * 0.07
          const f = midi(m + det) * (ci === 0 ? 1 : 1)
          const idx = (ci * 4 + k) * voices + v
          phase[idx] = (phase[idx] + f / SR) % 1
          const saw = 2 * phase[idx] - 1
          const pan = (v - 1) * 0.6
          sL += saw * w * (1 - pan * 0.5)
          sR += saw * w * (1 + pan * 0.5)
        }
      })
    }
    const amp = 0.018 * (0.55 + 0.6 * intensity(t))
    const cut = 0.025 + 0.06 * intensity(t) // เปิดฟิลเตอร์ตามความเข้ม
    lpL += cut * (sL * amp - lpL)
    lpR += cut * (sR * amp - lpR)
    L[i] += lpL; R[i] += lpR
  }
}

// 2) เบสต่ำ: รากของคอร์ด เข้ามาหลังฉากเปิด
for (let i = 0; i < N; i++) {
  const t = i / SR
  if (t < CUES.teacher - 4) continue
  const root = chordAt(t)[0] - 24
  const fade = Math.min(1, (t - (CUES.teacher - 4)) / 4)
  const s = Math.sin(2 * Math.PI * midi(root) * t) * 0.09 * fade * intensity(t)
  L[i] += s; R[i] += s
}

// 3) เปียโนพลัค (ไซน์ + ฮาร์มอนิก สลายตัวแบบ exponential) เล่น arpeggio — ห่างช่วงเปิด ถี่ขึ้นเมื่อเรื่องเดิน
function pluck(start, m, vel, pan) {
  const f = midi(m)
  const len = Math.floor(SR * 2.8)
  const s0 = Math.floor(start * SR)
  for (let j = 0; j < len && s0 + j < N; j++) {
    const tt = j / SR
    const env = Math.exp(-tt * 2.2) * Math.min(1, tt * 400)
    const v = (Math.sin(2 * Math.PI * f * tt) + 0.35 * Math.sin(4 * Math.PI * f * tt) * Math.exp(-tt * 4) + 0.12 * Math.sin(6 * Math.PI * f * tt) * Math.exp(-tt * 7)) * env * vel
    L[s0 + j] += v * (1 - pan); R[s0 + j] += v * (1 + pan)
  }
}
for (let t = 1.5; t < SCORE_SECONDS - 3; ) {
  const k = intensity(t)
  const chord = chordAt(t)
  const step = k < 0.4 ? BEAT * 2 : k < 0.7 ? BEAT : BEAT / 2
  const note = chord[Math.floor(rand() * chord.length)] + 12 + (rand() < 0.25 ? 12 : 0)
  pluck(t, note, 0.05 + 0.05 * k, (rand() - 0.5) * 0.6)
  t += step
}

// 4) ชีพจรเบา ๆ (kick นุ่ม) ช่วงสร้างความมั่นใจถึงพีค
for (let t = CUES.teacher; t < CUES.pilot; t += BEAT) {
  const k = intensity(t)
  const s0 = Math.floor(t * SR)
  for (let j = 0; j < SR * 0.35 && s0 + j < N; j++) {
    const tt = j / SR
    const f = 48 + 60 * Math.exp(-tt * 30)
    const v = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 9) * 0.16 * k
    L[s0 + j] += v; R[s0 + j] += v
  }
}

// 5) Reverb: comb filters ขนานสองช่อง (Schroeder แบบย่อ)
function reverb(x, delays, fb, mix) {
  const out = new Float32Array(x.length)
  for (const d of delays) {
    const D = Math.floor(d * SR)
    const buf = new Float32Array(D)
    let p = 0, lp = 0
    for (let i = 0; i < x.length; i++) {
      const y = buf[p]
      lp += 0.35 * (y - lp)
      buf[p] = x[i] + lp * fb
      out[i] += y / delays.length
      p = (p + 1) % D
    }
  }
  for (let i = 0; i < x.length; i++) out[i] = x[i] * (1 - mix) + out[i] * mix * 2.2
  return out
}
let outL = reverb(L, [0.0297, 0.0371, 0.0411, 0.0437], 0.84, 0.4)
let outR = reverb(R, [0.0309, 0.0359, 0.0423, 0.0451], 0.84, 0.4)

// fade in/out + normalize
let peak = 0
for (let i = 0; i < N; i++) {
  const t = i / SR
  const g = Math.min(1, t / 3) * Math.min(1, (SCORE_SECONDS - t) / 4)
  outL[i] *= g; outR[i] *= g
  peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]))
}
const norm = 0.8 / peak
for (let i = 0; i < N; i++) { outL[i] *= norm; outR[i] *= norm }
wav('public/audio/score.wav', outL, outR)

// ── เสียงประกอบ UI ──
{ // whoosh: noise กรองแบบกวาดความถี่
  const n = Math.floor(SR * 0.9), a = new Float32Array(n), b = new Float32Array(n)
  let lp1 = 0, lp2 = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    const env = Math.sin(Math.PI * t) ** 2
    const c = 0.01 + 0.12 * Math.sin(Math.PI * t)
    lp1 += c * ((rand() * 2 - 1) - lp1); lp2 += c * ((rand() * 2 - 1) - lp2)
    a[i] = lp1 * env * 0.9; b[i] = lp2 * env * 0.9
  }
  wav('public/audio/whoosh.wav', a, b)
}
{ // tick: คลิกนุ่มสำหรับไฮไลต์/ปุ่ม
  const n = Math.floor(SR * 0.12), a = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = i / SR; a[i] = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 60) * 0.35 }
  wav('public/audio/tick.wav', a)
}
{ // chime: ระฆังสองโน้ตสำหรับ "ส่งแล้ว" / ปิดวง
  const n = Math.floor(SR * 2.2), a = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const n1 = Math.sin(2 * Math.PI * midi(84) * t) * Math.exp(-t * 3)
    const n2 = t > 0.12 ? Math.sin(2 * Math.PI * midi(91) * (t - 0.12)) * Math.exp(-(t - 0.12) * 2.5) : 0
    a[i] = (n1 + n2) * 0.22
  }
  wav('public/audio/chime.wav', a)
}
{ // click: เสียงกดเมาส์นุ่ม ๆ — ทรานเซียนต์สั้น + ตบต่ำเบา ๆ ตอนปล่อยปุ่ม
  const n = Math.floor(SR * 0.09), a = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const down = Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t * 180) * 0.5
    const body = Math.sin(2 * Math.PI * 520 * t) * Math.exp(-t * 90) * 0.25
    const up = t > 0.03 ? Math.sin(2 * Math.PI * 1900 * (t - 0.03)) * Math.exp(-(t - 0.03) * 220) * 0.28 : 0
    a[i] = down + body + up
  }
  wav('public/audio/click.wav', a)
}
