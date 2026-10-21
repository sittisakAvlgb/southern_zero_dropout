import { useEffect, useRef } from 'react'

/** ลิ้นชักซ้อนกันได้ (เคส → แผ่นงาน) — Escape ต้องปิดใบบนสุดใบเดียว ไม่ใช่ทั้งตั้ง
 *  เหมือน `useScrollLock` ที่นับใบที่เปิดอยู่ ที่นี่เก็บเป็นลำดับว่าใครเปิดทีหลัง */
const stack: symbol[] = []

/**
 * กด Escape ปิด · ย้ายโฟกัสเข้าลิ้นชักตอนเปิด · คืนโฟกัสให้ปุ่มเดิมตอนปิด
 *
 * ลิ้นชักของโปรเจกต์นี้มี `role="dialog"` กับ `aria-modal="true"` และปิดด้วยการ
 * คลิกฉากหลังได้อยู่แล้ว แต่ไม่มีสองอย่างนี้ ซึ่งเป็นสิ่งที่คนใช้คีย์บอร์ดเจอก่อน
 * เพื่อนเลย: กด Escape แล้วไม่มีอะไรเกิดขึ้น และพอเปิดลิ้นชักมาโฟกัสยังค้างอยู่ที่
 * ปุ่มเดิมหลังฉากหลัง กด Tab ทีแรกจึงไปโผล่ที่เมนูด้านหลังแทนที่จะเป็นเนื้อหาที่
 * เพิ่งเปิด (และโปรแกรมอ่านหน้าจอก็ไม่ประกาศว่ามีอะไรเปิดขึ้นมา)
 *
 * คืนโฟกัสด้วยเสมอ — ย้ายเข้าแล้วไม่คืน ครูที่ไล่ดูเคสทีละคนด้วยคีย์บอร์ดจะเสีย
 * ตำแหน่งในรายการทุกครั้งที่ปิดลิ้นชัก ซึ่งแย่กว่าไม่ย้ายโฟกัสตั้งแต่แรก
 *
 * ยังไม่ได้ขังโฟกัส (focus trap) ไว้ในลิ้นชัก — `aria-modal` บอกโปรแกรมอ่านหน้าจอ
 * ให้ข้ามเนื้อหาด้านหลังแล้ว แต่ปุ่ม Tab ยังเดินออกไปข้างหลังได้
 */
export function useDialogDismiss<T extends HTMLElement>(
  onClose: () => void,
  /** บางหน้าเมาท์กล่องไว้ตลอดแล้ว return null เมื่อยังไม่มีอะไรให้เปิด
   *  ส่ง false มาตอนนั้น ไม่งั้นกล่องที่ยังไม่ได้เปิดจะแย่งโฟกัสไป */
  active = true,
) {
  const ref = useRef<T>(null)
  /** อ่านค่าล่าสุดตอนกดปุ่ม — ไม่งั้นต้องผูก/ถอด listener ใหม่ทุกครั้งที่
   *  ผู้เรียกส่ง closure ใหม่เข้ามา (ซึ่งคือทุกการเรนเดอร์) */
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!active) return
    const me = Symbol('dialog')
    stack.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (stack[stack.length - 1] !== me) return
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', onKey)

    const was = document.activeElement as HTMLElement | null
    /** รอให้ลิ้นชักถูกวาดก่อน — ตอน effect ทำงานครั้งแรก framer-motion ยังเลื่อน
     *  ตัวอยู่ และปุ่มปิดอาจยังไม่รับโฟกัส */
    const t = window.setTimeout(() => {
      const box = ref.current
      if (!box || box.contains(document.activeElement)) return
      const first = box.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      ;(first ?? box).focus({ preventScroll: true })
    }, 0)

    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      const i = stack.indexOf(me)
      if (i >= 0) stack.splice(i, 1)
      // คืนโฟกัสเฉพาะตอนที่ยังอยู่ในลิ้นชักที่กำลังปิด ถ้าผู้ใช้ไปคลิกที่อื่นแล้ว
      // การดึงกลับคือการแย่งโฟกัสจากสิ่งที่เขาเพิ่งเลือกเอง
      if (was && document.body.contains(was) && (!ref.current || ref.current.contains(document.activeElement))) {
        was.focus({ preventScroll: true })
      }
    }
  }, [active])

  return ref
}
