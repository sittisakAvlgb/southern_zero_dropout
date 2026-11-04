// ชนิดของ timeline.mjs (ไฟล์ .mjs ใช้ร่วมกับสคริปต์ Node จึงเขียนเป็น JS)
export type Box = { x: number; y: number; w: number; h: number }
export type RoleKey = 'teacher' | 'school' | 'esa' | 'obec'

// หนึ่งขั้นใน journey ของ role: หน้าจอที่ลงจอ + สิ่งที่เคอร์เซอร์ทำต่อ
export type Step = {
  img: string
  screen: string
  dur: number
  start: number
  title: string
  sub?: string
  focus?: Box
  mark?: Box
  click?: string // คีย์ของปุ่มใน boxes.json ที่เคอร์เซอร์จะกด (กดแล้วไปขั้นถัดไป)
  done?: boolean // ขั้นสุดท้ายของ role: มีเสียง chime ไม่มีปุ่มกด
  pip?: string // ชื่อภาพหน้าจอโหมดมือถือใน shots/ — ซ้อนเป็นกรอบโทรศัพท์ (ครูใช้งานบนมือถือ)
}

export type Scene = {
  id: string
  kind: 'school' | 'classroom' | 'signals' | 'logo' | 'journey' | 'chapter' | 'shot' | 'walk' | 'map' | 'loop' | 'pilot' | 'end'
  dur: number
  start: number
  title?: string
  sub?: string
  lines?: string[]
  role?: RoleKey
  no?: string
  img?: string
  screen?: string
  focus?: Box
  mark?: Box
  sfx?: 'chime'
  filled?: boolean
  steps?: Step[]
}

export type Sfx = { t: number; kind: 'whoosh' | 'click' | 'tick' | 'chime'; vol: number }

export declare const FPS: number
export declare const DEMO_URL: string
export declare const ROLE: Record<RoleKey, { th: string; color: string }>
export declare const SCENES: Scene[]
export declare const SCORE_SECONDS: number
export declare const SFX: Sfx[]
export declare const CLICK_AT: number
export declare const MUSIC: { src: string; length: number; credit: string; restartAt: number }
export declare const CUES: { teacher: number; climax: number; pilot: number; end: number }
