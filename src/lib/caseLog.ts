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
import type { CauseKey, InterventionEvent, Student } from '@/types'

export type LogMode = 'contact' | 'visit'
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
}

interface LogState {
  entries: CaseLogEntry[]
  /** childId → the person who took the case in this app */
  owners: Record<string, string>
}

const EMPTY: LogState = { entries: [], owners: {} }

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
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      owners: parsed.owners && typeof parsed.owners === 'object' ? parsed.owners : {},
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
    setState({ entries: state.entries.filter((e) => e.childId !== childId), owners })
  }, [])

  return { ...current, add, remove, setFollowUpDone, setOwner, clearChild }
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

  const extra: InterventionEvent[] = mine.map((e) => ({
    date: e.date,
    stageKey: e.mode === 'visit' ? 'homeVisit' : base.caseStage,
    note: e.note,
    by: e.by,
  }))

  return {
    ...base,
    caseOwner: owner ?? base.caseOwner,
    parentContact: parentContact ?? base.parentContact,
    homeVisited: visited || base.homeVisited,
    consent: consent ?? base.consent,
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
