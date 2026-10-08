import type {
  AttendancePoint,
  CaseStage,
  CauseKey,
  ChildStatus,
  ConsentStatus,
  GradeLevel,
  GradePoint,
  InterventionEvent,
  Student,
} from '@/types'
import { computeRiskScore, riskLevel } from '@/lib/risk'
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

const OWNERS = [
  'ครูฟาตีฮะห์ ม.', 'ครูอับดุลรอฮิม ส.', GUIDANCE_OWNER, 'ครูประจำชั้น อารีนา',
  'นักจิตวิทยา สุไรยา', 'นักสังคมสงเคราะห์ ซัลมา', 'ครูสมชาย ท.', 'อสม. ยาวารี',
]

const GRADES: GradeLevel[] = ['p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5']

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

function attendance(rng: () => number, base: number): AttendancePoint[] {
  const out: AttendancePoint[] = []
  let v = base
  for (let i = 1; i <= 8; i++) {
    v = Math.max(30, Math.min(100, v + (rng() * 14 - 8)))
    out.push({ week: `W${i}`, rate: Math.round(v) })
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
  const attendanceRisk = randInt(rng, hi ? 58 : 22, hi ? 98 : 70)
  const academicRisk = randInt(rng, hi ? 48 : 15, hi ? 95 : 66)
  const behaviorRisk = randInt(rng, 10, hi ? 86 : 58)
  const familyRisk = randInt(rng, hi ? 45 : 12, hi ? 96 : 62)
  const wellbeingRisk = randInt(rng, 8, hi ? 88 : 55)
  const parentRisk = randInt(rng, 12, hi ? 94 : 62)

  const riskScore = computeRiskScore({
    attendanceRisk, academicRisk, behaviorRisk, familyRisk, wellbeingRisk, parentRisk,
  })
  const level = riskLevel(riskScore)

  // Cause draw, biased by where the child lives
  const weighted: CauseKey[] = [...CAUSE_POOL]
  weighted.push('poverty', 'absence', 'dualSchooling')
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
  const absenceStreak = Math.round((attendanceRisk / 100) * 16)

  const status: ChildStatus =
    stage === 'returned' || stage === 'resolved'
      ? 'returned'
      : stage === 'planned' || stage === 'referred'
        ? 'reengaging'
        : level === 'normal'
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
    riskScore,
    riskLevel: level,
    vulnerableGroup: familyRisk > 58 || rng() > 0.66,
    causeKeys,
    attendanceRisk, academicRisk, behaviorRisk, familyRisk, wellbeingRisk, parentRisk,
    attendance: attendance(rng, 100 - attendanceRisk * 0.5),
    grades: grades(rng, 3.6 - academicRisk / 45),
    parentContact,
    homeVisited: ['homeVisit', 'referred', 'planned', 'returned', 'resolved'].includes(stage),
    guidanceNote:
      level === 'critical'
        ? 'พบสัญญาณความเครียดสูงและภาระทางบ้าน ควรประสานนักจิตวิทยาและ พมจ. โดยเร็ว'
        : 'อยู่ระหว่างติดตามการมาเรียนร่วมกับผู้นำชุมชนและครูตาดีกา',
    caseOwner: owner,
    caseStage: stage,
    nextAction:
      level === 'critical'
        ? 'เยี่ยมบ้านร่วมทีมสหวิชาชีพภายใน 48 ชั่วโมง'
        : level === 'high'
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
