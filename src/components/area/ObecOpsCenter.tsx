import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { canAccess } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { assetUrl } from '@/lib/asset'
import { formatNumber } from '@/lib/format'
import { useSimulatedLoading } from '@/lib/useLoading'
import { TIER_META, type Tier } from '@/lib/areaDeskOps'
import { esaBrief, esaViews, type EsaView } from '@/lib/obecOps'
import { Skeleton } from '@/components/ui/Skeleton'

const MASCOT = assetUrl('ChatBot.png')
const TONE_DOT: Record<'red' | 'amber' | 'blue', string> = {
  red: 'bg-red-600',
  amber: 'bg-orange-500',
  blue: 'bg-brand-500',
}

/**
 * หน้าแรกของ สพฐ. — ศูนย์กำกับเขตพื้นที่การศึกษา
 *
 * โครงเดียวกับหน้าแรกของเขต (AreaOpsCenter) แต่ขึ้นมาอีกหนึ่งชั้น:
 * เขตดูแลอำเภอและโรงเรียน · สพฐ. ดูแล **เขต** ลำดับการอ่านจึงเหมือนกัน
 *   AI สรุปวันนี้ → ตัวเลขที่ต้องตัดสินใจ → เขตที่ต้องดูแลก่อน
 *
 * หน้าเดิมเป็นแดชบอร์ดผู้บริหารแบบกว้าง — KPI หลายแถว แผนที่ กราฟรายจังหวัด
 * ซึ่งบอกได้ว่าภาพรวมเป็นอย่างไร แต่ไม่ได้บอกว่า **สพฐ. ต้องทำอะไรกับเขตไหน**
 * และเน้นจังหวัดซึ่งเป็นกรอบของ ศอ.บต. ไม่ใช่ของสายการศึกษา (ดู skill.md)
 *
 * ทุกบรรทัดคำนวณใน `lib/obecOps.ts` ถอด API key ออกหน้าก็ยังครบ
 */
export function ObecOpsCenter() {
  const { pick } = useI18n()
  const nav = useNavigate()
  const { user, districts, schools, cases, oosc } = useScopedData()
  const loading = useSimulatedLoading(450)
  const views = useMemo(() => esaViews(districts, schools, cases, oosc), [districts, schools, cases, oosc])
  const brief = useMemo(() => esaBrief(views), [views])
  const [allBrief, setAllBrief] = useState(false)
  const [tier, setTier] = useState<Tier | 'all'>('all')

  const go = (to: string) => {
    if (!user || canAccess(user, to)) nav(to)
  }

  const urgent = views.filter((v) => v.tier === 'urgent')
  const schoolsToWatch = views.reduce((a, v) => a + v.schoolsToWatch, 0)
  const overdue = views.reduce((a, v) => a + v.overdue, 0)
  const oosNoPlan = views.reduce((a, v) => a + v.oosNoPlan, 0)
  const rows = views.filter((v) => tier === 'all' || v.tier === tier)
  const count = (t: Tier) => views.filter((v) => v.tier === t).length

  if (loading)
    return (
      <div className="mb-8 space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )

  return (
    <div className="mb-8 space-y-6 sm:space-y-8">
      {/* ── 1. AI สรุปวันนี้ — สามเรื่องแรก ที่เหลือพับไว้ อ่านจบใน 20 วินาที ── */}
      <section aria-labelledby="obec-brief-h" className="rounded-2xl bg-white p-4 ring-1 ring-brand-200 sm:p-5">
        <div className="flex items-center gap-3">
          <img src={MASCOT} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 object-contain p-0.5" draggable={false} />
          <h2 id="obec-brief-h" className="min-w-0 text-[17px] font-bold leading-snug text-ink">
            {brief.length ? `AI สรุปวันนี้ · ${brief.length} เรื่องที่ควรดู` : 'วันนี้ไม่มีเรื่องเร่งด่วน — ทุกเขตดูแลเองได้'}
          </h2>
        </div>
        {brief.length > 0 && (
          <>
            <ul className="mt-2 divide-y divide-surface-border">
              {(allBrief ? brief : brief.slice(0, 3)).map((b) => (
                <li key={b.key}>
                  <button type="button" onClick={() => go(b.to)} className="group flex w-full items-start gap-3 py-3 text-left">
                    <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[b.tone]}`} aria-hidden />
                    <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink group-hover:text-brand-700">{b.text}</span>
                    <span aria-hidden className="shrink-0 text-ink-faint group-hover:text-brand-600">→</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => go(brief[0].to)}
                className="w-full rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white hover:bg-brand-600 sm:w-auto"
              >
                ดูเรื่องที่ต้องจัดการวันนี้ →
              </button>
              {brief.length > 3 && (
                <button type="button" onClick={() => setAllBrief((x) => !x)} className="text-[14.5px] font-semibold text-brand-700">
                  {allBrief ? 'ย่อ' : `ดูอีก ${brief.length - 3} เรื่อง`}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── 2. ตัวเลขที่ต้องตัดสินใจ — แถบเดียว ไม่ใช่สี่กล่อง ── */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border lg:grid-cols-4">
        {[
          { th: 'เขตที่ต้องช่วยเร่งด่วน', n: urgent.length, red: urgent.length > 0, to: '' },
          { th: 'โรงเรียนที่ต้องช่วย', n: schoolsToWatch, red: false, to: '/school' },
          { th: 'เคสเกิน SLA', n: overdue, red: false, to: '/intervention' },
          { th: 'เด็กนอกระบบยังไม่มีแผน', n: oosNoPlan, red: false, to: '/oosc' },
        ].map((x, i) => (
          <button
            key={x.th}
            type="button"
            onClick={() => (x.to ? go(x.to) : setTier('urgent'))}
            className={`px-4 py-3 text-left hover:bg-surface-muted/50 ${i % 2 ? 'border-l border-surface-border' : ''} ${i > 1 ? 'border-t border-surface-border lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
          >
            <span className={`tabular block text-[24px] font-bold leading-none ${x.red ? 'text-red-600' : 'text-ink'}`}>
              {formatNumber(x.n)}
            </span>
            <span className="mt-1 block text-[14px] leading-snug text-ink-muted">{x.th}</span>
          </button>
        ))}
      </div>

      {/* ── 3. เขตที่ต้องดูแลก่อน — ทุกเขต ไม่ใช่แค่สามจังหวัด ── */}
      <section aria-labelledby="obec-areas-h">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="obec-areas-h" className="text-[17px] font-bold text-ink">
            เขตที่ต้องดูแลก่อน
          </h2>
          <p className="text-[13.5px] text-ink-muted">กดเขตเพื่อดูเหตุผลและสิ่งที่ สพฐ. อาจพิจารณาทำ</p>
        </div>

        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="กรองตามระดับ">
          {(['all', 'urgent', 'follow', 'watch', 'ok'] as const).map((k) => {
            const on = tier === k
            const n = k === 'all' ? views.length : count(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                disabled={k !== 'all' && n === 0}
                onClick={() => setTier(k)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold transition-colors disabled:opacity-40 ${on ? 'bg-ink text-white' : 'bg-surface-muted/70 text-ink hover:bg-surface-muted'}`}
              >
                {k !== 'all' && <span className={`h-2 w-2 rounded-full ${TIER_META[k].dot}`} aria-hidden />}
                {k === 'all' ? 'ทุกเขต' : TIER_META[k].th}
                <span className="tabular">{n}</span>
              </button>
            )
          })}
        </div>

        <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
          {rows.map((v) => (
            <EsaRow key={v.esa.key} v={v} name={pick(v.esa)} onOpen={() => go(`/area?esa=${v.esa.key}`)} />
          ))}
          {rows.length === 0 && <li className="px-5 py-6 text-center text-[15px] text-ink-muted">ไม่มีเขตในระดับนี้</li>}
        </ul>
      </section>
    </div>
  )
}

/** หนึ่งเขต — ปิดไว้เห็นชื่อ ระดับ และเหตุผลข้อเดียว เปิดแล้วเห็นครบกับข้อเสนอ */
function EsaRow({ v, name, onOpen }: { v: EsaView; name: string; onOpen: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="group flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-muted/50"
      >
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TIER_META[v.tier].dot}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-bold text-ink">{name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${TIER_META[v.tier].pill}`}>{TIER_META[v.tier].th}</span>
          </span>
          {/* บรรทัดเดียวพอสำหรับการสแกน รายละเอียดอยู่ข้างใน */}
          <span className="mt-0.5 block text-[14px] leading-snug text-ink-muted">
            เด็กเสี่ยงสูง {v.riskRate.toFixed(1)}% · เกิน SLA {v.overdue}
            {v.unassigned ? ` (ไม่มีเจ้าของ ${v.unassigned})` : ''} · {v.districts} อำเภอ · {formatNumber(v.schools)} โรงเรียน
          </span>
        </span>
        <span aria-hidden className="shrink-0 pt-1 text-ink-faint group-hover:text-brand-600">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="space-y-2.5 px-4 pb-4 pl-9">
          <ul className="space-y-1">
            {v.why.map((w) => (
              <li key={w} className="flex gap-2 text-[14px] text-ink">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
          <p className="rounded-xl bg-brand-50/60 px-3 py-2.5 text-[14.5px] leading-snug text-ink">
            <span className="font-semibold text-brand-700">AI: </span>
            {v.rec}
          </p>
          <button
            type="button"
            onClick={onOpen}
            className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white hover:bg-brand-600 sm:w-auto"
          >
            เปิดเขตนี้ →
          </button>
        </div>
      )}
    </li>
  )
}
