import { useScopedData } from '@/auth/scope'
import Student360 from '@/pages/Student360'
import { TeacherStudentDesk } from './TeacherStudentDesk'

/** ครูได้โต๊ะทำงานรายเด็ก บทบาทอื่นยังเห็นแฟ้มข้อมูลเดิม (Student360) */
export default function StudentRoute() {
  const { user } = useScopedData()
  return user?.role === 'teacher' ? <TeacherStudentDesk /> : <Student360 />
}
