// ─────────────────────────────────────────────────────────────
// The cross-agency actor registry.
//
// Zero Dropout in the southern border provinces is not a สพฐ.-only job: the
// child who stops coming to school usually needs money, a health service, a
// document, or a job — each owned by a different agency. This file is the
// directory the referral module routes against.
//
// Names follow real Thai agency naming; performance figures are mock.
// ─────────────────────────────────────────────────────────────
import type { Agency, AgencyKind } from '@/types'
import { PROVINCES_GEO } from './geo'
import { hashSeed, makeRng, randInt } from '@/lib/format'

interface Template {
  slug: string
  kind: AgencyKind
  th: (p: string) => string
  en: (p: string) => string
  services: string[]
}

const TEMPLATES: Template[] = [
  {
    slug: 'esa',
    kind: 'education',
    th: (p) => `สำนักงานเขตพื้นที่การศึกษาประถมศึกษา${p}`,
    en: (p) => `${p} Primary Educational Service Area Office`,
    services: ['svc.reEnrol', 'svc.transfer', 'svc.remedial', 'svc.scholarship'],
  },
  {
    slug: 'nfe',
    kind: 'education',
    th: (p) => `สำนักงานส่งเสริมการเรียนรู้จังหวัด${p} (สกร.)`,
    en: (p) => `${p} Office for Learning Promotion (NFE)`,
    services: ['svc.nfeEnrol', 'svc.equivalency', 'svc.flexLearning'],
  },
  {
    slug: 'voc',
    kind: 'education',
    th: (p) => `อาชีวศึกษาจังหวัด${p}`,
    en: (p) => `${p} Vocational Education Institute`,
    services: ['svc.vocationalSeat', 'svc.shortCourse', 'svc.dualSystem'],
  },
  {
    slug: 'pmj',
    kind: 'social',
    th: (p) => `สำนักงานพัฒนาสังคมและความมั่นคงของมนุษย์จังหวัด${p} (พมจ.)`,
    en: (p) => `${p} Provincial Social Development & Human Security Office`,
    services: ['svc.cashGrant', 'svc.childProtection', 'svc.familySupport'],
  },
  {
    slug: 'shelter',
    kind: 'social',
    th: (p) => `บ้านพักเด็กและครอบครัวจังหวัด${p}`,
    en: (p) => `${p} Children & Family Shelter`,
    services: ['svc.emergencyShelter', 'svc.childProtection', 'svc.counselling'],
  },
  {
    slug: 'health',
    kind: 'health',
    th: (p) => `สำนักงานสาธารณสุขจังหวัด${p} (สสจ.)`,
    en: (p) => `${p} Provincial Public Health Office`,
    services: ['svc.mentalHealth', 'svc.healthScreening', 'svc.substanceCare'],
  },
  {
    slug: 'pao',
    kind: 'localGov',
    th: (p) => `องค์การบริหารส่วนจังหวัด${p}`,
    en: (p) => `${p} Provincial Administrative Organisation`,
    services: ['svc.transport', 'svc.communityFund', 'svc.localScholarship'],
  },
  {
    slug: 'labour',
    kind: 'labour',
    th: (p) => `สำนักงานแรงงานจังหวัด${p}`,
    en: (p) => `${p} Provincial Labour Office`,
    services: ['svc.skillTraining', 'svc.jobPlacement', 'svc.youthWorkPermit'],
  },
  {
    slug: 'islamic',
    kind: 'religious',
    th: (p) => `คณะกรรมการอิสลามประจำจังหวัด${p}`,
    en: (p) => `${p} Provincial Islamic Committee`,
    services: ['svc.tadika', 'svc.familyMediation', 'svc.communityOutreach'],
  },
  {
    slug: 'civil',
    kind: 'civil',
    th: (p) => `เครือข่ายประชาสังคมเพื่อเด็กและเยาวชนจังหวัด${p}`,
    en: (p) => `${p} Civil Society Network for Children & Youth`,
    services: ['svc.activeSearch', 'svc.mentoring', 'svc.homeVisit'],
  },
  {
    slug: 'district',
    kind: 'admin',
    th: (p) => `ที่ทำการปกครองจังหวัด${p} / ศปก.อำเภอ`,
    en: (p) => `${p} Provincial Administration / District Ops Centre`,
    services: ['svc.caseConference', 'svc.registry', 'svc.escalation'],
  },
]

/** Region-wide bodies that sit above the three pilot provinces. */
const REGIONAL: Omit<Agency, 'openReferrals' | 'avgAcceptHours' | 'completionRate'>[] = [
  {
    id: 'AG-SBPAC',
    kind: 'admin',
    th: 'ศูนย์อำนวยการบริหารจังหวัดชายแดนภาคใต้ (ศอ.บต.)',
    en: 'Southern Border Provinces Administrative Centre (SBPAC)',
    provinceKey: 'yala',
    services: ['svc.policy', 'svc.budget', 'svc.escalation', 'svc.caseConference'],
    contact: 'ศอ.บต. ถ.สุขยางค์ อ.เมืองยะลา',
  },
  {
    id: 'AG-SBP-EDU',
    kind: 'education',
    th: 'ศูนย์ประสานงานการศึกษาจังหวัดชายแดนภาคใต้',
    en: 'Southern Border Education Coordination Centre',
    provinceKey: 'yala',
    services: ['svc.reEnrol', 'svc.dataMatching', 'svc.scholarship'],
    contact: 'อ.เมืองยะลา จ.ยะลา',
  },
  {
    id: 'AG-SBP-CIVIL',
    kind: 'civil',
    th: 'สมัชชาประชาสังคมเพื่อสันติภาพและเด็กชายแดนใต้',
    en: 'Southern Border Civil Society Assembly for Peace & Children',
    provinceKey: 'pattani',
    services: ['svc.activeSearch', 'svc.mentoring', 'svc.communityOutreach'],
    contact: 'อ.เมืองปัตตานี จ.ปัตตานี',
  },
]

function build(): Agency[] {
  const out: Agency[] = []

  for (const p of PROVINCES_GEO) {
    const plain = p.th.replace(/\s*\(.*\)$/, '') // strips any "(…)" qualifier on the province name
    const plainEn = p.en.replace(/\s*\(.*\)$/, '')
    for (const tpl of TEMPLATES) {
      const id = `AG-${p.key}-${tpl.slug}`
      const rng = makeRng(hashSeed(id))
      out.push({
        id,
        kind: tpl.kind,
        th: tpl.th(plain),
        en: tpl.en(plainEn),
        provinceKey: p.key,
        services: tpl.services,
        contact: `อ.เมือง${plain} จ.${plain}`,
        avgAcceptHours: Math.round((6 + rng() * 66) * 10) / 10,
        openReferrals: randInt(rng, 4, 88),
        completionRate: Math.round((54 + rng() * 42) * 10) / 10,
      })
    }
  }

  for (const r of REGIONAL) {
    const rng = makeRng(hashSeed(r.id))
    out.push({
      ...r,
      avgAcceptHours: Math.round((4 + rng() * 30) * 10) / 10,
      openReferrals: randInt(rng, 10, 60),
      completionRate: Math.round((68 + rng() * 28) * 10) / 10,
    })
  }

  return out
}

export const AGENCIES: Agency[] = build()

export const AGENCY_BY_ID: Record<string, Agency> = Object.fromEntries(
  AGENCIES.map((a) => [a.id, a]),
)

export const agenciesOf = (provinceKey: string): Agency[] =>
  AGENCIES.filter((a) => a.provinceKey === provinceKey)

export const agenciesByKind = (kind: AgencyKind): Agency[] =>
  AGENCIES.filter((a) => a.kind === kind)

/** Which agency kind owns each referral need — drives smart routing. */
export const NEED_TO_KIND: Record<string, AgencyKind> = {
  financial: 'social',
  mentalHealth: 'health',
  physicalHealth: 'health',
  protection: 'social',
  housing: 'social',
  transport: 'localGov',
  documents: 'admin',
  skills: 'labour',
  jobPlacement: 'labour',
  childcare: 'social',
}

/** Best-fit agency for a need inside a province (falls back region-wide).
 *
 *  `seed` spreads load across equally-mandated offices instead of routing every
 *  case to whichever one happens to have the lowest median accept time — a
 *  single receiving office would otherwise appear to run the entire region. */
export function routeAgency(provinceKey: string, need: string, seed = ''): Agency {
  const kind = NEED_TO_KIND[need] ?? 'social'
  const inProv = AGENCIES.filter(
    (a) => a.provinceKey === provinceKey && a.kind === kind,
  )
  const pool = inProv.length ? inProv : AGENCIES.filter((a) => a.kind === kind)
  const candidates = pool.length ? pool : AGENCIES
  if (!seed) {
    return candidates.reduce((best, a) =>
      a.avgAcceptHours < best.avgAcceptHours ? a : best,
    )
  }
  // Bias toward faster offices, but keep every mandated office in play.
  const ranked = [...candidates].sort((a, b) => a.avgAcceptHours - b.avgAcceptHours)
  const rng = makeRng(hashSeed(`route::${seed}::${need}`))
  const idx = rng() < 0.55 ? 0 : randInt(rng, 0, ranked.length - 1)
  return ranked[idx]
}

export const AGENCY_KIND_COLOR: Record<AgencyKind, string> = {
  education: '#2f66f6',
  social: '#a855f7',
  health: '#0ea5e9',
  localGov: '#14b8a6',
  civil: '#f59e0b',
  religious: '#10b981',
  labour: '#ef4444',
  admin: '#64748b',
}
