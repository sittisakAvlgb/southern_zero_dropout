// ─────────────────────────────────────────────────────────────
// Work the user records in the app: parent contacts, home visits and case
// ownership.
//
// The mock datasets are read-only, so anything a teacher does here used to live
// in one page's React state — a call logged at 09:00 was gone the moment they
// opened another student, and certainly gone after a reload. That is the single
// thing standing between this screen and something a teacher could actually
// carry into the field, so the log is kept in `localStorage`, namespaced per
// account, and every screen reads it through the same store.
//
// In a real deployment each `add()` is a POST and this file becomes the
// optimistic cache. Nothing else about the shape would change.
// ─────────────────────────────────────────────────────────────
import { useCallback, useSyncExternalStore } from 'react'
import type { CaseStage, CauseKey, InterventionEvent, OpportunityPlan, PlanStepStatus, ReferralNeed, Student } from '@/types'

export type LogMode = 'contact' | 'visit' | 'talk' | 'note'

/** อุปสรรคที่ครูเลือกได้เมื่อแผนเดินต่อไม่ได้ — ห้าข้อตาม brief
 *  แต่ละข้อมีทางเลือกถัดไปที่ AI เสนอใน lib/planOps.ts */
export type ObstacleKey = 'unreachable' | 'absent' | 'noFamilyInfo' | 'noCooperation' | 'needAgency'
export type ContactOutcome = 'reached' | 'appointment' | 'noAnswer' | 'wrongNumber' | 'refused'

/** What a home visit finds. None of it is seeded — it is empty until a teacher
 *  fills it in, which is the correct state for a family nobody has visited yet.
 *  The findings reuse the platform's own `CauseKey` vocabulary rather than a
 *  private checklist, so a visit feeds the same taxonomy `/cause` reports on. */
export interface FamilyProfile {
  guardianRelation?: string
  guardianName?: string
  occupation?: string
  /** monthly household income band — a band, not a figure, because that is what
   *  a family will actually tell a teacher at the door */
  incomeBand?: string
  members?: number
  housing?: string
  /** what the child has at home to study with */
  study: string[]
  findings: CauseKey[]
}

/** The acknowledgement a paper visit form takes as a signature.
 *
 *  In production this belongs in the case record on the server, alongside the
 *  rest of the visit, never in browser storage — it is written here only
 *  because this build has no write API. */
export interface VisitSignature {
  /** who signed, as they gave it */
  name: string
  /** device time of signing */
  at: string
  /** PNG data URL from the pad */
  image?: string
}

export interface CaseLogEntry {
  id: string
  childId: string
  mode: LogMode
  /** the day the contact happened, which is not always today */
  date: string
  channel?: string
  outcome?: ContactOutcome
  note: string
  by: string
  /** the day the teacher committed to coming back to this child */
  followUpDate?: string
  /** เวลานัด (HH:MM) และวิธีติดตาม เช่น โทรผู้ปกครอง · เยี่ยมบ้าน */
  followUpTime?: string
  followUpMethod?: string
  /** ใครเป็นคนไปตามนัดนี้ ถ้าไม่ใช่ผู้บันทึก */
  followUpOwner?: string
  /** การยกระดับที่ครูกดเอง เช่น "แจ้ง ผอ." — ไม่มีการยกระดับอัตโนมัติ */
  escalation?: string
  followUpDone?: boolean
  /** what this entry did to the child's own record */
  parentContact?: Student['parentContact']
  homeVisited?: boolean
  /** visit entries only */
  attendees?: string[]
  family?: FamilyProfile
  /** Device time the teacher marked arrival. No coordinate is recorded — see
   *  the note on `applyLog` below. */
  arrivedAt?: string
  signature?: VisitSignature
  /** a signed visit is the consent artefact the rest of the platform waits on */
  consent?: Student['consent']
  /** ขั้นของเคสหลังรายการนี้ — ตอนนี้ใช้กับการปิดเคสเท่านั้น ('resolved')
   *  ครูเป็นคนกดเสมอ ระบบเสนอได้แต่ไม่ปิดเอง */
  stage?: CaseStage
  /** ผลลัพธ์ของการช่วยเหลือครั้งนี้ ตามที่ครูบันทึก */
  result?: string
  /** ครูแจ้งว่าแผนติดอุปสรรค */
  obstacle?: ObstacleKey
  /** ส่งต่อจากหน้าเคสโดยตรง ไม่ต้องออกไปเริ่มใหม่ที่เมนูส่งต่อ */
  referral?: {
    agencyId: string
    agencyName: string
    reason: string
    /** ข้อมูลที่ครูเลือกให้หน่วยงานเห็น — คุมตาม PDPA และความยินยอม */
    share: string[]
  }
  /** ครอบครัวเห็นชอบแผนแล้ว */
  familyAgreed?: boolean
  /** บันทึกนี้เกิดจากการส่งต่อใน refs — ให้งานของครูนับว่าช่วยแล้ว
   *  แต่ timeline ข้ามหน่วยงานไม่แสดงซ้ำ */
  refId?: string
}

// ── การส่งต่อ ────────────────────────────────────────────────

/** ขั้นของการส่งต่อ — แยกละเอียดตาม brief ไม่ใช่แค่ "ส่งแล้ว" ทุกขั้นมีเวลา */
export type RefEventType =
  | 'sent' // ครูส่ง
  | 'received' // ระบบปลายทางได้รับ
  | 'viewed' // เจ้าหน้าที่เปิดดู
  | 'accepted' // รับเคสแล้ว (ระบุเจ้าหน้าที่)
  | 'started' // เริ่มดำเนินการ
  | 'needInfo' // ปลายทางขอข้อมูลเพิ่ม
  | 'infoSent' // ครูส่งข้อมูลเพิ่มแล้ว
  | 'done' // ปลายทางดำเนินการเสร็จ
  | 'outcome' // ส่งผลกลับ
  | 'closed' // ครูปิดการส่งต่อ
  | 'returned' // ปลายทางไม่รับ / ส่งกลับ
  | 'reminded' // ครูส่งการแจ้งเตือน
  | 'contacted' // ครูติดต่อหน่วยงาน
  | 'escalated' // ยกระดับ
  | 'reassigned' // เปลี่ยนหน่วยงาน
  | 'followUp' // ครูนัดติดตาม

export type OutcomeKey = 'granted' | 'treated' | 'visited' | 'documented' | 'followUp' | 'failed'
export type HandoffType = 'joint' | 'transfer'

export interface RefEvent {
  type: RefEventType
  /** เวลาเครื่อง (ms) */
  ts: number
  by: string
  note?: string
  /** เจ้าหน้าที่ปลายทางที่รับเคส */
  officer?: string
  /** ระดับการยกระดับ 1 แจ้งเตือน · 2 หัวหน้าหน่วยงาน · 3 ระดับสูงขึ้น */
  level?: 1 | 2 | 3
  outcome?: OutcomeKey
  toAgencyId?: string
  toAgencyName?: string
  /** นัดติดตามวันที่ (YYYY-MM-DD) */
  date?: string
}

/** การส่งต่อที่ครูสร้างจากในแอป */
export interface LocalReferral {
  id: string
  childId: string
  childName: string
  provinceKey: string
  need: ReferralNeed
  reason: string
  /** รหัสสาเหตุ สพฐ. ที่เป็นเหตุให้ส่งต่อ */
  reasonCode?: number
  toAgencyId: string
  toAgencyName: string
  fromName: string
  /** ข้อมูลที่ส่ง — ตรวจกับความยินยอมแล้วตอนสร้าง */
  share: string[]
  handoff: HandoffType
  /** ผู้รับผิดชอบการส่งต่อฝั่งโรงเรียน */
  referralOwner: string
  createdTs: number
}

/** ความยินยอม PDPA — เป็นขั้นตอนจริง ไม่ใช่ช่องติ๊ก ต้องตอบได้ว่าแชร์อะไร
 *  กับใคร เพื่ออะไร และถึงเมื่อไร */
export interface ConsentRecord {
  status: 'granted' | 'pending' | 'declined'
  /** ลงนามในแบบฟอร์ม · ยินยอมด้วยวาจาต่อหน้าพยาน · ผ่านไลน์/โทรศัพท์ (มีบันทึก) */
  method: string
  date: string
  giver: string
  relation: string
  scope: string[]
  /** 'any' = ทุกหน่วยงานในแผน หรือระบุ id */
  agencies: 'any' | string[]
  purpose: string
  expires: string
  evidence?: string
  ts: number
}

/** สถานะขั้นในแผนที่ครูเปลี่ยน — ทับข้อมูลตั้งต้นของแผน */
export interface PlanStepMark {
  status: PlanStepStatus
  at: string
  by: string
  note?: string
  /** เวลาเครื่องตอนติ๊ก — ใช้เรียง timeline ในวันเดียวกัน (`at` รู้แค่วันที่) */
  ts?: number
}

/** เวลาที่บันทึกถูกสร้าง ดึงจาก id ซึ่งขึ้นต้นด้วย Date.now() */
export const entryTs = (e: Pick<CaseLogEntry, 'id'>): number => Number(e.id.split('-')[1]) || 0

interface LogState {
  entries: CaseLogEntry[]
  /** childId → the person who took the case in this app */
  owners: Record<string, string>
  /** stepId → สถานะที่ครูเปลี่ยน
   *
   *  เดิมหน้าเส้นทางโอกาสเก็บขั้นที่ติ๊กเสร็จไว้ใน React state ของหน้าเอง
   *  รีโหลดแล้วหายหมด ทั้งที่ทุกอย่างอื่นที่ครูทำถูกเก็บถาวรที่นี่ */
  steps: Record<string, PlanStepMark>
  /** แผนที่ครูสร้างเอง childId → plan */
  plans: Record<string, OpportunityPlan>
  /** การส่งต่อที่ครูสร้าง refId → referral */
  refs: Record<string, LocalReferral>
  /** เหตุการณ์ของการส่งต่อทุกตัว ทั้งที่มาจากข้อมูลตั้งต้นและที่ครูสร้าง */
  refEvents: Record<string, RefEvent[]>
  /** ความยินยอมที่ครูบันทึก childId → record */
  consents: Record<string, ConsentRecord>
}

const EMPTY: LogState = { entries: [], owners: {}, steps: {}, plans: {}, refs: {}, refEvents: {}, consents: {} }

// ── the store ────────────────────────────────────────────────
let scope = 'anon'
let state: LogState = EMPTY
let loaded = false
const listeners = new Set<() => void>()

const keyFor = (who: string) => `sbp-caselog:${who}`

function read(who: string): LogState {
  try {
    const raw = localStorage.getItem(keyFor(who))
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<LogState>
    const obj = (v: unknown) => (v && typeof v === 'object' ? v : {})
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      owners: obj(parsed.owners) as LogState['owners'],
      // บันทึกรุ่นก่อนไม่มีสองช่องนี้ — อ่านเป็นว่างแทนที่จะพัง
      steps: obj(parsed.steps) as LogState['steps'],
      plans: obj(parsed.plans) as LogState['plans'],
      refs: obj(parsed.refs) as LogState['refs'],
      refEvents: obj(parsed.refEvents) as LogState['refEvents'],
      consents: obj(parsed.consents) as LogState['consents'],
    }
  } catch {
    // a private window, cleared site data, or a half-written value — an empty
    // log is always a safe answer here
    return EMPTY
  }
}

function write() {
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(state))
  } catch {
    // out of quota or storage blocked: the session keeps working in memory
  }
}

function emit() {
  for (const l of listeners) l()
}

function setState(next: LogState) {
  state = next
  write()
  emit()
}

/** Point the store at an account. Called on every render of the hook, so a
 *  sign-out followed by a different sign-in reloads that account's own log
 *  rather than leaking the previous one. */
function useScopeTo(who: string) {
  if (!loaded || scope !== who) {
    scope = who
    state = read(who)
    loaded = true
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

const snapshot = () => state

export function useCaseLog(userKey: string | undefined) {
  const who = userKey ?? 'anon'
  useScopeTo(who)
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)

  const add = useCallback((entry: Omit<CaseLogEntry, 'id'>) => {
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setState({ ...state, entries: [{ ...entry, id }, ...state.entries] })
    return id
  }, [])

  const remove = useCallback((id: string) => {
    setState({ ...state, entries: state.entries.filter((e) => e.id !== id) })
  }, [])

  const setFollowUpDone = useCallback((id: string, done: boolean) => {
    setState({
      ...state,
      entries: state.entries.map((e) => (e.id === id ? { ...e, followUpDone: done } : e)),
    })
  }, [])

  const setOwner = useCallback((childId: string, owner: string) => {
    setState({ ...state, owners: { ...state.owners, [childId]: owner } })
  }, [])

  const clearChild = useCallback((childId: string) => {
    const owners = { ...state.owners }
    delete owners[childId]
    const plans = { ...state.plans }
    delete plans[childId]
    const steps = Object.fromEntries(
      Object.entries(state.steps).filter(([id]) => !id.startsWith(`${childId}-`)),
    )
    const refs = Object.fromEntries(Object.entries(state.refs).filter(([, r]) => r.childId !== childId))
    const consents = { ...state.consents }
    delete consents[childId]
    setState({ ...state, entries: state.entries.filter((e) => e.childId !== childId), owners, steps, plans, refs, consents })
  }, [])

  const markStep = useCallback((stepId: string, mark: PlanStepMark) => {
    setState({ ...state, steps: { ...state.steps, [stepId]: { ts: Date.now(), ...mark } } })
  }, [])

  const savePlan = useCallback((plan: OpportunityPlan) => {
    setState({ ...state, plans: { ...state.plans, [plan.childId]: plan } })
  }, [])

  const addRef = useCallback((ref: LocalReferral, first: RefEvent[]) => {
    setState({ ...state, refs: { ...state.refs, [ref.id]: ref }, refEvents: { ...state.refEvents, [ref.id]: first } })
  }, [])

  const addRefEvent = useCallback((refId: string, ev: RefEvent) => {
    setState({ ...state, refEvents: { ...state.refEvents, [refId]: [...(state.refEvents[refId] ?? []), ev] } })
  }, [])

  /** เดโมเท่านั้น: เลื่อนเวลาของการส่งต่อที่ครูสร้างย้อนหลัง เพื่อให้เห็น SLA ใกล้เกิน/เกิน
   *  โดยไม่ต้องรอจริง — ข้อมูลตั้งต้นไม่ถูกแตะ */
  const shiftRef = useCallback((refId: string, hours: number) => {
    const ms = hours * 3600_000
    const r = state.refs[refId]
    if (!r) return
    setState({
      ...state,
      refs: { ...state.refs, [refId]: { ...r, createdTs: r.createdTs - ms } },
      refEvents: { ...state.refEvents, [refId]: (state.refEvents[refId] ?? []).map((e) => ({ ...e, ts: e.ts - ms })) },
    })
  }, [])

  const saveConsent = useCallback((childId: string, rec: ConsentRecord) => {
    setState({ ...state, consents: { ...state.consents, [childId]: rec } })
  }, [])

  return { ...current, add, remove, setFollowUpDone, setOwner, clearChild, markStep, savePlan, addRef, addRefEvent, shiftRef, saveConsent }
}

// ── reading the log back onto a child ────────────────────────

/** The child as the app now knows them: the seeded record with this account's
 *  own work layered on top. One definition, so the student page, the teacher
 *  workspace and anything else added later cannot disagree about whether a
 *  parent has been reached. */
export function applyLog(base: Student, log: LogState): Student {
  const mine = log.entries.filter((e) => e.childId === base.id)
  const owner = log.owners[base.id]
  if (!mine.length && !owner) return base

  // entries are newest-first, so the first one carrying a field wins
  const parentContact = mine.find((e) => e.parentContact)?.parentContact
  const visited = mine.some((e) => e.homeVisited)
  const consent = mine.find((e) => e.consent)?.consent
  const stage = mine.find((e) => e.stage)?.stage

  const extra: InterventionEvent[] = mine.map((e) => ({
    date: e.date,
    stageKey: e.stage ?? (e.mode === 'visit' ? 'homeVisit' : base.caseStage),
    note: e.note,
    by: e.by,
  }))

  return {
    ...base,
    caseOwner: owner ?? base.caseOwner,
    parentContact: parentContact ?? base.parentContact,
    homeVisited: visited || base.homeVisited,
    consent: consent ?? base.consent,
    caseStage: stage ?? base.caseStage,
    timeline: [...extra, ...base.timeline],
  }
}

/** The most recent home visit that recorded a family profile. */
export function lastVisit(childId: string, log: LogState): CaseLogEntry | undefined {
  return log.entries
    .filter((e) => e.childId === childId && e.mode === 'visit')
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

/** The most recent contact this account recorded for a child, if any. */
export function lastContact(childId: string, log: LogState): CaseLogEntry | undefined {
  return log.entries
    .filter((e) => e.childId === childId)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

export interface FollowUp {
  entry: CaseLogEntry
  /** negative when the date has already passed */
  daysAway: number
}

/** Appointments the account has committed to and not yet ticked off, soonest
 *  first. This is the only forward-looking date the platform holds — it exists
 *  because a teacher typed it, not because a scheduler was invented. */
export function openFollowUps(log: LogState, today = new Date()): FollowUp[] {
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return log.entries
    .filter((e) => e.followUpDate && !e.followUpDone)
    .map((entry) => {
      const [y, m, d] = entry.followUpDate!.split('-').map(Number)
      const at = Date.UTC(y, (m ?? 1) - 1, d ?? 1)
      return { entry, daysAway: Math.round((at - t0) / 86400000) }
    })
    .sort((a, b) => a.daysAway - b.daysAway)
}

/** วันล่าสุดที่ครูลงมือกับเด็กแต่ละคน (YYYY-MM-DD) — ใช้เริ่มนับกำหนดติดตามใหม่
 *
 *  นับทั้งบันทึกและการติ๊กขั้นในแผน แต่ไม่นับการ "นัด" อย่างเดียว: นัดคือ
 *  สัญญาว่าจะทำ ยังไม่ได้ทำ (Escalate ก็เช่นกัน) ถ้านับ ครูจะเคลียร์เคสเกิน SLA
 *  ได้ด้วยการกดนัดไปเรื่อย ๆ โดยไม่เคยติดต่อเด็กเลย — หน้าครูและหน้าติดตามใช้นิยามเดียวนี้ */
export function lastLoggedMap(log: Pick<LogState, 'entries' | 'steps'>): Record<string, string> {
  const out: Record<string, string> = {}
  const bump = (id: string, d: string) => {
    if (!out[id] || d > out[id]) out[id] = d
  }
  for (const e of log.entries) if (!isScheduleOnly(e)) bump(e.childId, e.date)
  for (const [stepId, m] of Object.entries(log.steps)) bump(stepId.replace(/-S\d+$/, ''), m.at)
  return out
}

/** งานเอกสารที่ไม่ได้แตะตัวเด็ก: นัด หรือ Escalate — บันทึกใน Timeline แต่ไม่นับเป็นการอัปเดตเคส */
export const isScheduleOnly = (e: CaseLogEntry) => (Boolean(e.followUpMethod) || Boolean(e.escalation)) && e.mode === 'note' && !e.result

// ── แผนตามที่บัญชีนี้ทำงานไว้ ────────────────────────────────

const daysBetween = (iso: string, today = new Date()) => {
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = iso.split('-').map(Number)
  return Math.max(0, Math.round((t0 - Date.UTC(y, (m ?? 1) - 1, d ?? 1)) / 86400000))
}

/** แผนทั้งหมดของบัญชีนี้: แผนตั้งต้น + แผนที่ครูสร้างเอง แล้วทับด้วยสถานะ
 *  ขั้นที่ครูเปลี่ยน — นิยามเดียว หน้าเส้นทางโอกาส หน้าครู และหน้าแฟ้มเด็ก
 *  จึงเห็นแผนตรงกันเสมอ */
export function applyPlans(base: OpportunityPlan[], log: LogState): OpportunityPlan[] {
  const own = Object.values(log.plans).filter((p) => !base.some((b) => b.childId === p.childId))
  return [...base, ...own].map((p) => {
    const marks = p.steps.map((s) => log.steps[s.id])
    const touched = marks.some(Boolean)
    let steps = p.steps.map((s, i) => (marks[i] ? { ...s, status: marks[i]!.status } : s))
    // ทำขั้นปัจจุบันเสร็จแล้ว ขั้นถัดไปต้องเปิดเอง ไม่งั้นแผนจะค้างโดยไม่มีขั้นที่กำลังทำ
    if (touched && !steps.some((s) => s.status === 'active' || s.status === 'blocked')) {
      const next = steps.findIndex((s) => s.status === 'pending')
      if (next >= 0) steps = steps.map((s, i) => (i === next ? { ...s, status: 'active' } : s))
    }
    const done = steps.filter((s) => s.status === 'done').length
    const mine = log.entries.filter((e) => e.childId === p.childId)
    const latest = [
      ...marks.filter(Boolean).map((m) => m!.at),
      ...mine.map((e) => e.date),
    ].sort().at(-1)
    return {
      ...p,
      steps,
      progress: Math.round((done / Math.max(1, steps.length)) * 100),
      reviewedDaysAgo: latest ? Math.min(p.reviewedDaysAgo, daysBetween(latest)) : p.reviewedDaysAgo,
      agreedByFamily: p.agreedByFamily || mine.some((e) => e.familyAgreed),
    }
  })
}
