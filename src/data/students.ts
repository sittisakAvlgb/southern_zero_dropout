import type {
  AttendancePoint,
  CaseStage,
  CauseKey,
  ChildStatus,
  ConsentStatus,
  GradeLevel,
  GradePoint,
  InterventionEvent,
  RiskPoint,
  StudentMaster,
  Student,
} from '@/types'
import {
  computeRiskScore,
  familyRiskFrom,
  riskLevel,
  travelPenalty,
  wellbeingRiskFrom,
} from '@/lib/risk'
import { hashSeed, makeRng, pick, randInt } from '@/lib/format'
import { DISTRICTS_GEO } from './geo'
import { TAMBONS } from './places'
import { SCHOOLS } from './schools'

// Names reflect the actual population of the southern border provinces —
// predominantly Malay-Muslim, with a Thai-Buddhist minority.
const MALE_FIRST = [
  'มูฮัมหมัดอิลฮาม', 'อับดุลเราะห์มาน', 'ฟัยรุซ', 'อาลีฟ', 'ซุลกิฟลี', 'อิรฟาน',
  'นาซือรี', 'ฮากิม', 'อันวาร์', 'ยูโซะ', 'อิสมาแอ', 'มะรอสดี', 'ซอฟวาน',
  'ฮาฟิซ', 'อาดัม', 'สมชาย', 'ธีรพงศ์',
]
const FEMALE_FIRST = [
  'นูรีซัน', 'ฟาตีมะห์', 'ซากีนะห์', 'อัสมา', 'ฮัสนะห์', 'นูรฮายาตี', 'ไซนับ',
  'มารียัม', 'รุสนานี', 'ซูไรดา', 'อามีนะห์', 'ฮูดา', 'ซัลมา', 'นาซีฮะห์',
  'ปิยะดา', 'ศิริพร',
]
const LAST = [
  'ดอเลาะ', 'สาและ', 'มะมิง', 'ยูโซะ', 'เจ๊ะแว', 'หะยีสาแม', 'บินอาลี', 'ลาเตะ',
  'อาแว', 'สะแลแม', 'กาเดร์', 'หะมะ', 'ตาเยะ', 'นิเดร์', 'แวดาโอ๊ะ', 'มะเซ็ง',
  'ดาโอะ', 'ปะดอ', 'ทองแก้ว', 'แซ่ลิ่ม',
]

/** the guidance teacher the demo account signs in as — see auth/roles.ts */
const GUIDANCE_OWNER = 'ครูแนะแนว นูรียะ'

/** ผู้รับผิดชอบเคสในข้อมูลจำลอง — data/staff.ts ใช้รายชื่อเดียวกันเป็นส่วนหนึ่งของบุคลากรโรงเรียน */
export const OWNERS = [
  'ครูฟาตีฮะห์ ม.', 'ครูอับดุลรอฮิม ส.', GUIDANCE_OWNER, 'ครูประจำชั้น อารีนา',
  'นักจิตวิทยา สุไรยา', 'นักสังคมสงเคราะห์ ซัลมา', 'ครูสมชาย ท.', 'อสม. ยาวารี',
]

const GRADES: GradeLevel[] = ['p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5']

// ── ทะเบียนนักเรียนตามรูปร่างจริง (DMC/สพฐ.) ─────────────────
// สัดส่วนทุกชุดด้านล่างลอกมาจากไฟล์ตัวอย่างจริงที่ ผอ. ส่งมา (124 ระเบียน
// หนึ่งโรงเรียน ปีการศึกษา 2569 เทอม 2) ไม่ได้ตั้งขึ้นเอง ตัวเลขจึงกระจาย
// แบบเดียวกับของจริง เช่น รายได้ผู้ปกครองกองอยู่ที่ 9,000 และ 3,000 บาท
// ไม่ใช่กระจายเท่า ๆ กันแบบที่ข้อมูลสังเคราะห์มักเป็น
const SALARY_POOL = [
  ...Array(42).fill(9000), ...Array(24).fill(3000), ...Array(15).fill(5000),
  ...Array(8).fill(6000), ...Array(5).fill(15000), ...Array(4).fill(8000),
  ...Array(3).fill(12000), ...Array(3).fill(4000), ...Array(2).fill(20000),
  ...Array(2).fill(2000), 1500, 30000,
]

// เด็กที่อยู่กับปู่ย่าตายายมักมาพร้อมพ่อแม่ที่ย้ายถิ่นไปทำงาน ซึ่งเป็นสาเหตุ
// รหัส 306 ในตาราง สพฐ. — ฟิลด์นี้จึงไม่ใช่แค่ข้อมูลทะเบียน
const GUARDIAN_POOL = [
  ...Array(64).fill('มารดา'), ...Array(26).fill('บิดา'), ...Array(13).fill('ยาย'),
  ...Array(10).fill('ย่า'), ...Array(4).fill('ผู้ปกครอง'), ...Array(3).fill('น้า'),
  'ตา', 'ปู่', 'พี่สาว', 'ลุง',
]

const ROCK_POOL = [...Array(82).fill(0), ...Array(19).fill(100), ...Array(10).fill(200), ...Array(5).fill(300), ...Array(4).fill(500), 700]
const RUBBER_POOL = [...Array(21).fill(100), ...Array(19).fill(1000), ...Array(13).fill(200), ...Array(11).fill(5), ...Array(9).fill(500), ...Array(7).fill(1500), ...Array(5).fill(2000), ...Array(4).fill(3000), 50, 300]
const WATER_POOL = [...Array(72).fill(0), ...Array(14).fill(500), ...Array(13).fill(100), ...Array(7).fill(1000), ...Array(4).fill(300), ...Array(4).fill(200)]
const TIME_POOL = [...Array(50).fill(10), ...Array(36).fill(5), ...Array(16).fill(15), ...Array(8).fill(20), ...Array(6).fill(30), 25]
const JOURNEY_POOL = [
  ...Array(91).fill('พาหนะไม่เสียค่าโดยสาร'),
  ...Array(19).fill('พาหนะเสียค่าโดยสาร'),
  ...Array(14).fill('เดินเท้า'),
]

/** โอกาสที่เด็กในแต่ละขั้นจะ "กำลังดีขึ้น" — ยังไม่เริ่มช่วยคือศูนย์ ยิ่งช่วย
 *  ไปไกลยิ่งมีโอกาสเห็นผล กลับเข้าเรียนหรือปิดเคสแล้วคือดีขึ้นแน่นอน */
const RECOVERY_CHANCE: Record<CaseStage, number> = {
  alerted: 0,
  accepted: 0,
  inProgress: 0.3,
  homeVisit: 0.35,
  referred: 0.45,
  planned: 0.6,
  returned: 1,
  resolved: 1,
}

const STAGES: CaseStage[] = [
  'alerted', 'accepted', 'inProgress', 'homeVisit', 'referred', 'planned',
  'returned', 'resolved',
]

const CAUSE_POOL: CauseKey[] = [
  'absence', 'grades', 'failing', 'noExam', 'poverty', 'migration',
  'family', 'health', 'travel', 'noContact', 'noDevice', 'transition',
  'earlyMarriage', 'childLabour', 'dualSchooling', 'unrestAffected',
  'noDocuments',
]

/** Weighted pick of a tambon — bigger places carry more of the caseload. */
const TAMBON_POOL = TAMBONS.flatMap((t) =>
  Array.from({ length: Math.max(1, Math.round(t.highRiskStudents / 12)) }, () => t),
)

const DISTRICT_KIND = Object.fromEntries(
  DISTRICTS_GEO.map((d) => [d.key, d.kind]),
) as Record<string, string>

/** `trend` คือทิศทางเฉลี่ยต่อสัปดาห์ ค่าลบ = การมาเรียนถดถอย ซึ่งเป็นค่า
 *  ตั้งต้นของเด็กที่ยังไม่ได้รับการช่วยเหลือ ส่วนเด็กที่มีแผนช่วยเหลือแล้ว
 *  ส่งค่าบวกเข้ามา เพื่อให้ข้อมูลมีเด็กที่ "กำลังกลับมา" อยู่จริง */
function attendance(rng: () => number, base: number, trend = -1): AttendancePoint[] {
  const out: AttendancePoint[] = []
  let v = base
  for (let i = 1; i <= 8; i++) {
    v = Math.max(30, Math.min(100, v + (rng() * 14 - 7 + trend)))
    out.push({ week: `W${i}`, rate: Math.round(v) })
  }
  return out
}

/** ให้อัตรามาเรียนรายสัปดาห์สอดคล้องกับจำนวนวันที่ขาดติดกัน
 *
 *  สองค่านี้เคยสุ่มแยกกัน หน้าข้อมูลเด็กจึงขึ้น "ขาดเรียนต่อเนื่อง 16 วัน" คู่กับ
 *  "มาเรียนสัปดาห์นี้ 66%" ซึ่งเป็นไปไม่ได้ ครูเห็นแล้วจะไม่เชื่อตัวเลขอื่นทั้งหน้า
 *  ขาดติดกัน N วันเรียน = N วันล่าสุดขาดทั้งหมด (สัปดาห์ละ 5 วัน) จึงเพดานอัตรา
 *  ของสัปดาห์ที่ถูกครอบไว้ ไม่เรียก rng เพิ่ม ค่าสุ่มอื่นของเด็กจึงไม่เลื่อน */
function capByStreak(points: AttendancePoint[], streak: number): AttendancePoint[] {
  // วันที่ขาดติดกันล่าสุดอยู่ในสัปดาห์นี้เสมอ อัตราของสัปดาห์นี้จึงต้องสะท้อน — เดิมข้าม
  // กรณีขาด 1–2 วัน หน้าเด็กเลยขึ้น "สัปดาห์นี้ 100%" ข้างตารางที่บอกว่าขาดพุธกับพฤหัส
  // (เกณฑ์ปิดเคสใช้ค่าเฉลี่ย 4 สัปดาห์ เด็กที่ป่วย 1–2 วันจึงไม่ตกเกณฑ์เพราะเรื่องนี้)
  let left = streak
  const out = [...points]
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const absent = Math.min(5, left)
    out[i] = { ...out[i], rate: Math.min(out[i].rate, Math.round(((5 - absent) / 5) * 100)) }
    left -= absent
  }
  return out
}

/** คะแนนเสี่ยง 8 สัปดาห์ที่ "ลงเอย" ที่ค่าปัจจุบันพอดี
 *
 *  เดินถอยหลังจาก `now` แล้วกลับลำดับ เพื่อให้จุดสุดท้ายเท่ากับ `riskScore`
 *  เสมอ ถ้าเดินไปข้างหน้าแล้วปล่อยให้สุ่ม จุดสุดท้ายจะไม่ตรงกับเลขที่แสดง
 *  อยู่บนเกจ ซึ่งครูจะจับได้ทันทีว่ากราฟกับตัวเลขไม่ตรงกัน
 *
 *  `drift` เป็นบวก = ช่วงที่ผ่านมาความเสี่ยงไต่ขึ้น (เด็กแย่ลง) */
function riskSeries(rng: () => number, now: number, drift: number): RiskPoint[] {
  const out: RiskPoint[] = [{ week: 'W8', score: now }]
  let v = now
  for (let i = 7; i >= 1; i--) {
    v = Math.max(5, Math.min(100, v - drift + (rng() * 6 - 3)))
    out.unshift({ week: `W${i}`, score: Math.round(v) })
  }
  return out
}

function grades(rng: () => number, base: number): GradePoint[] {
  const terms = ['1/67', '2/67', '1/68', '2/68']
  let v = base
  return terms.map((t) => {
    v = Math.max(0.8, Math.min(4, v - rng() * 0.5))
    return { term: t, gpa: Math.round(v * 100) / 100 }
  })
}


/** ทะเบียนนักเรียนของเด็กคนนี้ ตามรูปร่างจริงของ DMC/สพฐ.
 *
 *  ผูกกับสาเหตุที่เด็กคนนี้มีอยู่แล้ว ไม่ได้สุ่มแยกจากกัน — เด็กที่ระเบียน
 *  ระบุความยากจนต้องมีรายได้ครัวเรือนต่ำจริง และเด็กที่ระบุว่าเดินทางลำบาก
 *  ต้องใช้เวลาเดินทางนานจริง ถ้าสุ่มแยก ทะเบียนกับสาเหตุจะขัดกันเอง และ
 *  หน้า "ทำไมเด็กคนนี้ถึงเสี่ยง" จะอ้างตัวเลขที่สวนทางกับคำอธิบายของตัวเอง */
function buildMaster(rng: () => number, severity: number): StudentMaster {
  // ครัวเรือนยากจนพบมากในกลุ่มที่สถานการณ์หนัก แต่ไม่ผูกตายตัว — ความยากจน
  // ไม่ได้แปลว่าเด็กจะหลุด และเด็กที่หลุดก็ไม่ได้ยากจนทุกคน
  const poor = severity > 0.45
  const farTravel = rng() > 0.78
  const moved = rng() > 0.82
  const guardian = moved
    ? pick(rng, ['ยาย', 'ย่า', 'ตา', 'ปู่', 'ผู้ปกครอง'])
    : pick(rng, GUARDIAN_POOL)

  const salary = poor ? pick(rng, SALARY_POOL.filter((v) => v <= 6000)) : pick(rng, SALARY_POOL)
  const timeDt = farTravel ? pick(rng, [20, 25, 30, 30, 45]) : pick(rng, TIME_POOL)

  const disadvantaged: string[] = []
  if (salary <= 3000) disadvantaged.push('เด็กยากจนพิเศษ')
  else if (salary <= 6000) disadvantaged.push('เด็กยากจน')
  if (!['มารดา', 'บิดา'].includes(guardian)) disadvantaged.push('เด็กที่อยู่ในความดูแลของญาติ')
  if (moved) disadvantaged.push('เด็กที่ย้ายถิ่นตามผู้ปกครอง')

  return {
    academicYear: '2569',
    term: '2',
    // รูปแบบรหัสตามต้นทาง: 10 หลักสำหรับโรงเรียน, 8 หลักสำหรับเขต
    schoolID: `10${randInt(rng, 11000000, 11999999)}`,
    areaID: `${randInt(rng, 11010000, 11039999)}`,
    parentSalary: salary,
    parentRelationName: guardian,
    disadvantaged,
    disabilityName: rng() > 0.98 ? 'บกพร่องทางการเรียนรู้' : '',
    weight: randInt(rng, 18, 62),
    height: randInt(rng, 108, 172),
    rockDt: farTravel ? pick(rng, [200, 300, 500, 700]) : pick(rng, ROCK_POOL),
    rubberDt: pick(rng, RUBBER_POOL),
    waterDt: pick(rng, WATER_POOL),
    timeDt,
    journeyTypeName: farTravel
      ? pick(rng, ['เดินเท้า', 'พาหนะเสียค่าโดยสาร'])
      : pick(rng, JOURNEY_POOL),
    movedFromRegisteredAddress: moved,
  }
}

function buildStudent(idx: number): Student {
  const id = `STD-${String(idx + 1).padStart(4, '0')}`
  const rng = makeRng(hashSeed(`sbp-student-${idx}`))
  const tambon = pick(rng, TAMBON_POOL)
  const kind = DISTRICT_KIND[tambon.districtKey]

  const gender = rng() > 0.5 ? 'male' : 'female'
  const first = pick(rng, gender === 'male' ? MALE_FIRST : FEMALE_FIRST)
  const name = `${first} ${pick(rng, LAST)}`
  const gradeKey = pick(rng, GRADES)

  const severity = rng()
  const hi = severity > 0.5

  // ทะเบียนนักเรียนมาก่อนคะแนน ไม่ใช่ตามหลัง — ในโลกจริงข้อเท็จจริงของ
  // ครัวเรือนมีอยู่ก่อน แล้วความเสี่ยงจึงตามมา เดิมโค้ดทำกลับทาง (สุ่มคะแนน
  // แล้วค่อยแต่งทะเบียนให้เข้ากัน) ซึ่งแปลว่าคะแนนไม่ได้มาจากอะไรเลย
  const master = buildMaster(rng, severity)

  // คำนวณจากทะเบียนจริง — ดู familyRiskFrom / wellbeingRiskFrom / travelPenalty
  const familyRisk = familyRiskFrom(master)
  const wellbeingRisk = wellbeingRiskFrom(master, randInt(rng, 8, hi ? 84 : 52))
  // การเดินทางลำบากโผล่เป็นการขาดเรียน จึงบวกเข้ากับด้านนี้ ไม่ใช่มิติใหม่
  const attendanceRisk = Math.min(
    100,
    randInt(rng, hi ? 58 : 22, hi ? 96 : 68) + travelPenalty(master),
  )
  const academicRisk = randInt(rng, hi ? 48 : 15, hi ? 95 : 66)
  const behaviorRisk = randInt(rng, 10, hi ? 86 : 58)
  // ติดต่อผู้ปกครองยากขึ้นเมื่อคนดูแลไม่ใช่พ่อแม่ หรือพ่อแม่ย้ายถิ่นไปทำงาน
  const parentRisk = Math.min(
    100,
    randInt(rng, 12, hi ? 90 : 60) + (master.movedFromRegisteredAddress ? 14 : 0),
  )

  const riskScore = computeRiskScore({
    attendanceRisk, academicRisk, behaviorRisk, familyRisk, wellbeingRisk, parentRisk,
  })
  const level = riskLevel(riskScore)

  // Cause draw, biased by where the child lives
  const weighted: CauseKey[] = [...CAUSE_POOL]
  weighted.push('poverty', 'absence', 'dualSchooling')
  // สาเหตุที่ถูกบันทึกควรสะท้อนทะเบียน ไม่ใช่สุ่มขนานกันไป เด็กที่รายได้
  // ครัวเรือน 3,000 บาทควรมีโอกาสถูกบันทึกว่า "ยากจน" มากกว่าเด็กที่ 20,000
  if (master.parentSalary <= 5000) weighted.push('poverty', 'poverty', 'childLabour')
  if (master.timeDt >= 20) weighted.push('travel', 'travel')
  if (master.movedFromRegisteredAddress) weighted.push('migration', 'migration')
  if (master.disabilityName) weighted.push('health')
  if (kind === 'border') weighted.push('migration', 'noDocuments', 'childLabour')
  if (kind === 'remote') weighted.push('travel', 'noDevice')
  if (kind === 'coastal') weighted.push('childLabour')
  if (kind === 'urban') weighted.push('grades', 'transition')
  const causeKeys = Array.from(
    new Set(Array.from({ length: randInt(rng, 3, 5) }, () => pick(rng, weighted))),
  )

  // A child belongs to one of the 46 real pilot schools, not a synthetic
  // `district-school-n` key: the school director, the teacher and the school
  // performance page all join on this, so it has to be the same namespace.
  const inDistrict = SCHOOLS.filter((sc) => sc.districtKey === tambon.districtKey)
  const inProvince = SCHOOLS.filter((sc) => sc.provinceKey === tambon.provinceKey)
  const school = inDistrict.length
    ? pick(rng, inDistrict)
    : inProvince.length
      ? pick(rng, inProvince)
      : SCHOOLS[0]
  const stage = pick(rng, STAGES)
  // Guidance staff carry the escalated cases; homeroom teachers and community
  // volunteers keep the watchlist. Drawing every owner at random left the
  // guidance account holding only watch-level children, so its dashboard
  // reported zero high-risk students for a school that has plenty.
  const owner =
    level === 'high' || level === 'critical'
      ? GUIDANCE_OWNER
      : OWNERS[hashSeed(school.id + '|' + randInt(rng, 0, 2)) % OWNERS.length]
  /** เด็กที่มีแผนช่วยเหลือแล้วหรือกลับเข้าเรียนแล้ว คือกลุ่มที่สถานการณ์
   *  กำลังดีขึ้น เดิมชุดข้อมูลไม่มีเด็กกลุ่มนี้เลย — `absenceStreak` คำนวณ
   *  จาก attendanceRisk ซึ่งต่ำสุดคือ 22 จึงไม่มีเด็กคนไหนเลิกขาดเรียนได้
   *  และคะแนนเสี่ยงก็มีแต่ขาขึ้น ผลคือปลายทางของระบบ ("ช่วยแล้วดีขึ้นจน
   *  ปิดเคสได้") พิสูจน์ไม่ได้เลยทั้งที่เป็นเป้าหมายของทั้งแพลตฟอร์ม */
  //
  // โอกาส "ดีขึ้น" ไล่ตามขั้นที่ได้รับการช่วยเหลือจริง ไม่ใช่ประตูเปิด/ปิด
  // รุ่นแรกให้ดีขึ้นได้เฉพาะขั้น planned ขึ้นไป เด็กที่กำลังได้รับการช่วยเหลือ
  // อยู่ (inProgress, referred) จึงไม่มีทางดีขึ้นเลย ซึ่งไม่ตรงกับความจริง
  // และเมื่อเคสโหลดของบัญชีเดโมบังเอิญไม่มีเด็กขั้น planned สักคน ขั้น
  // "เห็นผล → ปิดเคส" ก็ไม่มีวันเกิดบนหน้าครูเลย
  //
  // สุ่มจาก stream แยกของตัวเอง ไม่ดึงจาก rng หลัก เพื่อไม่ให้ทุกค่าที่สุ่ม
  // หลังจากบรรทัดนี้เลื่อนไปหมดทั้งชุดข้อมูล
  const recRng = makeRng(hashSeed(`sbp-recover-${idx}`))
  const recovering = recRng() < RECOVERY_CHANCE[stage]

  // เด็กที่กลับมาเรียนสม่ำเสมอแล้ว คะแนนด้านการมาเรียนต้องสะท้อนสภาพปัจจุบัน
  // ไม่ใช่สภาพตอนที่ถูกแจ้งเตือน เดิมเด็กที่มาเรียน 100% ขาดแค่วันเดียวยังได้
  // คะแนนรวม 79–82 เพราะคะแนนด้านการมาเรียนคำนวณไว้ก่อนรู้ว่าเด็กดีขึ้น
  // ผลคือไม่มีเด็กคนไหนลงต่ำกว่า 70 ได้ และเกณฑ์ปิดเคสไม่มีวันผ่าน
  //
  // ผู้รับผิดชอบเคส (owner) ยังใช้ระดับตอนแจ้งเตือน เพราะคนที่รับเคสตอน
  // วิกฤตก็ยังเป็นเจ้าของเคสตอนที่เด็กดีขึ้น ไม่ได้โยกไปคนอื่น
  const attendanceRiskNow = recovering
    ? Math.min(attendanceRisk, Math.round(12 + recRng() * 22))
    : attendanceRisk
  const riskScoreNow = computeRiskScore({
    attendanceRisk: attendanceRiskNow, academicRisk, behaviorRisk, familyRisk, wellbeingRisk, parentRisk,
  })
  const levelNow = riskLevel(riskScoreNow)
  const absenceStreak = recovering
    ? randInt(rng, 0, 2)
    : Math.round((attendanceRisk / 100) * 16)

  const status: ChildStatus =
    stage === 'returned' || stage === 'resolved'
      ? 'returned'
      : stage === 'planned' || stage === 'referred'
        ? 'reengaging'
        : levelNow === 'normal'
          ? 'inSchool'
          : 'atRisk'

  const timeline: InterventionEvent[] = [
    { date: '2026-06-15', stageKey: 'alerted', note: 'ระบบตรวจพบการขาดเรียนต่อเนื่องเกินเกณฑ์', by: 'ระบบเฝ้าระวัง' },
    { date: '2026-06-18', stageKey: 'accepted', note: 'ครูประจำชั้นรับเคสและเริ่มติดตาม', by: owner },
    { date: '2026-06-24', stageKey: 'inProgress', note: 'ติดต่อผู้ปกครอง / ประสานผู้นำชุมชนในพื้นที่', by: owner },
  ]
  if (['homeVisit', 'referred', 'planned', 'returned', 'resolved'].includes(stage)) {
    timeline.push({
      date: '2026-06-30',
      stageKey: 'homeVisit',
      note: 'ลงเยี่ยมบ้านร่วมกับ อบต. และผู้นำศาสนา พบภาระค่าใช้จ่ายและการเดินทาง',
      by: owner,
    })
  }
  if (['referred', 'planned', 'returned', 'resolved'].includes(stage)) {
    timeline.push({
      date: '2026-07-04',
      stageKey: 'referred',
      note: 'ส่งต่อ พมจ. เพื่อขอเงินสงเคราะห์เด็กในครอบครัวยากจน',
      by: owner,
    })
  }
  if (['planned', 'returned', 'resolved'].includes(stage)) {
    timeline.push({
      date: '2026-07-09',
      stageKey: 'planned',
      note: 'ทีมสหวิชาชีพระดับอำเภอเห็นชอบแผนโอกาสรายบุคคล',
      by: 'ศปก.อำเภอ',
    })
  }
  if (['returned', 'resolved'].includes(stage)) {
    timeline.push({
      date: '2026-07-16',
      stageKey: 'returned',
      note: 'กลับเข้าสู่การเรียนรู้ตามเส้นทางที่วางไว้',
      by: owner,
    })
  }

  const parentContact = parentRisk > 76 ? 'unreachable' : parentRisk > 46 ? 'delayed' : 'ok'
  const consent: ConsentStatus =
    rng() > 0.88 ? 'declined' : rng() > 0.72 ? 'pending' : 'granted'
  const hasPlan = ['planned', 'referred', 'returned', 'resolved'].includes(stage)

  return {
    id,
    name,
    gradeKey,
    schoolKey: school.id,
    provinceKey: tambon.provinceKey,
    districtKey: tambon.districtKey,
    tambonKey: tambon.key,
    gender,
    status,
    riskScore: riskScoreNow,
    riskLevel: levelNow,
    vulnerableGroup: familyRisk > 58 || rng() > 0.66,
    causeKeys,
    attendanceRisk: attendanceRiskNow, academicRisk, behaviorRisk, familyRisk, wellbeingRisk, parentRisk,
    attendance: capByStreak(
      attendance(
        rng,
        recovering ? Math.max(78, 100 - attendanceRiskNow * 0.5) : 100 - attendanceRisk * 0.5,
        recovering ? 3 : -1,
      ),
      absenceStreak,
    ),
    // ขาขึ้น = แย่ลง เด็กที่ยังไม่ได้รับการช่วยเหลือจึงไต่ขึ้น ส่วนเด็กที่
    // มีแผนแล้วเดินลง ซึ่งเป็นภาพของ "ช่วยแล้วได้ผล"
    riskHistory: riskSeries(rng, riskScoreNow, recovering ? -randInt(rng, 3, 7) : randInt(rng, 0, 4)),
    master,
    grades: grades(rng, 3.6 - academicRisk / 45),
    parentContact,
    homeVisited: ['homeVisit', 'referred', 'planned', 'returned', 'resolved'].includes(stage),
    guidanceNote:
      levelNow === 'critical'
        ? 'พบสัญญาณความเครียดสูงและภาระทางบ้าน ควรประสานนักจิตวิทยาและ พมจ. โดยเร็ว'
        : 'อยู่ระหว่างติดตามการมาเรียนร่วมกับผู้นำชุมชนและครูตาดีกา',
    caseOwner: owner,
    caseStage: stage,
    nextAction:
      levelNow === 'critical'
        ? 'เยี่ยมบ้านร่วมทีมสหวิชาชีพภายใน 48 ชั่วโมง'
        : levelNow === 'high'
          ? 'ประสานผู้ปกครองผ่านผู้นำชุมชน และนัดพบครูแนะแนว'
          : 'เฝ้าติดตามการมาเรียนรายสัปดาห์',
    timeline,
    absenceStreak,
    planId: hasPlan ? `PLAN-${id}` : null,
    consent,
  }
}

// ~20 tracked children per pilot school: a school director and a case owner
// need enough rows for their own screens to look like real work, and every
// downstream set (cases, plans, referrals) is derived from this one.
export const STUDENTS: Student[] = Array.from({ length: 900 }, (_, i) =>
  buildStudent(i),
).sort((a, b) => b.riskScore - a.riskScore)

export const STUDENT_BY_ID: Record<string, Student> = Object.fromEntries(
  STUDENTS.map((s) => [s.id, s]),
)
