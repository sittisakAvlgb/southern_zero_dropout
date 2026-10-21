import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { useI18n } from '@/i18n/LanguageContext'
import { TIER_META } from '@/lib/areaDeskOps'
import { esaViews } from '@/lib/obecOps'
import { useFollowCases } from '@/components/followup/useFollowCases'

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
  /** ลำดับชิปและจุดสีระดับต้องมาจากชุดเดียวกับตัวเลขในหน้า */
  const { built: followBuilt } = useFollowCases()
  const follow = useMemo(() => ('list' in followBuilt ? followBuilt.list : undefined), [followBuilt])
  const views = useMemo(() => esaViews(districts, schools, cases, oosc, follow), [districts, schools, cases, oosc, follow])
  const keys = views.map((v) => v.esa.key)
  const asked = params.get('esa')
  /** `null` = ทุกเขต และเป็นค่าตั้งต้น
   *
   *  เดิมค่าตั้งต้นคือ `keys[0]` คือเขตที่เร่งด่วนที่สุด หน้าจึงเปิดมาเป็นเขตเดียว
   *  เสมอ ขณะที่แถบ AI เหนือมันเขียน "ทุกเขต · 20 จาก 46 แห่งทั้ง 9 เขต" แล้ว
   *  ใต้มันเขียน "ทั้งหมด 6" — ผู้บริหาร สพฐ. ที่เปิดหน้าโรงเรียนจึงอ่านตัวเลข
   *  ของนราธิวาส เขต 2 โดยเข้าใจว่าเป็นภาพรวมทั้งเก้าเขต และไม่มีทางกลับไป
   *  ดูทุกเขตได้เลยเพราะไม่มีตัวเลือกนั้น */
  const current = asked && keys.includes(asked) ? asked : null
  /** เปลี่ยนเขตแล้วล้างอำเภอที่เลือกไว้ ไม่งั้นอำเภอของเขตเก่าค้างอยู่ใน URL */
  const pick = (key: string | null) => {
    const next = new URLSearchParams(params)
    if (key) next.set('esa', key)
    else next.delete('esa')
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
      <button
        type="button"
        role="tab"
        aria-selected={current === null}
        onClick={() => pick(null)}
        className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[14.5px] font-semibold transition-colors ${current === null ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-surface-border hover:ring-brand-300'}`}
      >
        ทุกเขต {views.length}
      </button>
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
