// ─────────────────────────────────────────────────────────────
// สาเหตุความเสี่ยง — คิดจากเด็กที่อยู่ในขอบเขตบัญชีจริง
//
// เดิมหน้าวิเคราะห์สาเหตุอ่าน `Province.topCauses` ซึ่งเป็นค่าสำเร็จรูประดับ
// จังหวัด และ `narrowToScope()` ใน auth/scope.ts คำนวณใหม่ให้ 15 ฟิลด์แต่
// **ไม่ได้คำนวณ `topCauses`** มันตกผ่าน `...p` เขตจึงเห็นจำนวนเด็กเสี่ยงสูง
// ของเขตตัวเอง (ถูก) อยู่ข้างสัดส่วนสาเหตุของทั้งจังหวัด (ผิด) — ตัวเลขสองชุด
// บนหน้าจอเดียว ซึ่งเป็นสิ่งที่ skill.md ห้ามไว้
//
// ที่นี่คิดจาก `causeKeys` ของเด็กแต่ละคนที่ `useScopedData()` กรองมาแล้ว
// ตัวเลขจึงเปลี่ยนตามบัญชี และตรงกับเด็กที่หน้าอื่นนับ
// ─────────────────────────────────────────────────────────────
import type { CauseKey, CauseWeight, OoscRecord, Student } from '@/types'
import { esaOfDistrict } from '@/data/esa'

/** หนึ่งเด็กนับหนึ่งสาเหตุ — สาเหตุหลัก (`causeKeys[0]`)
 *
 *  ถ้านับทุกคีย์ ตัวหารจะกลายเป็น "จำนวนครั้งที่ถูกระบุ" ไม่ใช่ "จำนวนเด็ก"
 *  แล้ว 13.2% จะไม่ได้แปลว่าเด็ก 13.2% อีกต่อไป · กติกาเดียวกับ `bottleneckOf()`
 *  ใน areaDeskOps.ts ที่ใช้ `causeKeys[0]` เหมือนกัน */
const primary = (c: { causeKeys: CauseKey[] }): CauseKey | undefined => c.causeKeys[0]

/** เด็กที่หน้านี้พูดถึง: เสี่ยงสูงที่ยังอยู่ในระบบ + เด็กที่หลุดไปแล้วและยังไม่กลับ
 *
 *  "ยังไม่กลับ" ใช้นิยามเดียวกับทั้งแอป (`outOfSchool` + `unreachable` — ดู
 *  skill.md) เด็กที่กลับเข้าเรียนหรือมีอาชีพแล้วไม่ถูกนับ เพราะอยู่ในตัวเลข
 *  ความสำเร็จของหน้าอื่น การนับซ้ำที่นี่จะทำให้สองหน้าบอกคนละเรื่อง */
export const atRiskOf = (students: Student[]): Student[] =>
  students.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical')
export const stillOutOf = (oosc: OoscRecord[]): OoscRecord[] =>
  oosc.filter((r) => r.status === 'outOfSchool' || r.status === 'unreachable')

export interface CauseMix {
  dist: CauseWeight[]
  /** ตัวหารจริง เอาไปพิมพ์บนหน้า อย่าให้ผู้ใช้เดาว่าคิดจากกี่คน */
  base: { atRisk: number; stillOut: number; total: number }
}

/** สัดส่วนสาเหตุหลักของเด็กในขอบเขตนี้ เรียงมากไปน้อย */
export function causeMix(students: Student[], oosc: OoscRecord[]): CauseMix {
  const atRisk = atRiskOf(students)
  const stillOut = stillOutOf(oosc)
  const acc = new Map<CauseKey, number>()
  let total = 0
  for (const c of [...atRisk, ...stillOut]) {
    const k = primary(c)
    if (!k) continue
    acc.set(k, (acc.get(k) ?? 0) + 1)
    total++
  }
  const dist = [...acc.entries()]
    .map(([key, n]) => ({ key, value: Math.round((n / Math.max(1, total)) * 1000) / 10 }))
    .sort((a, b) => b.value - a.value)
  return { dist, base: { atRisk: atRisk.length, stillOut: stillOut.length, total } }
}

/** จำนวนเด็กของสาเหตุหนึ่ง แยกตามอำเภอ เรียงมากไปน้อย
 *
 *  นี่คือสิ่งที่เขตเอาไปใช้ได้จริง — รู้ว่าสาเหตุนำคืออะไรยังไม่พอ ต้องรู้ว่า
 *  มันกระจุกอยู่อำเภอไหน ถึงจะตัดสินใจได้ว่าจะลงไปหนุนที่ใดก่อน */
export function byDistrict(
  key: CauseKey,
  students: Student[],
  oosc: OoscRecord[],
): { districtKey: string; n: number; share: number }[] {
  const rows = [...atRiskOf(students), ...stillOutOf(oosc)].filter((c) => primary(c) === key)
  const acc = new Map<string, number>()
  for (const r of rows) acc.set(r.districtKey, (acc.get(r.districtKey) ?? 0) + 1)
  const total = rows.length || 1
  return [...acc.entries()]
    .map(([districtKey, n]) => ({ districtKey, n, share: Math.round((n / total) * 1000) / 10 }))
    .sort((a, b) => b.n - a.n)
}

/** จำนวนเด็กของสาเหตุหนึ่ง แยกตามเขตพื้นที่การศึกษา
 *
 *  หน่วยของ สพฐ. คือเขต ไม่ใช่จังหวัด (ดู skill.md) — "สาเหตุนี้กระจุกที่เขตไหน"
 *  คือคำถามที่ สพฐ. เอาไปสั่งการต่อได้ ส่วนอำเภออยู่ในกราฟเปรียบเทียบด้านล่าง */
export function byEsa(
  key: CauseKey,
  students: Student[],
  oosc: OoscRecord[],
): { esaKey: string; n: number; share: number }[] {
  const rows = [...atRiskOf(students), ...stillOutOf(oosc)].filter((c) => primary(c) === key)
  const acc = new Map<string, number>()
  for (const r of rows) {
    const k = esaOfDistrict(r.districtKey)
    if (!k) continue
    acc.set(k, (acc.get(k) ?? 0) + 1)
  }
  const total = rows.length || 1
  return [...acc.entries()]
    .map(([esaKey, n]) => ({ esaKey, n, share: Math.round((n / total) * 1000) / 10 }))
    .sort((a, b) => b.n - a.n)
}

/** เด็กในขอบเขต แยกตามเขต — ใช้ทำกราฟเปรียบเทียบรายเขตของ สพฐ. */
export function esaCauseRows(
  students: Student[],
  oosc: OoscRecord[],
): { esaKey: string; total: number; counts: Record<string, number> }[] {
  const acc = new Map<string, { total: number; counts: Record<string, number> }>()
  for (const r of [...atRiskOf(students), ...stillOutOf(oosc)]) {
    const k = primary(r)
    const e = esaOfDistrict(r.districtKey)
    if (!k || !e) continue
    const row = acc.get(e) ?? { total: 0, counts: {} }
    row.total++
    row.counts[k] = (row.counts[k] ?? 0) + 1
    acc.set(e, row)
  }
  return [...acc.entries()]
    .map(([esaKey, v]) => ({ esaKey, ...v }))
    .sort((a, b) => b.total - a.total)
}
