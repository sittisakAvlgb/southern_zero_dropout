// ─────────────────────────────────────────────────────────────
// บันทึกของเขตพื้นที่ — วงระหว่างโรงเรียนกับเขต
//
// ครูดูแลเด็ก → ผอ. ปลดอุปสรรคในโรงเรียน → เขตเข้ามาช่วยเมื่อโรงเรียนแก้ต่อเองไม่ไหว
// หรือปัญหาเกิดซ้ำหลายโรงเรียน ที่นี่เก็บ:
//   คำขอจากโรงเรียน (ผอ. ส่งขึ้นมา) · การตัดสินใจของเขต (ส่งกลับไปที่ ผอ.) ·
//   การสนับสนุนที่เขตริเริ่มเอง · มาตรการระดับเขต · ผลที่โรงเรียนรายงานกลับ
//
// เก็บต่อเขต (sbp-arealog:<esaKey>) ทั้ง ผอ. และเขตอ่านเขียนที่เดียวกัน ในเดโมนี้อยู่ใน
// เบราว์เซอร์เครื่องที่ใช้ ระบบจริงเก็บที่เซิร์ฟเวอร์
// ─────────────────────────────────────────────────────────────
import { useCallback, useSyncExternalStore } from 'react'
import { ESA_AREAS } from '@/data/esa'
import { SCHOOLS } from '@/data/schools'

/** สิ่งที่โรงเรียนขอจากเขต */
export type AreaNeed = 'psych' | 'agency' | 'budget' | 'complex' | 'people' | 'resource'
export const AREA_NEED_TH: Record<AreaNeed, string> = {
  psych: 'ขอผู้เชี่ยวชาญด้านจิตวิทยา',
  agency: 'ขอประสานหน่วยงานภายนอก',
  budget: 'ขอทรัพยากร / งบช่วยเหลือ',
  complex: 'เคสซับซ้อน โรงเรียนดำเนินการแล้วไม่สำเร็จ',
  people: 'ขอบุคลากรช่วยติดตามเคส',
  resource: 'ขอสนับสนุนทรัพยากร',
}

/** สิ่งที่เขตทำได้ — action ของเขตจริง ไม่ใช่ "ดูรายละเอียด" */
export type AreaAct = 'psychologist' | 'sendTeam' | 'coordinateAgency' | 'budget' | 'meeting' | 'escalate' | 'measure' | 'advise'
export const AREA_ACT_TH: Record<AreaAct, string> = {
  psychologist: 'จัดนักจิตวิทยาเขต',
  sendTeam: 'ส่งทีมสนับสนุนจากเขต',
  coordinateAgency: 'ประสานหน่วยงาน (พม. · สาธารณสุข)',
  budget: 'จัดงบช่วยเหลือ',
  meeting: 'เรียกประชุม ผอ.',
  escalate: 'ยกระดับถึงระดับจังหวัด',
  measure: 'สร้างมาตรการระดับเขต',
  advise: 'ส่งคำแนะนำกลับโรงเรียน',
}

export type AreaVerdict = 'approve' | 'needInfo' | 'sendBack' | 'reject'
export const AREA_VERDICT_TH: Record<AreaVerdict, string> = {
  approve: 'อนุมัติ',
  needInfo: 'ขอข้อมูลเพิ่ม',
  sendBack: 'ส่งกลับพร้อมคำแนะนำ',
  reject: 'ไม่อนุมัติ',
}

export interface AreaDecision {
  ts: number
  by: string
  verdict: AreaVerdict
  acts: AreaAct[]
  /** ผู้รับผิดชอบฝั่งเขต */
  owner: string
  due: string
  /** ผลที่คาดหวัง — ใช้ติดตามว่าการช่วยเหลือระดับเขตได้ผลไหม */
  expected: string
  note: string
}

export interface AreaRequest {
  id: string
  schoolId: string
  schoolName: string
  /** ผอ. ผู้ส่ง */
  by: string
  ts: number
  need: AreaNeed
  /** สิ่งที่โรงเรียนต้องการจากเขต */
  ask: string
  /** สิ่งที่โรงเรียนทำแล้ว */
  tried: string[]
  /** สิ่งที่ติดขัด */
  blocked: string
  urgency: 'high' | 'normal'
  /** เคสของเด็กที่ ผอ. ยกระดับมา (ถ้ามี) */
  childId?: string
  childName?: string
  decision?: AreaDecision
  /** โรงเรียนรายงานผลหลังทำตามที่เขตตัดสินใจ */
  done?: { ts: number; by: string; note: string }
  /** ตัวอย่างในเดโม (โรงเรียนอื่นในเขต) */
  sample?: boolean
}

/** การสนับสนุนที่เขตริเริ่มเอง (จากรายชื่อโรงเรียนที่ต้องช่วย) — ส่งไปที่ ผอ. เหมือนคำตอบคำขอ */
export interface AreaAction {
  id: string
  schoolId: string
  schoolName: string
  ts: number
  by: string
  acts: AreaAct[]
  owner: string
  due: string
  expected: string
  note: string
  done?: { ts: number; by: string; note: string }
}

/** มาตรการระดับเขตสำหรับปัญหาที่เกิดซ้ำหลายโรงเรียน */
export interface AreaMeasure {
  id: string
  ts: number
  by: string
  pattern: string
  title: string
  schools: string[]
  owner: string
  due: string
  expected: string
}

export interface AreaState {
  requests: AreaRequest[]
  actions: AreaAction[]
  measures: AreaMeasure[]
}

export type RequestStatus = 'new' | 'needInfo' | 'decided' | 'sentBack' | 'rejected' | 'done'
export function areaRequestStatus(r: AreaRequest): RequestStatus {
  if (r.done) return 'done'
  if (!r.decision) return 'new'
  return r.decision.verdict === 'approve' ? 'decided' : r.decision.verdict === 'needInfo' ? 'needInfo' : r.decision.verdict === 'sendBack' ? 'sentBack' : 'rejected'
}

/** เขตของโรงเรียน — ตัดสินจากอำเภอที่ตั้ง (ดู data/esa.ts) */
export function esaOfSchool(schoolId: string | undefined): string | undefined {
  const s = schoolId ? SCHOOLS.find((x) => x.id === schoolId) : undefined
  return s ? ESA_AREAS.find((e) => e.districtKeys.includes(s.districtKey))?.key : undefined
}

const D = 86400000

/** ตัวอย่างคำขอจากโรงเรียนอื่นในเขต — ให้เขตเห็นงานจริงตั้งแต่เปิดเดโม (โรงเรียนเดโม TOR-005 ส่งเองได้) */
function sampleRequests(esaKey: string): AreaRequest[] {
  const esa = ESA_AREAS.find((e) => e.key === esaKey)
  if (!esa) return []
  const others = SCHOOLS.filter((s) => esa.districtKeys.includes(s.districtKey) && s.id !== 'TOR-005').sort((a, b) => b.highRiskStudents - a.highRiskStudents)
  const now = Date.now()
  const tpl: Omit<AreaRequest, 'id' | 'schoolId' | 'schoolName' | 'by'>[] = [
    {
      ts: now - 2 * D,
      need: 'psych',
      ask: 'ขอนักจิตวิทยาเขตเข้ามาช่วยสัปดาห์ละ 1 วัน สำหรับนักเรียน 3 คนที่มีภาวะซึมเศร้า',
      tried: ['ครูแนะแนวคุยรายบุคคลแล้วทั้ง 3 คน', 'ประสาน รพ.สต. แล้ว แต่คิวพบแพทย์ยาว 2 เดือน'],
      blocked: 'โรงเรียนไม่มีนักจิตวิทยา ครูแนะแนวรับเคสเสี่ยงสูงเต็มแล้ว',
      urgency: 'high',
      sample: true,
    },
    {
      ts: now - 4 * D,
      need: 'agency',
      ask: 'ขอให้เขตประสาน พมจ. ระดับจังหวัด — ส่งเรื่องไป 3 เคสเกิน 2 สัปดาห์ยังไม่มีผู้รับ',
      tried: ['ครูโทรทวงถาม พมจ. 3 ครั้ง', 'ผอ. ทำหนังสือถึงหัวหน้าหน่วยงานแล้ว'],
      blocked: 'หน่วยงานปลายทางยังไม่รับเรื่อง เด็กขาดเรียนต่อเนื่อง',
      urgency: 'high',
      sample: true,
    },
    {
      ts: now - 1 * D,
      need: 'budget',
      ask: 'ขอทุนค่าเดินทางรายเดือนให้นักเรียน 6 คนที่บ้านอยู่ห่างโรงเรียนเกิน 15 กม.',
      tried: ['ใช้งบโรงเรียนช่วยไปแล้ว 2 เดือน', 'ขอ อบต. แล้ว ได้เฉพาะรายที่ยากจนมาก'],
      blocked: 'งบโรงเรียนหมด ปัญหาค่าเดินทางเป็นสาเหตุหลักของการขาดเรียน',
      urgency: 'normal',
      sample: true,
    },
  ]
  return others.slice(0, tpl.length).map((s, i) => ({
    ...tpl[i],
    id: `areq-sample-${s.id}`,
    schoolId: s.id,
    schoolName: s.name,
    by: `ผอ.โรงเรียน${s.name}`,
  }))
}

// ── store ร่วม ระหว่างหน้า ผอ. กับหน้าเขต ────────────────────
const EMPTY: AreaState = { requests: [], actions: [], measures: [] }
const cache = new Map<string, AreaState>()
const listeners = new Set<() => void>()
const storageKey = (esaKey: string) => `sbp-arealog:${esaKey}`

function load(esaKey: string): AreaState {
  const hit = cache.get(esaKey)
  if (hit) return hit
  let s: AreaState | undefined
  try {
    const raw = localStorage.getItem(storageKey(esaKey))
    if (raw) {
      const p = JSON.parse(raw) as Partial<AreaState>
      s = { requests: p.requests ?? [], actions: p.actions ?? [], measures: p.measures ?? [] }
    }
  } catch {
    /* ไม่มีที่เก็บ — ใช้ค่าตั้งต้น */
  }
  s ??= { ...EMPTY, requests: sampleRequests(esaKey) }
  cache.set(esaKey, s)
  return s
}

function save(esaKey: string, s: AreaState) {
  cache.set(esaKey, s)
  try {
    localStorage.setItem(storageKey(esaKey), JSON.stringify(s))
  } catch {
    /* เก็บไม่ได้ — ยังใช้ได้ในหน้านี้ */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('sbp-arealog:')) {
      cache.delete(e.key.slice('sbp-arealog:'.length))
      l()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

/** ล้างบันทึกของเขต (ปุ่มล้างข้อมูลทดสอบ) */
export function resetAreaLog(esaKey: string) {
  try {
    localStorage.removeItem(storageKey(esaKey))
  } catch {
    /* ไม่มีอะไรให้ล้าง */
  }
  cache.delete(esaKey)
  listeners.forEach((l) => l())
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

export function useAreaLog(esaKey: string | undefined) {
  const key = esaKey ?? ''
  const state = useSyncExternalStore(
    subscribe,
    () => (key ? load(key) : EMPTY),
    () => EMPTY,
  )
  const set = useCallback((f: (s: AreaState) => AreaState) => key && save(key, f(load(key))), [key])

  /** ผอ. ส่งคำขอถึงเขต */
  const addRequest = useCallback((r: Omit<AreaRequest, 'id' | 'ts'>) => {
    const id = uid('areq')
    set((s) => ({ ...s, requests: [{ ...r, id, ts: Date.now() }, ...s.requests] }))
    return id
  }, [set])

  /** เขตตัดสินใจ — ส่งกลับไปที่ ผอ. */
  const decide = useCallback((id: string, d: Omit<AreaDecision, 'ts'>) => {
    set((s) => ({ ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, decision: { ...d, ts: Date.now() }, done: undefined } : r)) }))
  }, [set])

  /** ผอ. รายงานผลหลังทำตามที่เขตตัดสินใจ */
  const reportRequest = useCallback((id: string, by: string, note: string) => {
    set((s) => ({ ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, done: { ts: Date.now(), by, note } } : r)) }))
  }, [set])

  /** เขตริเริ่มการสนับสนุนโรงเรียน */
  const addAction = useCallback((a: Omit<AreaAction, 'id' | 'ts'>) => {
    set((s) => ({ ...s, actions: [{ ...a, id: uid('aact'), ts: Date.now() }, ...s.actions] }))
  }, [set])

  const reportAction = useCallback((id: string, by: string, note: string) => {
    set((s) => ({ ...s, actions: s.actions.map((a) => (a.id === id ? { ...a, done: { ts: Date.now(), by, note } } : a)) }))
  }, [set])

  const addMeasure = useCallback((m: Omit<AreaMeasure, 'id' | 'ts'>) => {
    set((s) => ({ ...s, measures: [{ ...m, id: uid('ames'), ts: Date.now() }, ...s.measures] }))
  }, [set])

  return { ...state, addRequest, decide, reportRequest, addAction, reportAction, addMeasure }
}
