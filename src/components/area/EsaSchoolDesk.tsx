import { useMemo, useState } from 'react'
import { useScopedData } from '@/auth/scope'
import { esaOfDistrict } from '@/data/esa'
import { useI18n } from '@/i18n/LanguageContext'
import { useToast } from '@/components/ui/Toast'
import { fmtDay } from '@/lib/directorOps'
import { AREA_ACT_TH, AREA_NEED_TH, AREA_VERDICT_TH, areaRequestStatus, useAreaLog, type AreaAct, type AreaRequest } from '@/lib/areaLog'
import { TIER_META, crossSchoolPatterns, requestBrief, schoolViews, teamRows, type Pattern, type SchoolView, type Tier } from '@/lib/areaDeskOps'
import { MeasureSheet, RequestDrawer, SupportSheet } from './AreaOpsCenter'
import { EsaSchoolDrawer, SchoolTable, TIER_BAR, exportSchoolsCsv } from './EsaSchoolParts'
import { useFollowCases } from '@/components/followup/useFollowCases'
const TIERS: Tier[] = ['urgent', 'follow', 'watch', 'ok']

type Sheet = { kind: 'support'; v: SchoolView } | { kind: 'request'; r: AreaRequest } | { kind: 'decide'; r: AreaRequest; acts: AreaAct[] } | { kind: 'school'; v: SchoolView } | { kind: 'measure'; p: Pattern }

/**
 * โรงเรียนในเขต — มุมมองของเขต
 *
 * หน้าเดิม (ผลการดำเนินงานโรงเรียน) เรียงตามคุณภาพข้อมูล ป้ายเคสค้างรายโรงเรียนมาจากตัวเลขรายงาน
 * (รวม 79 ขณะที่หน้าเขตบอกเกิน SLA 30) และไม่มีที่ให้เขตลงมือ ที่นี่เรียงจากโรงเรียนที่ต้องช่วยก่อน
 * นับเคสจากเคสจริง แต่ละโรงเรียนบอกสถานะกับเขต (คำขอรอเขต · เขตส่งอะไรไป · ผลที่โรงเรียนรายงาน)
 * และปุ่มหลักคือ "วางแผนสนับสนุน" — มุมมองตาราง (เรียงได้ทุกคอลัมน์ · ส่งออก CSV) และข้อมูลโรงเรียน
 * อยู่ในหน้านี้ เขตจึงไม่ต้องไปตารางเดิมที่มีแถบเตือนสามแถบและตัวเลขเคสค้างคนละชุด
 */
export function EsaSchoolDesk({ esaKey: esaKeyProp }: { esaKey?: string } = {}) {
  const { dn } = useI18n()
  const { push } = useToast()
  const scoped = useScopedData()
  const { user } = scoped
  /** สพฐ. ดูทีละเขต — ย่อโรงเรียนและเคสให้เหลือเขตนั้น (กติกาเดียวกับหน้าอื่น) */
  const inEsa = useMemo(() => {
    if (!esaKeyProp) return () => true
    return (districtKey?: string) => esaOfDistrict(districtKey) === esaKeyProp
  }, [esaKeyProp])
  const schools = useMemo(() => scoped.schools.filter((x) => inEsa(x.districtKey)), [scoped.schools, inEsa])
  const students = useMemo(() => scoped.students.filter((x) => inEsa(x.districtKey)), [scoped.students, inEsa])
  const cases = useMemo(() => scoped.cases.filter((x) => inEsa(x.districtKey)), [scoped.cases, inEsa])
  const referrals = scoped.referrals
  /** การสนับสนุนและการตัดสินใจเป็นการกระทำของเขตนั้น เขียนลงสมุดงานของเขตพร้อม
   *  ชื่อผู้สั่ง สพฐ. ที่เปิดดูเขตอื่นจึงอ่านได้อย่างเดียว */
  const mayAct = !esaKeyProp
  const area = useAreaLog(esaKeyProp ?? user?.esaKey)
  const by = user?.name ?? 'ผู้บริหารเขต'
  /** `mayAct` คือ "นี่คือเขตของบัญชีนี้เอง" — เขตนับเกิน SLA จาก `FollowCase`
   *  เหมือนหน้าแรกและป้ายเมนูของตัวเอง ส่วน สพฐ. ที่ส่อง `esaKey` ของคนอื่นเข้ามา
   *  ยังนับจาก `cases` ชุดเดียวกับแถบ AI และหน้าแรกของ สพฐ. */
  const { built: followBuilt } = useFollowCases()
  const follow = useMemo(
    () => (mayAct && 'list' in followBuilt ? followBuilt.list : undefined),
    [mayAct, followBuilt],
  )
  const views = useMemo(() => schoolViews(schools, cases, students, follow), [schools, cases, students, follow])
  const patterns = useMemo(() => crossSchoolPatterns(schools, students, referrals), [schools, students, referrals])
  const team = useMemo(() => teamRows(area), [area])
  const [tier, setTier] = useState<Tier | 'all'>('all')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [mode, setMode] = useState<'list' | 'table'>('list')
  const [q, setQ] = useState('')

  const count = (t: Tier) => views.filter((v) => v.tier === t).length
  const rows = views.filter((v) => (tier === 'all' || v.tier === tier) && (!q.trim() || v.s.name.includes(q.trim()) || dn(v.s.districtKey).includes(q.trim())))
  const waiting = area.requests.filter((r) => areaRequestStatus(r) === 'new').length
  const active = area.actions.filter((a) => !a.done).length + area.requests.filter((r) => areaRequestStatus(r) === 'decided').length
  const reported = area.actions.filter((a) => a.done).length + area.requests.filter((r) => r.done).length

  return (
    <div className="animate-page-rise space-y-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight text-ink">โรงเรียนในเขต</h1>
          <p className="mt-1 text-[14.5px] text-ink-muted">เรียงจากโรงเรียนที่ต้องช่วยก่อน — เขตเข้ามาช่วยเมื่อโรงเรียนแก้ต่อเองไม่ไหว</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-surface-muted p-1" role="group" aria-label="มุมมอง">
            {(['list', 'table'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-4 py-2 text-[14.5px] font-semibold ${mode === m ? 'bg-white text-brand-700 shadow-card' : 'text-ink-muted hover:text-ink'}`}>
                {m === 'list' ? 'รายการ' : 'ตาราง'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => exportSchoolsCsv(rows, dn)} className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink hover:border-brand-300">
            ส่งออก CSV
          </button>
        </div>
      </div>

      {/* ── สรุป: ระดับความเร่งด่วน (กดกรอง) + งานกับเขต ── */}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-surface-border">
        <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามระดับ">
          {(['all', ...TIERS] as const).map((k) => {
            const on = tier === k
            const n = k === 'all' ? views.length : count(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setTier(k)}
                disabled={k !== 'all' && n === 0}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14.5px] font-semibold transition-colors disabled:opacity-40 ${on ? 'bg-ink text-white' : 'bg-surface-muted/70 text-ink hover:bg-surface-muted'}`}
              >
                {k !== 'all' && <span className={`h-2.5 w-2.5 rounded-full ${TIER_META[k].dot}`} aria-hidden />}
                {k === 'all' ? 'ทั้งหมด' : TIER_META[k].th}
                <span className="tabular">{n}</span>
              </button>
            )
          })}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อโรงเรียนหรืออำเภอ"
          aria-label="ค้นหาชื่อโรงเรียนหรืออำเภอ"
          className="mt-3 w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[15px] text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-3 border-t border-surface-border pt-3 text-[14px] text-ink-muted">
          คำขอรอเขตตัดสินใจ <b className={waiting ? 'text-red-700' : 'text-ink'}>{waiting}</b> · เขตกำลังสนับสนุน <b className="text-ink">{active}</b> · โรงเรียนรายงานผลแล้ว <b className="text-ink">{reported}</b>
        </p>
      </div>

      {/* ── โรงเรียน: แถวเดียวต่อโรงเรียนในการ์ดเดียว — ชื่อ · ตัวเลขสามตัวในบรรทัดเดียว · AI · สถานะกับเขต · ปุ่มหลักด้านขวา ── */}
      {rows.length === 0 && <p className="rounded-2xl border border-dashed border-surface-border bg-white px-5 py-4 text-[15px] text-ink-muted">ไม่พบโรงเรียนที่ตรงกับตัวกรอง</p>}
      {mode === 'table' && rows.length > 0 && <SchoolTable rows={rows} dn={dn} onOpen={(v) => setSheet({ kind: 'school', v })} />}
      {mode === 'list' && rows.length > 0 && (
      <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl bg-white ring-1 ring-surface-border">
        {rows.map((v) => {
          const reqs = area.requests.filter((r) => r.schoolId === v.s.id && !r.done && areaRequestStatus(r) !== 'rejected')
          const acts = area.actions.filter((a) => a.schoolId === v.s.id && !a.done)
          const lastDone = [...area.requests.filter((r) => r.schoolId === v.s.id && r.done), ...area.actions.filter((a) => a.schoolId === v.s.id && a.done)].sort((a, b) => (b.done?.ts ?? 0) - (a.done?.ts ?? 0))[0]
          return (
            <li key={v.s.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
              <span className="hidden h-11 w-1 shrink-0 rounded-full sm:block" style={{ background: TIER_BAR[v.tier] }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button type="button" onClick={() => setSheet({ kind: 'school', v })} className="text-left text-[16.5px] font-bold text-ink underline-offset-2 hover:text-brand-700 hover:underline">
                    {v.s.name}
                  </button>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${TIER_META[v.tier].pill}`}>{TIER_META[v.tier].th}</span>
                </div>
                <p className="mt-1 text-[14px] text-ink-muted">
                  อ.{dn(v.s.districtKey)} · เสี่ยงสูง <b className="font-semibold text-ink">{v.rate.toFixed(1)}%</b> · เกิน SLA{' '}
                  <b className={`font-semibold ${v.overdue >= 5 ? 'text-red-700' : 'text-ink'}`}>{v.overdue}</b>
                  {v.unassigned ? ` (ไม่มีเจ้าของ ${v.unassigned})` : ''} · ช่วยสำเร็จ <b className="font-semibold text-ink">{v.s.interventionSuccessRate.toFixed(0)}%</b>
                </p>
                <p className="mt-1.5 text-[14.5px] leading-snug text-ink">
                  <span className="font-semibold text-brand-700">AI: </span>
                  {v.ai}
                </p>
                {(reqs.length > 0 || acts.length > 0 || lastDone) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reqs.map((r) => {
                      const st = areaRequestStatus(r)
                      return st === 'new' ? (
                        mayAct ? (
                        <button key={r.id} type="button" onClick={() => setSheet({ kind: 'request', r })} className="rounded-full bg-red-50 px-3 py-1.5 text-[13.5px] font-semibold text-red-800 hover:bg-red-100">
                          คำขอรอเขต: {AREA_NEED_TH[r.need]} · รอ {requestBrief(r, team, patterns).waitedDays} วัน →
                        </button>
                        ) : (
                        <span key={r.id} className="rounded-full bg-red-50 px-3 py-1.5 text-[13.5px] font-semibold text-red-800">
                          คำขอรอเขต: {AREA_NEED_TH[r.need]} · รอ {requestBrief(r, team, patterns).waitedDays} วัน
                        </span>
                        )
                      ) : (
                        <span key={r.id} className="rounded-full bg-brand-50 px-3 py-1.5 text-[13.5px] font-semibold text-brand-800">
                          เขต{AREA_VERDICT_TH[r.decision!.verdict]}: {AREA_NEED_TH[r.need]}
                        </span>
                      )
                    })}
                    {acts.map((a) => (
                      <span key={a.id} className="rounded-full bg-brand-50 px-3 py-1.5 text-[13.5px] font-semibold text-brand-800">
                        เขตส่ง {a.acts.map((x) => AREA_ACT_TH[x]).join(' · ')} · กำหนด {fmtDay(a.due)}
                      </span>
                    ))}
                    {lastDone && <span className="rounded-full bg-green-50 px-3 py-1.5 text-[13.5px] font-semibold text-green-800">✓ โรงเรียนรายงานผลแล้ว</span>}
                  </div>
                )}
              </div>
              {mayAct && v.tier !== 'ok' && (
                <button
                  type="button"
                  onClick={() => setSheet({ kind: 'support', v })}
                  className={`shrink-0 self-start rounded-xl px-4 py-2.5 text-[14.5px] font-semibold ${v.tier === 'urgent' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-surface-border bg-white text-ink hover:border-brand-300'}`}
                >
                  วางแผนสนับสนุน
                </button>
              )}
            </li>
          )
        })}
      </ul>
      )}

      {sheet?.kind === 'school' && (
        <EsaSchoolDrawer
          v={sheet.v}
          dn={dn}
          requests={area.requests.filter((r) => r.schoolId === sheet.v.s.id)}
          actions={area.actions.filter((a) => a.schoolId === sheet.v.s.id)}
          onClose={() => setSheet(null)}
          onSupport={() => setSheet({ kind: 'support', v: sheet.v })}
          onRequest={(r) => setSheet({ kind: 'request', r })}
        />
      )}
      {sheet?.kind === 'request' && (
        <RequestDrawer
          r={sheet.r}
          team={team}
          patterns={patterns}
          school={views.find((v) => v.s.id === sheet.r.schoolId)}
          onClose={() => setSheet(null)}
          onDecide={(acts) => setSheet({ kind: 'decide', r: sheet.r, acts })}
          onOpenSchool={() => {
            const v = views.find((x) => x.s.id === sheet.r.schoolId)
            if (v) setSheet({ kind: 'school', v })
          }}
          onMeasure={(p) => setSheet({ kind: 'measure', p })}
        />
      )}
      {sheet?.kind === 'measure' && (
        <MeasureSheet
          p={sheet.p}
          team={team}
          onClose={() => setSheet(null)}
          onSave={(m) => {
            area.addMeasure({ by, pattern: sheet.p.key, ...m })
            setSheet(null)
            push(`สร้างมาตรการ "${m.title}" แล้ว`)
          }}
        />
      )}
      {sheet?.kind === 'decide' && (
        <SupportSheet
          title={`ตัดสินใจ · ${sheet.r.schoolName}`}
          sub={AREA_NEED_TH[sheet.r.need]}
          withVerdict
          acts0={sheet.acts}
          expected0={requestBrief(sheet.r, team, patterns).expected}
          team={team}
          onClose={() => setSheet(null)}
          onSave={(d) => {
            area.decide(sheet.r.id, { by, ...d })
            setSheet(null)
            push(d.verdict === 'approve' ? `ส่งการตัดสินใจถึง ผอ.${sheet.r.schoolName} แล้ว — ${d.owner} รับผิดชอบฝั่งเขต` : `ส่ง "${AREA_VERDICT_TH[d.verdict]}" ถึงโรงเรียนแล้ว`)
          }}
        />
      )}
      {sheet?.kind === 'support' && (
        <SupportSheet
          title={`วางแผนสนับสนุน · ${sheet.v.s.name}`}
          sub={`${TIER_META[sheet.v.tier].th} · อำเภอ${dn(sheet.v.s.districtKey)}`}
          context={
            <div className="rounded-2xl border border-surface-border p-4">
              <ul className="space-y-1">
                {sheet.v.why.map((w) => (
                  <li key={w} className="flex gap-2 text-[14.5px] text-ink">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
              <p className="mt-2 rounded-xl bg-brand-50/60 px-3 py-2.5 text-[14.5px] leading-snug text-ink">
                <span className="font-semibold text-brand-700">AI: </span>
                {sheet.v.ai}
              </p>
            </div>
          }
          acts0={sheet.v.suggest}
          expected0={sheet.v.overdue ? `เคสเกิน SLA ของโรงเรียนลดลงครึ่งหนึ่งภายใน 1 เดือน (ตอนนี้ ${sheet.v.overdue})` : 'เด็กเสี่ยงสูงทุกคนมีผู้รับผิดชอบและแผนภายใน 1 เดือน'}
          team={team}
          onClose={() => setSheet(null)}
          onSave={(d) => {
            area.addAction({ schoolId: sheet.v.s.id, schoolName: sheet.v.s.name, by, acts: d.acts, owner: d.owner, due: d.due, expected: d.expected, note: d.note })
            setSheet(null)
            push(`ส่งการสนับสนุนถึง ผอ.${sheet.v.s.name} แล้ว — ${d.owner} รับผิดชอบฝั่งเขต`)
          }}
        />
      )}
    </div>
  )
}
