import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { useI18n } from '@/i18n/LanguageContext'
import { assetUrl } from '@/lib/asset'
import { formatNumber } from '@/lib/format'
import { TIER_META, type Tier } from '@/lib/areaDeskOps'
import { esaInsight, esaViews, type EsaView } from '@/lib/obecOps'
import { Card, CardHeader } from '@/components/ui/Card'
import { IconArrowRight } from '@/components/icons'

const MASCOT = assetUrl('ChatBot.png')
const TIERS: Tier[] = ['urgent', 'follow', 'watch', 'ok']

/**
 * เขตพื้นที่การศึกษาทั้งหมด — แผงหลักของหน้าแรก สพฐ.
 *
 * สพฐ. กำกับเขต ไม่ได้กำกับจังหวัด หน้าแรกจึงต้องตอบว่าเขตไหนต้องเข้าไปหนุนก่อน
 * และเพราะอะไร เดิมหน้านี้เรียงเป็นสามจังหวัด ซึ่งบอกได้แค่ว่าจังหวัดไหนใหญ่
 * ไม่ได้บอกว่าหน่วยที่ สพฐ. สั่งการได้จริงหน่วยไหนมีปัญหา
 *
 * AI ที่นี่ไม่ใช่กล่องแชท แต่เป็นการอ่านข้อมูลแทนผู้บริหาร: จัดอันดับ บอกเหตุผล
 * เป็นตัวเลข แล้วเสนอสิ่งที่ "อาจพิจารณา" ทำกับเขตนั้น ทุกบรรทัดคำนวณใน
 * `lib/obecOps.ts` ถอด API key ออกก็ยังครบ (กติกาเดียวกับ decision.ts/briefing.ts)
 */
export function ObecEsaPanel() {
  const { pick } = useI18n()
  const nav = useNavigate()
  const { districts, schools, cases, oosc } = useScopedData()
  const views = useMemo(() => esaViews(districts, schools, cases, oosc), [districts, schools, cases, oosc])
  const insight = useMemo(() => esaInsight(views), [views])
  const [tier, setTier] = useState<Tier | 'all'>('all')
  const [openKey, setOpenKey] = useState<string | null>(views[0]?.esa.key ?? null)

  const count = (t: Tier) => views.filter((v) => v.tier === t).length
  const rows = views.filter((v) => tier === 'all' || v.tier === tier)

  return (
    <Card className="xl:col-span-7">
      <CardHeader
        title={`เขตพื้นที่การศึกษา ${views.length} เขต`}
        subtitle="เรียงจากเขตที่ต้องเข้าไปหนุนก่อน — กดเขตเพื่อดูเหตุผลและสิ่งที่ สพฐ. อาจพิจารณาทำ"
      />

      {/* ── ข้อสังเกตเดียวจากทุกเขต ── */}
      <div className="mx-4 mb-3 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3.5">
        <img src={MASCOT} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-1" draggable={false} />
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand-600">AI อ่านให้แล้ว</p>
          <p className="mt-0.5 text-[14.5px] leading-snug text-ink">{insight}</p>
        </div>
      </div>

      {/* ── กรองตามระดับ ── */}
      <div className="flex flex-wrap gap-2 px-4 pb-3" role="group" aria-label="กรองตามระดับ">
        {(['all', ...TIERS] as const).map((k) => {
          const on = tier === k
          const n = k === 'all' ? views.length : count(k)
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              disabled={k !== 'all' && n === 0}
              onClick={() => setTier(k)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-semibold transition-colors disabled:opacity-40 ${on ? 'bg-ink text-white' : 'bg-surface-muted/70 text-ink hover:bg-surface-muted'}`}
            >
              {k !== 'all' && <span className={`h-2 w-2 rounded-full ${TIER_META[k].dot}`} aria-hidden />}
              {k === 'all' ? 'ทุกเขต' : TIER_META[k].th}
              <span className="tabular">{n}</span>
            </button>
          )
        })}
      </div>

      <ul className="divide-y divide-surface-border border-t border-surface-border">
        {rows.map((v) => (
          <EsaRow
            key={v.esa.key}
            v={v}
            name={pick(v.esa)}
            open={openKey === v.esa.key}
            onToggle={() => setOpenKey(openKey === v.esa.key ? null : v.esa.key)}
            onOpen={() => nav(`/area?esa=${v.esa.key}`)}
          />
        ))}
        {rows.length === 0 && (
          <li className="px-5 py-6 text-center text-[14.5px] text-ink-muted">ไม่มีเขตในระดับนี้</li>
        )}
      </ul>
    </Card>
  )
}

/** หนึ่งเขต — ปิดไว้เห็นตัวเลขที่ใช้ตัดสิน เปิดแล้วเห็นเหตุผลครบกับข้อเสนอ */
function EsaRow({
  v,
  name,
  open,
  onToggle,
  onOpen,
}: {
  v: EsaView
  name: string
  open: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  return (
    <li className="px-4 py-3.5">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${TIER_META[v.tier].dot}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15.5px] font-bold text-ink">{name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${TIER_META[v.tier].pill}`}>
              {TIER_META[v.tier].th}
            </span>
          </span>
          {/* ตัวเลขที่ใช้ตัดสินสามตัว ไม่ใช่ทุกตัวที่มี */}
          <span className="mt-1 block text-[13.5px] text-ink-muted">
            เด็กเสี่ยงสูง <b className="font-semibold text-ink">{v.riskRate.toFixed(1)}%</b> ·{' '}
            เกิน SLA{' '}
            <b className={`font-semibold ${v.overdue >= 5 ? 'text-red-700' : 'text-ink'}`}>{v.overdue}</b>
            {v.unassigned ? ` (ไม่มีเจ้าของ ${v.unassigned})` : ''} · {v.districts} อำเภอ ·{' '}
            {formatNumber(v.schools)} โรงเรียน
          </span>
        </span>
        <span className="shrink-0 pt-1 text-ink-faint" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5 pl-6">
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-600"
          >
            เปิดเขตนี้
            <IconArrowRight width={14} height={14} />
          </button>
        </div>
      )}
    </li>
  )
}
