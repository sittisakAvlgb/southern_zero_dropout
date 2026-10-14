import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useScopedData } from '@/auth/scope'
import { canWorkCases } from '@/auth/roles'
import { useI18n } from '@/i18n/LanguageContext'
import { applyLog, applyPlans, lastLoggedMap, useCaseLog } from '@/lib/caseLog'
import { useSimulatedLoading } from '@/lib/useLoading'
import { assetUrl } from '@/lib/asset'
import {
  ATTN_META,
  buildFollowCase,
  FILTERS,
  HEALTH_META,
  insightOf,
  sortFollow,
  type Attn,
  type FollowCase,
  type QuickFilter,
} from '@/lib/followOps'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader, Breadcrumb } from '@/components/ui/PageHeader'
import { IconArrowRight, IconIntervention } from '@/components/icons'
import { useRefCases } from '@/components/referrals/useRefCases'
import { FollowCaseDetail, HealthBadge, RiskBadge, SLA_TONE, type Sheet } from './FollowCaseDetail'

const MASCOT = assetUrl('ChatBot.png')
type Group = Attn | 'relapse'
const GROUP_TH: Record<Group, string> = { ...Object.fromEntries(Object.entries(ATTN_META).map(([k, v]) => [k, v.th])), relapse: 'ความเสี่ยงกลับมาหลังปิดเคส' } as Record<Group, string>
const GROUP_ORDER: Group[] = ['critical', 'sla', 'relapse', 'rising', 'due', 'stale', 'agency', 'closing', 'normal']
const GROUP_ICON: Record<Group, string> = { critical: '🔴', sla: '🔴', relapse: '🟠', rising: '🟠', due: '🟡', stale: '🟡', agency: '🔵', closing: '🟢', normal: '⚪' }
const groupOf = (c: FollowCase): Group => (c.relapse ? 'relapse' : c.attn)

/**
 * ติดตามการช่วยเหลือ สำหรับครู — "ศูนย์ติดตามงานช่วยเหลือนักเรียนของคุณครู"
 *
 * หน้าเดิมเปิดด้วยตัวเลขรวม แถบ pipeline สีไล่ระดับ แล้วตารางเคสพร้อมตัวกรอง
 * ห้าแบบ ปุ่มในเคสคือ "เลื่อนไปขั้นถัดไป" ซึ่งครูไม่รู้ว่าแปลว่าให้ทำอะไร และ
 * ทุกอย่างหายเมื่อรีโหลด ลำดับใหม่ตาม brief: TODAY → PRIORITY → INSIGHT →
 * ACTION → HISTORY ทุกเคสมีเหตุผลที่ต้องดู และปุ่มเดียวที่บอกว่าต้องทำอะไร
 */
export function TeacherFollowUpCenter() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { user, students, cases, referrals, plans } = useScopedData()
  const log = useCaseLog(user?.id)
  const mayAct = canWorkCases(user)
  const loading = useSimulatedLoading(450)
  const [params, setParams] = useSearchParams()
  const [retry, setRetry] = useState(0)
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

  const now = useMemo(() => Date.now(), [log]) // eslint-disable-line react-hooks/exhaustive-deps
  const roster = useMemo(() => students.map((s) => applyLog(s, log)), [students, log])
  const refs = useRefCases(user, roster, referrals, log, now)
  const planned = useMemo(() => new Set(applyPlans(plans, log).map((p) => p.childId)), [plans, log])

  const built = useMemo((): { list: FollowCase[] } | { error: true } => {
    try {
      const lastLogged = lastLoggedMap(log)
      // เคสเชื่อมกับเด็กด้วยชื่อ — เหมือนหน้าเคสของฉัน (ดู teacherOps)
      const byName = new Map(cases.map((c) => [c.studentName, c]))
      const list = roster.map((s) =>
        buildFollowCase({
          s,
          record: byName.get(s.name),
          entries: log.entries.filter((e) => e.childId === s.id),
          lastLogged: lastLogged[s.id],
          refs: refs.filter((r) => r.childId === s.id),
          hasPlan: planned.has(s.id),
        }),
      )
      return { list: sortFollow(list) }
    } catch {
      return { error: true }
    }
    // retry บังคับคำนวณใหม่เมื่อครูกด "ลองอีกครั้ง"
  }, [roster, cases, log, refs, planned, retry]) // eslint-disable-line react-hooks/exhaustive-deps

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
        subtitle="ศูนย์ติดตามงานช่วยเหลือนักเรียนของคุณ — เปิดมาแล้วรู้ว่าวันนี้ต้องช่วยใคร ทำไม และต้องทำอะไร"
      />

      {offline && (
        <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-[14px] text-ink" role="status">
          ⚠ ออฟไลน์อยู่ — ยังบันทึกได้ตามปกติ ข้อมูลเก็บไว้ในเครื่องนี้
        </p>
      )}

      {/* ── วันนี้ (เด่นที่สุดของหน้า) ───────────────────── */}
      <div className="mb-4 rounded-3xl border-2 border-brand-200 bg-gradient-to-b from-brand-50/80 to-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <img src={MASCOT} alt="" className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-card" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">สิ่งที่ต้องทำวันนี้</p>
            {loading ? (
              <div className="mt-1.5 space-y-2">
                <Skeleton className="h-6 w-7/12" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            ) : 'error' in built ? null : (
              <>
                <p className="mt-0.5 text-[20px] font-bold leading-snug text-ink">
                  {today.length ? `วันนี้ต้องติดตาม ${today.length} เคส` : 'เยี่ยมมาก วันนี้ไม่มีเคสเร่งด่วน'}
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">
                  {today.length ? insightOf(today) : `ทำแล้ววันนี้ ${doneToday.length} เคส · เคสที่เหลืออยู่ในกำหนดทั้งหมด`}
                </p>
                {doneToday.length > 0 && today.length > 0 && (
                  <p className="mt-1 text-[14px] font-semibold text-green-700">✓ ทำแล้ววันนี้ {doneToday.length} เคส</p>
                )}
              </>
            )}
          </div>
        </div>
        {!loading && first && mayAct && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => openCase(first.s.id)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600"
            >
              เริ่มติดตามเคสแรก · {first.s.name}
              <IconArrowRight width={16} height={16} />
            </button>
          </div>
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
                {x.th} <span className="font-bold">{n}</span>
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
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="mt-4 rounded-xl bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white">
            ลองอีกครั้ง
          </button>
        </div>
      ) : open.length === 0 && !all.some((c) => c.relapse) ? (
        <div className="rounded-2xl border border-dashed border-surface-border bg-white px-6 py-10 text-center">
          <p className="text-[17px] font-semibold text-ink">ยังไม่มีเคสที่ต้องติดตาม</p>
          <p className="mt-1 text-[14px] text-ink-muted">เมื่อระบบพบเด็กเสี่ยงในความดูแลของคุณ เคสจะขึ้นที่นี่พร้อมบอกว่าต้องทำอะไร</p>
        </div>
      ) : (
        <div className="space-y-5">
          {shown.length === 0 && (
            <div className="rounded-2xl bg-green-50 px-5 py-6 text-center">
              <p className="text-[17px] font-bold text-green-800">{filter === 'today' ? '🎉 เยี่ยมมาก วันนี้ไม่มีเคสเร่งด่วน' : 'ไม่มีเคสในกลุ่มนี้'}</p>
              {filter === 'today' && <p className="mt-1 text-[14px] text-ink">ดูเคสทั้งหมดได้จากตัวกรอง "เคสของฉันทั้งหมด"</p>}
            </div>
          )}
          {groups.map(({ g, items }) => (
            <section key={g}>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
                <span aria-hidden>{GROUP_ICON[g]}</span>
                {GROUP_TH[g]}
                <span className="font-medium text-ink-faint">· {items.length} เคส</span>
              </h2>
              <ul className="space-y-2">
                {items.map((c) => (
                  <CaseCard key={c.s.id} c={c} mayAct={mayAct} onOpen={() => openCase(c.s.id)} onCta={() => cta(c)} />
                ))}
              </ul>
            </section>
          ))}

          {filter === 'today' && doneToday.length > 0 && (
            <Fold title={`ทำแล้ววันนี้ · ${doneToday.length}`}>
              {doneToday.map((c) => (
                <CaseCard key={c.s.id} c={c} mayAct={false} onOpen={() => openCase(c.s.id)} onCta={() => cta(c)} />
              ))}
            </Fold>
          )}
          {closed.length > 0 && (
            <Fold title={`ปิดเคสแล้ว · ${closed.length}`}>
              {closed.map((c) => (
                <CaseCard key={c.s.id} c={c} mayAct={false} onOpen={() => openCase(c.s.id)} onCta={() => cta(c)} />
              ))}
            </Fold>
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
      <ul className="mt-2 space-y-2">{children}</ul>
    </details>
  )
}

/** การ์ดเคส — ชื่อ · ความเสี่ยง · สุขภาพเคส · เหตุผล · อัปเดตล่าสุด · SLA · ขั้นถัดไป · ปุ่มหลักปุ่มเดียว */
function CaseCard({ c, mayAct, onOpen, onCta }: { c: FollowCase; mayAct: boolean; onOpen: () => void; onCta: () => void }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-surface-border bg-white">
      <div className="flex">
        <div className="min-w-0 flex-1 px-4 py-3.5">
          <button type="button" onClick={onOpen} className="block w-full text-left">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[16.5px] font-bold text-ink">{c.s.name}</span>
              <RiskBadge c={c} />
              <HealthBadge c={c} />
            </div>
            <p className="mt-1.5 text-[14.5px] font-medium leading-snug text-ink">{c.doneToday ? '✓ บันทึกแล้ววันนี้' : c.because}</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              อัปเดตล่าสุด {c.updatedDaysAgo === 0 ? 'วันนี้' : `${c.updatedDaysAgo} วันก่อน`} ·{' '}
              <span className="font-semibold" style={{ color: SLA_TONE[c.sla.level] }}>
                {c.sla.level === 'breach' ? '⚠ ' : c.sla.level === 'near' ? '⏰ ' : ''}
                {c.sla.text}
              </span>
            </p>
            <p className="mt-1.5 text-[14.5px] leading-snug text-ink">
              <span className="text-ink-muted">ถัดไป:</span> <span className="font-semibold">{c.next.th}</span>
            </p>
          </button>
          {mayAct && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onCta} className="flex-1 rounded-xl bg-brand-500 px-4 py-3 text-[15px] font-semibold text-white shadow-card sm:flex-none">
                {c.next.cta}
              </button>
              <button type="button" onClick={onOpen} className="rounded-xl border border-surface-border bg-white px-4 py-3 text-[14.5px] font-medium text-ink">
                ดูเคส
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
