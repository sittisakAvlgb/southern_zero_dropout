import { useScopedData } from '@/auth/scope'
import Student360 from '@/pages/Student360'
import { TeacherStudentDesk } from './TeacherStudentDesk'

/** ครูและ ผอ. ใช้โต๊ะทำงานรายเด็กหน้าเดียวกัน (ผอ. ดูอย่างเดียว + กล่องของ ผอ.) บทบาทอื่นยังเห็นแฟ้มข้อมูลเดิม (Student360) */
export default function StudentRoute() {
  const { user } = useScopedData()
  return user?.role === 'teacher' || user?.role === 'school' ? <TeacherStudentDesk /> : <Student360 />
}
