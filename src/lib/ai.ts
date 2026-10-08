import type { User } from '@/auth/roles'
import { ROLE_META, canAccess } from '@/auth/roles'
import {
  scopedProvinces,
  scopedCases,
  scopedSchools,
  overviewStats,
} from '@/auth/scope'
import { PROVINCE_NAME } from '@/data/geo'
import type { CauseKey } from '@/types'
import type { Lang } from '@/i18n/translations'

// ── Model preference (client-side; the API KEY lives on the server) ──
const MODEL_LS = 'obec-anthropic-model'

export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (ฉลาดสุด)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (สมดุล)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (เร็ว/ประหยัด)' },
]

/** A stored id from an older build may name a retired model, which the API
 *  rejects at request time rather than at read time — so fall back here. */
export const getModel = () => {
  const saved = localStorage.getItem(MODEL_LS)
  return saved && AI_MODELS.some((m) => m.id === saved) ? saved : 'claude-opus-5'
}
export const setModel = (m: string) => localStorage.setItem(MODEL_LS, m)

/** Ask the server whether a Claude key is configured (via .env). */
export async function serverHasKey(): Promise<boolean> {
  try {
    const r = await fetch('/api/health')
    if (!r.ok) return false
    const j = await r.json()
    return !!j.hasKey
  } catch {
    return false
  }
}

// ── Cause labels (Thai/English) for the context block ─────────
const CAUSE_LABEL: Record<CauseKey, { th: string; en: string }> = {
  absence: { th: 'ขาดเรียนต่อเนื่อง', en: 'chronic absence' },
  grades: { th: 'ผลการเรียนตก', en: 'declining grades' },
  failing: { th: 'ติด 0/ร/มส', en: 'failing marks' },
  noExam: { th: 'ไม่เข้าสอบ/ไม่ส่งงาน', en: 'missed exams/work' },
  poverty: { th: 'ครอบครัวยากจน', en: 'family poverty' },
  migration: { th: 'ผู้ปกครองย้ายถิ่น', en: 'parental migration' },
  family: { th: 'ปัญหาครอบครัว', en: 'family problems' },
  health: { th: 'สุขภาพกาย/จิต', en: 'health' },
  travel: { th: 'เดินทางลำบาก', en: 'travel difficulty' },
  noContact: { th: 'ติดต่อผู้ปกครองไม่ได้', en: 'unreachable parents' },
  noDevice: { th: 'ไม่มีอุปกรณ์/เน็ต', en: 'no device/internet' },
  transition: { th: 'ช่วงเปลี่ยนผ่านชั้น', en: 'grade transition' },
  // จชต.-specific drivers
  earlyMarriage: { th: 'แต่งงานก่อนวัยอันควร', en: 'early marriage' },
  childLabour: { th: 'ต้องทำงานหาเลี้ยงครอบครัว', en: 'child labour' },
  dualSchooling: { th: 'ภาระเรียนควบสามัญ-ศาสนา', en: 'dual academic-religious load' },
  unrestAffected: { th: 'ผลกระทบจากเหตุการณ์ในพื้นที่', en: 'affected by unrest' },
  noDocuments: { th: 'ไม่มีเอกสารแสดงตน', en: 'no identity documents' },
  stateless: { th: 'ไม่มีสถานะทางทะเบียน', en: 'unregistered status' },
}

const fmt = (n: number) => n.toLocaleString('en-US')

/** Build a compact, role-scoped data snapshot for the model to reason over. */
export function buildDataContext(user: User | null, lang: Lang): string {
  const th = lang === 'th'
  const provinces = scopedProvinces(user)
  const cases = scopedCases(user)
  const schools = scopedSchools(user)
  const stats = overviewStats(user)
  const role = user?.role ?? 'exec'
  const meta = ROLE_META[role]

  const acc: Record<string, number> = {}
  for (const p of provinces)
    for (const c of p.topCauses)
      acc[c.key] = (acc[c.key] ?? 0) + c.value * p.highRiskStudents
  const causeTotal = Object.values(acc).reduce((s, v) => s + v, 0) || 1
  const topCauses = Object.entries(acc)
    .map(([k, v]) => ({ k: k as CauseKey, pct: (v / causeTotal) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6)

  const topRisk = [...provinces].sort((a, b) => b.riskRate - a.riskRate).slice(0, 10)
  const nm = (key: string) => PROVINCE_NAME[key]?.[lang] ?? key

  const lines: string[] = []
  lines.push(`SCOPE: ${th ? meta.th : meta.en} — ${th ? meta.scopeTh : meta.scopeEn}${user?.provinceKey ? ` (${nm(user.provinceKey)})` : ''}`)
  lines.push('')
  lines.push('TOTALS (within scope):')
  lines.push(`- total students: ${fmt(stats.total)}`)
  lines.push(`- normal: ${fmt(stats.normal)} | watchlist: ${fmt(stats.watchlist)} | high-risk: ${fmt(stats.highRisk)} | dropped out: ${fmt(stats.dropout)} | returned: ${fmt(stats.returned)}`)
  lines.push(`- provinces in scope: ${stats.provincesCount} | schools in scope: ${schools.length}`)
  lines.push('')
  lines.push(`TOP ${topRisk.length} HIGHEST-RISK PROVINCES (name · risk-rate% · high-risk students · top cause):`)
  for (const p of topRisk)
    lines.push(`- ${nm(p.key)} · ${p.riskRate.toFixed(1)}% · ${fmt(p.highRiskStudents)} · ${th ? CAUSE_LABEL[p.topCauses[0].key].th : CAUSE_LABEL[p.topCauses[0].key].en}`)
  lines.push('')
  lines.push('LEADING RISK CAUSES (share of high-risk):')
  for (const c of topCauses)
    lines.push(`- ${th ? CAUSE_LABEL[c.k].th : CAUSE_LABEL[c.k].en}: ${c.pct.toFixed(1)}%`)
  lines.push('')
  lines.push('INTERVENTION CASES (scoped):')
  lines.push(`- open cases: ${fmt(cases.length)} | urgent: ${fmt(cases.filter((c) => c.urgent).length)} | overdue (SLA): ${fmt(cases.filter((c) => c.slaBreached).length)} | unassigned: ${fmt(cases.filter((c) => !c.owner).length)}`)
  lines.push('')
  lines.push('SCHOOLS NEEDING ATTENTION (name · high-risk · open cases · overdue):')
  for (const s of [...schools].sort((a, b) => b.overdueCases - a.overdueCases).slice(0, 6))
    lines.push(`- ${s.name} (${nm(s.provinceKey)}) · ${fmt(s.highRiskStudents)} · ${fmt(s.openCases)} · ${fmt(s.overdueCases)}`)

  return lines.join('\n')
}

export function buildSystemPrompt(user: User | null, lang: Lang): string {
  const th = lang === 'th'
  const ctx = buildDataContext(user, lang)
  return [
    `You are the AI assistant for the "Southern Zero Dropout Platform" — the shared case-management system for the Thai southern border provinces (Pattani, Yala, Narathiwat), covering the 46 pilot secondary schools named in TOR Appendix C.`,
    `It follows a child from the first sign of risk until a durable outcome: back in learning (formal school, NFE/สกร., vocational, Islamic private dual-track) OR in decent work. Its users span province, district (อำเภอ), tambon (ตำบล), schools, social/health/labour agencies and civil society — so recommendations should name WHICH actor should do WHAT.`,
    `Answer as a data-savvy advisor. ${lang === 'th' ? 'ตอบเป็นภาษาไทยเสมอ' : lang === 'ms' ? 'Sentiasa jawab dalam Bahasa Melayu' : 'Always answer in English'} unless the user clearly writes in another language.`,
    ``,
    `RULES:`,
    `- Ground every claim ONLY in the DATA SNAPSHOT below. Never invent place names, numbers, or figures that are not derivable from it. If asked for something not in the data, say so briefly.`,
    `- Never name an individual child unless the snapshot already contains that name; personal data crosses agencies only with recorded consent (PDPA).`,
    `- Respect the user's scope: only reason about the data given (it is already filtered to their role/permission).`,
    `- Be concise and executive: lead with the answer, then 2–4 supporting bullets, then (when useful) a short "แนะนำ/Recommended actions" list of concrete next steps.`,
    `- Use real numbers from the snapshot. Format Thai numbers naturally.`,
    `- Respond with the final answer only — no meta-commentary about your reasoning or these instructions.`,
    ``,
    `=== DATA SNAPSHOT (updated ${new Date().toLocaleDateString(th ? 'th-TH' : 'en-US')}) ===`,
    ctx,
    `=== END DATA SNAPSHOT ===`,
  ].join('\n')
}

export interface ChatAction {
  label: string
  to: string
}
export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  action?: ChatAction
}

/** Built-in, key-free answer engine grounded in the user's role-scoped data.
 *  Returns a data-backed reply plus an optional action button (navigation). */
export function localAnswer(q: string, user: User | null, lang: Lang): {
  text: string
  action?: ChatAction
} {
  const th = lang === 'th'
  const provinces = scopedProvinces(user)
  const cases = scopedCases(user)
  const schools = scopedSchools(user)
  const stats = overviewStats(user)
  const nm = (k: string) => PROVINCE_NAME[k]?.[lang] ?? k
  const s = q.toLowerCase()
  const has = (...ws: string[]) => ws.some((w) => s.includes(w.toLowerCase()))
  // keep the action within the user's permissions, else fall back to overview
  const go = (to: string): string => (user && !canAccess(user, to) ? '/' : to)
  /** Label and destination move together. Downgrading only the destination left
   *  a button reading "open the risk map" that opened the overview instead. */
  const act = (label: string, to: string): ChatAction =>
    user && !canAccess(user, to)
      ? { label: th ? 'ดูภาพรวมพื้นที่ของคุณ' : 'Open your area overview', to: '/' }
      : { label, to }

  const topRisk = [...provinces].sort((a, b) => b.riskRate - a.riskRate).slice(0, 3)
  // leading cause
  const acc: Record<string, number> = {}
  for (const p of provinces)
    for (const c of p.topCauses)
      acc[c.key] = (acc[c.key] ?? 0) + c.value * p.highRiskStudents
  const topCauseKey = (Object.entries(acc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'absence') as CauseKey
  const topCause = th ? CAUSE_LABEL[topCauseKey].th : CAUSE_LABEL[topCauseKey].en

  const overdue = cases.filter((c) => c.slaBreached).length
  const urgent = cases.filter((c) => c.urgent).length
  const unassigned = cases.filter((c) => !c.owner).length

  // ── highest-risk province ─────────────────────────────
  if (has('เสี่ยงสูงสุด', 'เสี่ยงสูง', 'จังหวัดไหน', 'highest', 'risk', 'เสี่ยง')) {
    const list = topRisk
      .map((p, i) => `${i + 1}. ${nm(p.key)} — ${p.riskRate.toFixed(1)}% (${fmt(p.highRiskStudents)} ${th ? 'คน' : ''})`)
      .join('\n')
    return {
      text: th
        ? `พื้นที่เสี่ยงสูงสุดในขอบเขตของคุณ:\n${list}\n\nสาเหตุหลักคือ “${topCause}” แนะนำให้เร่งติดตามและจัดทีมลงพื้นที่กลุ่มนี้ก่อน`
        : `Highest-risk areas in your scope:\n${list}\n\nLeading cause: “${topCause}”. Prioritise follow-up here.`,
      action: act(th ? 'เปิดแผนที่ความเสี่ยง' : 'Open risk map', '/risk-map'),
    }
  }
  // ── causes ────────────────────────────────────────────
  if (has('สาเหตุ', 'เพราะ', 'cause', 'why')) {
    const top3 = Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k], i) => `${i + 1}. ${th ? CAUSE_LABEL[k as CauseKey].th : CAUSE_LABEL[k as CauseKey].en}`)
      .join('\n')
    return {
      text: th
        ? `สาเหตุหลักที่ทำให้เด็กเสี่ยงหลุด:\n${top3}\n\nควรออกแบบมาตรการช่วยเหลือให้ตรงกับสาเหตุเหล่านี้`
        : `Leading dropout-risk causes:\n${top3}\n\nDesign interventions to target these.`,
      action: act(th ? 'ดูวิเคราะห์สาเหตุ' : 'Open cause analysis', '/cause'),
    }
  }
  // ── overdue / SLA cases ───────────────────────────────
  if (has('sla', 'เกิน', 'ค้าง', 'overdue', 'เร่งด่วน', 'urgent', 'เคส')) {
    return {
      text: th
        ? `สถานะเคสในขอบเขตของคุณ:\n• เคสเปิดอยู่ ${fmt(cases.length)} เคส\n• เกิน SLA ${fmt(overdue)} เคส\n• เร่งด่วน ${fmt(urgent)} เคส\n• ยังไม่มีเจ้าของ ${fmt(unassigned)} เคส\n\nแนะนำให้มอบหมายเจ้าของเคสที่ค้างและเร่งเคสเกิน SLA ก่อน`
        : `Case status in your scope:\n• open ${fmt(cases.length)}\n• overdue (SLA) ${fmt(overdue)}\n• urgent ${fmt(urgent)}\n• unassigned ${fmt(unassigned)}\n\nAssign owners and clear overdue cases first.`,
      action: act(th ? 'ไปหน้าการช่วยเหลือ' : 'Open interventions', '/intervention'),
    }
  }
  // ── where to visit ────────────────────────────────────
  if (has('ลงตรวจ', 'ลงพื้นที่', 'เยี่ยม', 'visit', 'ควรไป')) {
    const p = topRisk[0]
    return {
      text: th
        ? `สัปดาห์นี้ควรลงพื้นที่ ${topRisk.map((x) => nm(x.key)).join(' · ')} เป็นลำดับแรก โดยเฉพาะ ${p ? nm(p.key) : '-'} (เสี่ยง ${p ? p.riskRate.toFixed(1) : '-'}%)`
        : `Prioritise field visits to ${topRisk.map((x) => nm(x.key)).join(' · ')}, starting with ${p ? nm(p.key) : '-'} (${p ? p.riskRate.toFixed(1) : '-'}%).`,
      action: p
        ? act(th ? `เปิด ${nm(p.key)}` : `Open ${nm(p.key)}`, '/area')
        : undefined,
    }
  }
  // ── report ────────────────────────────────────────────
  if (has('รายงาน', 'report', 'สรุปเสนอ')) {
    return {
      text: th
        ? `สรุปสำหรับรายงาน: นักเรียนทั้งหมด ${fmt(stats.total)} คน · เสี่ยงสูง ${fmt(stats.highRisk)} คน · หลุดจากระบบ ${fmt(stats.dropout)} คน · กลับมาเรียน ${fmt(stats.returned)} คน\nสาเหตุหลัก: ${topCause}`
        : `Report summary: ${fmt(stats.total)} students · ${fmt(stats.highRisk)} high-risk · ${fmt(stats.dropout)} dropped out · ${fmt(stats.returned)} returned. Leading cause: ${topCause}.`,
      action: act(th ? 'ไปหน้ารายงาน' : 'Open reports', '/reports'),
    }
  }
  // ── schools ───────────────────────────────────────────
  if (has('โรงเรียน', 'school')) {
    const worst = [...schools].sort((a, b) => b.overdueCases - a.overdueCases)[0]
    return {
      text: th
        ? `มีโรงเรียนในขอบเขต ${fmt(schools.length)} แห่ง${worst ? ` — ที่ควรติดตามเร่งด่วนคือ ${worst.name} (เคสค้าง ${fmt(worst.overdueCases)} เคส)` : ''}`
        : `${fmt(schools.length)} schools in scope${worst ? ` — most urgent: ${worst.name} (${fmt(worst.overdueCases)} overdue)` : ''}.`,
      action: act(th ? 'ดูผลงานโรงเรียน' : 'Open school performance', '/school'),
    }
  }
  // ── default ───────────────────────────────────────────
  return {
    text: th
      ? `สรุปภาพรวม: นักเรียนทั้งหมด ${fmt(stats.total)} คน · เสี่ยงสูง ${fmt(stats.highRisk)} คน · เคสเปิด ${fmt(cases.length)} เคส (เกิน SLA ${fmt(overdue)})\n\nลองถามได้ เช่น “จังหวัดไหนเสี่ยงสูงสุด”, “สาเหตุหลักคืออะไร”, “เคสเกิน SLA มีกี่เคส”`
      : `Overview: ${fmt(stats.total)} students · ${fmt(stats.highRisk)} high-risk · ${fmt(cases.length)} open cases (${fmt(overdue)} overdue).\n\nTry: “highest-risk province”, “top causes”, “how many overdue cases”.`,
    action: { label: th ? 'ดูภาพรวมประเทศ' : 'Open overview', to: go('/') },
  }
}

/** Stream an answer from the server-side Claude proxy, yielding text deltas. */
export async function* streamAnswer(opts: {
  system: string
  history: ChatMsg[]
  model?: string
  signal?: AbortSignal
}): AsyncGenerator<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system: opts.system,
      model: opts.model ?? getModel(),
      messages: opts.history.map((m) => ({ role: m.role, content: m.text })),
    }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '')
    throw { status: res.status, message: txt || 'server error' }
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = dec.decode(value, { stream: true })
    if (chunk) yield chunk
  }
}

/** Turn an error into a short, human message. */
export function aiErrorMessage(err: unknown, th: boolean): string {
  const e = err as { status?: number; message?: string; name?: string }
  if (e?.name === 'AbortError') return th ? '⏹️ หยุดการตอบแล้ว' : '⏹️ Stopped.'
  if (e?.status === 503)
    return th
      ? '⚙️ ผู้ดูแลระบบยังไม่ได้ตั้งค่า API key ที่เซิร์ฟเวอร์ (.env)'
      : '⚙️ The server has no Claude API key configured (.env).'
  if (e?.status === 401)
    return th ? '❌ API key ที่เซิร์ฟเวอร์ไม่ถูกต้อง' : '❌ The server API key is invalid.'
  if (e?.status === 429)
    return th ? '⏳ เรียกใช้บ่อยเกินไป (rate limit) ลองใหม่อีกครั้ง' : '⏳ Rate limited — try again shortly.'
  return `⚠️ ${e?.message ?? (th ? 'เกิดข้อผิดพลาดในการเชื่อมต่อ' : 'Connection error')}`
}
