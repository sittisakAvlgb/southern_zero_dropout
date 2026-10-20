import { Suspense, lazy, useMemo } from 'react'
import { useI18n } from '@/i18n/LanguageContext'
import { useScopedData } from '@/auth/scope'
import { ROLE_META } from '@/auth/roles'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { formatNumber } from '@/lib/format'
import { ESA_BY_KEY } from '@/data/esa'

/** หน้าแรกของทุกบทบาทใช้ route เดียวกัน (`/`) แต่แต่ละที่นั่งเห็นแผงคนละชุด
 *  ถ้า import ตรง ๆ ครูที่เปิดหน้า "เคสของฉัน" จะต้องดาวน์โหลดแผงของเขต
 *  ของ ผอ. และการอ่านภาพพื้นที่ (ApexCharts + แผนที่ทั้งประเทศ) ไปด้วยทั้งหมด
 *  ทั้งที่ `navFor()` ปิดไม่ให้เข้าอยู่แล้ว — จึงโหลดเฉพาะแผงของที่นั่งนั้น */
const AreaOverview = lazy(() => import('./overview/AreaOverview'))
const AreaOpsCenter = lazy(() =>
  import('@/components/area/AreaOpsCenter').then((m) => ({ default: m.AreaOpsCenter })),
)
const DirectorHome = lazy(() =>
  import('@/components/ai/DirectorHome').then((m) => ({ default: m.DirectorHome })),
)
const TeacherWorkspace = lazy(() =>
  import('@/components/ai/TeacherWorkspace').then((m) => ({ default: m.TeacherWorkspace })),
)
const ExecutiveBriefing = lazy(() =>
  import('@/components/ai/ExecutiveBriefing').then((m) => ({ default: m.ExecutiveBriefing })),
)

/** ช่วงที่ chunk ของแผงกำลังมา — รูปร่างเดียวกับ skeleton ที่หน้าอื่นใช้
 *  (`SkeletonCard` + `space-y-4`) ไม่มีข้อความ จึงไม่ต้องมีคำแปลสามภาษา
 *  และครูไม่ต้องอ่านอะไรเพิ่มระหว่างรอ */
function PanelFallback() {
  return (
    <div className="space-y-4">
      <SkeletonCard className="h-24" />
      <SkeletonCard className="h-[320px]" />
    </div>
  )
}

export default function SouthernOverview() {
  const { t, lang, pn, pick } = useI18n()
  const th = lang === 'th'
  const { schools, stats, user, isExecutive } = useScopedData()

  const meta = ROLE_META[user?.role ?? 'exec']

  /** What "the area" means for this account, not for the platform. */
  const scopeNote = useMemo(() => {
    // a director's "area" is their school, not the province it stands in
    if (user?.schoolKey) return schools[0]?.name ?? pn(user.provinceKey ?? '')
    if (user?.esaKey && ESA_BY_KEY[user.esaKey]) return pick(ESA_BY_KEY[user.esaKey])
    if (user?.provinceKey) return pn(user.provinceKey)
    return t('app.scopeNote')
  }, [user, schools, pick, pn, t])

  return (
    <div className="animate-page-rise">
      {/* Header — title, who is looking, and what "the area" covers, in one block */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          {/* A teacher's page carries no area read at all (see the note below
              the panel switch), so counting อำเภอ and ตำบล over the top of it
              described a page that is not there. Their heading names the work
              and the one school it happens in. */}
          <h1 className="text-xl font-bold text-ink md:text-2xl">
            {user?.role === 'teacher' ? t('nav.overview.teacher') : user?.role === 'esa' ? scopeNote : t('app.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {user?.role === 'teacher' ? (
              <>
                {user.ownerName ?? user.name}
                {schools[0] ? ` · ${schools[0].name}` : ''}
              </>
            ) : (
              <>
                {/* naming all three provinces beside counts covering four อำเภอ of
                    one เขต is the contradiction an area account reads first */}
                {user?.role === 'esa' ? '' : `${scopeNote} · `}
                <span className="tabular">
                  {stats.districtsCount} {t('geo.districts')} · {stats.tambonsCount}{' '}
                  {t('geo.tambons')} · {formatNumber(schools.length)}{' '}
                  {th ? 'โรงเรียนนำร่อง' : 'pilot schools'}
                </span>
              </>
            )}
          </p>
        </div>
        {/* เขตรู้ว่าตัวเองเป็นใคร (ชื่อเขตคือหัวเรื่องแล้ว) — ป้ายบทบาทเป็นแค่สีเพิ่มบนหน้าที่แน่นอยู่แล้ว */}
        <div className={`${user?.role === 'esa' ? 'hidden' : 'flex'} shrink-0 items-center gap-2 text-xs`}>
          <span
            className="rounded-full px-3 py-1.5 font-medium text-white"
            style={{ background: meta.color }}
          >
            {pick({ th: meta.th, en: meta.en, ms: meta.ms })} ·{' '}
            {pick({ th: meta.scopeTh, en: meta.scopeEn })}
          </span>
        </div>
      </div>

      {/* Each seat gets the panel that matches its job: สพฐ. and ศอ.บต. decide
          policy across provinces, an area office runs a เขต's caseload, a
          principal runs a school, and a teacher works a named list. */}
      {user?.role === 'esa' ? (
        <Suspense fallback={<PanelFallback />}>
          <AreaOpsCenter />
        </Suspense>
      ) : user?.role === 'school' ? (
        <Suspense fallback={<PanelFallback />}>
          <DirectorHome />
        </Suspense>
      ) : user?.role === 'teacher' ? (
        <Suspense fallback={<PanelFallback />}>
          <TeacherWorkspace />
        </Suspense>
      ) : (
        isExecutive && (
          <Suspense fallback={<PanelFallback />}>
            <ExecutiveBriefing />
          </Suspense>
        )
      )}

      {/* A teacher's page ends here. Everything below is the area read — a
          จชต. map, a province comparison, a registry funnel of 117 children
          they cannot open and were never asked to work. Leaving it on gave a
          guidance teacher two different totals under one label and a row of
          drill-downs their own menu bounces. */}

      {/* ผอ. ก็จบที่นี่เช่นกัน — แผนที่ จชต. ภาพรวมรายจังหวัด และทะเบียนเด็กนอกระบบทั้งอำเภอ
          เป็นงานของระดับพื้นที่ เคยทำให้หน้า ผอ. มี "ปัตตานี 9,422 นักเรียน" ใต้ "นักเรียนทั้งโรงเรียน 1,536" */}
      {/* เขตก็จบที่นี่ — แผนที่ จชต. ภาพรวมรายจังหวัด และกราฟระดับพื้นที่อยู่ในหน้าเจาะลึกและแผนที่ (ลิงก์ใน "ข้อมูลเชิงลึก")
          หน้าแรกของเขตต้องตอบว่าพื้นที่ไหนต้องดูแลก่อนและเขตต้องช่วยอย่างไร ไม่ใช่ข้อมูลเพิ่มอีกชุด */}
      {user?.role !== 'teacher' && user?.role !== 'school' && user?.role !== 'esa' && (
        <Suspense fallback={<PanelFallback />}>
          <AreaOverview />
        </Suspense>
      )}
    </div>
  )
}
