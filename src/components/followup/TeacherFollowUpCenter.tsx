import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { canWorkCases } from '@/auth/roles'
import { useScopedData } from '@/auth/scope'
import { DirectOnlyNotice } from '@/components/auth/DirectOnlyNotice'
import { useI18n } from '@/i18n/LanguageContext'
import { useSimulatedLoading } from '@/lib/useLoading'
import { assetUrl } from '@/lib/asset'
import {
  ATTN_META,
  FILTERS,
  insightOf,
  type Attn,
  type FollowCase,
  type QuickFilter,
} from '@/lib/followOps'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { IconArrowRight, IconIntervention } from '@/components/icons'
import { useFollowCases } from './useFollowCases'
import { FollowCaseDetail, HealthBadge, RiskBadge, type Sheet } from './FollowCaseDetail'

const MASCOT = assetUrl('ChatBot.png')
type Group = Attn | 'relapse'
const GROUP_TH: Record<Group, string> = { ...Object.fromEntries(Object.entries(ATTN_META).map(([k, v]) => [k, v.th])), relapse: 'ความเสี่ยงกลับมาหลังปิดเคส' } as Record<Group, string>
const GROUP_ORDER: Group[] = ['critical', 'sla', 'relapse', 'rising', 'due', 'stale', 'agency', 'closing', 'normal']
const groupOf = (c: FollowCase): Group => (c.relapse ? 'relapse' : c.attn)

/**
 * ติดตามการช่วยเหลือ สำหรับครู — "ศูนย์ติดตามงานช่วยเหลือนักเรียนของคุณครู"
 *
 * หน้าเดิมเปิดด้วยตัวเลขรวม แถบ pipeline สีไล่ระดับ แล้วตารางเคสพร้อมตัวกรอง
 * ห้าแบบ ปุ่มในเคสคือ "เลื่อนไปขั้นถัดไป" ซึ่งครูไม่รู้ว่าแปลว่าให้ทำอะไร และ
 * ทุกอย่างหายเมื่อรีโหลด ลำดับใหม่ตาม brief: TODAY → PRIORITY → INSIGHT →
 * ACTION → HISTORY ทุกเคสมีเหตุผลที่ต้องดู และปุ่มเดียวที่บอกว่าต้องทำอะไร
 *
 * **เขตใช้หน้านี้ด้วย ในโหมดอ่านอย่างเดียว** — `canWorkCases()` คืน false ให้ esa
 * ทุกปุ่มลงมือจึงปิดเองอยู่แล้ว (`mayAct` ถูกส่งต่อถึงแถวและลิ้นชักครบทุกชั้น)
 * ที่ต้องเปลี่ยนคือ *ถ้อยคำ* เท่านั้น เพราะคำของครูพูดว่า "เคสของคุณ" และ
 * "วันนี้ต้องติดตาม" ซึ่งไม่จริงสำหรับคนที่กำกับดูแลแต่ไม่ได้ถือเคส
 * และแถวต้องบอกโรงเรียน เพราะเขตดูข้ามหลายโรงเรียน
 */
export function TeacherFollowUpCenter() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { user, log, built } = useFollowCases()
  const { schools } = useScopedData()
  const mayAct = canWorkCases(user)
  /** ชื่อโรงเรียนของเด็ก — ใช้เฉพาะที่นั่งกำกับดูแลที่ดูข้ามโรงเรียน */
  const schoolById = new Map(schools.map((s) => [s.id, s.name]))
  const schoolOf = (c: FollowCase) => (mayAct ? undefined : c.s.schoolKey ? schoolById.get(c.s.schoolKey) : undefined)
  const loading = useSimulatedLoading(450)
  const [params, setParams] = useSearchParams()
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const all = 'list' in built ? built.list : []
  const open = all.filter((c) => c.open)
  const today = all.filter((c) => c.today)
  const doneToday = open.filter((c) => c.doneToday)
  const closed = all.filter((c) => !c.open && !c.relapse)

  const [filter, setFilter] = useState<QuickFilter>('today')
  const f = FILTERS.find((x) => x.k === filter)!
  const shown = all.filter(f.test)
  const groups = GROUP_ORDER.map((g) => ({ g, items: shown.filter((c) => groupOf(c) === g) })).filter((x) => x.items.length)

  const [openId, setOpenId] = useState<string | null>(null)
  const [initial, setInitial] = useState<Sheet | undefined>()
  const openCase = (id: string, sheet?: Sheet) => {
    setInitial(sheet)
    setOpenId(id)
  }
  const current = all.find((c) => c.s.id === openId)

  // ลิงก์ตรง /intervention?child=ID เปิดเคสทันที
  useEffect(() => {
    const id = params.get('child')
    if (!id || loading) return
    setOpenId(id)
    params.delete('child')
    setParams(params, { replace: true })
  }, [params, setParams, loading])

  const cta = (c: FollowCase) => {
    const g = c.next.go
    if ('href' in g) nav(g.href)
    else openCase(c.s.id, g as Sheet)
  }

  const first = today[0]
  const counts = (k: QuickFilter) => all.filter(FILTERS.find((x) => x.k === k)!.test).length

  return (
    <div className="animate-page-rise">
      <PageHeader
        icon={<IconIntervention width={22} height={22} />}
        breadcrumb={<Breadcrumb items={[t('app.areaShort'), t('nav.intervention')]} />}
        title={t('iv.title')}
        subtitle={
          mayAct
            ? 'ศูนย์ติดตามงานช่วยเหลือนักเรียนของคุณ — เปิดมาแล้วรู้ว่าวันนี้ต้องช่วยใคร ทำไม และต้องทำอะไร'
            : 'ติดตามว่าเคสในพื้นที่ที่คุณกำกับเดินถึงไหน — เคสไหนค้าง ค้างที่ขั้นไหน และอยู่โรงเรียนใด'
        }
      />

      <DirectOnlyNotice />

      {offline && mayAct && (
        <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-[14px] text-ink" role="status">
          ⚠ ออฟไลน์อยู่ — ยังบันทึกได้ตามปกติ ข้อมูลเก็บไว้ในเครื่องนี้
        </p>
      )}

      {/* ── วันนี้ (เด่นที่สุดของหน้า) ───────────────────── */}
      <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-surface-border bg-white p-4 sm:p-5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <img src={MASCOT} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-surface-muted object-contain p-1" draggable={false} />
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-7/12" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            ) : 'error' in built ? null : (
              <>
                <p className="text-[19px] font-bold leading-snug text-ink">
                  {today.length
                    ? mayAct
                      ? `วันนี้ต้องติดตาม ${today.length} เคส`
                      : `${today.length} เคสที่ถึงกำหนดต้องติดตามวันนี้`
                    : mayAct
                      ? 'เยี่ยมมาก วันนี้ไม่มีเคสเร่งด่วน'
                      : 'วันนี้ไม่มีเคสที่ถึงกำหนดในพื้นที่ที่คุณกำกับ'}
                  {doneToday.length > 0 && <span className="ml-2 text-[14px] font-semibold text-ink-muted">· ทำแล้ว {doneToday.length}</span>}
                </p>
                <p className="mt-0.5 text-[14.5px] leading-relaxed text-ink-muted">
                  {today.length ? insightOf(today) : 'เคสที่เหลืออยู่ในกำหนดทั้งหมด'}
                </p>
              </>
            )}
          </div>
        </div>
        {!loading && first && mayAct && (
          <button
            type="button"
            onClick={() => openCase(first.s.id)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600"
          >
            เริ่มเคสแรก · {first.s.name}
            <IconArrowRight width={16} height={16} />
          </button>
        )}
      </div>

      {/* ── ตัวกรองด่วน — ตัวเลขที่ใช้ตัดสินใจอยู่ในตัวกรองเลย ไม่ซ้ำเป็นการ์ดอีกชุด ── */}
      {!loading && !('error' in built) && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((x) => {
            const n = counts(x.k)
            if (!n && x.k !== 'today' && x.k !== filter) return null
            return (
              <button
                key={x.k}
                type="button"
                onClick={() => setFilter(x.k)}
                aria-pressed={filter === x.k}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] font-medium"
                style={{ borderColor: filter === x.k ? '#2f66f6' : '#e2e8f0', background: filter === x.k ? '#eef3ff' : '#fff', color: filter === x.k ? '#1d4ed8' : '#0f172a' }}
              >
                {/* "เคสของฉันทั้งหมด" เป็นคำของครู — ที่นั่งกำกับดูแลไม่ได้ถือเคสเอง */}
                {x.k === 'all' && !mayAct ? 'เคสทั้งหมดในพื้นที่' : x.th} <span className="font-bold">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : 'error' in built ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-[17px] font-semibold text-red-700">ไม่สามารถโหลดข้อมูลเคสได้</p>
          <p className="mt-1 text-[14px] text-ink">บันทึกที่คุณทำไว้ยังอยู่ครบ ลองโหลดอีกครั้ง</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white">
            ลองอีกครั้ง
          </button>
        </div>
      ) : open.length === 0 && !all.some((c) => c.relapse) ? (
        <div className="rounded-2xl border border-dashed border-surface-border bg-white px-6 py-10 text-center">
          <p className="text-[17px] font-semibold text-ink">ยังไม่มีเคสที่ต้องติดตาม</p>
          <p className="mt-1 text-[14px] text-ink-muted">
            {mayAct
              ? 'เมื่อระบบพบเด็กเสี่ยงในความดูแลของคุณ เคสจะขึ้นที่นี่พร้อมบอกว่าต้องทำอะไร'
              : 'เมื่อโรงเรียนในพื้นที่เปิดเคส จะเห็นที่นี่ว่าเคสเดินถึงขั้นไหนและค้างที่ใด'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {shown.length === 0 && (
            <div className="rounded-2xl bg-green-50 px-5 py-6 text-center">
              <p className="text-[17px] font-bold text-green-800">{filter === 'today' ? '🎉 เยี่ยมมาก วันนี้ไม่มีเคสเร่งด่วน' : 'ไม่มีเคสในกลุ่มนี้'}</p>
              {filter === 'today' && (
                <p className="mt-1 text-[14px] text-ink">ดูเคสทั้งหมดได้จากตัวกรอง "{mayAct ? 'เคสของฉันทั้งหมด' : 'เคสทั้งหมดในพื้นที่'}"</p>
              )}
            </div>
          )}
          {groups.map(({ g, items }) => (
            <section key={g}>
              <h2 className={`mb-2 text-[15px] font-bold ${g === 'critical' || g === 'sla' ? 'text-red-700' : 'text-ink'}`}>
                {GROUP_TH[g]} <span className="font-medium text-ink-faint">· {items.length} เคส</span>
              </h2>
              <CaseList items={items} mayAct={mayAct} schoolOf={schoolOf} onOpen={(id) => openCase(id)} onCta={cta} />
            </section>
          ))}

          {filter === 'today' && doneToday.length > 0 && (
            <Fold title={`ทำแล้ววันนี้ · ${doneToday.length}`}>
              <CaseList items={doneToday} mayAct={false} schoolOf={schoolOf} onOpen={(id) => openCase(id)} onCta={cta} />
            </Fold>
          )}
          {closed.length > 0 && (
            <Fold title={`ปิดเคสแล้ว · ${closed.length}`}>
              <CaseList items={closed} mayAct={false} schoolOf={schoolOf} onOpen={(id) => openCase(id)} onCta={cta} />
            </Fold>
          )}

          {/* ที่นั่งกำกับดูแลเคยได้ตารางเต็มเป็นหน้าหลัก — ยังต้องมีทางเข้า
              ไม่งั้นการค้นหา ตัวกรอง และส่งออก CSV หายไปเฉย ๆ */}
          {!mayAct && (
            <button
              type="button"
              onClick={() => nav('/intervention?view=full')}
              className="rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-semibold text-ink hover:border-brand-300"
            >
              เปิดตารางแบบเต็ม (ค้นหา · กรอง · ส่งออก CSV)
            </button>
          )}
        </div>
      )}

      {current && (
        <FollowCaseDetail
          key={`${current.s.id}-${initial ? JSON.stringify(initial) : ''}`}
          c={current}
          entries={log.entries.filter((e) => e.childId === current.s.id)}
          log={log}
          user={user}
          mayAct={mayAct}
          initial={initial}
          onClose={() => {
            setOpenId(null)
            setInitial(undefined)
          }}
        />
      )}
    </div>
  )
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-surface-border bg-white px-4 py-3">
      <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
        <span className="inline-flex items-center gap-1.5">
          <IconArrowRight width={14} height={14} className="transition-transform group-open:rotate-90" />
          {title}
        </span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

const COLS = 'xl:grid xl:grid-cols-[minmax(170px,0.9fr)_minmax(240px,1.5fr)_minmax(190px,1.1fr)_230px] xl:items-center xl:gap-x-6'

/** รายการเคส — จอใหญ่เป็นแถวแบ่งคอลัมน์ (นักเรียน · ทำไมต้องดู · ถัดไป · ปุ่ม) ใช้ความกว้างจอ
 *  มือถือเรียงลงเป็นการ์ด · เดิมการ์ดกว้างเต็มจอแต่เนื้อหาอยู่ซ้ายหนึ่งในสาม */
function CaseList({ items, mayAct, schoolOf, onOpen, onCta }: { items: FollowCase[]; mayAct: boolean; schoolOf: (c: FollowCase) => string | undefined; onOpen: (id: string) => void; onCta: (c: FollowCase) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border bg-white">
      <div className={`hidden border-b border-surface-border bg-surface-muted/60 px-4 py-2 text-[12.5px] font-semibold text-ink-muted ${COLS}`}>
        <span>นักเรียน</span>
        <span>ทำไมต้องดู</span>
        <span>ขั้นถัดไป</span>
        <span />
      </div>
      <ul className="divide-y divide-surface-border">
        {items.map((c) => (
          <CaseRow key={c.s.id} c={c} mayAct={mayAct} school={schoolOf(c)} onOpen={() => onOpen(c.s.id)} onCta={() => onCta(c)} />
        ))}
      </ul>
    </div>
  )
}

function CaseRow({ c, mayAct, school, onOpen, onCta }: { c: FollowCase; mayAct: boolean; school?: string; onOpen: () => void; onCta: () => void }) {
  const why = c.doneToday ? 'บันทึกแล้ววันนี้' : c.reasons[0] ?? c.sla.text
  // เหตุผลแรกพูดเรื่อง SLA อยู่แล้วก็ไม่ต้องบอกซ้ำในบรรทัดเวลา
  const slaInWhy = why.includes('SLA')
  const updated = c.updatedDaysAgo === 0 ? 'อัปเดตวันนี้' : `อัปเดต ${c.updatedDaysAgo} วันก่อน`
  return (
    <li className={`px-4 py-3.5 ${COLS}`}>
      <button type="button" onClick={onOpen} className="block min-w-0 text-left">
        <span className="block text-[16px] font-bold leading-snug text-ink">{c.s.name}</span>
        {/* เขตดูข้ามโรงเรียน ชื่อเด็กอย่างเดียวจึงไม่บอกว่าต้องไปหนุนที่ไหน */}
        {school && <span className="mt-0.5 block text-[13px] text-ink-muted">{school}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <RiskBadge c={c} />
          <HealthBadge c={c} />
        </span>
      </button>
      <div className="mt-2 min-w-0 xl:mt-0">
        <p className={`text-[14.5px] leading-snug ${slaInWhy ? 'font-semibold text-red-700' : 'text-ink'}`}>{why}</p>
        {/* บรรทัดเวลาเฉพาะข้อมูลที่เหตุผลยังไม่ได้บอก */}
        {(!why.includes('อัปเดต') || (!slaInWhy && c.sla.level !== 'ok')) && (
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {[!why.includes('อัปเดต') ? updated : '', !slaInWhy && c.sla.level !== 'ok' ? c.sla.text : ''].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <p className="mt-2 min-w-0 text-[14.5px] leading-snug text-ink xl:mt-0">
        <span className="text-ink-muted xl:hidden">ถัดไป: </span>
        <span className="font-semibold">{c.next.th}</span>
      </p>
      <div className="mt-3 flex gap-2 xl:mt-0 xl:w-auto xl:justify-end">
        {mayAct && (
          <button type="button" onClick={onCta} className="flex-1 whitespace-nowrap rounded-xl bg-brand-500 px-4 py-2.5 text-[14.5px] font-semibold text-white sm:flex-none">
            {c.next.cta}
          </button>
        )}
        <button type="button" onClick={onOpen} className="whitespace-nowrap rounded-xl border border-surface-border bg-white px-4 py-2.5 text-[14.5px] font-medium text-ink">
          ดูเคส
        </button>
      </div>
    </li>
  )
}
