import { useMemo } from 'react'
import { useScopedData } from '@/auth/scope'
import { applyLog, applyPlans, lastLoggedMap, useCaseLog } from '@/lib/caseLog'
import { buildFollowCase, sortFollow, type FollowCase } from '@/lib/followOps'
import { useRefCases } from '@/components/referrals/useRefCases'

/**
 * เคสติดตามของเด็กทุกคนในความดูแล — นิยามเดียวที่หน้าติดตามการช่วยเหลือ
 * และหน้าข้อมูลเด็กรายบุคคลใช้ร่วมกัน เด็กคนเดียวกันจึงได้ "สิ่งที่ต้องทำต่อ"
 * และไทม์ไลน์ชุดเดียวกันไม่ว่าจะเปิดจากหน้าไหน
 */
export function useFollowCases() {
  const { user, students, cases, referrals, plans } = useScopedData()
  const log = useCaseLog(user?.id)
  const now = useMemo(() => Date.now(), [log]) // eslint-disable-line react-hooks/exhaustive-deps
  const roster = useMemo(() => students.map((s) => applyLog(s, log)), [students, log])
  const refs = useRefCases(user, roster, referrals, log, now)
  const planned = useMemo(() => new Set(applyPlans(plans, log).map((p) => p.childId)), [plans, log])

  const built = useMemo((): { list: FollowCase[] } | { error: true } => {
    try {
      const lastLogged = lastLoggedMap(log)
      // เคสเชื่อมกับเด็กด้วยชื่อ — เหมือนหน้าเคสของฉัน (ดู teacherOps)
      const byName = new Map(cases.map((c) => [c.studentName, c]))
      const list = roster.map((s) =>
        buildFollowCase({
          s,
          record: byName.get(s.name),
          entries: log.entries.filter((e) => e.childId === s.id),
          lastLogged: lastLogged[s.id],
          refs: refs.filter((r) => r.childId === s.id),
          hasPlan: planned.has(s.id),
        }),
      )
      return { list: sortFollow(list) }
    } catch {
      return { error: true }
    }
  }, [roster, cases, log, refs, planned])

  return { user, log, built }
}
