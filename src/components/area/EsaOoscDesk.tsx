import { useMemo, useState } from 'react'
import { useScopedData } from '@/auth/scope'
import { esaOfDistrict } from '@/data/esa'
import { useI18n } from '@/i18n/LanguageContext'
import { useToast } from '@/components/ui/Toast'
import { Drawer } from '@/components/referrals/ui'
import { useAreaLog } from '@/lib/areaLog'
import { teamRows, type Pattern } from '@/lib/areaDeskOps'
import type { OoscRecord } from '@/types'
import { MeasureSheet } from './AreaOpsCenter'

type Stuck = 'verify' | 'owner' | 'consent' | 'plan'
const DONE = new Set(['returned', 'working'])
const STUCK: { key: Stuck; th: string; hint: string; test: (r: OoscRecord) => boolean }[] = [
  { key: 'verify', th: 'รอลงพื้นที่ยืนยัน', hint: 'ยังไม่มีใครไปเจอตัวเด็ก', test: (r) => !r.verified && !DONE.has(r.status) },
  { key: 'owner', th: 'ยังไม่มีผู้รับผิดชอบ', hint: 'ไม่มีโรงเรียนหรือหน่วยงานรับเด็กคนนี้', test: (r) => !r.ownerName && !DONE.has(r.status) },
  { key: 'consent', th: 'รอความยินยอม', hint: 'ครอบครัวยังไม่ยินยอมให้ช่วย', test: (r) => r.consent !== 'granted' },
  { key: 'plan', th: 'ยังไม่มีแผนโอกาส', hint: 'ยืนยันแล้วแต่ยังไม่มีเส้นทางให้เด็ก', test: (r) => !r.planId },
]
const STATUS_PILL: Record<string, string> = {
  outOfSchool: 'bg-red-50 text-red-700',
  unreachable: 'bg-surface-muted text-ink-muted',
  reengaging: 'bg-orange-50 text-orange-700',
  returned: 'bg-green-50 text-green-800',
  working: 'bg-green-50 text-green-800',
}
const PAGE = 10

/**
 * ทะเบียนเด็กนอกระบบ — มุมมองของเขต
 *
 * หน้าเดิมเปิดด้วยแถบเตือน "อ่านอย่างเดียว" และคิวลงพื้นที่รายคน ซึ่งเป็นงานของโรงเรียนและทีมอำเภอ
 * เขตไม่ได้ลงพื้นที่เอง สิ่งที่เขตต้องรู้คือ เด็กเดินมาถึงไหนแล้ว · ติดอยู่ขั้นไหน · อำเภอไหนต้องช่วย
 * และเขตทำอะไรได้ (สร้างมาตรการให้ทั้งอำเภอ) — รายชื่อเด็กยังเห็นได้ (เขตเห็นชื่อได้แต่ลงมือไม่ได้)
 */
export function EsaOoscDesk({ esaKey: esaKeyProp, readOnly }: { esaKey?: string; readOnly?: boolean } = {}) {
  const { t, dn, tn } = useI18n()
  const { push } = useToast()
  const scoped = useScopedData()
  const { user } = scoped
  /** เขตที่หน้านี้กำลังพูดถึง — บัญชีเขตถูกจำกัดขอบเขตมาแล้ว ส่วน สพฐ. ส่งเข้ามา
   *  (กติกาเดียวกับ EsaAreaDetail) */
  const esaKey = esaKeyProp ?? user?.esaKey
  const inEsa = useMemo(() => {
    if (!esaKeyProp) return () => true
    return (districtKey?: string) => esaOfDistrict(districtKey) === esaKeyProp
  }, [esaKeyProp])
  const oosc = useMemo(() => scoped.oosc.filter((r) => inEsa(r.districtKey)), [scoped.oosc, inEsa])
  const districts = useMemo(() => scoped.districts.filter((d) => inEsa(d.key)), [scoped.districts, inEsa])
  const schools = useMemo(() => scoped.schools.filter((x) => inEsa(x.districtKey)), [scoped.schools, inEsa])
  /** สร้างมาตรการเป็นการกระทำของเขตนั้น เขียนลงสมุดงานของเขตด้วยชื่อผู้สั่ง
   *  สพฐ. ที่เปิดดูเขตอื่นจึงอ่านได้อย่างเดียว ไม่ลงมือแทนเขต */
  /** สิทธิ์มาจากที่นั่ง ไม่ใช่จากขอบเขตที่เลือก — ดูคอมเมนต์ใน EsaSchoolDesk */
  const mayAct = !readOnly
  const area = useAreaLog(esaKey)
  const team = useMemo(() => teamRows(area), [area])
  const [stuck, setStuck] = useState<Stuck | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<OoscRecord | null>(null)
  const [measure, setMeasure] = useState<Pattern | null>(null)

  const known = oosc.length
  const verified = oosc.filter((r) => r.verified).length
  const planned = oosc.filter((r) => r.planId).length
  const done = oosc.filter((r) => DONE.has(r.status)).length
  const steps = [
    { th: 'อยู่ในทะเบียน', n: known, pct: 100, color: '#64748b' },
    { th: 'ยืนยันตัวตนแล้ว', n: verified, pct: (verified / Math.max(1, known)) * 100, color: '#2f66f6' },
    { th: 'มีแผนโอกาส', n: planned, pct: (planned / Math.max(1, known)) * 100, color: '#0d9488' },
    { th: 'กลับเข้าเรียน / มีอาชีพ', n: done, pct: (done / Math.max(1, known)) * 100, color: '#16a34a' },
  ]

  const byDistrict = useMemo(
    () =>
      districts
        .map((d) => {
          const rs = oosc.filter((r) => r.districtKey === d.key)
          const n = Math.max(1, rs.length)
          const c = Object.fromEntries(STUCK.map((s) => [s.key, rs.filter(s.test).length])) as Record<Stuck, number>
          const vPct = (rs.filter((r) => r.verified).length / n) * 100
          const issues = [
            { score: vPct < 55 ? 3 : vPct < 62 ? 1 : 0, text: `ยืนยันตัวตนได้ ${vPct.toFixed(0)}% — อาจพิจารณาให้ทีมเยี่ยมบ้านเขตลงพื้นที่ร่วมกับผู้นำชุมชน` },
            { score: c.owner / n >= 0.2 || c.owner >= 10 ? 2.5 : c.owner ? 1 : 0, text: `เด็ก ${c.owner} คนยังไม่มีผู้รับผิดชอบ — อาจพิจารณาให้โรงเรียนในพื้นที่หรือทีมอำเภอรับไป` },
            { score: c.consent / n >= 0.3 ? 2 : 0, text: `รอความยินยอม ${c.consent} คน — อาจพิจารณาให้ผู้นำศาสนาช่วยคุยกับครอบครัว` },
          ].sort((a, b) => b.score - a.score)
          const score = issues.reduce((a, x) => a + x.score, 0)
          return { d, total: rs.length, vPct, c, score, ai: issues[0].score ? issues[0].text : 'อยู่ในเกณฑ์ — ติดตามต่อ', made: area.measures.find((m) => m.pattern === `oosc-${d.key}`) }
        })
        .sort((a, b) => b.score - a.score),
    [districts, oosc, area.measures],
  )

  const list = useMemo(() => {
    const s = STUCK.find((x) => x.key === stuck)
    const term = q.trim()
    return oosc
      .filter((r) => (!s || s.test(r)) && (!district || r.districtKey === district) && (!term || r.name.includes(term) || r.id.toLowerCase().includes(term.toLowerCase())))
      .sort((a, b) => Number(DONE.has(a.status)) - Number(DONE.has(b.status)) || Number(Boolean(a.ownerName)) - Number(Boolean(b.ownerName)) || b.matchConfidence - a.matchConfidence)
  }, [oosc, stuck, district, q])
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const shown = list.slice(page * PAGE, page * PAGE + PAGE)
  const reset = () => setPage(0)

  const measureFor = (row: (typeof byDistrict)[number]): Pattern => ({
    key: `oosc-${row.d.key}`,
    th: `เด็กนอกระบบอำเภอ${dn(row.d.key)}`,
    schools: schools.filter((s) => s.districtKey === row.d.key).map((s) => s.name).concat(schools.some((s) => s.districtKey === row.d.key) ? [] : [`อำเภอ${dn(row.d.key)}`]),
    n: row.total,
    rec: row.ai,
  })

  return (
    <div className="animate-page-rise space-y-5 pb-8">
      <div>
        <h1 className="text-[24px] font-bold leading-tight text-ink">ทะเบียนเด็กนอกระบบ{readOnly && !esaKeyProp ? ' · ทุกเขต' : ''}</h1>
        <p className="mt-1 text-[14.5px] text-ink-muted">
          {readOnly
            ? 'ดูว่าเด็กติดอยู่ขั้นไหนและเขต/อำเภอไหนต้องช่วย — การลงพื้นที่และดูแลเด็กรายคนเป็นงานของโรงเรียนและทีมอำเภอ'
            : 'เขตดูว่าเด็กติดอยู่ขั้นไหนและอำเภอไหนต้องช่วย — การลงพื้นที่และดูแลเด็กรายคนเป็นงานของโรงเรียนและทีมอำเภอ'}
        </p>
      </div>

      {/* ── 1 · เด็กเดินมาถึงไหนแล้ว ── */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-surface-border sm:p-5">
        <h2 className="text-[17px] font-bold text-ink">เด็กเดินมาถึงไหนแล้ว</h2>
        <ol className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.th} className="rounded-xl bg-surface-muted/60 px-4 py-3">
              <p className="text-[13.5px] text-ink-muted">
                {i > 0 && <span aria-hidden>→ </span>}
                {s.th}
              </p>
              <p className="mt-0.5 flex items-baseline gap-2">
                <span className="text-[24px] font-bold leading-tight tabular text-ink">{s.n}</span>
                {i > 0 && <span className="text-[14px] font-semibold tabular" style={{ color: s.color }}>{s.pct.toFixed(0)}%</span>}
              </p>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white">
                <span className="block h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 2 · ติดอยู่ที่ไหน (กดเพื่อกรองรายชื่อ) ── */}
      <section>
        <h2 className="text-[17px] font-bold text-ink">ติดอยู่ที่ไหน</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {STUCK.map((s) => {
            const n = oosc.filter(s.test).length
            const on = stuck === s.key
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setStuck(on ? null : s.key)
                  reset()
                  document.getElementById('oosc-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`rounded-2xl px-4 py-3 text-left transition-colors ${on ? 'bg-ink text-white' : 'bg-white ring-1 ring-surface-border hover:ring-brand-300'}`}
              >
                <span className={`block text-[24px] font-bold leading-tight tabular ${on ? 'text-white' : n ? 'text-orange-700' : 'text-ink'}`}>{n}</span>
                <span className="block text-[14.5px] font-semibold">{s.th}</span>
                <span className={`block text-[13px] ${on ? 'text-white/80' : 'text-ink-muted'}`}>{s.hint}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 3 · อำเภอที่ต้องช่วย ── */}
      <section>
        <h2 className="text-[17px] font-bold text-ink">อำเภอที่ต้องช่วย</h2>
        <ul className="mt-2.5 divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
          {byDistrict.map((row) => {
            const on = district === row.d.key
            return (
              <li key={row.d.key} className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5 ${on ? 'bg-brand-50/50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[16.5px] font-bold text-ink">อำเภอ{dn(row.d.key)}</span>
                    <span className="text-[14px] text-ink-muted">{row.total} คนในทะเบียน</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-2 w-40 max-w-[45%] overflow-hidden rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full" style={{ width: `${row.vPct}%`, background: row.vPct < 55 ? '#dc2626' : row.vPct < 62 ? '#f97316' : '#2f66f6' }} />
                    </span>
                    <span className="text-[14px] text-ink-muted">
                      ยืนยันแล้ว <b className="text-ink">{row.vPct.toFixed(0)}%</b> · ไม่มีผู้รับผิดชอบ <b className={row.c.owner ? 'text-orange-700' : 'text-ink'}>{row.c.owner}</b> · ไม่มีแผน <b className="text-ink">{row.c.plan}</b>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[14.5px] leading-snug text-ink">
                    <span className="font-semibold text-brand-700">AI: </span>
                    {row.ai}
                  </p>
                  {row.made && (
                    <p className="mt-1 text-[14px] font-semibold text-green-800">
                      ✓ มีมาตรการแล้ว: {row.made.title} · {row.made.owner}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setDistrict(on ? null : row.d.key)
                      reset()
                    }}
                    className={`rounded-xl px-4 py-2.5 text-[14.5px] font-semibold ${on ? 'bg-ink text-white' : 'border border-surface-border bg-white text-ink hover:border-brand-300'}`}
                  >
                    {on ? 'แสดงทุกอำเภอ' : 'ดูรายชื่อ'}
                  </button>
                  {mayAct && !row.made && row.score > 0 && (
                    <button type="button" onClick={() => setMeasure(measureFor(row))} className="rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white hover:bg-brand-600">
                      สร้างมาตรการ
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ── 4 · รายชื่อเด็ก ── */}
      <section id="oosc-list" className="scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-[17px] font-bold text-ink">
            รายชื่อเด็ก
            <span className="ml-2 text-[14px] font-normal text-ink-muted">
              {[stuck ? STUCK.find((s) => s.key === stuck)?.th : '', district ? `อำเภอ${dn(district)}` : ''].filter(Boolean).join(' · ') || 'ทั้งหมด'} · {list.length} คน
            </span>
          </h2>
          {(stuck || district) && (
            <button
              type="button"
              onClick={() => {
                setStuck(null)
                setDistrict(null)
                reset()
              }}
              className="text-[14.5px] font-semibold text-brand-700"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            reset()
          }}
          placeholder="ค้นหาชื่อเด็กหรือรหัส"
          aria-label="ค้นหาชื่อเด็กหรือรหัส"
          className="mt-2.5 w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[15px] text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <ul className="mt-2.5 divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted/40 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15.5px] font-semibold text-ink group-hover:text-brand-700">{r.name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${STATUS_PILL[r.status] ?? 'bg-surface-muted text-ink-muted'}`}>{t(`status.${r.status}`)}</span>
                  </span>
                  <span className="mt-0.5 block text-[13.5px] text-ink-muted">
                    {r.ageYears} ปี · ต.{tn(r.tambonKey)} อ.{dn(r.districtKey)} · ออกจากระบบ {r.yearsOut.toFixed(1)} ปี ·{' '}
                    {r.ownerName ? <span className="text-ink">{r.ownerName}</span> : <span className="font-semibold text-orange-700">ยังไม่มีผู้รับผิดชอบ</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[13px] text-ink-muted">
                  {r.verified ? <span className="font-semibold text-green-800">ยืนยันแล้ว</span> : <span>ข้อมูลน่าเชื่อ {r.matchConfidence}%</span>}
                </span>
                <span aria-hidden className="text-ink-faint">›</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-5 py-5 text-[15px] text-ink-muted">ไม่พบเด็กที่ตรงกับตัวกรอง</li>}
        </ul>
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between gap-2 text-[14.5px]">
            <span className="text-ink-muted">
              แสดง {page * PAGE + 1}–{Math.min(list.length, page * PAGE + PAGE)} จาก {list.length} คน
            </span>
            <span className="flex gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-xl border border-surface-border bg-white px-4 py-2 font-semibold text-ink disabled:opacity-40">
                ก่อนหน้า
              </button>
              <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-xl border border-surface-border bg-white px-4 py-2 font-semibold text-ink disabled:opacity-40">
                ถัดไป
              </button>
            </span>
          </div>
        )}
      </section>

      {open && (
        <Drawer
          label={open.name}
          head={
            <>
              <p className="truncate text-[19px] font-bold leading-tight text-ink">{open.name}</p>
              <p className="mt-0.5 text-[13.5px] text-ink-muted">
                {open.id} · {open.ageYears} ปี · ต.{tn(open.tambonKey)} อ.{dn(open.districtKey)}
              </p>
            </>
          }
          onClose={() => setOpen(null)}
        >
          <span className={`inline-flex rounded-full px-3 py-1 text-[13px] font-bold ${STATUS_PILL[open.status] ?? 'bg-surface-muted text-ink-muted'}`}>{t(`status.${open.status}`)}</span>
          <dl className="mt-4 divide-y divide-surface-border">
            {[
              { k: 'ผู้รับผิดชอบ', v: open.ownerName ?? 'ยังไม่มี', warn: !open.ownerName },
              { k: 'ยืนยันตัวตน', v: open.verified ? 'ลงพื้นที่ยืนยันแล้ว' : `ยังไม่ยืนยัน · ข้อมูลน่าเชื่อ ${open.matchConfidence}%`, warn: !open.verified },
              { k: 'ความยินยอม', v: open.consent === 'granted' ? 'ยินยอมแล้ว' : open.consent === 'pending' ? 'รอความยินยอม' : 'ไม่ยินยอม', warn: open.consent !== 'granted' },
              { k: 'แผนโอกาส', v: open.planId ? 'มีแผนแล้ว' : 'ยังไม่มี', warn: !open.planId },
              { k: 'ออกจากระบบ', v: `${open.yearsOut.toFixed(1)} ปี` },
              { k: 'สาเหตุ', v: open.causeKeys.map((c) => t(`cause.${c}`)).join(' · ') || '—' },
              { k: 'พบผ่าน', v: t(`source.${open.source}`) },
            ].map((f) => (
              <div key={f.k} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-[14.5px] text-ink-muted">{f.k}</dt>
                <dd className={`text-right text-[15px] font-semibold ${f.warn ? 'text-orange-700' : 'text-ink'}`}>{f.v}</dd>
              </div>
            ))}
          </dl>
          {open.note && <p className="mt-3 rounded-xl bg-surface-muted/60 px-4 py-3 text-[14.5px] leading-snug text-ink">{open.note}</p>}
          <p className="mt-4 text-[13.5px] text-ink-muted">เขตเห็นข้อมูลรายคนได้แต่ไม่ลงมือแทนโรงเรียน — ถ้าเด็กไม่มีผู้รับผิดชอบ อาจพิจารณาสร้างมาตรการให้อำเภอนี้</p>
        </Drawer>
      )}
      {measure && (
        <MeasureSheet
          p={measure}
          team={team}
          onClose={() => setMeasure(null)}
          onSave={(m) => {
            area.addMeasure({ by: user?.name ?? 'ผู้บริหารเขต', pattern: measure.key, ...m })
            setMeasure(null)
            push(`สร้างมาตรการ "${m.title}" แล้ว`)
          }}
        />
      )}
    </div>
  )
}
