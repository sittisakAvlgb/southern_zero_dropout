import { useMemo } from 'react'
import type { Referral, Student } from '@/types'
import type { User } from '@/auth/roles'
import { SCHOOL_BY_ID } from '@/data/schools'
import { entryTs, type LocalReferral, type RefEvent, type useCaseLog } from '@/lib/caseLog'
import { buildRefCase, consentOf, sortRefs, type RefCase } from '@/lib/refOps'

export type Log = ReturnType<typeof useCaseLog>

export const byOf = (user: User | null) => user?.ownerName ?? user?.name ?? 'ครูผู้รับผิดชอบ'
/** ผู้ส่งคือโรงเรียน ไม่ใช่ตัวครู — ชื่อเดียวกับที่ข้อมูลตั้งต้นใช้ (`โรงเรียน${name}`) */
export const schoolOf = (user: User | null) => {
  const sc = user?.schoolKey ? SCHOOL_BY_ID[user.schoolKey] : undefined
  return sc ? `โรงเรียน${sc.name}` : user?.org ?? 'โรงเรียน'
}

/**
 * การส่งต่อทุกรายการของเด็กในความดูแล — ข้อมูลตั้งต้น + ที่ครูสร้างในแอป +
 * ที่ส่งจากหน้าเคสด้วยตัวเก่า (entry.referral) ซึ่งตอนนั้นยังไม่มีเหตุการณ์
 * ให้ติดตาม ทุกหน้าที่แสดงการส่งต่อของครูต้องอ่านผ่านตัวนี้
 */
export function useRefCases(
  user: User | null,
  roster: Student[],
  referrals: Referral[],
  log: Log,
  now: number,
) {
  return useMemo(() => {
    const byId = new Map(roster.map((s) => [s.id, s]))
    // ความยินยอมเป็นของเด็ก ไม่ใช่ของการส่งต่อแต่ละรายการ — ใช้สถานะของเด็กก่อน
    // ไม่งั้นหน้าเด็กบอก "ยังไม่ได้ความยินยอม" แต่หน้าส่งต่อบอก "ยินยอมแล้ว"
    const consentFor = (childId: string, seeded?: Referral['consent']) =>
      consentOf(childId, byId.get(childId)?.consent ?? seeded, byId.get(childId), log.consents[childId], now)

    const out: RefCase[] = []
    for (const r of referrals) {
      const st = byId.get(r.childId)
      out.push(
        buildRefCase({
          seeded: r,
          logEvents: log.refEvents[r.id] ?? [],
          student: st,
          consent: consentFor(r.childId, r.consent),
          caseOwner: st?.caseOwner ?? byOf(user),
          now,
        }),
      )
    }

    const locals: LocalReferral[] = Object.values(log.refs)
    // ตัวเก่า: ส่งจากหน้าเคสก่อนมีระบบติดตาม — แปลงเป็นการส่งต่อที่ติดตามได้
    for (const e of log.entries) {
      if (!e.referral || e.refId) continue
      const id = `legacy-${e.id}`
      if (log.refs[id]) continue
      const st = byId.get(e.childId)
      locals.push({
        id,
        childId: e.childId,
        childName: st?.name ?? '',
        provinceKey: st?.provinceKey ?? '',
        need: 'financial',
        reason: e.referral.reason,
        toAgencyId: e.referral.agencyId,
        toAgencyName: e.referral.agencyName,
        fromName: schoolOf(user),
        share: e.referral.share,
        handoff: 'joint',
        referralOwner: e.by,
        createdTs: entryTs(e),
      })
    }
    for (const l of locals) {
      const st = byId.get(l.childId)
      // ตัวที่สร้างด้วย addRef มีเหตุการณ์แรกเก็บไว้แล้ว ตัวเก่าไม่มี จึงเติมให้
      const stored = log.refEvents[l.id] ?? []
      const first: RefEvent[] = log.refs[l.id]
        ? stored
        : [
            { type: 'sent', ts: l.createdTs, by: l.fromName },
            ...stored,
          ]
      out.push(
        buildRefCase({
          local: l,
          logEvents: first,
          student: st,
          consent: consentFor(l.childId),
          caseOwner: st?.caseOwner ?? byOf(user),
          now,
        }),
      )
    }
    return sortRefs(out)
  }, [user, roster, referrals, log.refs, log.refEvents, log.consents, log.entries, now])
}

/** กลุ่มตามเด็ก — เด็กหนึ่งคนส่งต่อหลายหน่วยงานได้ แต่เป็นเคสเดียวกัน */
export function groupByChild(refs: RefCase[]) {
  const m = new Map<string, RefCase[]>()
  for (const r of refs) m.set(r.childId, [...(m.get(r.childId) ?? []), r])
  // refs เรียงมาแล้ว ตัวแรกของแต่ละกลุ่มคือตัวที่แย่ที่สุด
  return [...m.values()]
}
