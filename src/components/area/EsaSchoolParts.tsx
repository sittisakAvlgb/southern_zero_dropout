import { useMemo, useState } from 'react'
import { Drawer } from '@/components/referrals/ui'
import { fmtDay } from '@/lib/directorOps'
import { AREA_ACT_TH, AREA_NEED_TH, AREA_VERDICT_TH, areaRequestStatus, type AreaAction, type AreaRequest } from '@/lib/areaLog'
import { TIER_META, type SchoolView, type Tier } from '@/lib/areaDeskOps'

export const TIER_BAR: Record<Tier, string> = { urgent: '#dc2626', follow: '#f97316', watch: '#eab308', ok: '#16a34a' }

const SECTOR_TH: Record<string, string> = { obec: 'สังกัด สพฐ.', islamicPrivate: 'เอกชนสอนศาสนาอิสลาม', nfe: 'สกร.', vocational: 'อาชีวศึกษา' }

type Col = { key: string; th: string; num?: boolean; get: (v: SchoolView) => number | string; show: (v: SchoolView) => string }

/** คอลัมน์ของไฟล์ CSV — ครบทุกตัวเลข แยกช่องกัน (ตารางบนจอรวมบางช่องเข้าด้วยกันเพื่อให้อ่านง่าย) */
const COLS: Col[] = [
  { key: 'tier', th: 'ระดับ', get: (v) => TIER_META[v.tier].rank, show: (v) => TIER_META[v.tier].th },
  { key: 'students', th: 'นักเรียน', num: true, get: (v) => v.s.totalStudents, show: (v) => v.s.totalStudents.toLocaleString('th-TH') },
  { key: 'rate', th: 'เสี่ยงสูง', num: true, get: (v) => v.rate, show: (v) => `${v.rate.toFixed(1)}%` },
  { key: 'overdue', th: 'เกิน SLA', num: true, get: (v) => v.overdue, show: (v) => String(v.overdue) },
  { key: 'unassigned', th: 'ไม่มีเจ้าของ', num: true, get: (v) => v.unassigned, show: (v) => String(v.unassigned) },
  { key: 'success', th: 'ช่วยสำเร็จ', num: true, get: (v) => v.s.interventionSuccessRate, show: (v) => `${v.s.interventionSuccessRate.toFixed(1)}%` },
  { key: 'response', th: 'ตอบสนอง (ชม.)', num: true, get: (v) => v.s.responseHours, show: (v) => v.s.responseHours.toFixed(0) },
  { key: 'quality', th: 'คุณภาพข้อมูล', num: true, get: (v) => v.s.dataQualityScore, show: (v) => String(v.s.dataQualityScore) },
]

export function exportSchoolsCsv(rows: SchoolView[], dn: (k: string) => string) {
  const head = ['โรงเรียน', 'อำเภอ', ...COLS.map((c) => c.th)]
  const body = rows.map((v) => [v.s.name, dn(v.s.districtKey), ...COLS.map((c) => c.show(v))])
  const csv = [head, ...body].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `schools-in-area-${rows.length}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** แถบเล็กใต้ตัวเลข — เทียบกันในคอลัมน์ได้ด้วยตา ไม่ต้องอ่านตัวเลขทุกช่อง */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, pct))}%`, background: color }} />
    </span>
  )
}

const SORTS: { key: string; th: string; get: (v: SchoolView) => number | string; desc?: boolean; align?: 'right' }[] = [
  { key: 'name', th: 'โรงเรียน', get: (v) => v.s.name },
  { key: 'tier', th: 'ระดับ', get: (v) => TIER_META[v.tier].rank },
  { key: 'rate', th: 'เด็กเสี่ยงสูง', get: (v) => v.rate, desc: true },
  { key: 'overdue', th: 'เคสเกิน SLA', get: (v) => v.overdue, desc: true },
  { key: 'success', th: 'ช่วยสำเร็จ', get: (v) => v.s.interventionSuccessRate },
  { key: 'response', th: 'ตอบสนอง', get: (v) => v.s.responseHours, desc: true, align: 'right' },
  { key: 'quality', th: 'คุณภาพข้อมูล', get: (v) => v.s.dataQualityScore, align: 'right' },
]

/**
 * ตารางโรงเรียน — 7 คอลัมน์แทน 9: จำนวนนักเรียนย้ายไปใต้ชื่อ "ไม่มีเจ้าของ" ย้ายไปใต้เคสเกิน SLA
 * ร้อยละมีแถบให้เทียบด้วยตา แถวสุดท้ายคือค่าเฉลี่ยเขต กดหัวคอลัมน์เพื่อเรียง กดแถวเพื่อเปิดข้อมูลโรงเรียน
 */
export function SchoolTable({ rows, dn, onOpen }: { rows: SchoolView[]; dn: (k: string) => string; onOpen: (v: SchoolView) => void }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'tier', dir: 1 })
  const sorted = useMemo(() => {
    const col = SORTS.find((c) => c.key === sort.key) ?? SORTS[1]
    return [...rows].sort((a, b) => {
      const x = col.get(a)
      const y = col.get(b)
      return (typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'th') : x - y) * sort.dir
    })
  }, [rows, sort])
  const toggle = (key: string, desc?: boolean) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: desc ? -1 : 1 }))

  const n = Math.max(1, rows.length)
  const avg = {
    rate: rows.reduce((a, v) => a + v.rate, 0) / n,
    overdue: rows.reduce((a, v) => a + v.overdue, 0) / n,
    success: rows.reduce((a, v) => a + v.s.interventionSuccessRate, 0) / n,
    response: rows.reduce((a, v) => a + v.s.responseHours, 0) / n,
    quality: rows.reduce((a, v) => a + v.s.dataQualityScore, 0) / n,
  }
  const maxRate = Math.max(...rows.map((v) => v.rate), 1)
  const qColor = (q: number) => (q >= 85 ? 'bg-green-600' : q >= 70 ? 'bg-yellow-500' : 'bg-red-600')

  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-surface-border">
      <table className="w-full min-w-[820px] text-[14.5px]">
        <thead className="bg-surface-muted/50">
          <tr className="text-left">
            {SORTS.map((c) => {
              const on = sort.key === c.key
              return (
                <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                  <button type="button" onClick={() => toggle(c.key, c.desc)} className={`inline-flex items-center gap-1 whitespace-nowrap text-[13.5px] font-semibold ${on ? 'text-brand-700' : 'text-ink-muted hover:text-ink'}`}>
                    {c.th}
                    {on && <span aria-hidden className="text-[11px]">{sort.dir === 1 ? '▲' : '▼'}</span>}
                  </button>
                </th>
              )
            })}
            <th scope="col" className="w-8" aria-label="เปิด" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {sorted.map((v) => (
            <tr key={v.s.id} onClick={() => onOpen(v)} className="cursor-pointer align-middle hover:bg-surface-muted/40">
              <td className="px-4 py-3">
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(v) }} className="flex items-center gap-3 text-left">
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: TIER_BAR[v.tier] }} aria-hidden />
                  <span>
                    <span className="block whitespace-nowrap font-semibold text-ink">{v.s.name}</span>
                    <span className="block whitespace-nowrap text-[13px] text-ink-muted">
                      อ.{dn(v.s.districtKey)} · {v.s.totalStudents.toLocaleString('th-TH')} คน
                    </span>
                  </span>
                </button>
              </td>
              <td className="px-4 py-3">
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold ${TIER_META[v.tier].pill}`}>{TIER_META[v.tier].th}</span>
              </td>
              <td className="w-36 px-4 py-3">
                <span className="flex items-baseline justify-between gap-2 tabular">
                  <span className="font-semibold text-ink">{v.rate.toFixed(1)}%</span>
                  <span className="text-[13px] text-ink-muted">{v.s.highRiskStudents} คน</span>
                </span>
                <Bar pct={(v.rate / maxRate) * 100} color={v.rate >= avg.rate * 1.25 ? '#dc2626' : '#f97316'} />
              </td>
              <td className="px-4 py-3 tabular">
                <span className={`text-[17px] font-bold ${v.overdue >= 5 ? 'text-red-700' : 'text-ink'}`}>{v.overdue}</span>
                <span className="text-[13px] text-ink-muted"> / {v.open} เคส</span>
                {v.unassigned > 0 && <span className="block text-[13px] font-semibold text-orange-700">ไม่มีเจ้าของ {v.unassigned}</span>}
              </td>
              <td className="w-32 px-4 py-3 tabular">
                <span className="font-semibold text-ink">{v.s.interventionSuccessRate.toFixed(1)}%</span>
                <Bar pct={v.s.interventionSuccessRate} color={v.s.interventionSuccessRate < avg.success * 0.85 ? '#f97316' : '#16a34a'} />
              </td>
              <td className={`whitespace-nowrap px-4 py-3 text-right tabular ${v.s.responseHours > avg.response * 1.3 ? 'font-semibold text-orange-700' : 'text-ink'}`}>{v.s.responseHours.toFixed(0)} ชม.</td>
              <td className="px-4 py-3 text-right tabular">
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className={`h-2 w-2 rounded-full ${qColor(v.s.dataQualityScore)}`} aria-hidden />
                  {v.s.dataQualityScore}
                </span>
              </td>
              <td className="pr-4 text-right text-ink-faint" aria-hidden>
                ›
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-surface-border bg-surface-muted/40 text-[14px] text-ink-muted">
              <th scope="row" className="px-4 py-3 text-left font-semibold">ค่าเฉลี่ยเขต</th>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 font-semibold tabular">{avg.rate.toFixed(1)}%</td>
              <td className="px-4 py-3 font-semibold tabular">{avg.overdue.toFixed(1)}</td>
              <td className="px-4 py-3 font-semibold tabular">{avg.success.toFixed(1)}%</td>
              <td className="px-4 py-3 text-right font-semibold tabular">{avg.response.toFixed(0)} ชม.</td>
              <td className="px-4 py-3 text-right font-semibold tabular">{avg.quality.toFixed(0)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

/**
 * ข้อมูลโรงเรียนสำหรับเขต — อ่านจากบนลงล่างตามลำดับที่เขตคิด:
 *   คำขอที่รอเขต (ถ้ามี — งานที่ต้องทำก่อน) → ทำไมต้องช่วย + AI → ข้อมูลอื่นที่ยังไม่ได้พูดถึง → ประวัติกับเขต
 * เดิมเหตุผลบอก 315 คน · 4 จาก 8 · 71.6% แล้วกล่องตัวเลขแปดกล่องด้านล่างบอกซ้ำอีกรอบ
 */
export function EsaSchoolDrawer({
  v,
  dn,
  requests,
  actions,
  onClose,
  onSupport,
  onRequest,
}: {
  v: SchoolView
  dn: (k: string) => string
  requests: AreaRequest[]
  actions: AreaAction[]
  onClose: () => void
  onSupport: () => void
  onRequest: (r: AreaRequest) => void
}) {
  const pending = requests.filter((r) => areaRequestStatus(r) === 'new')
  const facts: { k: string; v: string; warn?: boolean }[] = [
    { k: 'นักเรียนทั้งหมด', v: `${v.s.totalStudents.toLocaleString('th-TH')} คน` },
    { k: 'เคสที่เปิดอยู่', v: `${v.open} เคส` },
    { k: 'ไม่มีผู้รับผิดชอบ', v: `${v.unassigned} เคส`, warn: v.unassigned > 0 },
    { k: 'เวลาตอบสนองเฉลี่ย', v: `${v.s.responseHours.toFixed(0)} ชั่วโมง` },
    { k: 'คุณภาพข้อมูล', v: `${v.s.dataQualityScore} / 100`, warn: v.s.dataQualityScore < 70 },
  ]
  const history = [
    ...requests
      .filter((r) => areaRequestStatus(r) !== 'new')
      .map((r) => ({
        ts: r.ts,
        from: 'โรงเรียนขอ',
        what: `${AREA_NEED_TH[r.need]}${r.childName ? ` · ${r.childName}` : ''}`,
        status: r.done ? `✓ ${r.done.note}` : r.decision ? `เขต${AREA_VERDICT_TH[r.decision.verdict]}${r.decision.owner ? ` · ${r.decision.owner}` : ''}` : '',
        done: Boolean(r.done),
      })),
    ...actions.map((a) => ({
      ts: a.ts,
      from: 'เขตส่ง',
      what: a.acts.map((x) => AREA_ACT_TH[x]).join(' · '),
      status: a.done ? `✓ ${a.done.note}` : `${a.owner} · กำหนด ${fmtDay(a.due)} · รอโรงเรียนรายงานผล`,
      done: Boolean(a.done),
    })),
  ].sort((a, b) => b.ts - a.ts)

  return (
    <Drawer
      label={v.s.name}
      head={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[19px] font-bold leading-tight text-ink">{v.s.name}</p>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${TIER_META[v.tier].pill}`}>{TIER_META[v.tier].th}</span>
          </div>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            อ.{dn(v.s.districtKey)} · {SECTOR_TH[v.s.sector] ?? ''}
          </p>
        </>
      }
      onClose={onClose}
      footer={
        v.tier !== 'ok' ? (
          <button type="button" onClick={onSupport} className="w-full rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white hover:bg-brand-600">
            วางแผนสนับสนุน
          </button>
        ) : undefined
      }
    >
      {/* 1 · คำขอที่รอเขต — สิ่งที่ต้องตัดสินใจก่อน */}
      {pending.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onRequest(r)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border-2 border-red-200 bg-red-50/60 px-4 py-3.5 text-left hover:border-red-300"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-red-700">โรงเรียนขอให้เขตช่วย · รอเขตตัดสินใจ</span>
            <span className="mt-0.5 block text-[16px] font-bold leading-snug text-ink">{AREA_NEED_TH[r.need]}</span>
          </span>
          <span className="shrink-0 text-[14.5px] font-semibold text-red-700">พิจารณา →</span>
        </button>
      ))}

      {/* 2 · ทำไมต้องช่วย */}
      <h3 className="text-[16px] font-bold text-ink">{v.tier === 'ok' ? 'สถานะของโรงเรียน' : 'ทำไมต้องช่วย'}</h3>
      <ul className="mt-2 space-y-2">
        {v.why.map((w) => (
          <li key={w} className="flex gap-2.5 text-[15px] leading-snug text-ink">
            <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: TIER_BAR[v.tier] }} aria-hidden />
            {w}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl bg-brand-50/70 px-4 py-3 text-[15px] leading-snug text-ink">
        <span className="font-semibold text-brand-700">AI แนะนำ: </span>
        {v.ai}
      </p>

      {/* 3 · ข้อมูลอื่น — ไม่ซ้ำกับเหตุผลด้านบน */}
      <h3 className="mt-6 text-[16px] font-bold text-ink">ข้อมูลโรงเรียน</h3>
      <dl className="mt-1 divide-y divide-surface-border">
        {facts.map((f) => (
          <div key={f.k} className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-[14.5px] text-ink-muted">{f.k}</dt>
            <dd className={`text-[15px] font-semibold tabular ${f.warn ? 'text-red-700' : 'text-ink'}`}>{f.v}</dd>
          </div>
        ))}
      </dl>

      {/* 4 · ประวัติกับเขต */}
      <h3 className="mt-6 text-[16px] font-bold text-ink">ประวัติกับเขต</h3>
      {history.length === 0 ? (
        <p className="mt-2 text-[14.5px] text-ink-muted">{pending.length ? 'ยังไม่เคยได้รับการสนับสนุนจากเขต' : 'ยังไม่มีคำขอหรือการสนับสนุนจากเขต'}</p>
      ) : (
        <ol className="mt-3 space-y-4 border-l-2 border-surface-border pl-4">
          {history.map((h, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full ring-2 ring-white ${h.done ? 'bg-green-600' : 'bg-brand-500'}`} aria-hidden />
              <p className="text-[13px] text-ink-muted">
                {new Date(h.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · {h.from}
              </p>
              <p className="text-[15px] font-semibold text-ink">{h.what}</p>
              <p className={`text-[14px] ${h.done ? 'text-green-800' : 'text-ink-muted'}`}>{h.status}</p>
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  )
}
