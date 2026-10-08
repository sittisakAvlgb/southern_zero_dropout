// ─────────────────────────────────────────────────────────────
// ส่งต่อเคสข้ามหน่วยงาน — the referral spine.
//
// A referral is the moment accountability moves between organisations, so it
// is the moment things get dropped. Every referral therefore carries: who sent
// it, who owns it now, an SLA clock, and the PDPA consent state — because
// personal data must not cross an agency boundary without it.
// ─────────────────────────────────────────────────────────────
import type {
  CaseConference,
  ConsentStatus,
  Referral,
  ReferralNeed,
  ReferralStatus,
} from '@/types'
import { hashSeed, makeRng, pick, randInt } from '@/lib/format'
import { AGENCIES, AGENCY_BY_ID, routeAgency } from './agencies'
import { STUDENTS } from './students'
import { OOSC } from './oosc'
import { PLANS } from './plans'
import { DISTRICT_BY_KEY as DISTRICT_GEO_BY_KEY } from './geo'

export const NEEDS: ReferralNeed[] = [
  'financial', 'mentalHealth', 'physicalHealth', 'protection', 'housing',
  'transport', 'documents', 'skills', 'jobPlacement', 'childcare',
]

/** Statutory-ish turnaround targets, in days, per need. */
export const NEED_SLA: Record<ReferralNeed, number> = {
  financial: 15,
  mentalHealth: 7,
  physicalHealth: 5,
  protection: 2,
  housing: 10,
  transport: 14,
  documents: 30,
  skills: 21,
  jobPlacement: 21,
  childcare: 14,
}

export const NEED_LABEL: Record<ReferralNeed, { th: string; en: string }> = {
  financial: { th: 'ทุน / เงินสงเคราะห์', en: 'Financial aid' },
  mentalHealth: { th: 'สุขภาพจิต', en: 'Mental health' },
  physicalHealth: { th: 'สุขภาพกาย', en: 'Physical health' },
  protection: { th: 'คุ้มครองเด็ก', en: 'Child protection' },
  housing: { th: 'ที่พักอาศัย', en: 'Housing' },
  transport: { th: 'การเดินทาง', en: 'Transport' },
  documents: { th: 'เอกสาร / สถานะบุคคล', en: 'Documents / legal status' },
  skills: { th: 'ฝึกทักษะอาชีพ', en: 'Skills training' },
  jobPlacement: { th: 'จัดหางาน', en: 'Job placement' },
  childcare: { th: 'ภาระเลี้ยงดู', en: 'Childcare burden' },
}

const NOTES: Record<ReferralNeed, string[]> = {
  financial: [
    'ครอบครัวมีรายได้ไม่แน่นอน ขอเงินสงเคราะห์เด็กในครอบครัวยากจน',
    'ขอทุนปัจจัยพื้นฐานและค่าเดินทางรายเดือนต่อเนื่อง 1 ภาคเรียน',
  ],
  mentalHealth: [
    'พบสัญญาณซึมเศร้าและแยกตัว ขอประเมินโดยนักจิตวิทยา',
    'ได้รับผลกระทบจากเหตุการณ์ในพื้นที่ ขอทีมเยียวยาจิตใจ',
  ],
  physicalHealth: [
    'มีภาวะทุพโภชนาการ ขอตรวจสุขภาพและติดตามโดย รพ.สต.',
    'มีโรคประจำตัวต้องพบแพทย์ต่อเนื่อง ขอประสานนัดหมาย',
  ],
  protection: [
    'พบความเสี่ยงความรุนแรงในครอบครัว ขอทีมคุ้มครองเด็กเร่งด่วน',
    'เด็กอยู่ลำพังหลังผู้ปกครองย้ายถิ่น ขอประเมินความปลอดภัย',
  ],
  housing: [
    'บ้านพักไม่มั่นคง ขอปรับปรุงที่อยู่อาศัยหรือที่พักชั่วคราว',
  ],
  transport: [
    'บ้านห่างโรงเรียนเกิน 12 กม. ไม่มีรถรับส่ง ขอสนับสนุนการเดินทาง',
    'เส้นทางเข้าหมู่บ้านลำบากในฤดูฝน ขอจัดรถรับส่งร่วมกับ อบต.',
  ],
  documents: [
    'ยังไม่มีเลขประจำตัวประชาชน ขอประสานงานทะเบียนราษฎร',
    'ผู้ปกครองทำงานต่างประเทศ เอกสารรับรองไม่ครบ ขอช่วยดำเนินการ',
  ],
  skills: [
    'สนใจงานช่างยนต์ ขอที่นั่งหลักสูตรระยะสั้นรอบถัดไป',
    'ขอประเมินทักษะเพื่อออกแบบเส้นทางฝึกอาชีพ',
  ],
  jobPlacement: [
    'อายุ 17 ปี ต้องการงานในพื้นที่พร้อมสัญญาที่เป็นธรรม',
    'จบหลักสูตรระยะสั้นแล้ว ขอจับคู่สถานประกอบการ',
  ],
  childcare: [
    'ต้องดูแลน้องเล็กในเวลาเรียน ขอศูนย์พัฒนาเด็กเล็กรองรับ',
    'มีบุตรเล็ก ขอรูปแบบเรียนยืดหยุ่นพร้อมการดูแลบุตร',
  ],
}

interface Subject {
  id: string
  name: string
  provinceKey: string
  districtKey: string
  tambonKey: string
  consent: ConsentStatus
  urgentHint: boolean
}

const SUBJECTS: Subject[] = [
  ...STUDENTS.map((s) => ({
    id: s.id,
    name: s.name,
    provinceKey: s.provinceKey,
    districtKey: s.districtKey,
    tambonKey: s.tambonKey,
    consent: s.consent,
    urgentHint: s.riskLevel === 'critical',
  })),
  ...OOSC.map((r) => ({
    id: r.id,
    name: r.name,
    provinceKey: r.provinceKey,
    districtKey: r.districtKey,
    tambonKey: r.tambonKey,
    consent: r.consent,
    urgentHint: r.status === 'unreachable',
  })),
]

const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]))

/** Needs already declared as barriers on a plan seed the referral list. */
function seedPairs(): { subject: Subject; need: ReferralNeed }[] {
  const pairs: { subject: Subject; need: ReferralNeed }[] = []
  for (const plan of PLANS) {
    const subj = SUBJECT_BY_ID[plan.childId]
    if (!subj) continue
    for (const need of plan.barriers) pairs.push({ subject: subj, need })
  }
  // plus standalone referrals raised straight from a case, without a plan yet
  for (let i = 0; i < SUBJECTS.length; i += 3) {
    const rng = makeRng(hashSeed(`standalone-${SUBJECTS[i].id}`))
    if (rng() > 0.55) pairs.push({ subject: SUBJECTS[i], need: pick(rng, NEEDS) })
  }
  return pairs
}

function buildReferral(
  subject: Subject,
  need: ReferralNeed,
  idx: number,
): Referral {
  const id = `REF-${String(idx + 1).padStart(4, '0')}`
  const rng = makeRng(hashSeed(`referral::${subject.id}::${need}`))

  const to = routeAgency(subject.provinceKey, need, subject.id)
  const fromPool = AGENCIES.filter(
    (a) =>
      a.provinceKey === subject.provinceKey &&
      a.id !== to.id &&
      (a.kind === 'education' || a.kind === 'admin' || a.kind === 'civil'),
  )
  const from = fromPool.length ? pick(rng, fromPool) : AGENCIES[0]

  const slaDays = NEED_SLA[need]
  const openedDaysAgo = randInt(rng, 0, Math.round(slaDays * 1.35))

  // Consent gates everything: without it the referral cannot legally proceed.
  let status: ReferralStatus
  if (subject.consent === 'declined') status = 'rejected'
  else if (subject.consent === 'pending') status = 'draft'
  else {
    const roll = rng()
    status =
      roll > 0.82 ? 'completed'
        : roll > 0.58 ? 'inProgress'
          : roll > 0.34 ? 'accepted'
            : roll > 0.12 ? 'sent'
              : 'rejected'
  }
  const open = status === 'sent' || status === 'accepted' || status === 'inProgress'
  if (open && openedDaysAgo > slaDays) status = 'overdue'

  return {
    id,
    childId: subject.id,
    childName: subject.name,
    provinceKey: subject.provinceKey,
    districtKey: subject.districtKey,
    tambonKey: subject.tambonKey,
    need,
    fromAgencyId: from.id,
    toAgencyId: to.id,
    status,
    openedDaysAgo,
    slaDays,
    urgent: subject.urgentHint || need === 'protection',
    note: pick(rng, NOTES[need]),
    consent: subject.consent,
  }
}

export const REFERRALS: Referral[] = seedPairs()
  .map((p, i) => buildReferral(p.subject, p.need, i))
  .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.openedDaysAgo - a.openedDaysAgo)

export const REFERRAL_STATUSES: ReferralStatus[] = [
  'draft', 'sent', 'accepted', 'inProgress', 'completed', 'overdue', 'rejected',
]

export const REFERRAL_STATUS_COLOR: Record<ReferralStatus, string> = {
  draft: '#94a3b8',
  sent: '#3b82f6',
  accepted: '#8b5cf6',
  inProgress: '#f59e0b',
  completed: '#16a34a',
  overdue: '#dc2626',
  rejected: '#64748b',
}

export const REFERRAL_STATS = {
  total: REFERRALS.length,
  open: REFERRALS.filter((r) =>
    ['sent', 'accepted', 'inProgress', 'overdue'].includes(r.status),
  ).length,
  overdue: REFERRALS.filter((r) => r.status === 'overdue').length,
  urgent: REFERRALS.filter((r) => r.urgent && r.status !== 'completed').length,
  blockedByConsent: REFERRALS.filter((r) => r.consent !== 'granted').length,
  completed: REFERRALS.filter((r) => r.status === 'completed').length,
  avgDaysOpen:
    Math.round(
      (REFERRALS.reduce((s, r) => s + r.openedDaysAgo, 0) /
        Math.max(1, REFERRALS.length)) * 10,
    ) / 10,
}

export function referralsByNeed(): { need: ReferralNeed; count: number; overdue: number }[] {
  return NEEDS.map((n) => ({
    need: n,
    count: REFERRALS.filter((r) => r.need === n).length,
    overdue: REFERRALS.filter((r) => r.need === n && r.status === 'overdue').length,
  }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
}

/** Flow matrix: which agency sends to which — the collaboration graph. */
export function referralFlows(limit = 12) {
  const acc = new Map<string, number>()
  for (const r of REFERRALS) {
    const k = `${r.fromAgencyId}→${r.toAgencyId}`
    acc.set(k, (acc.get(k) ?? 0) + 1)
  }
  return [...acc.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split('→')
      return { from, to, count, fromAgency: AGENCY_BY_ID[from], toAgency: AGENCY_BY_ID[to] }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

// ── Multi-agency case conferences ────────────────────────────
const DECISIONS = [
  'เห็นชอบเส้นทาง สกร. แบบยืดหยุ่น และมอบ อบต. จัดรถรับส่งสัปดาห์ละ 2 วัน',
  'มอบ พมจ. เร่งอนุมัติเงินสงเคราะห์ภายใน 15 วัน',
  'ให้ รพ.สต. ประเมินสุขภาพจิตและรายงานกลับใน 7 วัน',
  'มอบผู้นำศาสนาในตำบลเป็นผู้ประสานกับครอบครัว',
  'ให้สำนักงานแรงงานจัดที่นั่งฝึกอาชีพรอบเดือนหน้า',
  'ให้ที่ทำการปกครองอำเภอเร่งเรื่องเอกสารสถานะบุคคล',
  'นัดทบทวนแผนอีกครั้งหลังเปิดภาคเรียน',
]

function buildConference(idx: number): CaseConference {
  const rng = makeRng(hashSeed(`conf-${idx}`))
  const plan = PLANS[(idx * 7) % PLANS.length]
  const subj = SUBJECT_BY_ID[plan.childId]
  const districtKey = subj?.districtKey ?? 'mueangYala'
  const provinceKey =
    DISTRICT_GEO_BY_KEY[districtKey]?.provinceKey ?? 'yala'

  const pool = AGENCIES.filter((a) => a.provinceKey === provinceKey)
  const attendees = Array.from(
    new Set(Array.from({ length: randInt(rng, 3, 6) }, () => pick(rng, pool).id)),
  )

  return {
    id: `CONF-${String(idx + 1).padStart(3, '0')}`,
    childId: plan.childId,
    childName: plan.childName,
    districtKey,
    date: `2026-07-${String(randInt(rng, 1, 21)).padStart(2, '0')}`,
    chair: 'นายอำเภอ / ประธาน ศปก.อำเภอ',
    attendeeAgencyIds: attendees,
    decisions: Array.from(
      new Set(Array.from({ length: randInt(rng, 2, 3) }, () => pick(rng, DECISIONS))),
    ),
    nextReviewDays: randInt(rng, 7, 45),
  }
}

export const CONFERENCES: CaseConference[] = Array.from({ length: 18 }, (_, i) =>
  buildConference(i),
).sort((a, b) => b.date.localeCompare(a.date))
