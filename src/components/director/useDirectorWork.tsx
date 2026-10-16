import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useScopedData } from '@/auth/scope'
import { applyPlans, requestStatus } from '@/lib/caseLog'
import { buildCase } from '@/lib/planOps'
import { directorInbox } from '@/lib/directorOps'
import { directorQueue, inPlanQueue, inRefQueue } from '@/lib/directorDeskOps'
import { inOoscQueue, viewOosc } from '@/lib/ooscOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { byOf, useRefCases } from '@/components/referrals/useRefCases'

/**
 * งานที่รอ ผอ. ทั้งโรงเรียน — แหล่งเดียวของตัวเลขบนเมนู กระดิ่ง และหน้าภาพรวม
 * ใช้กฎคิวชุดเดียวกับหน้าแต่ละหน้า (directorQueue · inPlanQueue · inRefQueue · inOoscQueue)
 * ตัวเลขบนเมนูจึงเท่ากับ "ต้องใช้ ผอ." ในหน้านั้นเสมอ
 */
export interface DirectorWork {
  /** หน้าเรื่องที่ต้องตัดสินใจ: คำขอจากครู + เรื่องที่ AI พบว่าค้าง */
  decisions: number
  asks: number
  found: number
  /** งานที่ ผอ. ส่งกลับไปแล้วเลยกำหนด */
  lateBack: number
  plans: number
  referrals: number
  oosc: number
  /** เคสที่ติดตามในระบบซึ่งเกิน SLA */
  breach: number
  total: number
}

const Ctx = createContext<DirectorWork | null>(null)

/** null เมื่อไม่ใช่ ผอ. */
export const useDirectorWork = () => useContext(Ctx)

export function DirectorWorkProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // คำนวณเฉพาะบัญชี ผอ. — บทบาทอื่นไม่ต้องจ่ายค่าคำนวณเคสทั้งหมดทุกหน้า
  if (user?.role !== 'school') return <>{children}</>
  return <Compute>{children}</Compute>
}

function Compute({ children }: { children: ReactNode }) {
  const { plans, students, referrals, oosc } = useScopedData()
  const { user, log, built } = useFollowCases()
  const [now] = useState(() => Date.now())
  const by = byOf(user)
  const fc = useMemo(() => ('list' in built ? built.list : []), [built])
  const roster = useMemo(() => fc.map((c) => c.s), [fc])
  const refs = useRefCases(user, roster.length ? roster : students, referrals, log, now)

  const work = useMemo<DirectorWork>(() => {
    const requests = Object.values(log.requests)
    const q = directorQueue(directorInbox(fc, requests), log.entries)
    const today = new Date().toISOString().slice(0, 10)
    const lateBack = requests.filter((r) => requestStatus(r) === 'withTeacher' && (r.decisions.at(-1)?.next?.due ?? '9') < today).length

    const byId = new Map(roster.map((s) => [s.id, s]))
    const ooscOwner = new Map(oosc.map((r) => [r.id, r.ownerName]))
    const ownerOf = (id: string) => byId.get(id)?.caseOwner || log.owners[id] || ooscOwner.get(id) || undefined
    const planN = applyPlans(plans, log)
      .map((p) => buildCase(p, byId.get(p.childId), log.entries, true))
      .filter((c) => inPlanQueue(c, ownerOf(c.plan.childId), log.entries)).length
    const refN = refs.filter((r) => inRefQueue(r, now, by)).length
    const ooscN = oosc.map((r) => viewOosc(r, log)).filter(inOoscQueue).length
    const breach = fc.filter((c) => c.open && c.sla.level === 'breach').length
    return {
      decisions: q.waiting,
      asks: q.asks.length,
      found: q.found.length,
      lateBack,
      plans: planN,
      referrals: refN,
      oosc: ooscN,
      breach,
      total: q.waiting + planN + refN + ooscN,
    }
  }, [fc, roster, log, plans, refs, oosc, now, by])

  return <Ctx.Provider value={work}>{children}</Ctx.Provider>
}
