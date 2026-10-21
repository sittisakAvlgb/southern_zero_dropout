import { useEffect, useRef } from 'react'

/** ลิ้นชักซ้อนกันได้ (เคส → แผ่นงาน) — Escape ต้องปิดใบบนสุดใบเดียว ไม่ใช่ทั้งตั้ง
 *  เหมือน `useScrollLock` ที่นับใบที่เปิดอยู่ ที่นี่เก็บเป็นลำดับว่าใครเปิดทีหลัง */
const stack: symbol[] = []

/** สิ่งที่รับโฟกัสได้จริงในลิ้นชัก — เรียงตามลำดับใน DOM ซึ่งเป็นลำดับที่ Tab เดิน
 *
 *  กรองสองชั้น: ตัวที่ปิดไว้ (`disabled` · `tabindex="-1"` · `aria-hidden`) และตัวที่
 *  ซ่อนอยู่ตอนนี้ — การ์ดที่ยังไม่กางมีปุ่มอยู่ข้างในแต่ `display:none` ถ้านับด้วย
 *  Tab จะวิ่งไปจุดที่มองไม่เห็นแล้วเหมือนโฟกัสหายไปเฉย ๆ */
const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]'
const focusables = (box: HTMLElement): HTMLElement[] =>
  [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('tabindex') !== '-1' &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.getClientRects().length > 0,
  )

/**
 * กด Escape ปิด · ขังโฟกัสไว้ในลิ้นชัก · ย้ายโฟกัสเข้าตอนเปิด คืนให้ปุ่มเดิมตอนปิด
 *
 * ลิ้นชักของโปรเจกต์นี้มี `role="dialog"` กับ `aria-modal="true"` และปิดด้วยการ
 * คลิกฉากหลังได้อยู่แล้ว แต่ไม่มีสามอย่างนี้ ซึ่งเป็นสิ่งที่คนใช้คีย์บอร์ดเจอก่อน
 * เพื่อนเลย: กด Escape แล้วไม่มีอะไรเกิดขึ้น · พอเปิดลิ้นชักมาโฟกัสยังค้างอยู่ที่
 * ปุ่มเดิมหลังฉากหลัง กด Tab ทีแรกจึงไปโผล่ที่เมนูด้านหลังแทนที่จะเป็นเนื้อหาที่
 * เพิ่งเปิด · และกด Tab ไปเรื่อย ๆ ก็เดินออกไปอยู่หลังฉากทั้งที่ลิ้นชักยังเปิดค้าง
 *
 * คืนโฟกัสด้วยเสมอ — ย้ายเข้าแล้วไม่คืน ครูที่ไล่ดูเคสทีละคนด้วยคีย์บอร์ดจะเสีย
 * ตำแหน่งในรายการทุกครั้งที่ปิดลิ้นชัก ซึ่งแย่กว่าไม่ย้ายโฟกัสตั้งแต่แรก
 *
 * `aria-modal` บอกโปรแกรมอ่านหน้าจอให้ข้ามเนื้อหาด้านหลังอยู่แล้ว การขังโฟกัสคือ
 * การทำให้ปุ่ม Tab เชื่อเรื่องเดียวกันนั้น
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
      if (stack[stack.length - 1] !== me) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const box = ref.current
      if (!box) return
      // หาใหม่ทุกครั้ง เนื้อหาในลิ้นชักเปลี่ยนได้ระหว่างเปิด (กางการ์ด · สลับแท็บ)
      const items = focusables(box)
      if (!items.length) {
        e.preventDefault()
        box.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement as HTMLElement | null
      // โฟกัสหลุดออกไปข้างหลังแล้ว (คลิกฉากหลังแล้วกด Tab) — ดึงกลับเข้ามา
      if (!at || !box.contains(at)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus({ preventScroll: true })
        return
      }
      if (e.shiftKey && at === first) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && at === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', onKey)

    const was = document.activeElement as HTMLElement | null
    /** รอให้ลิ้นชักถูกวาดก่อน — ตอน effect ทำงานครั้งแรก framer-motion ยังเลื่อน
     *  ตัวอยู่ และปุ่มปิดอาจยังไม่รับโฟกัส */
    const t = window.setTimeout(() => {
      const box = ref.current
      if (!box || box.contains(document.activeElement)) return
      ;(focusables(box)[0] ?? box).focus({ preventScroll: true })
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
