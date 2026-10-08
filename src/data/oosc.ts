// ─────────────────────────────────────────────────────────────
// ทะเบียนเด็กนอกระบบ — the Out-of-School Children registry.
//
// This is the half of the problem a school MIS can never see: children who
// already left, or who never appeared. Records arrive from seven different
// channels (school report, ตำบล survey, civil-society outreach, imam, health
// records, civil registry matching, hotline) and are reconciled into one
// person. `matchConfidence` is how sure the platform is that the record is a
// real, still-out-of-school child — the field that decides whether a team
// spends a day driving to a village.
// ─────────────────────────────────────────────────────────────
import type {
  CauseKey,
  ChildStatus,
  ConsentStatus,
  GradeLevel,
  OoscRecord,
  OoscSource,
} from '@/types'
import { hashSeed, makeRng, pick, randInt } from '@/lib/format'
import { DISTRICTS_GEO, TAMBONS_GEO, type TambonGeo } from './geo'
import { AGENCIES } from './agencies'

const MALE_FIRST = [
  'อาหามะ', 'มะยากี', 'อับดุลฮากิม', 'นิเซ็ง', 'แวอาลี', 'ซัมซูดิน', 'ฮาซัน',
  'มูฮัมหมัดฟาริส', 'อิบรอเฮม', 'ยะห์ยา', 'รอมือลี', 'สุไลมาน', 'อภิชาติ',
]
const FEMALE_FIRST = [
  'นูรอัยนี', 'ฮานีฟะห์', 'ซูฮาดา', 'แวรอกีเยาะ', 'ยารีนา', 'ซีตีคอลีเยาะ',
  'อาอีเสาะ', 'ฟาดีละห์', 'นุรมา', 'ฮาบีบะห์', 'มัสนา', 'จันทิมา',
]
const LAST = [
  'ดอเลาะ', 'สาและ', 'เจ๊ะแว', 'อาแว', 'หะยีสาแม', 'มะมิง', 'สะแลแม', 'ลาเตะ',
  'บินอาลี', 'ตาเยะ', 'แวดาโอ๊ะ', 'นิเดร์', 'กาเดร์', 'มะเซ็ง', 'ปะดอ', 'ดาโอะ',
]

const SOURCES: OoscSource[] = [
  'schoolReport', 'tambonSurvey', 'civilSurvey', 'religiousLeader',
  'healthRecord', 'civilRegistry', 'hotline',
]

/** How much each channel is trusted before a home visit verifies it. */
const SOURCE_CONFIDENCE: Record<OoscSource, [number, number]> = {
  schoolReport: [78, 96],
  tambonSurvey: [70, 94],
  civilSurvey: [64, 92],
  religiousLeader: [60, 90],
  healthRecord: [52, 82],
  civilRegistry: [44, 76],
  hotline: [38, 74],
}

const OOS_CAUSES: CauseKey[] = [
  'poverty', 'migration', 'family', 'earlyMarriage', 'childLabour',
  'dualSchooling', 'health', 'travel', 'noDocuments', 'stateless',
  'unrestAffected', 'failing', 'transition',
]

const GRADES: GradeLevel[] = ['p4', 'p5', 'p6', 'm1', 'm2', 'm3']

const OWNERS = [
  'ครูอาสา สกร. ตำบล', 'นักสังคมสงเคราะห์ พมจ.', 'อสม. ประจำหมู่บ้าน',
  'ผู้ช่วยผู้ใหญ่บ้าน', 'อาสาสมัครประชาสังคม', 'ครูตาดีกา', 'นักจิตวิทยาโรงเรียน',
]

const NOTES = [
  'ผู้ปกครองไปทำงานรับจ้างที่มาเลเซีย เด็กอยู่กับย่า',
  'ออกกลางคันหลังจบ ป.6 เพราะไม่มีค่าเดินทางไปโรงเรียนมัธยม',
  'ช่วยครอบครัวกรีดยาง/ออกเรือประมง ไม่สะดวกเรียนเต็มเวลา',
  'แต่งงานตามประเพณีเมื่ออายุ 15 ปี ปัจจุบันสนใจเรียน สกร.',
  'เรียนตาดีกา/ปอเนาะอย่างเดียว ยังไม่มีวุฒิสายสามัญ',
  'ไม่มีเอกสารแสดงตน อยู่ระหว่างประสานงานทะเบียนราษฎร',
  'มีปัญหาสุขภาพเรื้อรัง ต้องเรียนรูปแบบยืดหยุ่น',
  'ครอบครัวย้ายถิ่นตามฤดูกาล ติดตามตัวได้ไม่ต่อเนื่อง',
  'สนใจฝึกอาชีพช่างยนต์ มากกว่ากลับเข้าระบบโรงเรียน',
  'พบตัวแล้วจากการสำรวจร่วมของ อบต. และผู้นำศาสนา',
]

const DISTRICT_KIND = Object.fromEntries(
  DISTRICTS_GEO.map((d) => [d.key, d.kind]),
) as Record<string, string>

// Expected number of out-of-school children per ตำบล, by district character.
// The registry is generated FIRST and every place-level aggregate is then
// counted from it — so when an executive drills from "82 children" into the
// list, there really are 82 names there.
const OOS_PER_TAMBON: Record<string, number> = {
  urban: 13,
  coastal: 11,
  rural: 9,
  border: 14,
  remote: 8,
}

/** One entry per child to be generated, tagged with its home tambon. */
const SLOTS: TambonGeo[] = TAMBONS_GEO.flatMap((t) => {
  const rng = makeRng(hashSeed(`oos-size::${t.key}`))
  const base = OOS_PER_TAMBON[DISTRICT_KIND[t.districtKey]] ?? 9
  const n = Math.max(2, Math.round(base * (0.55 + rng() * 0.95)))
  return Array.from({ length: n }, () => t)
})

function buildRecord(idx: number): OoscRecord {
  const id = `OOS-${String(idx + 1).padStart(4, '0')}`
  const rng = makeRng(hashSeed(`sbp-oosc-${idx}`))
  const tambon = SLOTS[idx]
  const kind = DISTRICT_KIND[tambon.districtKey]

  const gender = rng() > 0.52 ? 'male' : 'female'
  const name = `${pick(rng, gender === 'male' ? MALE_FIRST : FEMALE_FIRST)} ${pick(rng, LAST)}`

  const source = pick(rng, SOURCES)
  const [cLo, cHi] = SOURCE_CONFIDENCE[source]
  const verified = rng() > 0.42
  const matchConfidence = Math.min(
    99,
    randInt(rng, cLo, cHi) + (verified ? 8 : 0),
  )

  const causes: CauseKey[] = [...OOS_CAUSES]
  if (kind === 'border') causes.push('migration', 'noDocuments', 'stateless')
  if (kind === 'remote') causes.push('travel', 'poverty')
  if (kind === 'coastal') causes.push('childLabour')
  const causeKeys = Array.from(
    new Set(Array.from({ length: randInt(rng, 2, 4) }, () => pick(rng, causes))),
  )

  // Status distribution: most still out, a healthy share re-engaging/returned
  const roll = rng()
  const status: ChildStatus =
    roll > 0.86 ? 'returned'
      : roll > 0.72 ? 'working'
        : roll > 0.44 ? 'reengaging'
          : roll > 0.08 ? 'outOfSchool'
            : 'unreachable'

  const hasPlan = status === 'reengaging' || status === 'returned' || status === 'working'
  const owner = hasPlan || verified ? pick(rng, OWNERS) : null
  const ownerAgency = owner
    ? pick(rng, AGENCIES.filter((a) => a.provinceKey === tambon.provinceKey))
    : null

  const consent: ConsentStatus =
    status === 'unreachable' ? 'pending' : rng() > 0.84 ? 'pending' : rng() > 0.95 ? 'declined' : 'granted'

  return {
    id,
    name,
    ageYears: randInt(rng, 7, 18),
    gender,
    provinceKey: tambon.provinceKey,
    districtKey: tambon.districtKey,
    tambonKey: tambon.key,
    lastGradeKey: pick(rng, GRADES),
    yearsOut: Math.round((rng() * 5.5 + 0.2) * 10) / 10,
    source,
    verified,
    status,
    causeKeys,
    planId: hasPlan ? `PLAN-${id}` : null,
    ownerName: owner,
    ownerAgencyId: ownerAgency?.id ?? null,
    consent,
    matchConfidence,
    note: pick(rng, NOTES),
  }
}

export const OOSC: OoscRecord[] = SLOTS.map((_, i) => buildRecord(i)).sort(
  (a, b) => b.matchConfidence - a.matchConfidence,
)

/** Registry roll-up per ตำบล — the single source of truth for OOS counts.
 *  `engaged` = has an active plan (in progress OR finished).
 *  `outcome`  = actually arrived somewhere durable (back in learning, or working).
 *  Keeping these separate stops "we opened a plan" from being reported as
 *  "the child is fine now". */
export const OOSC_BY_TAMBON: Record<
  string,
  { out: number; engaged: number; outcome: number }
> = OOSC.reduce<Record<string, { out: number; engaged: number; outcome: number }>>(
  (acc, r) => {
    acc[r.tambonKey] ??= { out: 0, engaged: 0, outcome: 0 }
    if (r.status === 'outOfSchool' || r.status === 'unreachable') acc[r.tambonKey].out++
    else {
      acc[r.tambonKey].engaged++
      if (r.status === 'returned' || r.status === 'working') acc[r.tambonKey].outcome++
    }
    return acc
  },
  {},
)

export const OOSC_BY_ID: Record<string, OoscRecord> = Object.fromEntries(
  OOSC.map((r) => [r.id, r]),
)

export const SOURCE_LABEL: Record<OoscSource, { th: string; en: string }> = {
  schoolReport: { th: 'โรงเรียนแจ้ง', en: 'School report' },
  tambonSurvey: { th: 'สำรวจโดยท้องถิ่น', en: 'Local government survey' },
  civilSurvey: { th: 'ภาคประชาสังคมลงพื้นที่', en: 'Civil society outreach' },
  religiousLeader: { th: 'ผู้นำศาสนา / มัสยิด', en: 'Religious leader' },
  healthRecord: { th: 'จับคู่ข้อมูลสาธารณสุข', en: 'Health record match' },
  civilRegistry: { th: 'จับคู่ทะเบียนราษฎร', en: 'Civil registry match' },
  hotline: { th: 'สายด่วน / แจ้งเบาะแส', en: 'Hotline tip-off' },
}

/** Registry-wide counters used by the OOSC page header. */
export const OOSC_STATS = {
  total: OOSC.length,
  verified: OOSC.filter((r) => r.verified).length,
  stillOut: OOSC.filter((r) => r.status === 'outOfSchool').length,
  reengaging: OOSC.filter((r) => r.status === 'reengaging').length,
  returned: OOSC.filter((r) => r.status === 'returned').length,
  working: OOSC.filter((r) => r.status === 'working').length,
  unreachable: OOSC.filter((r) => r.status === 'unreachable').length,
  noPlan: OOSC.filter((r) => !r.planId).length,
  consentPending: OOSC.filter((r) => r.consent !== 'granted').length,
  highConfidenceUnverified: OOSC.filter((r) => !r.verified && r.matchConfidence >= 80).length,
}

/** Counts per discovery channel — the "how we find children" chart. */
export function bySource(): { source: OoscSource; count: number; verified: number }[] {
  return SOURCES.map((s) => ({
    source: s,
    count: OOSC.filter((r) => r.source === s).length,
    verified: OOSC.filter((r) => r.source === s && r.verified).length,
  })).sort((a, b) => b.count - a.count)
}
