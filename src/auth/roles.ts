// ─────────────────────────────────────────────────────────────
// Role model, per-role navigation, and demo accounts.
//
// Five roles, because five is how many *different jobs* this platform has:
// someone who reads the area and moves resources, someone who supervises the
// schools in an education service area, someone who runs a school, someone who
// owns a child's case, and someone outside education who receives a referral.
// Everything else that used to be a role — province, district, tambon — is the
// same job at a different altitude, so it is expressed as the account's
// territory (`provinceKey` / `districtKey`), not as a new role.
//
// `obec` (สพฐ.) earns its own role rather than being another exec territory
// because the *work* differs, not the altitude: it answers for school
// performance and for getting children back into learning, while cross-agency
// referral to พมจ./สธ./แรงงาน and the tambon coordination table stay with
// ศอ.บต. and the area team.
//
// It is also the one area-wide seat that legitimately reads named children, and
// that is not an exception to TOR ๔.๕.๕ but the rule applied honestly: สพฐ. is
// the ผู้ควบคุมข้อมูล of the student register itself (DMC, TOR ๔.๓). ศอ.บต. is a
// coordinating agency, so its area-wide seat stays on aggregates; สพฐ. owns the
// records, so its area-wide seat does not. Access still follows the job.
//
// Territory works the same way it does for `exec`: an `obec` account with no
// keys is สพฐ. ส่วนกลาง and sees all three provinces, while one carrying a
// `provinceKey` is a สพม. seat — in the TOR dataset each สพม. covers exactly
// one province, so no second scoping key was needed.
//
// The one rule that must survive that simplification is the PDPA rule from
// TOR ๔.๕.๕: access follows the job, not the rank. An executive account with
// no territory assigned (ศอ.บต.) works with aggregates and never sees a named
// child; an executive assigned to a province or district runs actual cases and
// therefore keeps the child-level screens. `navFor()` below is where that
// lives — not scattered across the pages.
// ─────────────────────────────────────────────────────────────

export type Role =
  | 'exec' // ผู้บริหาร / คณะทำงาน — ศอ.บต. · จังหวัด · อำเภอ (ต่างกันที่ขอบเขตบัญชี)
  | 'obec' // ผู้บริหาร สพฐ. — ส่วนกลาง (ไม่มีขอบเขต) หรือ สพม. (มี provinceKey)
  | 'esa' // ผู้บริหารสำนักงานเขตพื้นที่การศึกษา — กำกับอำเภอและโรงเรียนในเขต
  | 'school' // ผู้อำนวยการสถานศึกษา
  | 'teacher' // ครู / ผู้จัดการรายกรณี
  | 'agency' // หน่วยงานที่รับส่งต่อ (พมจ. / สธ. / แรงงาน)

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** territory. An exec with neither key set covers the whole จชต. area. */
  provinceKey?: string
  /** เขตพื้นที่การศึกษา — sits between province and district (see data/esa.ts) */
  esaKey?: string
  districtKey?: string
  tambonKey?: string
  /** school scope (school director). Format matches student.schoolKey */
  schoolKey?: string
  /** case-owner scope (teacher / case owner) — matches student.caseOwner */
  ownerName?: string
  /** agency scope — referrals addressed to this agency */
  agencyId?: string
  /** organisation shown in the profile chip */
  org?: string
}

/** Widest scope first, narrowing down to the single caseload — the order the
 *  login and register screens present the roles in. */
export const ROLES: Role[] = ['obec', 'esa', 'exec', 'school', 'teacher', 'agency']

export interface RoleMeta {
  role: Role
  th: string
  en: string
  ms: string
  /** two-word label for tight spots (login role picker, chips) */
  shortTh: string
  shortEn: string
  shortMs: string
  descTh: string
  descEn: string
  scopeTh: string
  scopeEn: string
  color: string
}

export const ROLE_META: Record<Role, RoleMeta> = {
  exec: {
    role: 'exec',
    th: 'ผู้บริหาร / คณะทำงานพื้นที่',
    en: 'Executive / Area Working Group',
    ms: 'Eksekutif Kawasan',
    shortTh: 'ผู้บริหาร',
    shortEn: 'Executive',
    shortMs: 'Eksekutif',
    descTh: 'ศอ.บต. · จังหวัด · อำเภอ — เห็นภาพรวมตามขอบเขตที่บัญชีรับผิดชอบ',
    descEn: 'SBPAC, province or district — the area this account is responsible for',
    scopeTh: 'ตามขอบเขตของบัญชี',
    scopeEn: 'Account territory',
    color: '#0f2a6b',
  },
  obec: {
    role: 'obec',
    // `th`/`en` name the job only — the scope is appended from scopeTh/scopeEn
    // wherever the two are shown together, so repeating it here reads double
    th: 'ผู้บริหาร สพฐ.',
    en: 'OBEC Executive',
    ms: 'Eksekutif OBEC',
    shortTh: 'ผู้บริหาร สพฐ.',
    shortEn: 'OBEC executive',
    shortMs: 'OBEC',
    descTh: 'สพฐ. ส่วนกลาง — เห็นทุกจังหวัด ทุกโรงเรียน และนักเรียนรายคน ในฐานะเจ้าของทะเบียนนักเรียน (DMC)',
    descEn: 'OBEC HQ — every province, every school and named students, as the controller of the student register (DMC)',
    scopeTh: 'ทุกจังหวัดและทุกสถานศึกษา',
    scopeEn: 'All provinces and schools',
    color: '#0891b2',
  },
  esa: {
    role: 'esa',
    th: 'ผู้บริหารสำนักงานเขตพื้นที่การศึกษา',
    en: 'Educational Service Area Executive',
    ms: 'Eksekutif PPD',
    shortTh: 'ผู้บริหารสำนักเขต',
    shortEn: 'Area office',
    shortMs: 'PPD',
    descTh: 'สำนักงานเขตพื้นที่ — ไล่ดูจากเขตลงอำเภอ โรงเรียน จนถึงนักเรียนรายคนในเขตของตน',
    descEn: 'Area office — drills from its เขต down through districts and schools to the named student',
    // says what the เขต contains rather than repeating the words already in
    // `th` — the two are rendered side by side as "job · scope"
    scopeTh: 'อำเภอและโรงเรียนในเขต',
    scopeEn: 'Districts and schools in its area',
    // deep rose — the remaining gap in the role palette; violet would sit too
    // close to agency's purple and teal too close to สพฐ.'s cyan
    color: '#be185d',
  },
  school: {
    role: 'school',
    th: 'ผู้อำนวยการสถานศึกษา',
    en: 'School Director',
    ms: 'Pengetua Sekolah',
    shortTh: 'ผอ.สถานศึกษา',
    shortEn: 'School director',
    shortMs: 'Pengetua',
    descTh: 'เห็นนักเรียนและเคสในสถานศึกษา',
    descEn: 'Students and cases within the school',
    scopeTh: 'ระดับสถานศึกษา',
    scopeEn: 'School level',
    color: '#f97316',
  },
  teacher: {
    role: 'teacher',
    th: 'ครู / ผู้จัดการรายกรณี',
    en: 'Teacher / Case Manager',
    ms: 'Guru / Pengurus Kes',
    shortTh: 'ครู / ผู้จัดการเคส',
    shortEn: 'Teacher',
    shortMs: 'Guru',
    descTh: 'เห็นเฉพาะเด็กที่ตนรับผิดชอบ',
    descEn: 'Only the caseload you own',
    scopeTh: 'เคสที่รับผิดชอบ',
    scopeEn: 'My caseload',
    color: '#dc2626',
  },
  agency: {
    role: 'agency',
    th: 'หน่วยงานที่รับส่งต่อ (พมจ. / สธ. / แรงงาน)',
    en: 'Receiving Agency (Social / Health / Labour)',
    ms: 'Agensi Penerima',
    shortTh: 'หน่วยงานส่งต่อ',
    shortEn: 'Receiving agency',
    shortMs: 'Agensi',
    descTh: 'เห็นเฉพาะเคสที่ถูกส่งต่อมายังหน่วยงาน พร้อมนาฬิกา SLA',
    descEn: 'Only referrals addressed to this agency, with the SLA clock',
    scopeTh: 'เคสที่รับส่งต่อ',
    scopeEn: 'Referred to us',
    color: '#a855f7',
  },
}

/** ศอ.บต. sets policy and moves resources; it does not work single cases.
 *  Every screen that names an individual child (/oosc, /plan, /referral,
 *  /tambon) or manages one (/intervention) is therefore out of scope —
 *  TOR ๔.๖.๑ puts the executive at area/province/school level, and ๔.๕.๕ +
 *  PDPA require access to follow the job, not the rank. */
const EXEC_AREAWIDE_NAV = ['/', '/risk-map', '/area', '/cause', '/school', '/reports', '/settings']

/** A province or district executive chairs the multi-agency team and owns the
 *  case pipeline for their territory, so the child-level screens come back. */
const EXEC_TERRITORY_NAV = [
  '/', '/risk-map', '/area', '/tambon', '/oosc', '/cause', '/plan', '/referral', '/intervention', '/school', '/reports', '/settings',
]

/** สพฐ. answers for its schools and for the children who left them, so it keeps
 *  the registry, the pathway plans, the case tracker and — as the controller of
 *  the student register — the individual child record. What it does not get:
 *  `/referral`, because sending a child to พมจ./สธ./แรงงาน is the area team's
 *  authority rather than the education line's, and `/tambon`, which is the
 *  ศอ.บต. coordination table — สพฐ. reads the area by school, not by tambon.
 *
 *  `/risk-map` is deliberately absent too: `/geo` does everything it does and
 *  adds the เขต tier, layers, filters and the student list, so listing both put
 *  three map pages in one menu. It stays in `EXEC_AREAWIDE_NAV` because it is
 *  the only map an ศอ.บต. account has. */
const OBEC_NAV = [
  '/', '/geo', '/area', '/oosc', '/cause', '/plan', '/intervention', '/school', '/student', '/reports', '/settings',
]

/** The เขต office runs the same education-line work as สพฐ., one tier down: it
 *  reads its own เขต, the districts inside it, the schools in those districts
 *  and the children in those schools. Same two exclusions as `obec` —
 *  `/referral` and `/tambon` belong to the area team, not the education line. */
const ESA_NAV = OBEC_NAV

/** Nav paths each role may access (order preserved from NAV_ITEMS).
 *  For `exec` this is the most restrictive variant — use `navFor(user)`, which
 *  widens it once the account has a territory. */
export const ROLE_NAV: Record<Role, string[]> = {
  exec: EXEC_AREAWIDE_NAV,
  obec: OBEC_NAV,
  esa: ESA_NAV,
  school: ['/', '/oosc', '/plan', '/referral', '/intervention', '/school', '/student', '/reports', '/settings'],
  teacher: ['/', '/plan', '/referral', '/intervention', '/student', '/settings'],
  agency: ['/', '/referral', '/plan', '/oosc', '/reports', '/settings'],
}

/** Roles withheld from this build.
 *
 *  Nothing is deleted: the scope rules, nav lists, demo accounts and every
 *  screen for these seats stay exactly where they are. They are simply not
 *  offered — not in the login picker, not in registration, and not by signing
 *  in with the address directly. Shipping a role a reviewer has not walked
 *  through is how a demo gets judged on a screen nobody meant to show.
 *
 *  Emptying this set brings both back with no other change. */
const HIDDEN_ROLES = new Set<Role>(['exec', 'agency'])

export const isHiddenRole = (role: Role): boolean => HIDDEN_ROLES.has(role)

/** The roles this build offers, in ROLES order. */
export const LOGIN_ROLES: Role[] = ROLES.filter((r) => !HIDDEN_ROLES.has(r))

type NavUser = Pick<User, 'role' | 'provinceKey' | 'districtKey'> | null

/** Menu for this *account* — see the PDPA note at the top of the file. */
export function navFor(user: NavUser): string[] {
  if (!user) return EXEC_AREAWIDE_NAV
  if (user.role === 'exec') {
    return user.provinceKey || user.districtKey ? EXEC_TERRITORY_NAV : EXEC_AREAWIDE_NAV
  }
  return ROLE_NAV[user.role]
}

/** Callers pass real destinations, which carry query strings — `/student?id=x`
 *  and `/area?p=a&d=b` are the same routes as `/student` and `/area`. Comparing
 *  the whole string silently denied every deep link and the navigation just did
 *  nothing, so the pathname is what gets checked. */
export function canAccess(user: NavUser, path: string): boolean {
  const route = path.split(/[?#]/)[0]
  return navFor(user).includes(route)
}

/** May this account do case-level work — open a plan, take a case, record a
 *  visit — or only read it and direct someone else to?
 *
 *  A seat covering the whole area sets policy and moves resources; the case
 *  itself belongs to whoever is accountable for that child. สพฐ. ส่วนกลาง and
 *  ศอ.บต. therefore read every screen and act on none of them, while a
 *  province exec, the เขต office, a school and a teacher all carry real
 *  caseloads. Same principle as the menu — TOR ๔.๕.๕: access follows the job.
 *
 *  This gates *actions*, not visibility. An สพฐ. executive still sees who has
 *  no plan and which อำเภอ is behind; they just do not author the plan. */
export function canWorkCases(user: NavUser): boolean {
  return !isAreaWide(user)
}

/** Roles that may open an individual child's full record. */
export function canSeeChildRecord(role: Role): boolean {
  return role === 'school' || role === 'teacher' || role === 'agency'
}

/** True for a seat covering the whole จชต. area — ศอ.บต. or สพฐ. ส่วนกลาง: an
 *  executive-family account carrying no territory of its own. What the two may
 *  read there still differs (see the PDPA note at the top); this only says the
 *  account is not narrowed to a province or district. */
export function isAreaWide(user: NavUser): boolean {
  if (!user) return true
  if (user.role !== 'exec' && user.role !== 'obec') return false
  return !user.provinceKey && !user.districtKey
}

// Demo accounts. Five roles, six accounts: the executive seat is shown twice
// because its territory — not its title — decides what it may see, and that is
// the point worth demonstrating.
export const DEMO_USERS: (User & { password: string })[] = [
  {
    id: 'u-sbpac',
    name: 'ดร. อับดุลรอฮิม เจ๊ะแว',
    email: 'sbpac@zerodropout.go.th',
    password: 'demo',
    role: 'exec',
    org: 'ศอ.บต.',
  },
  {
    id: 'u-province',
    name: 'นายสมพงษ์ นิเดร์',
    email: 'pattani@zerodropout.go.th',
    password: 'demo',
    role: 'exec',
    provinceKey: 'pattani',
    org: 'ศึกษาธิการจังหวัดปัตตานี',
  },
  {
    id: 'u-obec',
    name: 'ดร. อาดุลย์ พรหมแก้ว',
    email: 'obec@zerodropout.go.th',
    password: 'demo',
    role: 'obec',
    // no territory: สพฐ. ส่วนกลาง reads all three provinces, all 46 pilot
    // schools and every child in them. Give this account a `provinceKey` and
    // the same role becomes a สพม. seat, scoped exactly like a province exec.
    org: 'สพฐ.',
  },
  {
    id: 'u-esa',
    name: 'นายสมชาย แวดาโอะ',
    email: 'esa@zerodropout.go.th',
    password: 'demo',
    role: 'esa',
    // เขต 3 of Pattani — สายบุรี / ไม้แก่น / ทุ่งยางแดง / กะพ้อ. provinceKey is
    // set too so anything that only understands provinces still narrows down.
    provinceKey: 'pattani',
    esaKey: 'pattani-3',
    org: 'สพท.ปัตตานี เขต 3',
  },
  {
    id: 'u-school',
    name: 'นายอิสมาแอ หะยีสาแม',
    email: 'school@zerodropout.go.th',
    password: 'demo',
    role: 'school',
    provinceKey: 'pattani',
    districtKey: 'saiburi',
    // a real pilot-school id from TOR Appendix C — students, cases and the
    // school performance page all join on this
    schoolKey: 'TOR-005',
    org: 'โรงเรียนสายบุรี "แจ้งประชาคาร"',
  },
  {
    id: 'u-teacher',
    // the name has to match a case owner that exists at this school, otherwise
    // "only my caseload" silently widens to the whole school
    name: 'ครูแนะแนว นูรียะ',
    email: 'teacher@zerodropout.go.th',
    password: 'demo',
    role: 'teacher',
    provinceKey: 'pattani',
    districtKey: 'saiburi',
    schoolKey: 'TOR-005',
    ownerName: 'ครูแนะแนว นูรียะ',
    org: 'ครูแนะแนว โรงเรียนสายบุรี "แจ้งประชาคาร"',
  },
  {
    id: 'u-agency',
    name: 'นางสาวซัลมา อาแว',
    email: 'pmj@zerodropout.go.th',
    password: 'demo',
    role: 'agency',
    provinceKey: 'narathiwat',
    agencyId: 'AG-narathiwat-pmj',
    org: 'พมจ. นราธิวาส',
  },
]

/** One demo account per role for the login cards, in ROLES order. */
export const DEMO_BY_ROLE: Record<Role, (User & { password: string })> =
  Object.fromEntries(
    ROLES.map((r) => [r, DEMO_USERS.find((u) => u.role === r)!]),
  ) as Record<Role, User & { password: string }>

/** The territory-scoped executive, offered next to the four role cards so the
 *  province/district view stays one click away. */
export const DEMO_TERRITORY_EXEC = DEMO_USERS.find((u) => u.id === 'u-province')!
