// ─────────────────────────────────────────────────────────────
// Domain types — Southern Zero Dropout Platform
// "มองเห็นทุกคน ออกแบบโอกาสเฉพาะบุคคล"
//
// The model covers a child's whole journey: first risk signal → case work →
// cross-agency referral → an individual opportunity plan → a durable outcome
// (back in learning, or in decent work). It is deliberately wider than a
// school-only EWS because the จชต. response is run by จังหวัด / อำเภอ / ตำบล /
// โรงเรียน / หน่วยงานสังคม / ภาคประชาสังคม together.
// ─────────────────────────────────────────────────────────────

export type Region =
  | 'central'
  | 'north'
  | 'northeast'
  | 'east'
  | 'west'
  | 'south'

/** Terrain/settlement character of a district — drives outreach difficulty */
export type AreaKind = 'urban' | 'rural' | 'coastal' | 'remote' | 'border'

export type RiskLevel = 'normal' | 'watch' | 'high' | 'critical'

export type Gender = 'male' | 'female'

/** Grade band used for filtering / transition-risk analysis */
export type GradeLevel =
  | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6'
  | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6'

/** Canonical cause keys — labels live in the i18n dictionary */
export type CauseKey =
  | 'absence'
  | 'grades'
  | 'failing'
  | 'noExam'
  | 'poverty'
  | 'migration'
  | 'family'
  | 'health'
  | 'travel'
  | 'noContact'
  | 'noDevice'
  | 'transition'
  // จชต.-specific drivers
  | 'earlyMarriage'
  | 'childLabour'
  | 'dualSchooling'
  | 'unrestAffected'
  | 'noDocuments'
  | 'stateless'

export interface CauseWeight {
  key: CauseKey
  /** share 0–100 */
  value: number
}

// ── Where a child currently stands ───────────────────────────
/** The single status every child in the platform carries. */
export type ChildStatus =
  | 'inSchool' // ปกติ อยู่ในระบบ
  | 'atRisk' // อยู่ในระบบแต่มีสัญญาณเสี่ยง
  | 'outOfSchool' // หลุดจากระบบแล้ว
  | 'reengaging' // อยู่ระหว่างดึงกลับ / มีแผนแล้ว
  | 'returned' // กลับเข้าสู่การเรียนรู้แล้ว
  | 'working' // มีอาชีพ/รายได้มั่นคง (ปลายทางที่ยอมรับได้)
  | 'unreachable' // ติดตามไม่พบ

/** Learning or livelihood destinations a plan can aim at. */
export type Pathway =
  | 'formalReturn' // กลับเข้าโรงเรียนเดิม/ใหม่ (สพฐ.)
  | 'nfe' // กศน. / สกร. — การศึกษานอกระบบ
  | 'vocational' // อาชีวศึกษา (ปวช./ปวส.)
  | 'islamicSchool' // โรงเรียนเอกชนสอนศาสนาอิสลาม / ตาดีกา / ปอเนาะ
  | 'apprentice' // ฝึกอาชีพ / ทวิภาคี
  | 'employment' // จ้างงาน / ประกอบอาชีพ
  | 'specialNeeds' // การศึกษาพิเศษ / เรียนร่วม
  | 'undecided'

// ── Who is involved ──────────────────────────────────────────
export type AgencyKind =
  | 'education' // สพป./สพม., สกร., อาชีวศึกษา
  | 'social' // พมจ. / บ้านพักเด็กและครอบครัว
  | 'health' // สสจ. / รพ.สต. / นักจิตวิทยา
  | 'localGov' // อบต. / เทศบาล / อบจ.
  | 'civil' // มูลนิธิ / NGO / ภาคประชาสังคม
  | 'religious' // ผู้นำศาสนา / มัสยิด / ตาดีกา
  | 'labour' // แรงงานจังหวัด / พัฒนาฝีมือแรงงาน
  | 'admin' // ศอ.บต. / ปกครองจังหวัด-อำเภอ

export interface Agency {
  id: string
  kind: AgencyKind
  th: string
  en: string
  provinceKey: string
  districtKey?: string
  /** services this agency can be referred for (i18n keys) */
  services: string[]
  contact: string
  /** median hours from referral received → accepted */
  avgAcceptHours: number
  openReferrals: number
  completionRate: number // %
}

export type ReferralStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'inProgress'
  | 'completed'
  | 'rejected'
  | 'overdue'

export type ReferralNeed =
  | 'financial' // ทุน/เงินสงเคราะห์
  | 'mentalHealth' // สุขภาพจิต
  | 'physicalHealth'
  | 'protection' // คุ้มครองเด็ก/ความรุนแรง
  | 'housing'
  | 'transport'
  | 'documents' // สถานะบุคคล/เอกสาร
  | 'skills' // ฝึกอาชีพ
  | 'jobPlacement'
  | 'childcare' // ภาระเลี้ยงดูน้อง/บุตร

export interface Referral {
  id: string
  childId: string
  childName: string
  provinceKey: string
  districtKey: string
  tambonKey: string
  need: ReferralNeed
  fromAgencyId: string
  toAgencyId: string
  status: ReferralStatus
  openedDaysAgo: number
  /** service-level agreement in days for this need */
  slaDays: number
  urgent: boolean
  note: string
  /** consent must exist before personal data crosses agencies (PDPA) */
  consent: ConsentStatus
}

export type ConsentStatus = 'granted' | 'pending' | 'declined'

/** Multi-agency case conference (ประชุมทีมสหวิชาชีพ) */
export interface CaseConference {
  id: string
  childId: string
  childName: string
  districtKey: string
  date: string
  chair: string
  attendeeAgencyIds: string[]
  decisions: string[]
  nextReviewDays: number
}

// ── The individual plan ──────────────────────────────────────
export type PlanStepStatus = 'pending' | 'active' | 'done' | 'blocked'

export interface PlanStep {
  id: string
  /** i18n key for the step template, e.g. 'plan.step.homeVisit' */
  titleTh: string
  titleEn: string
  ownerAgencyId: string
  ownerName: string
  dueInDays: number
  status: PlanStepStatus
}

export interface OpportunityPlan {
  id: string
  childId: string
  childName: string
  pathway: Pathway
  /** why this pathway — plain-language rationale shown to the committee */
  rationaleTh: string
  rationaleEn: string
  /** blockers that must be cleared before the pathway is viable */
  barriers: ReferralNeed[]
  steps: PlanStep[]
  /** 0–100 completion of the plan */
  progress: number
  targetMonth: string // e.g. '2026-11'
  reviewedDaysAgo: number
  /** the child + guardian agreed to this plan */
  agreedByFamily: boolean
  ownerAgencyId: string
}

// ── Out-of-school children registry ──────────────────────────
export type OoscSource =
  | 'schoolReport' // โรงเรียนแจ้งหลุด
  | 'tambonSurvey' // สำรวจโดย อบต./เทศบาล
  | 'civilSurvey' // ภาคประชาสังคมลงพื้นที่
  | 'religiousLeader' // ผู้นำศาสนา/อิหม่าม
  | 'healthRecord' // จับคู่ทะเบียนสาธารณสุข
  | 'civilRegistry' // จับคู่ทะเบียนราษฎร (มีชื่อ ไม่มีที่เรียน)
  | 'hotline' // สายด่วน/ผู้ปกครองแจ้ง

export interface OoscRecord {
  id: string
  name: string
  ageYears: number
  gender: Gender
  provinceKey: string
  districtKey: string
  tambonKey: string
  /** last grade completed before leaving */
  lastGradeKey: GradeLevel
  yearsOut: number
  source: OoscSource
  /** verified by a home visit? */
  verified: boolean
  status: ChildStatus
  causeKeys: CauseKey[]
  /** null until a plan is opened */
  planId: string | null
  /** who is currently accountable */
  ownerName: string | null
  ownerAgencyId: string | null
  consent: ConsentStatus
  /** confidence that the record is a genuine, still-out-of-school child */
  matchConfidence: number // 0–100
  note: string
}

// ── Existing in-school entities (extended) ───────────────────
export interface Province {
  id: string // e.g. "TH-94"
  key: string
  region: Region
  x: number
  y: number
  partial: boolean
  totalStudents: number
  normalStudents: number
  watchlistStudents: number
  highRiskStudents: number
  dropoutStudents: number
  returnedStudents: number
  /** children out of school and not yet re-engaged */
  oosCount: number
  /** children with an active plan, on the way back */
  reengagedCount: number
  /** children who reached a durable outcome (learning or work) */
  outcomeCount: number
  /** % of students at high-risk or above */
  riskRate: number
  topCauses: CauseWeight[]
  openCases: number
  overdueCases: number
  unassignedCases: number
  openReferrals: number
  interventionSuccessRate: number // %
  dataQualityScore: number // 0–100
  schools: number
  districts: number
  tambons: number
  /** 6-month risk-rate trend (oldest → newest) */
  trend: number[]
}

export interface District {
  key: string
  provinceKey: string
  kind: AreaKind
  lon: number
  lat: number
  totalStudents: number
  highRiskStudents: number
  oosCount: number
  /** children with an active plan (in progress or finished) */
  reengagedCount: number
  /** children who actually reached a durable destination */
  outcomeCount: number
  openCases: number
  overdueCases: number
  openReferrals: number
  schools: number
  tambons: number
  riskRate: number
  /** % of known OOS children who now have an active plan */
  planCoverage: number
  interventionSuccessRate: number
  topCauses: CauseWeight[]
  /** has a functioning multi-agency district team (ศปก.อำเภอ) */
  hasDistrictTeam: boolean
}

export interface Tambon {
  key: string
  districtKey: string
  provinceKey: string
  totalStudents: number
  highRiskStudents: number
  oosCount: number
  reengagedCount: number
  outcomeCount: number
  planCoverage: number
  schools: number
  /** community volunteers / อสม. / ผู้นำที่ร่วมเฝ้าระวัง */
  volunteers: number
  /** last active outreach sweep */
  lastSurveyDaysAgo: number
  riskRate: number
  hasChildProtectionCommittee: boolean
}

export interface School {
  id: string
  name: string // Thai display name
  nameEn?: string // romanised, used for en/ms
  provinceKey: string
  districtKey: string
  tambonKey: string
  /** สพม. the school reports to */
  sesao?: string
  /** map pin position — see data/schools.ts for how it is derived */
  lon: number
  lat: number
  /** สพฐ. / เอกชนสอนศาสนา / สกร. / อาชีวะ */
  sector: 'obec' | 'islamicPrivate' | 'nfe' | 'vocational'
  totalStudents: number
  highRiskStudents: number
  openCases: number
  overdueCases: number
  dataQualityScore: number
  interventionSuccessRate: number
  responseHours: number // avg time to first response
  riskReduction: number // % reduction over quarter
  needsResources: boolean
}

export interface AttendancePoint {
  week: string
  rate: number // 0–100
}

/** คะแนนเสี่ยงของเด็กคนหนึ่ง ณ สัปดาห์หนึ่ง
 *
 *  เดิมระบบเก็บคะแนนเสี่ยงเป็นค่าล่าสุดค่าเดียว จึงตอบไม่ได้ว่า "เด็กคนไหน
 *  เสี่ยงเพิ่มขึ้น" และ "ที่ช่วยไปแล้วดีขึ้นหรือยัง" ซึ่งเป็น 2 ใน 8 คำถาม
 *  ที่ระบบต้องตอบให้ครู จุดสุดท้ายของ series เท่ากับ `riskScore` เสมอ */
export interface RiskPoint {
  week: string
  score: number // 0–100
}

/** ทะเบียนนักเรียนตามรูปร่างจริงที่ ผอ. ส่งตัวอย่างมา (DMC/สพฐ. · ปี 2569)
 *
 *  คะแนนเสี่ยงหกด้านใน `RiskInputs` เป็นตัวเลขที่โปรเจกต์ตั้งขึ้นเอง ไม่มีที่มา
 *  ว่าคำนวณจากอะไร ฟิลด์ชุดนี้คือ *วัตถุดิบ* ที่ระบบจริงจะได้รับ และเป็นสิ่งที่
 *  โมเดลทำนายต้องกินเข้าไป ไม่ใช่คะแนนสำเร็จรูป การเก็บไว้ที่นี่ทำให้
 *  "ทำไมเด็กคนนี้ถึงเสี่ยง" ตอบด้วยข้อเท็จจริงที่ย้อนไปที่ทะเบียนได้
 *
 *  ชื่อฟิลด์คงตามต้นทางโดยตั้งใจ จะได้แมปกับข้อมูลจริงโดยไม่ต้องแปลชื่อ */
export interface StudentMaster {
  /** ปีการศึกษา พ.ศ. เช่น '2569' */
  academicYear: string
  term: string
  schoolID: string
  areaID: string
  /** รายได้ต่อเดือนของผู้ปกครอง (บาท) — ตัวทำนายที่แรงที่สุดตัวหนึ่ง */
  parentSalary: number
  /** ความสัมพันธ์ของผู้ปกครองกับเด็ก เช่น มารดา · ยาย · ผู้ปกครอง
   *  เด็กที่อยู่กับปู่ย่าตายายมักมาพร้อมพ่อแม่ที่ย้ายถิ่นไปทำงาน */
  parentRelationName: string
  /** กลุ่มด้อยโอกาสตามนิยาม สพฐ. เช่น 'เด็กยากจน' */
  disadvantaged: string[]
  /** ความพิการตามนิยาม สพฐ. ว่างคือไม่มี */
  disabilityName: string
  weight: number
  height: number
  /** ระยะทางจากบ้านถึงโรงเรียน แยกตามสภาพเส้นทาง (เมตร) */
  rockDt: number
  rubberDt: number
  waterDt: number
  /** เวลาเดินทางถึงโรงเรียน (นาที) */
  timeDt: number
  /** เช่น เดินเท้า · พาหนะไม่เสียค่าโดยสาร · พาหนะเสียค่าโดยสาร */
  journeyTypeName: string
  /** ที่อยู่ตามทะเบียนบ้านต่างจากที่อยู่ปัจจุบัน = สัญญาณการย้ายถิ่น */
  movedFromRegisteredAddress: boolean
}

export interface GradePoint {
  term: string
  gpa: number // 0–4
}

export type CaseStage =
  | 'alerted'
  | 'accepted'
  | 'inProgress'
  | 'homeVisit'
  | 'referred'
  | 'planned'
  | 'returned'
  | 'resolved'

export interface InterventionEvent {
  date: string
  stageKey: CaseStage
  note: string // Thai note
  by: string
}

export interface Student {
  id: string
  name: string
  gradeKey: GradeLevel
  schoolKey: string
  provinceKey: string
  districtKey: string
  tambonKey: string
  gender: Gender
  status: ChildStatus
  riskScore: number // 0–100
  riskLevel: RiskLevel
  vulnerableGroup: boolean
  causeKeys: CauseKey[]
  // Risk sub-scores (each 0–100), weighted per the risk model
  attendanceRisk: number
  academicRisk: number
  behaviorRisk: number
  familyRisk: number
  wellbeingRisk: number
  parentRisk: number
  attendance: AttendancePoint[]
  /** 8 สัปดาห์ย้อนหลัง จุดสุดท้ายคือ `riskScore` */
  riskHistory: RiskPoint[]
  grades: GradePoint[]
  /** ทะเบียนนักเรียนตามโครงสร้างจริงของ DMC/สพฐ. — ดู `StudentMaster` */
  master: StudentMaster
  parentContact: 'ok' | 'delayed' | 'unreachable'
  homeVisited: boolean
  guidanceNote: string
  caseOwner: string
  caseStage: CaseStage
  nextAction: string
  timeline: InterventionEvent[]
  /** absolute absence streak in days */
  absenceStreak: number
  /** set once an opportunity plan exists */
  planId: string | null
  consent: ConsentStatus
}

export interface CaseRecord {
  id: string
  studentName: string
  provinceKey: string
  districtKey: string
  tambonKey: string
  schoolKey: string
  gradeKey: GradeLevel
  riskLevel: RiskLevel
  stage: CaseStage
  owner: string | null
  openedDaysAgo: number
  slaBreached: boolean
  urgent: boolean
  /** cross-agency referrals attached to this case */
  referralCount: number
}

export interface KpiDatum {
  key: string
  value: number
  deltaPct: number // vs last month
  /** which direction is "good" — used to color the delta */
  goodDirection: 'up' | 'down'
  level?: RiskLevel
}
