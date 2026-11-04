/**
 * เดิมหน่วงเวลาปลอม (setTimeout) เพื่อให้เห็น skeleton ในเดโม — ตัดออกแล้วเพื่อให้โหลดไว
 * ข้อมูลทั้งหมดเป็น local จึงพร้อมทันทีตอน mount ฮุกนี้จึงคืน `false` เสมอ
 * (ไม่มีดีเลย์เทียมและไม่มี skeleton ซ้อนจังหวะที่สอง)
 *
 * ช่วงโหลดไฟล์ของหน้าจริง ๆ (`React.lazy`) ยังมี skeleton ของ Suspense
 * — RouteFallback / PanelFallback — ตามเดิม เพราะนั่นคือการโหลดจริง ไม่ใช่ดีเลย์ปลอม
 *
 * คง signature เดิมไว้ ผู้เรียกทุกจุดไม่ต้องแก้ (`const loading = useSimulatedLoading()`)
 */
export function useSimulatedLoading(_ms = 0): boolean {
  return false
}
