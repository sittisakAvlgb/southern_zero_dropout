import { useEffect, useRef, useState } from 'react'
import type { Student } from '@/types'
import type { CaseLogEntry } from '@/lib/caseLog'
import { SCHOOL_BY_ID } from '@/data/schools'
import { GRADE_LABEL } from '@/lib/schoolOps'
import { LEVEL_TH, type FollowCase } from '@/lib/followOps'
import { caseStatus, latestOutcome, riskTrend } from '@/lib/careOps'
import { useToast } from '@/components/ui/Toast'
import { Drawer } from '@/components/referrals/ui'

// ── 1. พูดแทนพิมพ์ ───────────────────────────────────────────

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

const Ctor = (): (new () => Recognition) | undefined =>
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)

/**
 * ปุ่มไมค์ — ครูพูดภาษาไทย ข้อความต่อท้ายช่องที่พิมพ์อยู่
 * ใช้การรู้จำเสียงของเบราว์เซอร์ (Chrome/Edge/Android) ถ้าเบราว์เซอร์ไม่รองรับ
 * ปุ่มจะไม่แสดงเลย แทนที่จะให้กดแล้วไม่เกิดอะไร
 */
export function MicButton({ onText }: { onText: (t: string) => void }) {
  const { push } = useToast()
  const [on, setOn] = useState(false)
  const rec = useRef<Recognition | null>(null)
  useEffect(() => () => rec.current?.stop(), [])
  const C = Ctor()
  if (!C) return null
  const toggle = () => {
    if (on) return rec.current?.stop()
    const r = new C()
    r.lang = 'th-TH'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (text) onText(text)
    }
    r.onerror = (e) => {
      setOn(false)
      if (e.error === 'not-allowed') push('เบราว์เซอร์ไม่อนุญาตให้ใช้ไมโครโฟน — เปิดสิทธิ์ไมค์ในการตั้งค่าเบราว์เซอร์', 'info')
      else if (e.error !== 'aborted' && e.error !== 'no-speech') push('ฟังไม่ชัด ลองพูดอีกครั้ง', 'info')
    }
    r.onend = () => setOn(false)
    rec.current = r
    r.start()
    setOn(true)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'หยุดฟัง' : 'พูดแทนพิมพ์'}
      className={`shrink-0 rounded-xl border px-3.5 text-[14px] font-semibold ${on ? 'border-red-300 bg-red-50 text-red-700' : 'border-surface-border bg-white text-ink'}`}
    >
      {on ? '● กำลังฟัง…' : '🎤 พูด'}
    </button>
  )
}

// ── 2. ข้อมูลครอบครัวจากการเยี่ยมบ้าน · ผลการเรียน ──────────────

/** ข้อมูลครอบครัวที่ครูกรอกตอนเยี่ยมบ้านครั้งล่าสุด — แสดงเฉพาะช่องที่กรอก
 *  ช่องว่างจะอ่านเหมือนเป็นข้อเท็จจริงเกี่ยวกับครอบครัว */
export function FamilyFromVisit({ visit, t, onVisit, mayAct }: { visit?: CaseLogEntry; t: (k: string) => string; onVisit: () => void; mayAct: boolean }) {
  const f = visit?.family
  const rows: [string, string][] = f
    ? (
        [
          ['ผู้ดูแล', f.guardianRelation ? `${t(`hv.rel.${f.guardianRelation}`)}${f.guardianName ? ` · ${f.guardianName}` : ''}` : ''],
          ['อาชีพ', f.occupation ?? ''],
          ['รายได้ครัวเรือน', f.incomeBand ? t(`hv.inc.${f.incomeBand}`) : ''],
          ['สมาชิกในบ้าน', f.members ? `${f.members} คน` : ''],
          ['ที่อยู่อาศัย', f.housing ? t(`hv.ho.${f.housing}`) : ''],
        ] as [string, string][]
      ).filter(([, v]) => v)
    : []
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <h2 className="mb-2 text-[16px] font-bold text-ink">ข้อมูลครอบครัวจากการเยี่ยมบ้าน</h2>
      {!visit ? (
        <div>
          <p className="text-[14px] text-ink-muted">ยังไม่มีบันทึกการเยี่ยมบ้านในระบบนี้</p>
          {mayAct && (
            <button type="button" onClick={onVisit} className="mt-2 rounded-xl border border-surface-border px-3.5 py-2 text-[14px] font-semibold text-brand-700">
              บันทึกการเยี่ยมบ้าน
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-[13.5px] text-ink-muted">
            เยี่ยมเมื่อ {visit.date}
            {visit.arrivedAt ? ` · ถึง ${visit.arrivedAt}` : ''}
            {visit.signature ? ` · ผู้ปกครองลงนาม: ${visit.signature.name}` : ''}
          </p>
          {rows.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12.5px] text-ink-faint">{k}</dt>
                  <dd className="font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {Boolean(f?.study.length) && (
            <p className="mt-2 text-[14px] text-ink">
              <span className="text-ink-muted">มีที่บ้านสำหรับเรียน:</span> {f!.study.map((c) => t(`hv.sd.${c}`)).join(' · ')}
            </p>
          )}
          {Boolean(f?.findings.length) && (
            <p className="mt-1 text-[14px] text-ink">
              <span className="text-ink-muted">สิ่งที่พบที่บ้าน:</span> {f!.findings.map((c) => t(`cause.${c}`)).join(' · ')}
            </p>
          )}
          {!rows.length && !f?.study.length && !f?.findings.length && <p className="text-[14px] text-ink-muted">บันทึกการเยี่ยมครั้งนี้ไม่ได้กรอกข้อมูลครอบครัว</p>}
        </>
      )}
    </section>
  )
}

export function Grades({ s }: { s: Student }) {
  const g = s.grades
  if (!g.length) return null
  const first = g[0].gpa
  const last = g[g.length - 1].gpa
  const d = Math.round((last - first) * 100) / 100
  const insight =
    d <= -0.3 ? `เกรดเฉลี่ยลดลง ${Math.abs(d).toFixed(2)} ใน ${g.length} ภาคเรียน` : d >= 0.3 ? `เกรดเฉลี่ยดีขึ้น ${d.toFixed(2)} ใน ${g.length} ภาคเรียน` : 'เกรดเฉลี่ยทรงตัว'
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <h2 className="mb-1 text-[16px] font-bold text-ink">ผลการเรียน</h2>
      <p className="mb-2 text-[14.5px] font-semibold text-ink">
        {insight}
        {last < 2 && <span className="font-normal text-ink-muted"> · ภาคล่าสุดต่ำกว่า 2.00</span>}
      </p>
      <ul className="space-y-1.5">
        {g.map((p) => (
          <li key={p.term} className="grid grid-cols-[64px_1fr_40px] items-center gap-3 text-[14px]">
            <span className="text-ink-muted">ภาค {p.term}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full rounded-full bg-slate-400" style={{ width: `${(p.gpa / 4) * 100}%` }} />
            </span>
            <span className="text-right font-bold tabular text-ink">{p.gpa.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── 3. การมาเรียน ─────────────────────────────────────────────

const DAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

/** วันเรียนของสัปดาห์นี้ จ.–ศ. ที่ผ่านมาแล้ว (รวมวันนี้) — วันหยุดสุดสัปดาห์ใช้สัปดาห์ที่เพิ่งจบ */
function schoolDaysThisWeek(today = new Date()): Date[] {
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const end = new Date(d)
  if (dow === 6) end.setDate(d.getDate() - 1)
  if (dow === 0) end.setDate(d.getDate() - 2)
  const mon = new Date(end)
  mon.setDate(end.getDate() - (end.getDay() - 1))
  const out: Date[] = []
  for (let x = new Date(mon); x <= end; x.setDate(x.getDate() + 1)) out.push(new Date(x))
  return out
}

/**
 * การมาเรียนรายวันสัปดาห์นี้ + รายสัปดาห์ย้อนหลัง
 *
 * ทะเบียนมีอัตรามาเรียนเป็นรายสัปดาห์ และจำนวนวันที่ขาดติดกันล่าสุด ไม่มีบันทึก
 * รายวัน — วันที่อยู่ในช่วงขาดติดกันจึงรู้แน่ว่า "ขาด" วันก่อนหน้านั้นหนึ่งวันรู้แน่ว่า
 * "มา" (ไม่งั้นช่วงขาดจะยาวกว่านี้) ที่เหลือแสดงเป็น "—" ไม่เดา
 */
export function Attendance({ s }: { s: Student }) {
  const days = schoolDaysThisWeek()
  const n = days.length
  const state = (i: number): 'absent' | 'present' | 'unknown' => {
    const fromEnd = n - 1 - i
    if (fromEnd < s.absenceStreak) return 'absent'
    if (fromEnd === s.absenceStreak) return 'present'
    return 'unknown'
  }
  const weeks = s.attendance
  const now = weeks[weeks.length - 1]?.rate ?? 0
  return (
    <section className="rounded-3xl border border-surface-border bg-white p-4 sm:p-5">
      <h2 className="mb-1 text-[16px] font-bold text-ink">การมาเรียน</h2>
      <p className="mb-3 text-[14.5px] font-semibold text-ink">
        สัปดาห์นี้ {Math.round(now)}%{s.absenceStreak > 0 ? ` · ขาดติดกัน ${s.absenceStreak} วันเรียนล่าสุด` : ' · ไม่มีการขาดติดกัน'}
      </p>
      <ol className="grid grid-cols-5 gap-1.5" aria-label="การมาเรียนสัปดาห์นี้">
        {days.map((d, i) => {
          const st = state(i)
          return (
            <li
              key={d.toISOString()}
              className={`rounded-xl border px-1 py-2 text-center ${st === 'absent' ? 'border-red-200 bg-red-50' : 'border-surface-border bg-white'}`}
            >
              <p className="text-[12.5px] text-ink-muted">
                {DAY_TH[d.getDay()]} {d.getDate()}
              </p>
              <p className={`text-[14px] font-bold ${st === 'absent' ? 'text-red-700' : st === 'present' ? 'text-ink' : 'text-ink-faint'}`}>
                {st === 'absent' ? 'ขาด' : st === 'present' ? 'มา' : '—'}
              </p>
            </li>
          )
        })}
      </ol>
      {days.some((_, i) => state(i) === 'unknown') && (
        <p className="mt-1.5 text-[12.5px] text-ink-muted">— = ทะเบียนมีข้อมูลรายวันเฉพาะช่วงขาดติดกัน วันอื่นดูได้จากอัตรารายสัปดาห์ด้านล่าง</p>
      )}
      <p className="mb-1.5 mt-4 text-[13.5px] font-semibold text-ink-muted">8 สัปดาห์ย้อนหลัง</p>
      <ul className="grid grid-cols-8 items-end gap-1.5" aria-label="อัตรามาเรียนรายสัปดาห์">
        {weeks.map((w, i) => (
          <li key={w.week} className="flex flex-col items-center gap-1">
            <span className="text-[12px] font-semibold tabular text-ink">{Math.round(w.rate)}</span>
            <span className="flex h-16 w-full items-end overflow-hidden rounded-md bg-surface-muted">
              <span className={`block w-full rounded-md ${w.rate < 80 ? 'bg-slate-500' : 'bg-slate-300'}`} style={{ height: `${w.rate}%` }} />
            </span>
            <span className="text-[12px] text-ink-faint">{i === weeks.length - 1 ? 'นี้' : `-${weeks.length - 1 - i}`}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12.5px] text-ink-muted">แท่งเข้ม = ต่ำกว่า 80% · ตัวเลขใต้แท่ง = สัปดาห์ก่อนหน้า</p>
    </section>
  )
}

// ── 4. สรุปเคสหนึ่งหน้า ───────────────────────────────────────

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function buildSummary(fc: FollowCase, entries: CaseLogEntry[], obs: string[], by: string, t: (k: string) => string) {
  const s = fc.s
  const school = SCHOOL_BY_ID[s.schoolKey]
  const tr = riskTrend(s)
  const done = entries.filter((e) => !e.choice && !e.followUpMethod).slice(0, 6)
  const fus = entries.filter((e) => e.followUpDate && !e.followUpDone)
  const sections: [string, string[]][] = [
    [
      'ข้อมูลนักเรียน',
      [
        `${s.name} (${s.id}) · ${GRADE_LABEL(s.gradeKey, true)} · ${school ? `โรงเรียน${school.name}` : s.schoolKey}`,
        `ครูเจ้าของเคส: ${s.caseOwner || '—'} · สถานะ: ${caseStatus(fc).th}`,
        `ความเสี่ยง ${s.riskScore}/100 ระดับ${LEVEL_TH[s.riskLevel]} — ${tr.insight}`,
        `มาเรียนสัปดาห์นี้ ${Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)}% · ขาดติดกัน ${s.absenceStreak} วัน`,
      ],
    ],
    ['สิ่งที่ครูพบ', obs.length ? obs : ['ยังไม่มีบันทึกสิ่งที่ครูพบ']],
    ['สาเหตุตามข้อมูล', [s.causeKeys.map((k) => t(`cause.${k}`)).join(' · ') || '—']],
    ['ที่ผ่านมาได้ช่วยอะไรแล้ว', done.length ? done.map((e) => `${e.date} — ${e.note}`) : s.timeline.slice(-3).map((e) => `${e.date} — ${e.note}`)],
    ['ผลล่าสุด', latestOutcome(fc, entries).map((r) => `${r.ok ? '✓' : '○'} ${r.th}`)],
    ['สิ่งที่จะทำต่อ', [`${fc.next.th} — ${fc.next.whyTh}`, ...fus.map((e) => `นัด ${e.followUpDate}${e.followUpTime ? ` ${e.followUpTime}` : ''} · ${e.followUpMethod ?? 'ติดตามผล'} · ${e.followUpOwner ?? e.by}`)]],
    ['การส่งต่อ', fc.refs.length ? fc.refs.map((r) => `${r.toName} · ${r.needTh} · ${r.next.th}`) : ['ยังไม่มี']],
  ]
  const date = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
  const text = [`สรุปเคส — ${s.name}`, `จัดทำโดย ${by} · ${date}`, '', ...sections.flatMap(([h, xs]) => [h, ...xs.map((x) => `  • ${x}`), ''])].join('\n')
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>สรุปเคส ${esc(s.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600&display=swap" rel="stylesheet">
<style>body{font-family:Kanit,sans-serif;color:#0f172a;max-width:720px;margin:24px auto;padding:0 16px;font-size:14px;line-height:1.55}
h1{font-size:20px;margin:0}p.meta{color:#475569;margin:4px 0 16px}h2{font-size:15px;margin:14px 0 4px;border-bottom:1px solid #e2e8f0;padding-bottom:2px}
ul{margin:0;padding-left:18px}.pdpa{margin-top:20px;font-size:12px;color:#475569;border-top:1px solid #e2e8f0;padding-top:8px}
@media print{body{margin:0}}</style></head><body>
<h1>สรุปเคส — ${esc(s.name)}</h1><p class="meta">จัดทำโดย ${esc(by)} · ${esc(date)}</p>
${sections.map(([h, xs]) => `<h2>${esc(h)}</h2><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}
<p class="pdpa">เอกสารนี้มีข้อมูลส่วนบุคคลของนักเรียน — ใช้ภายในเพื่อการช่วยเหลือเท่านั้น ห้ามเผยแพร่ (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)</p>
</body></html>`
  return { sections, text, html }
}

export function CaseSummary({
  fc,
  entries,
  obs,
  by,
  t,
  onClose,
}: {
  fc: FollowCase
  entries: CaseLogEntry[]
  obs: string[]
  by: string
  t: (k: string) => string
  onClose: () => void
}) {
  const { push } = useToast()
  const { sections, text, html } = buildSummary(fc, entries, obs, by, t)
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return push('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาตป๊อปอัปแล้วลองอีกครั้ง', 'info')
    w.document.write(html)
    w.document.close()
    w.onload = () => w.print()
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      return push('คัดลอกสรุปแล้ว — วางใน LINE หรืออีเมลได้')
    } catch {
      // เบราว์เซอร์ในแอป (เช่น LINE) และมือถือรุ่นเก่ามักปิด Clipboard API — ใช้วิธีเดิมแทน
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      push(ok ? 'คัดลอกสรุปแล้ว — วางใน LINE หรืออีเมลได้' : 'คัดลอกไม่ได้ — ลองเลือกข้อความเอง', ok ? 'success' : 'info')
    }
  }
  const csv = () => {
    const rows = sections.flatMap(([h, xs]) => xs.map((x) => [h, x]))
    const body = rows.map(([a, b]) => `"${a.replace(/"/g, '""')}","${b.replace(/"/g, '""')}"`).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${fc.s.id}-record.csv`
    a.click()
    URL.revokeObjectURL(url)
    push(`ส่งออกประวัติของ ${fc.s.name} แล้ว`)
  }
  return (
    <Drawer
      label="สรุปเคส"
      head={
        <>
          <p className="text-[19px] font-bold text-ink">สรุปเคสหนึ่งหน้า</p>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">สำหรับส่ง ผอ. หรือแนบตอนส่งต่อ</p>
        </>
      }
      onClose={onClose}
      footer={
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={print} className="rounded-xl bg-brand-500 px-2 py-3 text-[14.5px] font-semibold text-white">
            พิมพ์ / PDF
          </button>
          <button type="button" onClick={copy} className="rounded-xl border border-surface-border bg-white px-2 py-3 text-[14.5px] font-medium text-ink">
            คัดลอกข้อความ
          </button>
          <button type="button" onClick={csv} className="rounded-xl border border-surface-border bg-white px-2 py-3 text-[14.5px] font-medium text-ink">
            ส่งออก CSV
          </button>
        </div>
      }
    >
      <p className="mb-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-[13px] text-ink">
        มีข้อมูลส่วนบุคคลของนักเรียน — ส่งเฉพาะผู้ที่เกี่ยวข้องกับการช่วยเหลือ (PDPA)
      </p>
      {sections.map(([h, xs]) => (
        <section key={h} className="mb-3">
          <h3 className="border-b border-surface-border pb-1 text-[15px] font-bold text-ink">{h}</h3>
          <ul className="mt-1.5 space-y-0.5 text-[14px] text-ink">
            {xs.map((x, i) => (
              <li key={i}>• {x}</li>
            ))}
          </ul>
        </section>
      ))}
    </Drawer>
  )
}
