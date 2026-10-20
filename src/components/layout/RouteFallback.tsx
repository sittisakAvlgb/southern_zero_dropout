import { SkeletonCard } from '../ui/Skeleton'

/** ช่วงที่ไฟล์ของหน้ากำลังโหลด (`React.lazy` ใน `App.tsx`)
 *
 *  รูปร่างและชั้นเชิงเดียวกับ skeleton ที่หน้าอื่นใช้อยู่แล้ว — หัวเรื่องหนึ่งแถบ
 *  แล้วตามด้วยการ์ดสองใบ (เทียบ `GeoIntelligence` / `Settings`) ไม่มีสไตล์ใหม่
 *  และ **ไม่มีข้อความ** จึงไม่ต้องมีคำแปลสามภาษา และครูไม่ต้องอ่านอะไรเพิ่ม
 *  ระหว่างรอ เมนูด้านข้างกับแถบล่างยังอยู่ครบเพราะ Suspense อยู่ใน `AppLayout`
 *  ไม่ใช่ครอบทั้งแอป — กดไปหน้าอื่นได้ทันทีถ้ากดผิด */
export function RouteFallback() {
  return (
    <div className="animate-page-rise space-y-4">
      <SkeletonCard className="h-16" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard className="h-[320px]" />
        <SkeletonCard className="h-[320px]" />
      </div>
    </div>
  )
}
