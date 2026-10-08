// ─────────────────────────────────────────────────────────────
// Report building and export.
//
// The Reports page used to hand out toasts: "report generated" with nothing to
// open. Everything here produces a file the user can actually keep:
//   · CSV  — UTF-8 with a BOM so Thai opens correctly in Excel
//   · XLS  — an HTML table served as application/vnd.ms-excel (opens natively
//            in Excel and LibreOffice; no dependency needed)
//   · HTML — a standalone, print-styled page for presenting or archiving
//   · PDF  — the same page rendered into a hidden iframe and sent to the
//            browser's print dialog, where "Save as PDF" writes the file.
//            Generating a real PDF in-process would need an embedded Thai
//            font, which no client-side library here can supply.
// ─────────────────────────────────────────────────────────────
import type { CaseRecord, District, OoscRecord, OpportunityPlan, Province, Referral, School } from '@/types'
import { oosSplit } from './oos'

export type ReportFormat = 'pdf' | 'xls' | 'csv' | 'html'

export interface ReportDef {
  id: string
  title: string
  subtitle: string
  scopeLabel: string
  periodLabel: string
  generatedAt: string
  by: string
  kpis: { label: string; value: string }[]
  columns: string[]
  rows: (string | number)[][]
  /** shown under the table in the exported document */
  note: string
}

export interface ReportContext {
  th: boolean
  provinces: Province[]
  districts: District[]
  schools: School[]
  oosc: OoscRecord[]
  plans: OpportunityPlan[]
  referrals: Referral[]
  cases: CaseRecord[]
  pn: (k: string) => string
  dn: (k: string) => string
  t: (k: string) => string
  scopeLabel: string
  periodLabel: string
  by: string
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0)
const sum = <T,>(rows: T[], sel: (r: T) => number) => rows.reduce((a, r) => a + sel(r), 0)

/** Build the report body for a template id against the caller's scoped data. */
export function buildReport(id: string, c: ReportContext): ReportDef {
  const { th, provinces, districts, schools, oosc, plans, referrals } = c
  const students = sum(provinces, (p) => p.totalStudents)
  const highRisk = sum(provinces, (p) => p.highRiskStudents)
  const oos = sum(provinces, (p) => p.oosCount)
  const outcome = sum(provinces, (p) => p.outcomeCount)

  const base = {
    scopeLabel: c.scopeLabel,
    periodLabel: c.periodLabel,
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    by: c.by,
    note: th
      ? 'ข้อมูลจำลองเพื่อการสาธิต — ชื่อพื้นที่และรายชื่อโรงเรียนเป็นของจริง ตัวเลขเป็นข้อมูลตัวอย่าง'
      : 'Demonstration data — real place and school names, sample figures.',
  }

  const areaKpis = [
    { label: th ? 'นักเรียนในพื้นที่' : 'Students', value: students.toLocaleString() },
    { label: th ? 'เด็กเสี่ยงสูง' : 'High risk', value: highRisk.toLocaleString() },
    { label: th ? 'เด็กนอกระบบ' : 'Out of school', value: oos.toLocaleString() },
    {
      label: th ? 'กลับเข้าเรียน / มีอาชีพ' : 'Back in learning or work',
      value: outcome.toLocaleString(),
    },
  ]

  switch (id) {
    case 'prov-risk':
      return {
        ...base,
        id,
        title: th ? 'รายงานความเสี่ยงรายอำเภอ' : 'District Risk Report',
        subtitle: th
          ? 'จัดอันดับอำเภอตามสัดส่วนเด็กเสี่ยงสูง'
          : 'Districts ranked by the share of high-risk students',
        kpis: areaKpis,
        columns: th
          ? ['อำเภอ', 'จังหวัด', 'นักเรียน', 'เด็กเสี่ยงสูง', 'สัดส่วนเสี่ยง %', 'เด็กนอกระบบ', 'ความครอบคลุมของแผน %']
          : ['District', 'Province', 'Students', 'High risk', 'Risk %', 'Out of school', 'Plan coverage %'],
        rows: [...districts]
          .sort((a, b) => b.riskRate - a.riskRate)
          .map((d) => [
            c.dn(d.key),
            c.pn(d.provinceKey),
            d.totalStudents,
            d.highRiskStudents,
            d.riskRate,
            d.oosCount,
            d.planCoverage,
          ]),
      }

    case 'iv-sla': {
      const needs = Array.from(new Set(referrals.map((r) => r.need)))
      return {
        ...base,
        id,
        title: th ? 'รายงาน SLA การส่งต่อและการช่วยเหลือ' : 'Referral & Intervention SLA Report',
        subtitle: th
          ? 'เวลาตอบสนองและเคสที่เกินกรอบเวลา แยกตามประเภทความช่วยเหลือ'
          : 'Response time and cases past SLA, by type of support',
        kpis: [
          { label: th ? 'เคสส่งต่อทั้งหมด' : 'Referrals', value: referrals.length.toLocaleString() },
          {
            label: th ? 'เกินกำหนด' : 'Past SLA',
            value: referrals.filter((r) => r.status === 'overdue').length.toLocaleString(),
          },
          {
            label: th ? 'ปิดเคสแล้ว' : 'Completed',
            value: referrals.filter((r) => r.status === 'completed').length.toLocaleString(),
          },
          {
            label: th ? 'อายุเคสเฉลี่ย (วัน)' : 'Avg age (days)',
            value: String(
              Math.round((sum(referrals, (r) => r.openedDaysAgo) / Math.max(1, referrals.length)) * 10) / 10,
            ),
          },
        ],
        columns: th
          ? ['ความช่วยเหลือที่ขอ', 'ทั้งหมด', 'เกินกำหนด', 'สัดส่วนเกินกำหนด %', 'ปิดเคสแล้ว', 'อายุเฉลี่ย (วัน)']
          : ['Need', 'Total', 'Past SLA', 'Past SLA %', 'Completed', 'Avg age (days)'],
        rows: needs
          .map((n) => {
            const rows = referrals.filter((r) => r.need === n)
            const late = rows.filter((r) => r.status === 'overdue').length
            return [
              c.t(`need.${n}`),
              rows.length,
              late,
              pct(late, rows.length),
              rows.filter((r) => r.status === 'completed').length,
              Math.round((sum(rows, (r) => r.openedDaysAgo) / Math.max(1, rows.length)) * 10) / 10,
            ]
          })
          .sort((a, b) => (b[1] as number) - (a[1] as number)),
      }
    }

    case 'cause': {
      const acc = new Map<string, number>()
      for (const r of oosc) for (const k of r.causeKeys) acc.set(k, (acc.get(k) ?? 0) + 1)
      const total = sum([...acc.values()], (v) => v) || 1
      return {
        ...base,
        id,
        title: th ? 'วิเคราะห์สาเหตุการหลุดออกนอกระบบ' : 'Dropout Cause Analysis',
        subtitle: th
          ? 'นับจากสาเหตุที่บันทึกไว้ในทะเบียนเด็กนอกระบบ'
          : 'Counted from the causes recorded in the out-of-school registry',
        kpis: [
          { label: th ? 'ระเบียนที่นับ' : 'Records', value: oosc.length.toLocaleString() },
          { label: th ? 'สาเหตุที่พบ' : 'Distinct causes', value: String(acc.size) },
          {
            label: th ? 'สาเหตุอันดับ 1' : 'Top cause',
            value: c.t(`cause.${[...acc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'poverty'}`),
          },
          { label: th ? 'เด็กนอกระบบ' : 'Out of school', value: oos.toLocaleString() },
        ],
        columns: th ? ['สาเหตุ', 'จำนวนเด็ก', 'สัดส่วน %'] : ['Cause', 'Children', 'Share %'],
        rows: [...acc.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => [c.t(`cause.${k}`), v, pct(v, total)]),
      }
    }

    case 'sch-dq':
      return {
        ...base,
        id,
        title: th ? 'คุณภาพข้อมูลระดับโรงเรียน' : 'School Data Quality',
        subtitle: th
          ? 'ความครบถ้วนของข้อมูลและผลการช่วยเหลือรายโรงเรียน'
          : 'Data completeness and intervention results per school',
        kpis: [
          { label: th ? 'โรงเรียน' : 'Schools', value: schools.length.toLocaleString() },
          {
            label: th ? 'คุณภาพข้อมูลเฉลี่ย' : 'Avg data quality',
            value: String(Math.round(sum(schools, (s) => s.dataQualityScore) / Math.max(1, schools.length))),
          },
          {
            label: th ? 'ต้องการทรัพยากรเพิ่ม' : 'Needs resources',
            value: String(schools.filter((s) => s.needsResources).length),
          },
          {
            label: th ? 'เคสค้างรวม' : 'Overdue cases',
            value: sum(schools, (s) => s.overdueCases).toLocaleString(),
          },
        ],
        columns: th
          ? ['โรงเรียน', 'อำเภอ', 'นักเรียน', 'เด็กเสี่ยงสูง', 'คุณภาพข้อมูล', 'อัตราช่วยสำเร็จ %', 'เวลาตอบสนอง (ชม.)', 'เคสค้าง']
          : ['School', 'District', 'Students', 'High risk', 'Data quality', 'Success %', 'Response (h)', 'Overdue'],
        rows: [...schools]
          .sort((a, b) => a.dataQualityScore - b.dataQualityScore)
          .map((s) => [
            s.name,
            c.dn(s.districtKey),
            s.totalStudents,
            s.highRiskStudents,
            s.dataQualityScore,
            s.interventionSuccessRate,
            s.responseHours,
            s.overdueCases,
          ]),
      }

    case 'dropout-return':
      return {
        ...base,
        id,
        title: th ? 'การหลุดออกและการกลับเข้าเรียน' : 'Dropout & Return',
        subtitle: th
          ? 'เด็กนอกระบบในทะเบียน เทียบกับเด็กที่กลับเข้าเรียนหรือมีอาชีพ'
          : 'Known out-of-school children against those back in learning or work',
        kpis: areaKpis,
        columns: th
          ? ['จังหวัด', 'เด็กนอกระบบในทะเบียน', 'ยังอยู่นอกระบบ', 'กำลังดึงกลับ', 'กลับเข้าเรียน / มีอาชีพ', 'อัตราสำเร็จ %']
          : ['Province', 'Known out of school', 'Still out', 'Re-engaging', 'Back in learning/work', 'Success %'],
        rows: provinces.map((p) => {
          const s = oosSplit(p)
          return [c.pn(p.key), s.known, s.stillOut, s.reengaging, s.succeeded, s.successRate]
        }),
      }

    case 'custom-district':
      return {
        ...base,
        id,
        title: th ? 'รายงานระดับโรงเรียนในอำเภอ' : 'Schools in the district',
        subtitle: c.scopeLabel,
        kpis: areaKpis,
        columns: th
          ? ['โรงเรียน', 'นักเรียน', 'เด็กเสี่ยงสูง', 'คุณภาพข้อมูล', 'อัตราช่วยสำเร็จ %', 'เคสค้าง']
          : ['School', 'Students', 'High risk', 'Data quality', 'Success %', 'Overdue'],
        rows: schools.map((s) => [
          s.name,
          s.totalStudents,
          s.highRiskStudents,
          s.dataQualityScore,
          s.interventionSuccessRate,
          s.overdueCases,
        ]),
      }

    // 'nat-weekly' and the area/province custom builds
    default:
      return {
        ...base,
        id,
        title: th ? 'สถานการณ์ภาพรวมพื้นที่ จชต.' : 'SBP Situation Report',
        subtitle: th
          ? 'สรุปตัวชี้วัดหลักรายจังหวัดในขอบเขตที่เลือก'
          : 'Headline indicators by province for the chosen scope',
        kpis: areaKpis,
        columns: th
          ? ['จังหวัด', 'นักเรียน', 'เด็กเสี่ยงสูง', 'สัดส่วนเสี่ยง %', 'เด็กนอกระบบ', 'กลับเข้าเรียน / มีอาชีพ', 'เคสส่งต่อที่เปิดอยู่']
          : ['Province', 'Students', 'High risk', 'Risk %', 'Out of school', 'Back in learning/work', 'Open referrals'],
        rows: provinces.map((p) => [
          c.pn(p.key),
          p.totalStudents,
          p.highRiskStudents,
          p.riskRate,
          p.oosCount,
          p.outcomeCount,
          p.openReferrals,
        ]),
      }
  }
}

/* ── exporters ─────────────────────────────────────────────── */

const esc = (v: unknown) => String(v).replace(/"/g, '""')
const html = (v: unknown) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function fileName(r: ReportDef, ext: string) {
  const slug = r.id.replace(/[^a-z0-9-]/gi, '') || 'report'
  return `${slug}-${r.generatedAt.slice(0, 10)}.${ext}`
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(r: ReportDef) {
  const meta = [
    [r.title],
    [r.subtitle],
    [r.scopeLabel, r.periodLabel],
    [r.generatedAt, r.by],
    [],
    r.kpis.map((k) => `${k.label}: ${k.value}`),
    [],
  ]
  const body = [r.columns, ...r.rows]
  const csv = [...meta, ...body, [], [r.note]]
    .map((row) => row.map((cell) => `"${esc(cell)}"`).join(','))
    .join('\n')
  // BOM keeps Thai readable when Excel opens the file
  save(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), fileName(r, 'csv'))
}

/** Excel opens an HTML table with this mime type as a real worksheet. */
export function downloadXls(r: ReportDef) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8" /><style>
 table{border-collapse:collapse;font-family:Tahoma,sans-serif;font-size:11pt}
 th{background:#0f2a6b;color:#fff;padding:6px 8px;border:1px solid #b8c4dd;text-align:left}
 td{padding:5px 8px;border:1px solid #d7deea}
 h1{font-family:Tahoma,sans-serif;font-size:14pt;margin:0 0 4px}
 p{font-family:Tahoma,sans-serif;font-size:10pt;color:#555;margin:0 0 10px}
</style></head><body>
<h1>${html(r.title)}</h1>
<p>${html(r.subtitle)}<br/>${html(r.scopeLabel)} · ${html(r.periodLabel)} · ${html(r.generatedAt)} · ${html(r.by)}</p>
<table><tr>${r.kpis.map((k) => `<th>${html(k.label)}</th>`).join('')}</tr>
<tr>${r.kpis.map((k) => `<td>${html(k.value)}</td>`).join('')}</tr></table>
<br/>
<table><thead><tr>${r.columns.map((h) => `<th>${html(h)}</th>`).join('')}</tr></thead>
<tbody>${r.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${html(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>
<p>${html(r.note)}</p>
</body></html>`
  save(
    new Blob(['﻿' + doc], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    fileName(r, 'xls'),
  )
}

/** Print-styled standalone page — used for the .html download and for print. */
export function reportDocument(r: ReportDef): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8" />
<title>${html(r.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600;700&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:Kanit,Tahoma,sans-serif;color:#0f172a;background:#f6f8fc}
  .page{max-width:900px;margin:0 auto;padding:28px 32px;background:#fff}
  h1{font-size:22px;margin:0 0 4px;color:#0f2a6b}
  .sub{font-size:13px;color:#5b6b82;margin:0 0 14px}
  .meta{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:#5b6b82;margin-bottom:18px}
  .meta span{background:#eef2f8;border-radius:999px;padding:3px 10px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}
  .kpi{border:1px solid #e6ebf3;border-radius:12px;padding:10px 12px}
  .kpi b{display:block;font-size:20px;color:#0f2a6b}
  .kpi small{font-size:11px;color:#5b6b82}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#0f2a6b;color:#fff;text-align:left;padding:7px 9px;font-weight:600}
  td{padding:6px 9px;border-bottom:1px solid #eef2f8}
  tr:nth-child(even) td{background:#fafcff}
  .note{margin-top:16px;font-size:11px;color:#7a8798}
  @media print{body{background:#fff}.page{max-width:none;padding:0}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="page">
<h1>${html(r.title)}</h1>
<p class="sub">${html(r.subtitle)}</p>
<div class="meta"><span>${html(r.scopeLabel)}</span><span>${html(r.periodLabel)}</span><span>${html(
    r.generatedAt,
  )}</span><span>${html(r.by)}</span></div>
<div class="kpis">${r.kpis
    .map((k) => `<div class="kpi"><b>${html(k.value)}</b><small>${html(k.label)}</small></div>`)
    .join('')}</div>
<table><thead><tr>${r.columns.map((h) => `<th>${html(h)}</th>`).join('')}</tr></thead>
<tbody>${r.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${html(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>
<p class="note">${html(r.note)} · ${r.rows.length} ${r.rows.length === 1 ? 'row' : 'rows'}</p>
</div></body></html>`
}

export function downloadHtml(r: ReportDef) {
  save(new Blob([reportDocument(r)], { type: 'text/html;charset=utf-8' }), fileName(r, 'html'))
}

/** Render into a hidden iframe and open the print dialog (Save as PDF).
 *  An iframe rather than window.open so a popup blocker cannot swallow it. */
export function printReport(r: ReportDef): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) {
    document.body.removeChild(frame)
    return
  }
  doc.open()
  doc.write(reportDocument(r))
  doc.close()
  const go = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 1000)
  }
  // give the webfont a moment; print anyway if it never loads
  if (frame.contentWindow) frame.contentWindow.onload = go
  window.setTimeout(go, 700)
}

export function exportReport(r: ReportDef, format: ReportFormat) {
  if (format === 'csv') downloadCsv(r)
  else if (format === 'xls') downloadXls(r)
  else if (format === 'html') downloadHtml(r)
  else printReport(r)
}
