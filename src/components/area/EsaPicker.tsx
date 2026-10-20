import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { useI18n } from '@/i18n/LanguageContext'
import { TIER_META } from '@/lib/areaDeskOps'
import { esaViews } from '@/lib/obecOps'

/**
 * ชิปเลือกเขตพื้นที่การศึกษา — ใช้บนหน้าของ สพฐ. ที่ยืมหน้าของเขตมาแสดง
 *
 * สพฐ. เห็นทั้ง 9 เขต แต่หน้าที่ยืมมา (เจาะลึกรายพื้นที่ · ทะเบียนเด็กนอกระบบ)
 * ออกแบบมาสำหรับ "หนึ่งเขต" ตัวเลือกนี้จึงเป็นชั้นบนสุด แล้วส่ง `esaKey` ลงไป
 *
 * รูปแบบชิปตรงกับชิปเลือกอำเภอที่อยู่ในหน้าพวกนั้น ผู้ใช้จึงอ่านเป็นลำดับชั้น
 * เดียวกัน (เขต แล้วค่อยอำเภอ) และเรียงตามความจำเป็นด้วย `esaViews()` —
 * เรียงตามตัวอักษรจะทำให้เขตที่ต้องดูก่อนไปอยู่ท้ายแถว
 */
export function useEsaPick() {
  const { districts, schools, cases, oosc } = useScopedData()
  const [params, setParams] = useSearchParams()
  const views = useMemo(() => esaViews(districts, schools, cases, oosc), [districts, schools, cases, oosc])
  const keys = views.map((v) => v.esa.key)
  const asked = params.get('esa')
  const current = asked && keys.includes(asked) ? asked : keys[0]
  /** เปลี่ยนเขตแล้วล้างอำเภอที่เลือกไว้ ไม่งั้นอำเภอของเขตเก่าค้างอยู่ใน URL */
  const pick = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('esa', key)
    next.delete('d')
    setParams(next, { replace: true })
  }
  return { views, current, pick }
}

export function EsaPicker() {
  const { pick: label } = useI18n()
  const { views, current, pick } = useEsaPick()
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="เลือกเขตพื้นที่การศึกษา">
      {views.map((v) => {
        const on = v.esa.key === current
        return (
          <button
            key={v.esa.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => pick(v.esa.key)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[14.5px] font-semibold transition-colors ${on ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-surface-border hover:ring-brand-300'}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${TIER_META[v.tier].dot}`} aria-hidden />
            {label(v.esa)}
          </button>
        )
      })}
    </div>
  )
}
