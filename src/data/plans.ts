// ─────────────────────────────────────────────────────────────
// แผนโอกาสรายบุคคล — Individual Opportunity Plans.
//
// "ออกแบบโอกาสเฉพาะบุคคล" is the operative half of the platform's promise:
// a 17-year-old who has been out three years and supports a family does not
// need the same thing as a 12-year-old who stopped coming after Ramadan.
// A plan picks ONE destination pathway, names the barriers that must be
// cleared first, and assigns every step to a *named agency* with a due date.
// ─────────────────────────────────────────────────────────────
import type {
  OpportunityPlan,
  Pathway,
  PlanStep,
  PlanStepStatus,
  ReferralNeed,
} from '@/types'
import { hashSeed, makeRng, pick, randInt } from '@/lib/format'
import { STUDENTS } from './students'
import { OOSC } from './oosc'
import { routeAgency, AGENCIES } from './agencies'

interface Candidate {
  childId: string
  childName: string
  provinceKey: string
  age: number
  yearsOut: number
  causeKeys: string[]
  fromRegistry: boolean
}

const CANDIDATES: Candidate[] = [
  ...STUDENTS.filter((s) => s.planId).map((s) => ({
    childId: s.id,
    childName: s.name,
    provinceKey: s.provinceKey,
    age: 12 + Number(s.gradeKey.replace(/\D/g, '')) - (s.gradeKey[0] === 'p' ? 6 : 0),
    yearsOut: 0,
    causeKeys: s.causeKeys as string[],
    fromRegistry: false,
  })),
  ...OOSC.filter((r) => r.planId).map((r) => ({
    childId: r.id,
    childName: r.name,
    provinceKey: r.provinceKey,
    age: r.ageYears,
    yearsOut: r.yearsOut,
    causeKeys: r.causeKeys as string[],
    fromRegistry: true,
  })),
]

/** Pathway choice is rule-based, so the demo can defend every recommendation. */
function choosePathway(c: Candidate, rng: () => number): Pathway {
  const has = (k: string) => c.causeKeys.includes(k)

  if (has('health') && rng() > 0.55) return 'specialNeeds'
  if (c.age >= 17) return rng() > 0.4 ? 'employment' : 'apprentice'
  if (c.age >= 15 && (has('childLabour') || has('poverty'))) {
    return rng() > 0.45 ? 'vocational' : 'apprentice'
  }
  if (c.yearsOut >= 2.5) return rng() > 0.35 ? 'nfe' : 'vocational'
  if (has('dualSchooling') && rng() > 0.5) return 'islamicSchool'
  if (has('earlyMarriage')) return 'nfe'
  if (c.yearsOut > 0) return rng() > 0.5 ? 'nfe' : 'formalReturn'
  return 'formalReturn'
}

const RATIONALE: Record<Pathway, { th: string; en: string }> = {
  formalReturn: {
    th: 'อายุยังอยู่ในเกณฑ์การศึกษาภาคบังคับและออกจากระบบไม่นาน โอกาสกลับเข้าโรงเรียนเดิมสูงที่สุดหากเคลียร์อุปสรรคด้านค่าใช้จ่ายและการเดินทาง',
    en: 'Still within compulsory-education age and only recently out — return to formal school is the highest-probability route once cost and transport barriers are cleared.',
  },
  nfe: {
    th: 'ออกจากระบบมานานและมีภาระทางบ้าน การเรียนแบบยืดหยุ่นกับ สกร. ให้วุฒิเทียบเท่าโดยไม่ต้องเข้าชั้นเรียนเต็มเวลา',
    en: 'Long out of school with household duties — flexible NFE study gives an equivalent qualification without full-time attendance.',
  },
  vocational: {
    th: 'มีความสนใจสายอาชีพชัดเจนและต้องการรายได้ระหว่างเรียน หลักสูตร ปวช. พร้อมทุนเรียนฟรีตอบโจทย์ทั้งวุฒิและรายได้',
    en: 'Clear vocational interest and a need to earn while studying — a Voc-Cert track with a fee waiver answers both.',
  },
  islamicSchool: {
    th: 'ผูกพันกับการเรียนศาสนาอยู่แล้ว การเรียนควบสายสามัญในโรงเรียนเอกชนสอนศาสนาช่วยให้ไม่ต้องเลือกอย่างใดอย่างหนึ่ง',
    en: 'Already committed to religious study — a dual-track Islamic private school removes the either/or choice.',
  },
  apprentice: {
    th: 'พร้อมทำงานแต่ยังขาดทักษะที่ตลาดต้องการ ฝึกอาชีพระบบทวิภาคีให้ทั้งรายได้ระหว่างฝึกและใบรับรองทักษะ',
    en: 'Ready to work but short on marketable skills — a dual-system apprenticeship pays during training and certifies at the end.',
  },
  employment: {
    th: 'อายุเกินเกณฑ์การศึกษาภาคบังคับและเป็นกำลังหลักของครอบครัว เป้าหมายคืองานที่มั่นคงพร้อมช่องทางเรียนต่อภายหลัง',
    en: 'Past compulsory-education age and a primary earner — the goal is stable work with a study route kept open for later.',
  },
  specialNeeds: {
    th: 'มีข้อจำกัดด้านสุขภาพ/การเรียนรู้ที่ต้องประเมินเฉพาะทางก่อนกำหนดรูปแบบการเรียนที่เหมาะสม',
    en: 'Health or learning constraints require a specialist assessment before the right learning format can be set.',
  },
  undecided: {
    th: 'อยู่ระหว่างประเมินความพร้อมและความต้องการของเด็กและครอบครัว',
    en: 'Assessment of the child and family situation is still in progress.',
  },
}

const CAUSE_TO_NEED: Record<string, ReferralNeed> = {
  poverty: 'financial',
  migration: 'documents',
  family: 'protection',
  health: 'physicalHealth',
  travel: 'transport',
  noDevice: 'financial',
  earlyMarriage: 'childcare',
  childLabour: 'skills',
  noDocuments: 'documents',
  stateless: 'documents',
  unrestAffected: 'mentalHealth',
  dualSchooling: 'skills',
}

interface StepTpl {
  th: string
  en: string
  need: ReferralNeed | null
}

const STEPS_BY_PATHWAY: Record<Pathway, StepTpl[]> = {
  formalReturn: [
    { th: 'เยี่ยมบ้านและยืนยันความสมัครใจของเด็กและผู้ปกครอง', en: 'Home visit; confirm child & guardian consent', need: null },
    { th: 'ประสานโรงเรียนต้นสังกัดเพื่อคืนสิทธิ์และจัดชั้นเรียน', en: 'Coordinate re-enrolment and class placement', need: null },
    { th: 'ขอทุนปัจจัยพื้นฐาน / ค่าเดินทางรายเดือน', en: 'Secure basic-needs grant / monthly travel allowance', need: 'financial' },
    { th: 'จัดสอนเสริมเพื่อลดช่องว่างการเรียนรู้ 8 สัปดาห์', en: 'Eight-week catch-up tutoring', need: null },
    { th: 'ติดตามการมาเรียนรายสัปดาห์เป็นเวลา 1 ภาคเรียน', en: 'Weekly attendance follow-up for one term', need: null },
  ],
  nfe: [
    { th: 'ประเมินระดับความรู้เดิมเพื่อเทียบโอน', en: 'Assess prior learning for credit transfer', need: null },
    { th: 'ลงทะเบียนเรียนกับ สกร. อำเภอ รูปแบบยืดหยุ่น', en: 'Enrol in flexible NFE at district level', need: null },
    { th: 'จัดหาอุปกรณ์/สัญญาณอินเทอร์เน็ตสำหรับเรียนที่บ้าน', en: 'Provide device / connectivity for home study', need: 'financial' },
    { th: 'จับคู่ครูอาสาในตำบลเป็นพี่เลี้ยงประจำ', en: 'Match with a tambon volunteer mentor', need: null },
    { th: 'ประเมินผลและวางแผนเรียนต่อ/ทำงาน', en: 'Review results, plan next step', need: null },
  ],
  vocational: [
    { th: 'พาเยี่ยมชมวิทยาลัยและเลือกสาขาที่สนใจ', en: 'College visit; choose a trade', need: null },
    { th: 'สมัครเรียนพร้อมขอทุนเรียนฟรี/ค่าครองชีพ', en: 'Apply with fee waiver / living allowance', need: 'financial' },
    { th: 'จัดหาที่พักหรือค่าเดินทางหากอยู่ต่างอำเภอ', en: 'Arrange lodging or travel if out of district', need: 'transport' },
    { th: 'ติดตามผลการเรียนภาคเรียนแรก', en: 'Track first-term performance', need: null },
  ],
  islamicSchool: [
    { th: 'หารือกับผู้นำศาสนาและครอบครัวเรื่องการเรียนควบ', en: 'Discuss dual-track study with family & religious leader', need: null },
    { th: 'ประสานโรงเรียนเอกชนสอนศาสนาที่เปิดสายสามัญ', en: 'Place in an Islamic private school with an academic track', need: null },
    { th: 'ขอทุนค่าธรรมเนียมและอุปกรณ์การเรียน', en: 'Secure fees and learning-materials grant', need: 'financial' },
    { th: 'ติดตามภาระเวลาเรียนไม่ให้ซ้ำซ้อนจนหลุดอีก', en: 'Monitor timetable load to prevent a second dropout', need: null },
  ],
  apprentice: [
    { th: 'ประเมินทักษะและความสนใจด้านอาชีพ', en: 'Skills and interest assessment', need: 'skills' },
    { th: 'จับคู่สถานประกอบการในพื้นที่ที่รับผู้ฝึก', en: 'Match with a local host employer', need: 'jobPlacement' },
    { th: 'ทำข้อตกลงฝึกอาชีพและค่าตอบแทนระหว่างฝึก', en: 'Sign training agreement incl. stipend', need: null },
    { th: 'เก็บชั่วโมงฝึกและออกใบรับรองทักษะ', en: 'Log hours; issue skills certificate', need: null },
    { th: 'เปิดช่องทางเรียนต่อ สกร. คู่ขนาน', en: 'Open a parallel NFE study route', need: null },
  ],
  employment: [
    { th: 'ตรวจสอบอายุและสิทธิตามกฎหมายคุ้มครองแรงงาน', en: 'Verify age and labour-protection entitlements', need: 'documents' },
    { th: 'อบรมทักษะระยะสั้นตามความต้องการนายจ้าง', en: 'Short skills course matched to employer demand', need: 'skills' },
    { th: 'จัดหางานในพื้นที่พร้อมสัญญาจ้างที่เป็นธรรม', en: 'Local job placement with a fair contract', need: 'jobPlacement' },
    { th: 'ติดตามความมั่นคงของงาน 6 เดือน', en: 'Six-month job-retention follow-up', need: null },
  ],
  specialNeeds: [
    { th: 'ส่งประเมินโดยแพทย์/นักจิตวิทยาเฉพาะทาง', en: 'Specialist medical / psychological assessment', need: 'physicalHealth' },
    { th: 'จัดทำแผนการจัดการศึกษาเฉพาะบุคคล (IEP)', en: 'Draft an Individual Education Plan (IEP)', need: null },
    { th: 'จัดหาสื่อ/อุปกรณ์ช่วยการเรียนรู้', en: 'Provide assistive learning materials', need: 'financial' },
    { th: 'ติดตามร่วมกับ รพ.สต. ทุกเดือน', en: 'Monthly joint follow-up with the health centre', need: null },
  ],
  undecided: [
    { th: 'ประเมินสถานการณ์เด็กและครอบครัวเชิงลึก', en: 'In-depth child and family assessment', need: null },
    { th: 'นำเข้าที่ประชุมทีมสหวิชาชีพระดับอำเภอ', en: 'Table at the district multi-agency conference', need: null },
  ],
}

function buildPlan(c: Candidate): OpportunityPlan {
  const rng = makeRng(hashSeed(`plan::${c.childId}`))
  const pathway = choosePathway(c, rng)
  const tpl = STEPS_BY_PATHWAY[pathway]

  const barriers = Array.from(
    new Set(
      c.causeKeys
        .map((k) => CAUSE_TO_NEED[k])
        .filter((n): n is ReferralNeed => Boolean(n)),
    ),
  ).slice(0, 3)

  // How far along the plan is — registry children start later than in-school ones
  const doneCount = randInt(rng, 0, tpl.length)
  const steps: PlanStep[] = tpl.map((s, i) => {
    let status: PlanStepStatus
    if (i < doneCount) status = 'done'
    else if (i === doneCount) status = rng() > 0.82 ? 'blocked' : 'active'
    else status = 'pending'
    const agency = s.need
      ? routeAgency(c.provinceKey, s.need, c.childId)
      : pick(rng, AGENCIES.filter((a) => a.provinceKey === c.provinceKey && a.kind === 'education'))
    return {
      id: `${c.childId}-S${i + 1}`,
      titleTh: s.th,
      titleEn: s.en,
      ownerAgencyId: agency.id,
      ownerName: agency.th,
      dueInDays: (i + 1) * randInt(rng, 5, 14),
      status,
    }
  })

  const progress = Math.round((doneCount / tpl.length) * 100)
  const month = randInt(rng, 8, 12)

  return {
    id: `PLAN-${c.childId}`,
    childId: c.childId,
    childName: c.childName,
    pathway,
    rationaleTh: RATIONALE[pathway].th,
    rationaleEn: RATIONALE[pathway].en,
    barriers,
    steps,
    progress,
    targetMonth: `2026-${String(month).padStart(2, '0')}`,
    reviewedDaysAgo: randInt(rng, 1, 64),
    agreedByFamily: rng() > 0.18,
    ownerAgencyId: steps[0]?.ownerAgencyId ?? AGENCIES[0].id,
  }
}

export const PLANS: OpportunityPlan[] = CANDIDATES.map(buildPlan)

export const PLAN_BY_ID: Record<string, OpportunityPlan> = Object.fromEntries(
  PLANS.map((p) => [p.id, p]),
)

export const PLAN_BY_CHILD: Record<string, OpportunityPlan> = Object.fromEntries(
  PLANS.map((p) => [p.childId, p]),
)

export const PATHWAYS: Pathway[] = [
  'formalReturn', 'nfe', 'vocational', 'islamicSchool', 'apprentice',
  'employment', 'specialNeeds', 'undecided',
]

export const PATHWAY_COLOR: Record<Pathway, string> = {
  formalReturn: '#2f66f6',
  nfe: '#8b5cf6',
  vocational: '#f59e0b',
  islamicSchool: '#10b981',
  apprentice: '#ec4899',
  employment: '#ef4444',
  specialNeeds: '#0ea5e9',
  undecided: '#94a3b8',
}

export function pathwayDistribution(): { pathway: Pathway; count: number }[] {
  return PATHWAYS.map((p) => ({
    pathway: p,
    count: PLANS.filter((pl) => pl.pathway === p).length,
  })).filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
}

export const PLAN_STATS = {
  total: PLANS.length,
  agreed: PLANS.filter((p) => p.agreedByFamily).length,
  blocked: PLANS.filter((p) => p.steps.some((s) => s.status === 'blocked')).length,
  nearlyDone: PLANS.filter((p) => p.progress >= 75).length,
  staleReview: PLANS.filter((p) => p.reviewedDaysAgo > 45).length,
  avgProgress:
    Math.round(
      (PLANS.reduce((s, p) => s + p.progress, 0) / Math.max(1, PLANS.length)) * 10,
    ) / 10,
}
