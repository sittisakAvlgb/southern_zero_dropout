import { lazy, type ComponentType } from 'react'

// ธงกัน reload ซ้ำไม่รู้จบ — เก็บใน sessionStorage (ต่อแท็บ ล้างเมื่อปิดแท็บ)
const KEY = 'ews-chunk-reloaded'

function alreadyReloaded(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function setReloaded(v: boolean) {
  try {
    if (v) window.sessionStorage.setItem(KEY, '1')
    else window.sessionStorage.removeItem(KEY)
  } catch {
    /* private mode / storage ปิด — ข้ามไป ไม่ต้องกัน loop */
  }
}

/**
 * React.lazy ที่ทนต่อ "chunk ค้าง" หลัง deploy เวอร์ชันใหม่
 *
 * เมื่อผู้ใช้เปิดเว็บค้างไว้แล้วมีการ deploy ใหม่ ไฟล์ chunk ที่ hash เปลี่ยนจะถูกลบ
 * พอผู้ใช้กดเข้าหน้าที่ lazy-load หน้านั้น เบราว์เซอร์ขอไฟล์เก่าที่หายไป → 404
 * ("Failed to fetch dynamically imported module") แล้วตกไปที่ ErrorBoundary
 *
 * ตัวห่อนี้ดักกรณีนั้น แล้ว reload หน้า 1 ครั้งเพื่อโหลด index.html + chunk hash ใหม่
 * มีธงกัน loop: ถ้ารีโหลดแล้วยังพัง (เช่น เน็ตหลุดจริง) จะโยน error ให้ ErrorBoundary
 * จัดการตามปกติ (ยังมีปุ่ม "ลองใหม่อีกครั้ง")
 */
// ใช้ ComponentType<any> ให้ตรงกับ signature ของ React.lazy เอง เพื่อคง props ของแต่ละคอมโพเนนต์
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory()
      setReloaded(false) // โหลดสำเร็จ — ล้างธงไว้ให้ครั้งหน้า
      return mod
    } catch (err) {
      if (!alreadyReloaded()) {
        setReloaded(true)
        window.location.reload()
        // คืน promise ที่ไม่ resolve จนกว่าหน้าจะรีโหลด กัน React เรนเดอร์ error ชั่วขณะ
        return new Promise<{ default: T }>(() => {})
      }
      throw err // รีโหลดแล้วยังพัง — ปล่อยให้ ErrorBoundary จัดการ
    }
  })
}
