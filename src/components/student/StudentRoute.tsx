import { Suspense, lazy } from 'react'
import { useScopedData } from '@/auth/scope'
import { RouteFallback } from '@/components/layout/RouteFallback'

/** ครูและ ผอ. ใช้โต๊ะทำงานรายเด็กหน้าเดียวกัน (ผอ. ดูอย่างเดียว + กล่องของ ผอ.) บทบาทอื่นยังเห็นแฟ้มข้อมูลเดิม (Student360)
 *
 *  สองฝั่งนี้ไม่มีใครเห็นทั้งคู่ จึงโหลดแยกกัน — ครูที่เปิดแฟ้มเด็กรายคนจาก
 *  มือถือไม่ต้องดาวน์โหลด `Student360` (สองพันบรรทัด + ApexCharts) ที่ตัวเอง
 *  ไม่ได้ใช้ และบทบาทระดับพื้นที่ก็ไม่ต้องโหลดโต๊ะทำงานของครู */
const TeacherStudentDesk = lazy(() =>
  import('./TeacherStudentDesk').then((m) => ({ default: m.TeacherStudentDesk })),
)
const Student360 = lazy(() => import('@/pages/Student360'))

export default function StudentRoute() {
  const { user } = useScopedData()
  const forTeacherOrDirector = user?.role === 'teacher' || user?.role === 'school'
  return (
    <Suspense fallback={<RouteFallback />}>
      {forTeacherOrDirector ? <TeacherStudentDesk /> : <Student360 />}
    </Suspense>
  )
}
