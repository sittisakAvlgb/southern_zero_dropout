// ─────────────────────────────────────────────────────────────
// "ครูควรเริ่มช่วยอย่างไร" — คำแนะนำที่อ่านสาเหตุของเด็กคนนั้นจริง ๆ
//
// เดิมคำตอบของคำถามนี้คือ `student.nextAction` ซึ่งเป็นเทมเพลตสามแบบตาม
// ระดับความเสี่ยงล้วน ๆ (ดู src/data/students.ts) เด็กที่ยากจน เด็กที่ถูกให้
// แต่งงานเร็ว และเด็กที่ไม่มีเอกสารแสดงตน จึงได้ประโยคเดียวกันหมดถ้าคะแนน
// อยู่ระดับเดียวกัน — ครูที่เชื่อคำแนะนำนั้นจะถูกพาไปผิดทาง ซึ่งแย่กว่าการ
// ไม่มีคำแนะนำเลย
//
// ที่นี่คำแนะนำผูกกับ `causeKeys` และตัวเลขบนระเบียนของเด็ก ทุกข้อจึงมี
// "เพราะอะไร" ที่ครูย้อนตรวจได้ และคำนวณล้วน — ไม่ต้องมี API key จึงทำงาน
// ได้บนเว็บ static ด้วย เมื่อมีโมเดลจริง ชั้นนี้กลายเป็นกรอบให้โมเดลเติม
// ข้อความ ไม่ใช่สิ่งที่ถูกแทนที่
// ─────────────────────────────────────────────────────────────
import type { CaseStage, CauseKey, Student } from '@/types'
import { REASON_BY_ID, ownerOfCause } from '@/data/dropReasons'

/** สิ่งที่ครูกดแล้วเกิดขึ้นจริงกับระเบียนเด็ก ไม่ใช่แค่พาไปอีกหน้า
 *  ทั้งสามค่าแมปตรงกับสิ่งที่ `useCaseLog()` เขียนได้อยู่แล้ว */
export type StepAction = 'contact' | 'visit' | 'followUp'

export interface RecommendedStep {
  key: string
  th: string
  en: string
  /** เหตุผลจากข้อมูลของเด็กคนนี้ ไม่ใช่คำอธิบายทั่วไป */
  whyTh: string
  whyEn: string
  /** ปุ่มกดเดียวจบ — ไม่มีก็ได้ ถ้าเป็นขั้นที่ต้องทำนอกระบบ */
  action?: StepAction
}

const CLOSED: CaseStage[] = ['returned', 'resolved']

/** ผู้ปกครองที่เป็นพ่อแม่จริง ที่เหลือคือญาติที่รับช่วงดูแลแทน */
const PARENT = ['มารดา', 'บิดา']

/** สาเหตุที่ต้องพาหน่วยงานนอกการศึกษาเข้ามา ไม่ใช่เรื่องที่ครูแก้เองได้ */
const NEEDS_AGENCY: CauseKey[] = [
  'poverty',
  'health',
  'childLabour',
  'earlyMarriage',
  'noDocuments',
  'family',
]

/** เรียงตามลำดับที่ครูควรลงมือจริง ไม่ใช่ตามความรุนแรงของสาเหตุ:
 *  ตั้งหลักให้ติดต่อได้ก่อน → เห็นสภาพจริงที่บ้าน → แก้ตามสาเหตุ → นัดวันกลับมาดู */
export function recommendSteps(s: Student, th: boolean): RecommendedStep[] {
  const out: RecommendedStep[] = []
  const has = (k: CauseKey) => s.causeKeys.includes(k)
  const push = (step: RecommendedStep) => out.push(step)

  // ① ถ้ายังติดต่อผู้ปกครองไม่ได้ ทุกอย่างหลังจากนี้ทำไม่ได้จริง
  if (s.parentContact === 'unreachable')
    push({
      key: 'reach',
      th: 'ติดต่อผู้ปกครองผ่านผู้นำชุมชนหรือ อสม.',
      en: 'Reach the guardian through a community leader or health volunteer',
      whyTh: `ติดต่อทางเบอร์ที่มีไม่สำเร็จ (คะแนนด้านผู้ปกครอง ${s.parentRisk}/100)`,
      whyEn: `Direct contact has failed (parent sub-score ${s.parentRisk}/100)`,
      action: 'contact',
    })
  else if (s.parentContact === 'delayed')
    push({
      key: 'callback',
      th: 'โทรหาผู้ปกครองอีกครั้งและนัดเวลาที่สะดวก',
      en: 'Call the guardian again and agree a time that suits them',
      whyTh: 'ผู้ปกครองตอบกลับช้า ยังไม่ได้ข้อสรุป',
      whyEn: 'The guardian has been slow to respond and nothing is settled',
      action: 'contact',
    })

  // ② ขาดเรียนต่อเนื่องคือสัญญาณที่เดินหน้าเองทุกวันถ้าไม่มีใครไปดู
  if (s.absenceStreak >= 5 && !s.homeVisited)
    push({
      key: 'visit',
      th: 'ลงเยี่ยมบ้านเพื่อดูว่าเกิดอะไรขึ้นจริง',
      en: 'Make a home visit to find out what is actually happening',
      whyTh: `ขาดเรียนติดต่อกัน ${s.absenceStreak} วัน และยังไม่เคยมีบันทึกเยี่ยมบ้าน`,
      whyEn: `${s.absenceStreak} consecutive days absent and no visit on record`,
      action: 'visit',
    })

  // ③ แก้ตามสาเหตุ — เฉพาะสาเหตุที่เด็กคนนี้มีจริง
  if (has('poverty') || has('childLabour')) {
    // อ้างรายได้จริงจากทะเบียน ไม่ใช่คำว่า "ยากจน" ลอย ๆ — ครูต้องใช้ตัวเลขนี้
    // กรอกแบบขอทุนอยู่แล้ว และผู้อนุมัติก็ดูตัวเลขนี้เหมือนกัน
    const salary = s.master.parentSalary.toLocaleString('th-TH')
    push({
      key: 'welfare',
      th: 'ประเมินสถานะทางเศรษฐกิจของครอบครัว และยื่นขอทุน/เงินอุดหนุน',
      en: "Assess the family's finances and apply for a grant or allowance",
      whyTh: has('childLabour')
        ? `รายได้ผู้ปกครอง ${salary} บาท/เดือน และระเบียนระบุว่าเด็กต้องทำงานหารายได้ (รหัส 303)`
        : `รายได้ผู้ปกครอง ${salary} บาท/เดือน · ${REASON_BY_ID.get(302)?.shortTh} (รหัส 302)`,
      whyEn: has('childLabour')
        ? `Household income ฿${salary}/month and the record shows the child is working for income`
        : `Household income ฿${salary}/month, recorded as a cost barrier to schooling`,
    })
  }

  if (has('health') || s.wellbeingRisk >= 70)
    push({
      key: 'health',
      th: 'ประสานนักจิตวิทยาโรงเรียนหรือ รพ.สต. ในพื้นที่',
      en: 'Involve the school counsellor or the local health station',
      // แสดงคะแนนสุขภาวะเฉพาะเมื่อสูงจริง — เดิมขึ้น "คะแนนด้านสุขภาวะ 18/100" เป็นเหตุผล
      // ทั้งที่ 18 คือเสี่ยงต่ำ ครูอ่านแล้วขัดกันเอง เหตุผลจริงคือปัญหาสุขภาพในระเบียน
      whyTh:
        s.wellbeingRisk >= 70
          ? `ความเสี่ยงด้านสุขภาวะ ${s.wellbeingRisk}/100${has('health') ? ' และมีปัญหาสุขภาพในระเบียน' : ''}`
          : 'มีปัญหาสุขภาพบันทึกไว้ในระเบียน (สาเหตุกลุ่ม 2xx) — ควรให้ผู้เชี่ยวชาญประเมิน',
      whyEn:
        s.wellbeingRisk >= 70
          ? `Wellbeing risk ${s.wellbeingRisk}/100${has('health') ? ', with a health problem on the record' : ''}`
          : 'A health problem is on the record — worth a professional assessment',
    })

  // ผู้ปกครองที่ไม่ใช่พ่อแม่ + ที่อยู่ปัจจุบันต่างจากทะเบียนบ้าน คือรูปร่างของ
  // รหัส 306 (ย้ายถิ่นตามผู้ปกครอง) ในข้อมูลจริง ครูที่เห็นสองฟิลด์นี้พร้อมกัน
  // จะรู้ทันทีว่าต้องคุยกับใคร ไม่ใช่โทรหาพ่อแม่ที่ไม่ได้อยู่ในพื้นที่
  if (has('migration') || (s.master.movedFromRegisteredAddress && !PARENT.includes(s.master.parentRelationName)))
    push({
      key: 'guardian',
      th: `คุยกับ${s.master.parentRelationName}ซึ่งเป็นผู้ดูแลจริง ไม่ใช่พ่อแม่ที่ย้ายถิ่น`,
      en: `Work with the ${s.master.parentRelationName}, who actually cares for the child`,
      whyTh: `ทะเบียนระบุผู้ปกครองเป็น "${s.master.parentRelationName}"${s.master.movedFromRegisteredAddress ? ' และที่อยู่ปัจจุบันต่างจากทะเบียนบ้าน' : ''} (รหัส 306)`,
      whyEn: `The register names the ${s.master.parentRelationName} as guardian${s.master.movedFromRegisteredAddress ? ', and the current address differs from the registered one' : ''}`,
    })

  if (has('earlyMarriage'))
    push({
      key: 'marriage',
      th: 'คุยกับครอบครัวเรื่องทางเลือกที่เรียนต่อได้โดยไม่ต้องออก',
      en: 'Talk the family through options that do not require leaving school',
      whyTh: 'ระเบียนระบุการแต่งงานก่อนวัย — เป็นการตัดสินใจของครอบครัว ไม่ใช่ของเด็ก',
      whyEn: 'Early marriage is on the record — a family decision, not the child’s',
    })

  if (has('noDocuments'))
    push({
      key: 'docs',
      th: 'ประสานอำเภอเรื่องเอกสารแสดงตน',
      en: 'Work with the district office on identity documents',
      whyTh: 'ไม่มีเอกสารแสดงตน ทำให้สิทธิ์ทางการศึกษาและสวัสดิการติดขัดทั้งหมด',
      whyEn: 'Without identity documents every education and welfare entitlement stalls',
    })

  if (has('travel') || has('noDevice')) {
    const m = s.master
    // ระยะทางในทะเบียนแยกตามสภาพเส้นทาง — ทางลูกรังกับทางน้ำคือสาเหตุที่
    // เด็กมาไม่ได้ในหน้าฝน ซึ่งต่างจาก "บ้านไกล" เฉย ๆ และแก้คนละวิธี
    const rough = m.rockDt + m.waterDt
    push({
      key: 'access',
      th: has('travel')
        ? 'จัดการเรื่องการเดินทางมาโรงเรียน'
        : 'จัดหาอุปกรณ์หรือจุดเรียนที่เด็กเข้าถึงได้',
      en: has('travel') ? 'Sort out the journey to school' : 'Find a device or a place to study',
      whyTh: has('travel')
        ? `เดินทาง ${m.timeDt} นาที · ${m.journeyTypeName}${rough > 0 ? ` · เส้นทางลูกรัง/ทางน้ำ ${rough.toLocaleString('th-TH')} ม.` : ''} (รหัส 503)`
        : 'ไม่มีอุปกรณ์สำหรับเรียน',
      whyEn: has('travel')
        ? `${m.timeDt} minutes each way · ${m.journeyTypeName}${rough > 0 ? ` · ${rough} m of unpaved or water crossing` : ''}`
        : 'No device to study with',
    })
  }

  if (has('grades') || has('failing') || has('noExam'))
    push({
      key: 'academic',
      th: 'จัดสอนเสริมหรือวัดผลซ่อมในวิชาที่ค้าง',
      en: 'Arrange catch-up teaching or a re-assessment for the subjects behind',
      whyTh: `ผลการเรียนเป็นสาเหตุในระเบียน (คะแนนด้านการเรียน ${s.academicRisk}/100)`,
      whyEn: `Academic failure is a recorded cause (academic sub-score ${s.academicRisk}/100)`,
    })

  // ④ ปิดท้ายด้วยวันที่จะกลับมาดู — ขั้นที่ทำให้เรื่องไม่หายไปเงียบ ๆ
  push({
    key: 'followUp',
    th: s.riskLevel === 'critical' ? 'นัดติดตามภายใน 7 วัน' : 'นัดติดตามภายใน 14 วัน',
    en: s.riskLevel === 'critical' ? 'Set a follow-up within 7 days' : 'Set a follow-up within 14 days',
    whyTh:
      s.riskLevel === 'critical'
        ? 'ระดับวิกฤต — ถ้าไม่มีวันนัด เรื่องจะค้างจนเกินกำหนด'
        : 'ตั้งวันกลับมาดู เพื่อให้รู้ว่าที่ช่วยไปได้ผลหรือไม่',
    whyEn:
      s.riskLevel === 'critical'
        ? 'Critical — without a date this slips past its deadline'
        : 'A date to come back and see whether the help worked',
    action: 'followUp',
  })

  return out
}

/** หน่วยงานนอกการศึกษาที่เคสนี้น่าจะต้องใช้ — ใช้บอกครูว่าเรื่องนี้เกินมือ
 *  โรงเรียนตั้งแต่ต้น ไม่ใช่ให้ครูลองเองจนหมดแรงแล้วค่อยส่งต่อ */
export function needsAgency(s: Student): boolean {
  return s.causeKeys.some((k) => NEEDS_AGENCY.includes(k))
}

/** เจ้าภาพของแต่ละสาเหตุ ตามกลุ่มรหัสในตาราง สพฐ. (1xx ครู · 2xx สาธารณสุข ·
 *  3xx พมจ./ท้องถิ่น · 4xx ชุมชน · 5xx โรงเรียน/เขต) — ตอบคำถาม "ส่งต่อใคร"
 *  จากตารางราชการ ไม่ใช่จากการเดาของเรา */
export function agencyOwners(s: Student): string[] {
  return [...new Set(s.causeKeys.map(ownerOfCause).filter((x): x is string => Boolean(x) && x !== '—'))]
}

// ── "เคสไหนปิดได้" ───────────────────────────────────────────

export interface Closable {
  /** เข้าเกณฑ์ครบหรือยัง */
  ready: boolean
  /** เงื่อนไขที่ผ่านแล้ว — ครูอ่านแล้วตรวจเองได้ก่อนกดปิด */
  metTh: string[]
  metEn: string[]
  /** ยังขาดอะไร */
  missingTh: string[]
  missingEn: string[]
}

/** เคสจะ "เสนอให้ปิด" ได้ ต้องเห็นผลจริง ไม่ใช่แค่เงียบไป
 *
 *  เงื่อนไขทุกข้ออ่านจากระเบียน ครูเป็นคนกดปิดเสมอ ระบบไม่ปิดเอง — การปิดเคส
 *  คือการบอกว่าเด็กคนนี้ปลอดภัยแล้ว ไม่ใช่การตัดสินใจที่ควรเป็นอัตโนมัติ */
export function closability(s: Student): Closable {
  const metTh: string[] = []
  const metEn: string[] = []
  const missingTh: string[] = []
  const missingEn: string[] = []

  const first = s.riskHistory[0]?.score ?? s.riskScore
  const drop = first - s.riskScore
  if (drop >= 8) {
    metTh.push(`ความเสี่ยงลดลง ${drop} คะแนนใน 8 สัปดาห์`)
    metEn.push(`Risk down ${drop} points over 8 weeks`)
  } else {
    missingTh.push('ความเสี่ยงยังไม่ลดลงอย่างชัดเจน')
    missingEn.push('Risk has not clearly come down')
  }

  // เพดานสัมบูรณ์ — "ลดลงเยอะ" ไม่พอ เด็กที่ร่วงจาก 100 มาอยู่ 74 ยังอยู่
  // ระดับเสี่ยงสูง การเสนอให้ปิดเคสตอนนั้นคือการบอกครูว่าเด็กปลอดภัยแล้ว
  // ทั้งที่ยังไม่ปลอดภัย (70 คือเส้นแบ่งระดับ "สูง" ใน riskLevel())
  if (s.riskScore < 70) {
    metTh.push(`คะแนนเสี่ยงปัจจุบัน ${s.riskScore} ต่ำกว่าระดับเสี่ยงสูง`)
    metEn.push(`Current score ${s.riskScore} is below the high-risk band`)
  } else {
    missingTh.push(`คะแนนเสี่ยงยังอยู่ที่ ${s.riskScore} ซึ่งยังเป็นระดับเสี่ยงสูง`)
    missingEn.push(`The score is still ${s.riskScore}, inside the high-risk band`)
  }

  const att = s.attendance[s.attendance.length - 1]?.rate ?? 0
  if (att >= 80) {
    metTh.push(`กลับมาเรียนสม่ำเสมอ ${Math.round(att)}%`)
    metEn.push(`Attendance back to ${Math.round(att)}%`)
  } else {
    missingTh.push(`การมาเรียนยังอยู่ที่ ${Math.round(att)}%`)
    missingEn.push(`Attendance is still ${Math.round(att)}%`)
  }

  // ขาด 1–2 วันคือเป็นหวัด ไม่ใช่สัญญาณหลุดระบบ ถ้าบังคับให้เป็นศูนย์เป๊ะ
  // เคสที่หายดีแล้วจริง ๆ จะติดอยู่ที่เงื่อนไขนี้ข้อเดียวแทบทั้งหมด
  if (s.absenceStreak <= 2) {
    metTh.push(
      s.absenceStreak === 0 ? 'ไม่มีการขาดเรียนต่อเนื่อง' : `ขาดเรียนเพียง ${s.absenceStreak} วัน ไม่ต่อเนื่อง`,
    )
    metEn.push(
      s.absenceStreak === 0
        ? 'No current absence streak'
        : `Only ${s.absenceStreak} days absent, not a streak`,
    )
  } else {
    missingTh.push(`ยังขาดเรียนต่อเนื่อง ${s.absenceStreak} วัน`)
    missingEn.push(`Still ${s.absenceStreak} consecutive days absent`)
  }

  if (s.parentContact === 'ok') {
    metTh.push('ติดต่อผู้ปกครองได้')
    metEn.push('The guardian is reachable')
  } else {
    missingTh.push('ยังติดต่อผู้ปกครองไม่ได้ตามปกติ')
    missingEn.push('The guardian is still not reliably reachable')
  }

  return {
    // เคสที่ปิดไปแล้วไม่ต้องเสนอซ้ำ
    ready: missingTh.length === 0 && !CLOSED.includes(s.caseStage),
    metTh,
    metEn,
    missingTh,
    missingEn,
  }
}
