import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { canWorkCases } from '@/auth/roles'
import { useCaseLog, logKeyOf } from '@/lib/caseLog'
import { useToast } from '@/components/ui/Toast'

/**
 * ล้างข้อมูลทดสอบ — ทุกอย่างที่บัญชีนี้บันทึกไว้ในเบราว์เซอร์นี้ (การติดต่อ เยี่ยมบ้าน นัด
 * แผนที่สร้าง การส่งต่อ ความยินยอม สิ่งที่ครูพบ เป้าหมาย) ข้อมูลตั้งต้นของระบบไม่ถูกแตะ
 * ใช้ก่อนเริ่มทดสอบตามสคริปต์ docs/e2e-teacher.md จะได้เริ่มจากสถานะเดียวกันทุกครั้ง
 * ต้องกดสองครั้ง เพราะลบแล้วกู้คืนไม่ได้
 */
export function DemoResetCard() {
  const { user } = useAuth()
  const log = useCaseLog(logKeyOf(user), user?.id)
  const { push } = useToast()
  const [confirm, setConfirm] = useState(false)
  if (!canWorkCases(user)) return null
  const n =
    log.entries.length +
    Object.keys(log.refs).length +
    Object.keys(log.plans).length +
    Object.values(log.observations).reduce((a, x) => a + x.length, 0) +
    Object.keys(log.requests).length
  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5">
      <h3 className="text-[16px] font-bold text-ink">ข้อมูลทดสอบ</h3>
      <p className="mt-1 text-[14px] text-ink-muted">
        {user?.schoolKey && (user.role === 'teacher' || user.role === 'school')
          ? `ล้างทุกอย่างที่ครูและ ผอ. ของโรงเรียนนี้บันทึกไว้ในเบราว์เซอร์นี้ (${n} รายการ รวมคำขอถึง ผอ.)`
          : `ล้างทุกอย่างที่บัญชีนี้บันทึกไว้ในเบราว์เซอร์นี้ (${n} รายการ)`}{' '}
        เพื่อเริ่มทดสอบใหม่ — ข้อมูลตั้งต้นของนักเรียนไม่ถูกลบ
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {confirm ? (
          <>
            <button
              type="button"
              onClick={() => {
                log.clearAll()
                setConfirm(false)
                push('ล้างข้อมูลทดสอบแล้ว — เริ่มใหม่ได้')
              }}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-[14.5px] font-semibold text-white"
            >
              ยืนยันล้าง {n} รายการ
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded-xl border border-surface-border px-4 py-2.5 text-[14.5px] text-ink">
              ยกเลิก
            </button>
          </>
        ) : (
          <button type="button" disabled={!n} onClick={() => setConfirm(true)} className="rounded-xl border border-surface-border px-4 py-2.5 text-[14.5px] font-semibold text-ink disabled:opacity-40">
            ล้างข้อมูลที่ฉันบันทึก
          </button>
        )}
      </div>
    </div>
  )
}
