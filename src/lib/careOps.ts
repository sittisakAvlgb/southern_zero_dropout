// ─────────────────────────────────────────────────────────────
// โต๊ะทำงานของครูสำหรับเด็กหนึ่งคน — ส่วนที่ AI ช่วยคิด
//
// "ครูรู้ปัญหา — AI ช่วยหาวิธี"
//
// ทุกอย่างในไฟล์นี้เป็น *ข้อเสนอ* ไม่ใช่คำสั่ง: ทางเลือกที่อาจลอง พร้อมเหตุผล
// ว่ามาจากข้อมูลอะไร ข้อดี และข้อควรพิจารณา ครูเป็นคนเลือกเสมอ
// สิ่งที่ครูพบ (observations) และบันทึกของครูถูกอ่านด้วย — ครูเขียนว่า
// "ไม่มีค่ารถ" ทางเลือกเรื่องค่าเดินทางต้องขึ้นมา แม้ทะเบียนจะไม่ได้บอก
// ─────────────────────────────────────────────────────────────
import type { Student } from '@/types'
import type { CaseLogEntry, CareGoal, Observation } from './caseLog'
import { agencyOwners, closability, needsAgency } from './recommend'
import { riskLevel } from './risk'
import { LEVEL_TH, type FollowCase, type Go } from './followOps'

const att = (s: Student) => Math.round(s.attendance[s.attendance.length - 1]?.rate ?? 0)

// ── สถานะเคสแบบภาษาคน ───────────────────────────────────────

export function caseStatus(fc: FollowCase): { th: string; color: string } {
  if (!fc.open) return { th: 'ปิดเคสแล้ว', color: '#64748b' }
  if (fc.closable && !fc.refs.some((r) => r.bucket !== 'done')) return { th: 'พร้อมประเมินเพื่อปิดเคส', color: '#16a34a' }
  if (fc.refs.some((r) => r.bucket === 'review')) return { th: 'กำลังประเมินผล', color: '#0d9488' }
  if (fc.s.parentContact !== 'ok') return { th: 'รอผู้ปกครอง', color: '#ea580c' }
  if (fc.refs.some((r) => ['breach', 'near', 'awaiting', 'inProgress', 'needInfo'].includes(r.bucket))) return { th: 'รอหน่วยงาน', color: '#2f66f6' }
  if (fc.hasPlan || fc.s.homeVisited) return { th: 'กำลังช่วยเหลือ', color: '#2f66f6' }
  return { th: 'กำลังติดตาม', color: '#475569' }
}

// ── แนวโน้มความเสี่ยง ────────────────────────────────────────

export interface Trend {
  points: { label: string; score: number }[]
  weekDelta: number
  insight: string
}

export function riskTrend(s: Student): Trend {
  const h = s.riskHistory
  const last4 = h.slice(-4)
  const labels = ['3 สัปดาห์ก่อน', '2 สัปดาห์ก่อน', 'สัปดาห์ก่อน', 'ปัจจุบัน'].slice(4 - last4.length)
  const points = last4.map((p, i) => ({ label: labels[i], score: p.score }))
  const weekDelta = h.length >= 2 ? h[h.length - 1].score - h[h.length - 2].score : 0
  const diffs = last4.slice(1).map((p, i) => p.score - last4[i].score)
  const peak = Math.max(...h.map((p) => p.score))
  let insight: string
  if (diffs.length && diffs.every((d) => d > 0)) insight = `ความเสี่ยงเพิ่มขึ้นต่อเนื่องในช่วง ${diffs.length} สัปดาห์`
  else if (diffs.length && diffs.every((d) => d < 0)) insight = `ความเสี่ยงลดลงต่อเนื่องในช่วง ${diffs.length} สัปดาห์`
  else if (peak - s.riskScore >= 10) insight = `ความเสี่ยงลดลงจากจุดสูงสุด ${peak} เหลือ ${s.riskScore}`
  else if (s.riskScore - (h[0]?.score ?? s.riskScore) >= 10) insight = `ความเสี่ยงสูงขึ้น ${s.riskScore - h[0].score} คะแนนใน 8 สัปดาห์`
  else insight = `ความเสี่ยงทรงตัวที่ระดับ${LEVEL_TH[s.riskLevel]}`
  return { points, weekDelta, insight }
}

// ── สิ่งที่ครูพบ — ข้อเสนอให้ครูยืนยัน ──────────────────────

/** สิ่งที่ข้อมูลบอก แต่ครูยังไม่ได้ยืนยัน — ครูกดยืนยันได้ ไม่ใช่ใส่ให้เอง */
export function observationHints(s: Student, existing: Observation[]): string[] {
  const out: string[] = []
  if (s.absenceStreak >= 3) out.push(`นักเรียนขาดเรียนต่อเนื่อง ${s.absenceStreak} วัน`)
  if (s.parentContact === 'unreachable') out.push('ติดต่อผู้ปกครองโดยตรงไม่ได้')
  if (s.parentContact === 'delayed') out.push('ผู้ปกครองตอบกลับช้า')
  if (s.causeKeys.includes('travel') || s.master.timeDt >= 45) out.push(`ใช้เวลาเดินทางมาโรงเรียน ${s.master.timeDt} นาที (${s.master.journeyTypeName})`)
  if (s.causeKeys.includes('poverty') || s.master.parentSalary < 3000) out.push(`ครอบครัวรายได้ ${s.master.parentSalary.toLocaleString('th-TH')} บาท/เดือน`)
  if (!['มารดา', 'บิดา'].includes(s.master.parentRelationName)) out.push(`อยู่กับ${s.master.parentRelationName} ไม่ได้อยู่กับพ่อแม่`)
  if (s.wellbeingRisk >= 60) out.push('มีสัญญาณด้านสุขภาวะ/อารมณ์')
  const have = existing.map((o) => o.text).join(' ')
  return out.filter((h) => !have.includes(h.slice(0, 12))).slice(0, 4)
}

// ── ทางเลือกที่ AI เสนอ ──────────────────────────────────────

export interface CareOption {
  key: string
  th: string
  /** ทำไมทางนี้ — จากข้อมูลของเด็กคนนี้ */
  why: string
  pros: string
  cons: string
  /** AI ใช้ข้อมูลอะไร — แสดงให้ครูเห็นเสมอ */
  basis: string[]
  go: Go
}

/** ข้อความทั้งหมดที่ครูเขียน (สิ่งที่พบ + บันทึก) — AI อ่านเพื่อจับบริบทที่ทะเบียนไม่มี */
const teacherText = (obs: Observation[], entries: CaseLogEntry[]) =>
  [...obs.filter((o) => !o.resolvedTs).map((o) => o.text), ...entries.map((e) => e.note)].join(' ')

/** ติดต่อผู้ปกครองไม่สำเร็จกี่ครั้งแล้ว — แนวทางเดิมไม่ได้ผล */
export function failedContacts(entries: CaseLogEntry[]): number {
  return entries.filter(
    (e) => e.outcome === 'noAnswer' || e.outcome === 'wrongNumber' || /ติดต่อไม่ได้|ไม่รับสาย/.test(e.result ?? ''),
  ).length
}

export function careOptions(fc: FollowCase, obs: Observation[], entries: CaseLogEntry[]): { options: CareOption[]; alternative: boolean; basis: string[] } {
  const s = fc.s
  // เคสปิดแล้ว: ไม่เสนอการช่วยเหลือเชิงรุกซ้ำ — เว้นแต่ความเสี่ยงกลับมา ให้เสนอเปิดเคสอย่างเดียว
  if (!fc.open) {
    if (!fc.relapse) return { options: [], alternative: false, basis: [] }
    return {
      options: [
        {
          key: 'reopen',
          th: 'เปิดเคสอีกครั้ง',
          why: `ความเสี่ยงกลับมาที่ระดับ${LEVEL_TH[s.riskLevel]} (${s.riskScore}/100) หลังปิดเคส`,
          pros: 'ประวัติเดิมทั้งหมดยังอยู่ เริ่มต่อจากที่ค้างได้ทันที',
          cons: 'คุยกับนักเรียนก่อนว่าเกิดอะไรขึ้นใหม่',
          basis: [`ความเสี่ยงปัจจุบัน ${s.riskScore}/100`, `เปลี่ยน ${fc.riskDelta > 0 ? '+' : ''}${fc.riskDelta} ใน 8 สัปดาห์`],
          go: { sheet: 'reopen' },
        },
      ],
      alternative: false,
      basis: [`ความเสี่ยงปัจจุบัน ${s.riskScore}/100`],
    }
  }
  const text = teacherText(obs, entries)
  const failed = failedContacts(entries)
  const alternative = failed > 0 && s.parentContact !== 'ok'
  const opts: (CareOption & { score: number })[] = []
  const absent = s.absenceStreak >= 3 ? `ขาดเรียน ${s.absenceStreak} วัน` : ''
  const noteSays = (re: RegExp, what: string) => (re.test(text) ? `ครูบันทึกว่า${what}` : '')
  const B = (...xs: string[]) => xs.filter(Boolean)

  if (s.parentContact !== 'ok') {
    opts.push({
      key: 'community',
      th: 'ประสานผู้ปกครองผ่านผู้นำชุมชน / อสม.',
      why: alternative ? `โทรตรงไม่สำเร็จ ${failed} ครั้งแล้ว` : s.parentContact === 'delayed' ? 'ผู้ปกครองตอบกลับช้า — คนในพื้นที่ช่วยตามได้' : 'ยังติดต่อผู้ปกครองโดยตรงไม่ได้',
      pros: 'มีโอกาสติดต่อครอบครัวได้เร็ว คนในพื้นที่รู้จักบ้าน',
      cons: 'ต้องคำนึงถึงความเป็นส่วนตัวของครอบครัว — แจ้งเท่าที่จำเป็น',
      basis: B(s.parentContact === 'unreachable' ? 'ติดต่อผู้ปกครองไม่ได้' : 'ผู้ปกครองตอบช้า', failed ? `โทรไม่สำเร็จ ${failed} ครั้ง` : '', absent),
      go: { sheet: 'schedule', method: 'ประสานผู้นำชุมชน' },
      score: alternative ? 95 : 85,
    })
    if (alternative)
      opts.push({
        key: 'relative',
        th: `ติดต่อญาติหรือผู้ดูแลคนอื่น${s.master.parentRelationName && !['มารดา', 'บิดา'].includes(s.master.parentRelationName) ? ` (ผู้ดูแลในทะเบียนคือ${s.master.parentRelationName})` : ''}`,
        why: 'ช่องทางเดิมเงียบ — คนในบ้านคนอื่นอาจรับเรื่องได้',
        pros: 'เร็ว ไม่ต้องเดินทาง',
        cons: 'ต้องแน่ใจว่าเป็นผู้ดูแลจริงก่อนเล่ารายละเอียด',
        basis: B(`โทรไม่สำเร็จ ${failed} ครั้ง`, `ผู้ดูแล: ${s.master.parentRelationName}`),
        go: { sheet: 'outcome', mode: 'contact' },
        score: 80,
      })
  }
  if (!s.homeVisited)
    opts.push({
      key: 'visit',
      th: 'เยี่ยมบ้าน',
      why: s.parentContact !== 'ok' ? 'ติดต่อทางไกลยังไม่ได้ผล ต้องไปพบที่บ้าน' : `ความเสี่ยงระดับ${LEVEL_TH[s.riskLevel]} และยังไม่เคยเยี่ยมบ้าน`,
      pros: 'เห็นบริบทจริงของครอบครัว และได้ความยินยอมในคราวเดียว',
      cons: 'ต้องนัดหมายและประสานทีม ใช้เวลาครึ่งวัน',
      basis: B('ยังไม่มีบันทึกเยี่ยมบ้าน', `ความเสี่ยง ${s.riskScore}/100`, absent),
      go: { sheet: 'schedule', method: 'เยี่ยมบ้าน' },
      score: (s.riskLevel === 'high' || s.riskLevel === 'critical' ? 80 : 50) + (alternative ? 10 : 0),
    })
  const moody = /ไม่พูด|เงียบ|เครียด|ซึม|ร้องไห้|ไม่คุย/.test(text)
  // นัดครูแนะแนวเฉพาะเมื่อมีสัญญาณจริง — เดิมขึ้นเมื่อขาด 2 วัน เด็กเกือบทุกคนจึงได้ข้อนี้
  // เหมือนกันหมด จนครูรู้สึกว่า AI ตอบแบบสำเร็จรูป
  if (moody || s.wellbeingRisk >= 60 || s.behaviorRisk >= 60 || s.causeKeys.includes('family') || (s.absenceStreak >= 5 && s.parentContact === 'ok'))
    opts.push({
      key: 'counsel',
      th: 'นัดครูแนะแนวพูดคุยกับนักเรียน',
      why: moody
        ? 'ครูสังเกตว่าเด็กเปลี่ยนไป'
        : s.wellbeingRisk >= 60
          ? `มีสัญญาณด้านสุขภาวะ/อารมณ์ (${s.wellbeingRisk}/100)`
          : s.causeKeys.includes('family')
            ? 'มีปัญหาในครอบครัว — เด็กอาจเล่ากับครูได้ง่ายกว่าเล่าต่อหน้าผู้ปกครอง'
            : `ขาด ${s.absenceStreak} วันทั้งที่ติดต่อครอบครัวได้ — สาเหตุอาจอยู่ที่ตัวเด็ก`,
      pros: 'เด็กได้เล่าเรื่องที่บ้านเอง ครูได้ข้อมูลตรง',
      cons: 'ต้องหาเวลาที่เด็กมาโรงเรียน และพื้นที่ที่เป็นส่วนตัว',
      basis: B(absent, s.wellbeingRisk >= 55 ? `สุขภาวะ ${s.wellbeingRisk}/100` : '', noteSays(/ไม่พูด|เงียบ|เครียด|ซึม|ร้องไห้|ไม่คุย/, 'เด็กเปลี่ยนไป')),
      go: { sheet: 'schedule', method: 'คุยกับนักเรียน' },
      score: moody ? 88 : 66,
    })

  // ── ทางเลือกตามสาเหตุของเด็กคนนี้ (รหัสสาเหตุ สพฐ.) — ทำให้แต่ละเคสได้คำแนะนำไม่เหมือนกัน
  const has = (k: Student['causeKeys'][number]) => s.causeKeys.includes(k)
  const gpa = s.grades[s.grades.length - 1]?.gpa
  const cause = (o: Omit<CareOption, 'basis'> & { basis: string[]; score: number }) => opts.push(o)
  if (has('grades') || has('failing') || has('noExam') || (gpa !== undefined && gpa < 1.5))
    cause({
      key: 'tutor',
      th: has('noExam') ? 'คุยกับครูประจำวิชาให้สอบ/ส่งงานย้อนหลังได้' : 'ขอครูประจำวิชาสอนเสริมและปรับงานที่ค้าง',
      why: gpa !== undefined ? `เกรดเฉลี่ยภาคล่าสุด ${gpa.toFixed(2)} — ถ้าตามไม่ทัน เด็กจะยิ่งไม่อยากมา` : 'ผลการเรียนเป็นสาเหตุหนึ่งของเด็กคนนี้',
      pros: 'ทำได้ในโรงเรียนทันที ไม่ต้องรอหน่วยงานอื่น',
      cons: 'ต้องขอความร่วมมือครูหลายวิชา',
      basis: [gpa !== undefined ? `GPA ${gpa.toFixed(2)}` : 'สาเหตุ: ผลการเรียน'],
      go: { sheet: 'schedule', method: 'ประชุมทีม' },
      score: 72,
    })
  if (has('noDevice'))
    cause({ key: 'device', th: 'ยืมอุปกรณ์การเรียนจากโรงเรียน / ขอทุนอุปกรณ์', why: 'ไม่มีอุปกรณ์สำหรับเรียนที่บ้าน', pros: 'แก้ได้เร็ว ใช้ของที่โรงเรียนมี', cons: 'ต้องมีระบบยืม-คืน', basis: ['สาเหตุ: ไม่มีอุปกรณ์'], go: { sheet: 'schedule', method: 'คุยกับนักเรียน' }, score: 70 })
  if (has('earlyMarriage'))
    cause({ key: 'flex', th: 'คุยกับครอบครัวเรื่องเรียนต่อแบบยืดหยุ่น (กศน. / เรียนทางไกล)', why: 'มีภาระครอบครัวจากการแต่งงาน — การเรียนเต็มเวลาอาจไม่ไหว', pros: 'เด็กไม่หลุดจากระบบแม้มาเรียนทุกวันไม่ได้', cons: 'ต้องคุยอย่างระมัดระวังเรื่องวัฒนธรรมและศาสนา', basis: ['สาเหตุ: แต่งงานก่อนวัยอันควร'], go: { sheet: 'schedule', method: 'เยี่ยมบ้าน' }, score: 80 })
  if (has('childLabour'))
    cause({ key: 'labour', th: 'ปรับเวลาเรียนให้เข้ากับงานที่ช่วยครอบครัว + หาทุนลดภาระ', why: 'เด็กต้องทำงานช่วยครอบครัว', pros: 'แก้ที่เหตุ ไม่บังคับให้เลือกระหว่างงานกับเรียน', cons: 'ต้องคุยกับครอบครัวเรื่องรายได้ที่หายไป', basis: ['สาเหตุ: ทำงานช่วยครอบครัว', `รายได้ครอบครัว ${s.master.parentSalary.toLocaleString('th-TH')} บาท`], go: { sheet: 'schedule', method: 'เยี่ยมบ้าน' }, score: 78 })
  if (has('dualSchooling'))
    cause({ key: 'dual', th: 'ประสานครูตาดีกา/ปอเนาะ ปรับตารางเรียนสามัญ-ศาสนาให้ไม่ชนกัน', why: 'เรียนควบสองระบบจนภาระเกิน', pros: 'เด็กไม่ต้องเลือกทิ้งอย่างใดอย่างหนึ่ง', cons: 'ต้องได้ความร่วมมือจากผู้นำศาสนา', basis: ['สาเหตุ: เรียนควบสามัญ-ศาสนา'], go: { sheet: 'schedule', method: 'ประสานผู้นำชุมชน' }, score: 74 })
  if (has('unrestAffected'))
    cause({ key: 'trauma', th: 'ส่งต่อนักจิตวิทยา / ศูนย์เยียวยาผู้ได้รับผลกระทบ', why: 'ได้รับผลกระทบจากเหตุการณ์ความไม่สงบ', pros: 'ได้ผู้เชี่ยวชาญดูแลจิตใจ', cons: 'ต้องได้ความยินยอมผู้ปกครอง (PDPA)', basis: ['สาเหตุ: ได้รับผลกระทบจากความไม่สงบ', `สุขภาวะ ${s.wellbeingRisk}/100`], go: { href: `/referral?child=${s.id}&need=mentalHealth` }, score: 82 })
  if (has('noDocuments') || has('stateless'))
    cause({ key: 'docs', th: 'พาไปทำเอกสารสถานะบุคคลกับอำเภอ', why: has('stateless') ? 'ไม่มีสถานะทางทะเบียน — สิทธิ์เรียนต่อและทุนติดเรื่องนี้' : 'ไม่มีเอกสารแสดงตน', pros: 'ปลดล็อกสิทธิ์ทุนและการเรียนต่อทั้งหมด', cons: 'ใช้เวลานาน ต้องมีพยานบุคคล', basis: [has('stateless') ? 'สาเหตุ: ไร้สถานะ' : 'สาเหตุ: ไม่มีเอกสาร'], go: { href: `/referral?child=${s.id}&need=documents` }, score: 76 })
  if (has('migration'))
    cause({ key: 'migrant', th: 'ติดต่อพ่อแม่ที่ย้ายไปทำงานผ่านญาติหรือ LINE', why: `ผู้ปกครองย้ายถิ่น — เด็กอยู่กับ${s.master.parentRelationName}`, pros: 'พ่อแม่ยังมีบทบาทตัดสินใจเรื่องเรียน', cons: 'ต้องขอช่องทางติดต่อจากผู้ดูแลก่อน', basis: ['สาเหตุ: ผู้ปกครองย้ายถิ่น', `ผู้ดูแล: ${s.master.parentRelationName}`], go: { sheet: 'outcome', mode: 'contact' }, score: 68 })
  if (has('transition'))
    cause({ key: 'transition', th: 'ให้ครูประจำชั้นใหม่และเพื่อนพี่เลี้ยงดูแลช่วงเปลี่ยนชั้น', why: 'อยู่ช่วงเปลี่ยนผ่านชั้นเรียน ซึ่งเด็กหลุดบ่อยที่สุด', pros: 'เด็กมีคนรู้จักที่โรงเรียนใหม่/ชั้นใหม่', cons: 'ต้องประสานก่อนเปิดเทอม', basis: ['สาเหตุ: ช่วงเปลี่ยนผ่านชั้นเรียน'], go: { sheet: 'schedule', method: 'คุยกับนักเรียน' }, score: 64 })
  const travel = /ค่าเดินทาง|ค่ารถ|ไม่มีรถ|เดินทาง/.test(text) || s.causeKeys.includes('travel')
  if (travel)
    opts.push({
      key: 'travel',
      th: 'หาทุนค่าเดินทาง (อบต. / กองทุนโรงเรียน)',
      why: /ค่าเดินทาง|ค่ารถ|ไม่มีรถ/.test(text) ? 'ครูบันทึกว่ามีปัญหาค่าเดินทาง' : `เดินทาง ${s.master.timeDt} นาที (${s.master.journeyTypeName})`,
      pros: 'แก้ที่ต้นเหตุ เด็กกลับมาเรียนได้ทันที',
      cons: 'ต้องมีหลักฐานรายได้ และใช้เวลาอนุมัติ',
      basis: B(noteSays(/ค่าเดินทาง|ค่ารถ|ไม่มีรถ/, 'มีปัญหาค่าเดินทาง'), `เวลาเดินทาง ${s.master.timeDt} นาที`, `รายได้ครอบครัว ${s.master.parentSalary.toLocaleString('th-TH')} บาท`),
      go: { href: `/referral?child=${s.id}&need=transport` },
      score: /ค่าเดินทาง|ค่ารถ|ไม่มีรถ/.test(text) ? 92 : 60,
    })
  if (alternative || fc.updatedDaysAgo >= 7)
    opts.push({
      key: 'team',
      th: 'ขอทีมช่วยเหลือของโรงเรียนเข้าร่วม (ประชุมทีม)',
      why: alternative ? 'ลองหลายทางแล้วยังไม่คืบ' : `ไม่มีความคืบหน้า ${fc.updatedDaysAgo} วัน`,
      pros: 'ได้หลายมุมมอง แบ่งงานกันทำ',
      cons: 'ต้องนัดหลายคน — ใช้เมื่อทางเดียวไม่พอ',
      basis: B(failed ? `ติดต่อไม่สำเร็จ ${failed} ครั้ง` : '', `อัปเดตล่าสุด ${fc.updatedDaysAgo} วันก่อน`),
      go: { sheet: 'schedule', method: 'ประชุมทีม' },
      score: alternative ? 65 : 55,
    })
  if (needsAgency(s) && !fc.refs.some((r) => r.bucket !== 'done'))
    opts.push({
      key: 'refer',
      th: `ส่งต่อ ${agencyOwners(s).filter((o) => !/ครู|โรงเรียน/.test(o))[0] ?? 'หน่วยงาน'}`,
      why: 'สาเหตุบางข้ออยู่นอกอำนาจโรงเรียนตามกลุ่มรหัส สพฐ.',
      pros: 'หน่วยงานมีทรัพยากรที่โรงเรียนไม่มี',
      cons: 'ต้องได้ความยินยอมผู้ปกครองก่อน (PDPA)',
      basis: B(...agencyOwners(s).filter((o) => !/ครู|โรงเรียน/.test(o)).slice(0, 2).map((o) => `เจ้าภาพตามรหัส สพฐ.: ${o}`)),
      go: { href: `/referral?child=${s.id}` },
      score: s.riskLevel === 'critical' || s.riskLevel === 'high' ? 62 : 40,
    })
  if (!fc.hasPlan && (s.riskLevel === 'high' || s.riskLevel === 'critical'))
    opts.push({
      key: 'plan',
      th: 'สร้างแผนโอกาสรายบุคคล',
      why: 'เสี่ยงสูงแต่ยังไม่มีแผนว่าใครทำอะไรเมื่อไร',
      pros: 'ทุกคนในทีมเห็นขั้นตอนเดียวกัน',
      cons: 'ควรรู้สาเหตุชัดก่อน — คุยกับเด็ก/ครอบครัวก่อนจะดีกว่า',
      basis: B(`ความเสี่ยง ${s.riskScore}/100`, 'ยังไม่มีแผน'),
      go: { href: `/plan?child=${s.id}` },
      score: 58,
    })
  if (fc.closable)
    opts.push({
      key: 'close',
      th: 'ประเมินเพื่อปิดเคส',
      why: 'ข้อมูลล่าสุดบ่งชี้ว่าเด็กดีขึ้นจนเข้าเกณฑ์',
      pros: 'ครูมีเวลาให้เด็กคนอื่นที่ต้องการมากกว่า',
      cons: 'ควรติดตามห่าง ๆ ต่ออีกระยะหลังปิด',
      basis: closability(s).metTh.slice(0, 3),
      go: { sheet: 'close' },
      score: 99,
    })

  // ทางที่ครูนัดไว้แล้วไม่ต้องเสนอซ้ำ — ขึ้นในส่วนนัดหมายอยู่แล้ว
  const booked = new Set(entries.filter((e) => e.followUpDate && !e.followUpDone).map((e) => e.followUpMethod))
  const fresh = opts.filter((o) => !('sheet' in o.go && o.go.sheet === 'schedule' && o.go.method && booked.has(o.go.method)))
  fresh.sort((a, b) => b.score - a.score)
  const options = fresh.map(({ score: _s, ...o }) => o)
  const basis = [...new Set(options.slice(0, 3).flatMap((o) => o.basis))]
  if (obs.some((o) => !o.resolvedTs)) basis.push(`สิ่งที่ครูพบ ${obs.filter((o) => !o.resolvedTs).length} ข้อ`)
  if (fc.riskDelta) basis.push(`ความเสี่ยง${fc.riskDelta > 0 ? 'เพิ่ม' : 'ลด'} ${Math.abs(fc.riskDelta)} คะแนนใน 8 สัปดาห์`)
  return { options, alternative, basis: [...new Set(basis)].slice(0, 7) }
}

// ── เป้าหมาย ────────────────────────────────────────────────

/** เป้าหมายที่ AI เสนอ — ครูแก้ ลบ เพิ่ม แล้วยืนยันเอง */
export function suggestGoals(s: Student): string[] {
  const g = ['กลับมาเรียนอย่างน้อย 80%']
  if (s.parentContact !== 'ok') g.push('ติดต่อผู้ปกครองได้')
  if (!s.homeVisited && (s.riskLevel === 'high' || s.riskLevel === 'critical')) g.push('เยี่ยมบ้านอย่างน้อย 1 ครั้ง')
  if (s.absenceStreak >= 2 || s.wellbeingRisk >= 55) g.push('นักเรียนพบครูแนะแนวอย่างน้อย 2 ครั้ง')
  if (s.riskScore >= 70) g.push('คะแนนความเสี่ยงต่ำกว่า 70')
  return g
}

/** ระบบวัดเป้าหมายบางข้อให้ได้เอง — ข้อที่วัดไม่ได้ครูติ๊กเอง */
export function goalProgress(s: Student, text: string): { auto?: boolean; note?: string } {
  if (/มาเรียน.*(\d+)%/.test(text)) {
    const want = Number(text.match(/(\d+)%/)![1])
    return { auto: att(s) >= want, note: `ตอนนี้ ${att(s)}%` }
  }
  if (/ติดต่อผู้ปกครองได้/.test(text)) return { auto: s.parentContact === 'ok', note: s.parentContact === 'ok' ? 'ติดต่อได้แล้ว' : 'ยังติดต่อไม่ได้' }
  if (/เยี่ยมบ้าน/.test(text)) return { auto: s.homeVisited, note: s.homeVisited ? 'เยี่ยมแล้ว' : 'ยังไม่ได้เยี่ยม' }
  if (/ต่ำกว่า (\d+)/.test(text) && /ความเสี่ยง/.test(text)) {
    const lim = Number(text.match(/ต่ำกว่า (\d+)/)![1])
    return { auto: s.riskScore < lim, note: `ตอนนี้ ${s.riskScore}` }
  }
  return {}
}

export const goalDone = (s: Student, g: CareGoal['items'][number]) => goalProgress(s, g.text).auto ?? Boolean(g.done)

// ── ผลล่าสุด ────────────────────────────────────────────────

export function latestOutcome(fc: FollowCase, entries: CaseLogEntry[]): { ok: boolean; th: string }[] {
  const s = fc.s
  const out: { ok: boolean; th: string }[] = []
  out.push(s.parentContact === 'ok' ? { ok: true, th: 'ติดต่อผู้ปกครองได้แล้ว' } : { ok: false, th: s.parentContact === 'unreachable' ? 'ยังติดต่อผู้ปกครองไม่ได้' : 'ผู้ปกครองยังตอบไม่ครบ' })
  const a = att(s)
  out.push(a >= 80 ? { ok: true, th: `มาเรียนสัปดาห์นี้ ${a}%` } : { ok: false, th: `มาเรียนสัปดาห์นี้ ${a}%${s.absenceStreak ? ` · ขาดติดกัน ${s.absenceStreak} วัน` : ''}` })
  out.push(s.homeVisited ? { ok: true, th: 'เยี่ยมบ้านแล้ว' } : { ok: false, th: 'ยังไม่ได้เยี่ยมบ้าน' })
  const pending = entries.filter((e) => e.followUpDate && !e.followUpDone)
  for (const p of pending.slice(0, 2)) out.push({ ok: false, th: `รอ${p.followUpMethod ?? 'ติดตามผล'} ${p.followUpDate}` })
  for (const r of fc.refs.filter((x) => x.outcome)) out.push({ ok: r.outcome!.ok === 'ok', th: `${r.toName}: ${r.outcome!.th}` })
  return out
}

// ── ทีมที่ช่วย ───────────────────────────────────────────────

export interface TeamMember {
  role: string
  name: string
  note?: string
}

/** เฉพาะคนที่เกี่ยวข้องจริงจากบันทึก — ไม่แสดงทุกบทบาทเผื่อไว้ */
export function caseTeam(fc: FollowCase, entries: CaseLogEntry[], me: string): TeamMember[] {
  const out: TeamMember[] = [{ role: 'ครูเจ้าของเคส', name: fc.s.caseOwner || me, note: fc.s.caseOwner === me ? 'คุณ' : undefined }]
  const text = entries.map((e) => `${e.note} ${e.channel ?? ''} ${e.escalation ?? ''} ${e.followUpMethod ?? ''}`).join(' ')
  if (/แนะแนว|คุยกับนักเรียน/.test(text) && !/แนะแนว/.test(fc.s.caseOwner)) out.push({ role: 'ครูแนะแนว', name: 'ครูแนะแนวของโรงเรียน' })
  if (/ผอ\./.test(text)) out.push({ role: 'ผู้บริหาร', name: 'ผอ.โรงเรียน', note: 'ได้รับแจ้งแล้ว' })
  // อ่านจากบันทึกของครูเท่านั้น — ไทม์ไลน์ตั้งต้นมีประโยค "ประสานผู้นำชุมชน" เหมือนกันทุกคน
  // ถ้านับด้วย เด็กทุกคนจะมีผู้นำชุมชนในทีมทั้งที่ไม่มีใครประสานจริง
  if (/ผู้นำชุมชน|อสม|leader/.test(text)) out.push({ role: 'ชุมชน', name: 'ผู้นำชุมชน / อสม.' })
  if (/ประชุมทีม/.test(text)) out.push({ role: 'ทีมช่วยเหลือ', name: 'ทีมช่วยเหลือนักเรียนของโรงเรียน' })
  for (const e of entries) if (e.followUpOwner && e.followUpOwner !== me && !out.some((m) => m.name === e.followUpOwner)) out.push({ role: 'ผู้รับผิดชอบนัด', name: e.followUpOwner })
  for (const r of fc.refs.filter((x) => x.bucket !== 'done' || x.outcome))
    out.push({ role: 'หน่วยงานภายนอก', name: r.toName, note: `${r.needTh}${r.officer ? ` · ${r.officer}` : ''}` })
  return out
}

export { riskLevel }
