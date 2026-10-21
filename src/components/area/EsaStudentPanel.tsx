import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { useI18n } from '@/i18n/LanguageContext'
import { areaRequestStatus, useAreaLog, AREA_ACT_TH, AREA_NEED_TH } from '@/lib/areaLog'
import { TIER_META, crossSchoolPatterns, districtViews, schoolViews, studentInArea } from '@/lib/areaDeskOps'
import type { FollowCase } from '@/lib/followOps'
import { IconChevronRight } from '@/components/icons'

/**
 * กล่องของเขตพื้นที่ (สพท.) บนแฟ้มเด็กหนึ่งคน
 *
 * เดิมบัญชีเขตได้การ์ด "สิ่งที่ต้องทำต่อ" ของครูที่ถอดปุ่มออก จึงอ่าน
 * "นัดเยี่ยมบ้าน" ที่กดอะไรไม่ได้ — ข้อมูลถูก แต่ไม่ใช่งานของคนที่กำลังอ่าน
 *
 * เขตไม่ได้ถือเคส และกล่องนี้ไม่มีปุ่มลงมือกับเคสแม้แต่ปุ่มเดียว (`canWorkCases()`
 * คืน false ให้ esa อยู่แล้ว — ที่นี่ต้องไม่แอบเปิดทางอ้อม) สิ่งที่เขตตอบได้คือ
 * สองคำถามของชั้นตัวเอง: **เคสนี้เป็นเรื่องเฉพาะราย หรือเป็นรูปแบบของโรงเรียน /
 * อำเภอ / เขต** และ **เขตช่วยอะไรได้** แล้วพาไปหน้าของเขตที่ลงมือได้จริง
 * (วางแผนสนับสนุนที่หน้าโรงเรียน · เจาะลึกอำเภอ · มาตรการระดับเขตที่หน้าแรก)
 *
 * ตัวเลขทุกตัวมาจาก `schoolViews()` · `districtViews()` · `crossSchoolPatterns()`
 * ชุดเดียวกับหน้า `/school` · `/area` · หน้าแรกของเขต และส่ง `FollowCase[]` เข้าไป
 * ด้วยเหมือนกัน เพราะ "เกิน SLA" ของเขตนับจาก `FollowCase` ไม่ใช่ `cases.slaBreached`
 * (ดูคอมเมนต์ของ `tally()` ใน `lib/areaDeskOps.ts` — เรื่องนี้พังมาสี่ครั้งแล้ว)
 */
/** รายชื่อโรงเรียนแบบย่อ — ครบหกชื่อบนจอ 375px กินสี่บรรทัดโดยไม่ได้บอกอะไรเพิ่ม */
const names = (xs: string[]) => (xs.length > 3 ? `${xs.slice(0, 3).join(' · ')} และอีก ${xs.length - 3} โรงเรียน` : xs.join(' · '))

export function EsaStudentPanel({ fc, all }: { fc: FollowCase; all: FollowCase[] }) {
  const { dn } = useI18n()
  const nav = useNavigate()
  const { user, districts, schools, students, cases, oosc, referrals } = useScopedData()
  const area = useAreaLog(user?.esaKey)

  const views = useMemo(() => schoolViews(schools, cases, students, all), [schools, cases, students, all])
  const dviews = useMemo(() => districtViews(districts, views, cases, oosc, all), [districts, views, cases, oosc, all])
  const patterns = useMemo(() => crossSchoolPatterns(schools, students, referrals), [schools, students, referrals])

  const sv = views.find((v) => v.s.id === fc.s.schoolKey)
  const dv = dviews.find((v) => v.d.key === fc.s.districtKey)
  const read = useMemo(() => studentInArea(fc, sv, dv, patterns, dn), [fc, sv, dv, patterns, dn])

  /** คำขอที่ค้างอยู่กับเขตของโรงเรียนนี้ — ของเด็กคนนี้ก่อน แล้วจึงของโรงเรียน
   *  (ชุดเดียวกับที่หน้า `/school` และหน้าแรกของเขตนับว่า "รอเขตตัดสินใจ") */
  const schoolReqs = area.requests.filter((r) => r.schoolId === fc.s.schoolKey && !r.done)
  const req = schoolReqs.find((r) => r.childId === fc.s.id) ?? schoolReqs.find((r) => areaRequestStatus(r) === 'new')
  const aboutChild = Boolean(req && req.childId === fc.s.id)
  const waiting = req ? areaRequestStatus(req) === 'new' : false
  /** การสนับสนุนที่เขตส่งไปที่โรงเรียนนี้แล้วและยังไม่ปิด — กันเขตสั่งซ้ำซ้อน */
  const sent = area.actions.find((a) => a.schoolId === fc.s.schoolKey && !a.done)

  return (
    <div className="border-t border-surface-border bg-brand-50/40 p-4 sm:p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand-600">AI สำหรับเขตพื้นที่</p>
      <p className="mt-1 text-[15.5px] font-semibold leading-snug text-ink">{read.headline}</p>
      <p className="mt-1.5 text-[14.5px] leading-snug text-ink-muted">
        <span className="font-semibold text-brand-700">เขตช่วยอะไรได้: </span>
        {read.rec}
      </p>

      {req && (aboutChild || waiting) && (
        <p className={`mt-2 text-[14px] font-semibold leading-snug ${aboutChild && waiting ? 'text-red-700' : 'text-ink'}`}>
          {aboutChild
            ? waiting
              ? `ผอ.${req.schoolName} ยกเรื่องของเด็กคนนี้มาถึงเขตแล้ว (${AREA_NEED_TH[req.need]}) — รอเขตตัดสินใจ`
              : `คำขอของเด็กคนนี้: ${AREA_NEED_TH[req.need]} — เขตตัดสินใจแล้ว งานอยู่ที่โรงเรียน`
            : `โรงเรียนนี้มีคำขอรอเขตตัดสินใจอยู่แล้ว: ${AREA_NEED_TH[req.need]}${req.childName ? ` (เคสของ${req.childName})` : ''}`}
        </p>
      )}
      {sent && (
        <p className="mt-1.5 text-[14px] leading-snug text-ink">
          เขตส่งไปที่โรงเรียนนี้แล้ว: <span className="font-semibold">{sent.acts.map((a) => AREA_ACT_TH[a]).join(' · ')}</span> — {sent.owner} รับผิดชอบฝั่งเขต
        </p>
      )}

      {/* ── โรงเรียนและอำเภอของเด็กคนนี้ — แถวทั้งแถวกดได้ (เป้าใหญ่พอบนมือถือ) ── */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-surface-border bg-white">
        {sv && (
          <Row
            label="โรงเรียนของเด็กคนนี้"
            title={sv.s.name}
            tier={TIER_META[sv.tier].th}
            pill={TIER_META[sv.tier].pill}
            detail={`เกิน SLA ${sv.overdue} จาก ${sv.open} เคสที่เปิดอยู่${sv.unassigned ? ` · ไม่มีผู้รับผิดชอบ ${sv.unassigned}` : ''}`}
            cta="เปิดข้อมูลโรงเรียนและวางแผนสนับสนุน"
            onClick={() => nav(`/school?s=${sv.s.id}`)}
          />
        )}
        {dv && (
          <Row
            label="อำเภอของเด็กคนนี้"
            title={`อำเภอ${dn(dv.d.key)}`}
            tier={TIER_META[dv.tier].th}
            pill={TIER_META[dv.tier].pill}
            detail={`เกิน SLA ${dv.overdue} เคส · ${dv.schools.length} โรงเรียนนำร่อง · ${dv.d.hasDistrictTeam ? 'มีทีมสหวิชาชีพอำเภอ' : 'ยังไม่มีทีมสหวิชาชีพอำเภอ'}`}
            cta="เจาะลึกอำเภอนี้"
            onClick={() => nav(`/area?d=${dv.d.key}`)}
          />
        )}
        {read.pattern && (
          <Row
            label="ปัญหาที่เกิดซ้ำหลายโรงเรียน"
            title={read.pattern.th}
            detail={`พบใน ${read.pattern.schools.length} โรงเรียนของเขต — ${names(read.pattern.schools)}`}
            cta="สร้างมาตรการระดับเขต"
            onClick={() => nav(`/?fold=pattern`)}
          />
        )}
      </div>
    </div>
  )
}

/** แถวหนึ่งพื้นที่ — ชื่อ · ระดับความเร่งด่วน · ตัวเลขชุดเดียวกับหน้าของพื้นที่นั้น · ปลายทาง
 *
 *  ปลายทางเขียนเป็นข้อความอยู่ในแถว ไม่ซ่อนไว้ใน hover (ครูและผู้บริหารบางท่าน
 *  ใช้มือถือหรือจอสัมผัส) ทั้งแถวเป็นปุ่มเดียว จึงกดได้ง่ายบนจอ 375px */
function Row({
  label,
  title,
  tier,
  pill,
  detail,
  cta,
  onClick,
}: {
  label: string
  title: string
  tier?: string
  pill?: string
  detail: string
  cta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-surface-border px-4 py-3.5 text-left last:border-b-0 hover:bg-brand-50/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[15.5px] font-bold text-ink">{title}</span>
          {tier && pill && <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${pill}`}>{tier}</span>}
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-muted">{detail}</span>
        <span className="mt-1 block text-[14px] font-semibold text-brand-700">{cta} →</span>
      </span>
      <IconChevronRight width={18} height={18} className="shrink-0 text-ink-faint" aria-hidden />
    </button>
  )
}
