import { useEffect } from 'react'

/** ลิ้นชักที่เปิดอยู่ตอนนี้ — นับไว้เพราะลิ้นชักซ้อนกันได้ (เช่น เคส → แผ่นงาน)
 *  ปลดล็อกเมื่อตัวสุดท้ายปิดเท่านั้น */
let open = 0
let saved: { overflow: string; paddingRight: string } | null = null

/**
 * ล็อกการเลื่อนของหน้าหลังขณะลิ้นชักเปิด
 *
 * เดิมหน้าหลังยังเลื่อนได้ จึงมีแถบเลื่อนสองอันซ้อนกัน (ของลิ้นชักกับของหน้า) และหมุนเมาส์
 * เลยขอบลิ้นชักแล้วหน้าหลังเลื่อนตามไปด้วย ใส่ padding เท่าความกว้างแถบเลื่อนที่หายไป
 * ไม่งั้นหน้าหลังกระตุกไปทางขวาตอนเปิดลิ้นชัก
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    if (open === 0) {
      const bar = window.innerWidth - root.clientWidth
      saved = { overflow: root.style.overflow, paddingRight: root.style.paddingRight }
      root.style.overflow = 'hidden'
      if (bar > 0) root.style.paddingRight = `${bar}px`
    }
    open += 1
    return () => {
      open -= 1
      if (open === 0 && saved) {
        root.style.overflow = saved.overflow
        root.style.paddingRight = saved.paddingRight
        saved = null
      }
    }
  }, [active])
}
