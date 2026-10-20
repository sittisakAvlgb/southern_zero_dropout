import { Suspense, lazy } from 'react'
import { useScopedData } from '@/auth/scope'
import { RouteFallback } from '@/components/layout/RouteFallback'

/** ครู · ผอ. · เขต ใช้โต๊ะทำงานรายเด็กหน้าเดียวกัน (ผอ. และเขตดูอย่างเดียว
 *  ผอ. มีกล่องของ ผอ. เพิ่ม) บทบาทอื่นยังเห็นแฟ้มข้อมูลเดิม (Student360)
 *
 *  สองฝั่งนี้ไม่มีใครเห็นทั้งคู่ จึงโหลดแยกกัน — ครูที่เปิดแฟ้มเด็กรายคนจาก
 *  มือถือไม่ต้องดาวน์โหลด `Student360` (สองพันบรรทัด + ApexCharts) ที่ตัวเอง
 *  ไม่ได้ใช้ และบทบาทที่ยังใช้แฟ้มเดิมก็ไม่ต้องโหลดโต๊ะทำงานของครู */
const TeacherStudentDesk = lazy(() =>
  import('./TeacherStudentDesk').then((m) => ({ default: m.TeacherStudentDesk })),
)
const Student360 = lazy(() => import('@/pages/Student360'))

/** ที่นั่งที่ใช้โต๊ะทำงานรายเด็กแบบเดียวกับครู
 *
 *  เขตอ่านเด็กรายคนได้แต่ลงมือแทนครูไม่ได้ — `canWorkCases()` คืน false ให้
 *  `esa` อยู่แล้ว โต๊ะจึงซ่อนปุ่มของครูให้เอง (`mayAct` ใน TeacherStudentDesk)
 *  การเพิ่มบทบาทตรงนี้จึงเปลี่ยน *หน้าตา* ไม่ใช่ *สิทธิ์* — อย่าแก้ด่านนั้น
 *  เพื่อให้ปุ่มกลับมา เพราะเคยเป็นบั๊กมาแล้ว (ดูคอมเมนต์ใน roles.ts) */
const DESK_ROLES = ['teacher', 'school', 'esa'] as const

export default function StudentRoute() {
  const { user } = useScopedData()
  const onDesk = DESK_ROLES.includes(user?.role as (typeof DESK_ROLES)[number])
  return (
    <Suspense fallback={<RouteFallback />}>
      {onDesk ? <TeacherStudentDesk /> : <Student360 />}
    </Suspense>
  )
}
