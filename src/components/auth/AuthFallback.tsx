import { Skeleton } from '@/components/ui/Skeleton'

/** ช่วงที่ไฟล์ของหน้าเข้าสู่ระบบ/สมัครใช้งานกำลังโหลด
 *
 *  รูปร่างเดียวกับ `AuthShell` — การ์ดใบเดียวกลางจอบนพื้น `bg-brand-50` ใบเดิม
 *  ไม่ใช่ skeleton ของหน้า dashboard ที่กว้างเต็มจอ (จะกระพริบคนละรูปร่าง)
 *  ไม่มีข้อความ จึงไม่ต้องมีคำแปลสามภาษา */
export function AuthFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-white p-6 shadow-card">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="mt-5 h-6 w-40" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-6 h-11 w-full" />
        <Skeleton className="mt-3 h-11 w-full" />
        <Skeleton className="mt-5 h-11 w-full rounded-xl" />
      </div>
    </div>
  )
}
