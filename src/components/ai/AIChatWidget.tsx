import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/LanguageContext'
import { useAuth } from '@/auth/AuthContext'
import { ROLE_META, canAccess, canWorkCases } from '@/auth/roles'
import { overviewStats, scopedCases, scopedDistricts, scopedOosc, scopedSchools, scopedStudents } from '@/auth/scope'
import { esaViews } from '@/lib/obecOps'
import { districtViews, schoolViews } from '@/lib/areaDeskOps'
import { FILTERS } from '@/lib/followOps'
import { useFollowCases } from '@/components/followup/useFollowCases'
import { caseAnswer } from './caseAnswer'
import { useDirectorWork } from '@/components/director/useDirectorWork'
import { oosSplit } from '@/lib/oos'
import { formatNumber } from '@/lib/format'
import { RISK_COLOR } from '@/lib/risk'
import {
  buildSystemPrompt,
  getModel,
  localAnswer,
  serverHasKey,
  streamAnswer,
  type ChatMsg,
} from '@/lib/ai'
import { IconArrowRight, IconChevronRight, IconClose, IconSend } from '@/components/icons'
import { assetUrl } from '@/lib/asset'

/** the platform's own mascot — public/ChatBot.png, copied from assets/image */
const MASCOT = assetUrl('ChatBot.png')

/** คำถามตั้งต้น แยกตามว่าบัญชีนี้ "ทำงานกับเด็กรายคน" หรือ "กำกับดูแลพื้นที่"
 *
 *  เดิมมีชุดเดียวใช้กับทุกบทบาท และชุดนั้นเขียนไว้สำหรับผู้บริหาร — "พื้นที่ไหน
 *  เสี่ยงสูงสุด" · "โรงเรียนไหนต้องตามด่วน" · "สรุปตัวเลขสำหรับรายงาน" ครูที่
 *  ดูแลเด็กสิบสองคนในโรงเรียนเดียวไม่เคยถามคำถามพวกนี้ และเมื่อครูเป็นผู้ใช้
 *  หลักของระบบ ช่องถามตอบที่เสนอคำถามของคนอื่นคือช่องที่ครูจะไม่แตะเลย */
const CASEWORK_CHIPS = [
  { th: 'วันนี้ต้องตามใครก่อน', en: 'Who should I chase first today' },
  { th: 'ทำไมเด็กคนนี้ถึงเสี่ยง', en: 'Why is this child at risk' },
  { th: 'ควรช่วยเด็กคนนี้อย่างไร', en: 'How should I help this child' },
  { th: 'ใครขาดเรียนต่อเนื่องบ้าง', en: 'Who has been absent repeatedly' },
  { th: 'เคสไหนยังไม่ได้ลงมือ', en: 'Which cases have had no action' },
  { th: 'เคสไหนปิดได้แล้ว', en: 'Which cases can be closed' },
]

const OVERSIGHT_CHIPS = [
  { th: 'พื้นที่ไหนเสี่ยงสูงสุด', en: 'Which areas carry the most risk' },
  { th: 'สาเหตุหลักคืออะไร', en: 'What is driving it' },
  { th: 'เคสเกิน SLA มีกี่เคส', en: 'How many cases are overdue' },
  { th: 'สัปดาห์นี้ควรลงพื้นที่ที่ไหน', en: 'Where to visit this week' },
  { th: 'โรงเรียนไหนต้องตามด่วน', en: 'Which school needs chasing' },
  { th: 'สรุปตัวเลขสำหรับรายงาน', en: 'Numbers for a report' },
]

/** ผอ. ทำงานกับเคสเหมือนครู แต่งานหลักคือการปลดอุปสรรคที่ครูทำเองไม่ได้
 *  — อนุมัติแผน ส่งต่อหน่วยงาน หาคนช่วย ชุดนี้จึงเปิดด้วย "อะไรรอ ผอ. อยู่"
 *  แล้วค่อยเห็นเคสรายคน เดิม ผอ. ได้ชุดของครูมาทั้งชุด รวม "ทำไมเด็กคนนี้..."
 *  ที่ ผอ. ไม่ได้เปิดเด็กคนไหนอยู่ */
const DIRECTOR_CHIPS = [
  { th: 'อะไรรอ ผอ. อยู่บ้าง', en: 'What is waiting on me' },
  { th: 'ครูขอให้ช่วยอะไร', en: 'What are teachers asking for' },
  { th: 'เคสไหนเกิน SLA', en: 'Which cases are past SLA' },
  { th: 'เคสไหนยังไม่ได้ลงมือ', en: 'Which cases have had no action' },
  { th: 'ใครขาดเรียนต่อเนื่องบ้าง', en: 'Who has been absent repeatedly' },
  { th: 'เคสไหนปิดได้แล้ว', en: 'Which cases can be closed' },
]

/** สพฐ. และเขตกำกับดูแล ไม่ได้ลงพื้นที่เอง (`canWorkCases()` คืน false ให้ทั้งคู่)
 *  คำถาม "สัปดาห์นี้ควรลงพื้นที่ที่ไหน" จึงเป็นคำถามของคนอื่น และ "พื้นที่"
 *  ลอย ๆ ก็ไม่ใช่หน่วยที่ทั้งสองสั่งการ — สพฐ. คิดเป็นเขต เขตคิดเป็นอำเภอ */
const OBEC_CHIPS = [
  { th: 'เขตไหนต้องหนุนก่อน', en: 'Which area office needs support first' },
  { th: 'สาเหตุหลักคืออะไร', en: 'What is driving it' },
  { th: 'เคสเกิน SLA มีกี่เคส', en: 'How many cases are overdue' },
  { th: 'โรงเรียนไหนต้องตามด่วน', en: 'Which school needs chasing' },
  { th: 'เด็กนอกระบบยังไม่มีแผนกี่คน', en: 'How many out-of-school children have no plan' },
  { th: 'สรุปตัวเลขสำหรับรายงาน', en: 'Numbers for a report' },
]

const ESA_CHIPS = [
  { th: 'อำเภอไหนต้องดูก่อน', en: 'Which district needs attention first' },
  { th: 'สาเหตุหลักคืออะไร', en: 'What is driving it' },
  { th: 'เคสเกิน SLA มีกี่เคส', en: 'How many cases are overdue' },
  { th: 'โรงเรียนไหนต้องตามด่วน', en: 'Which school needs chasing' },
  { th: 'เด็กนอกระบบยังไม่มีแผนกี่คน', en: 'How many out-of-school children have no plan' },
  { th: 'สรุปตัวเลขสำหรับรายงาน', en: 'Numbers for a report' },
]

/** Numbers are the payload of every answer, so they get the tabular treatment
 *  instead of sitting inside a wall of prose. */
function AnswerLine({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,.]*%?)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^\d[\d,.]*%?$/.test(p) ? (
          <span key={i} className="tabular font-bold text-ink">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

/** three dots, walking — only shown while a real stream is in flight */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-brand-400"
          animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

function Mascot({ size, className = '' }: { size: number; className?: string }) {
  return (
    <img
      src={MASCOT}
      alt=""
      width={size}
      height={size}
      className={`select-none object-contain ${className}`}
      draggable={false}
    />
  )
}

export function AIChatWidget() {
  const { t, lang, pn } = useI18n()
  const { user } = useAuth()
  const nav = useNavigate()
  const th = lang === 'th'

  const [open, setOpen] = useState(false)
  const [realAI, setRealAI] = useState(false) // true when a server key is configured
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    serverHasKey().then(setRealAI)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  /** what this panel can see — stated so the figures cannot be mistaken for
   *  area-wide ones when the account only covers a district or a school */
  const scopeLine = useMemo(() => {
    if (!user) return th ? 'พื้นที่ จชต.' : 'The three provinces'
    const meta = ROLE_META[user.role]
    const where = user.provinceKey
      ? pn(user.provinceKey)
      : th
        ? 'จชต. ทั้งพื้นที่'
        : 'All three provinces'
    return `${where} · ${th ? meta.shortTh : meta.shortEn}`
  }, [user, pn, th])

  /** first destination this account can actually open, so no row is a dead end */
  const firstAllowed = (...paths: string[]) =>
    paths.find((p) => !user || canAccess(user, p)) ?? '/'

  /** ครูและ ผอ. ทำงานกับเด็กรายคน ที่เหลือกำกับดูแลพื้นที่ — คนละคำถาม
   *  คนละตัวเลข ใช้ `canWorkCases` ที่มีอยู่แล้วแทนการไล่เช็กชื่อ role
   *  จะได้ไม่ต้องตามแก้ทุกครั้งที่เพิ่มบทบาทใหม่ */
  const caseworker = canWorkCases(user) && user?.role !== 'exec'
  const chips = caseworker
    ? user?.role === 'school'
      ? DIRECTOR_CHIPS
      : CASEWORK_CHIPS
    : user?.role === 'obec'
      ? OBEC_CHIPS
      : user?.role === 'esa'
        ? ESA_CHIPS
        : OVERSIGHT_CHIPS
  const work = useDirectorWork()

  /** "เคสเกิน SLA" ของเขตนับจาก `FollowCase` (รวมการส่งต่อที่เกิน
   *  กำหนดด้วย) ไม่ใช่ `cases.slaBreached` — หน้าแรกของเขต ป้ายบนเมนู
   *  และหน้าติดตามการช่วยเหลือนับแบบนั้นหมด (81) ขะที่กล่องนี้บอก 71
   *  การคุยกันเรื่องเดียวหน้าเดียว สองตัวเลข คือสิ่งที่ทำให้คนหยุดเชื่อระบบ
   *
   *  สพฐ. ไม่เข้าเกดนี้ เพราะหน้าแรกของ สพฐ. กับแถบ AI บน /intervention นับ
   *  จาก `cases` ทั้งเก้าเขต (339) — คนละหน่วย คนละชุดข้อมูล เหมือนที่ Sidebar ทำ */
  const { built: followBuilt } = useFollowCases()
  const followList = 'list' in followBuilt ? followBuilt.list : []
  const slaTest = FILTERS.find((f) => f.k === 'sla')!.test
  const followOverdue = followList.filter(slaTest).length
  /** นับด้วยตัวกรองด่วนชุดเดียวกับที่หน้าติดตามการช่วยเหลือโชว์เป็นชิป */
  const followCount = (k: 'today' | 'sla' | 'high' | 'parent' | 'all') =>
    followList.filter(FILTERS.find((f) => f.k === k)!.test).length
  /** คำตอบรายอำเภอของเขตต้องนับเกิน SLA จากชุดเดียวกับหน้าแรกและป้ายเมนู
   *  บทบาทอื่นส่ง undefined ไป localAnswer จะนับจาก cases ตามเดิม */
  const esaFollow = user?.role === 'esa' || user?.role === 'obec' ? followList : undefined

  /** The opening message carries real numbers, so saying hello is also useful.
   *  Only built while the panel is open — it walks the scoped datasets. */
  const brief = useMemo(() => {
    if (!open) return []
    const stats = overviewStats(user)
    const cases = scopedCases(user)
    const split = oosSplit({
      oosCount: stats.dropout,
      reengagedCount: stats.reengaging,
      outcomeCount: stats.returned,
    })
    const overdue = cases.filter((c) => c.slaBreached).length

    // ครู / ผอ. ทำงานกับเด็กที่ตัวเองรับผิดชอบ ตัวเลขเปิดห้องจึงต้องเป็นเคส
    // ของเขา ไม่ใช่ทะเบียนเด็กนอกระบบทั้งอำเภอ — นอกจากไม่ใช่งานของเขาแล้ว
    // ครูยังไม่มี /oosc ในเมนูด้วย การสรุปตัวเลขนั้นให้ดูจึงเป็นการคืนสิ่งที่
    // เมนูตั้งใจปิดไว้
    // ผอ. — เมนูของ ผอ. ไม่มีหน้าติดตามการช่วยเหลือ (ถูกซ่อนไว้) งานของ ผอ.
    // คือคิวที่รอการอนุมัติ ตัวเลขเปิดห้องจึงเป็นชุดเดียวกับป้ายบนเมนูของเขา
    // (`useDirectorWork`) ไม่ใช่เคสดิบ — เดิมบอก "เคสเลยกำหนด 13" ขณะที่
    // คำตอบในห้องเดียวกันบอก 14 จาก 18 เคส
    if (user?.role === 'school' && work) {
      const sla = followCount('sla')
      return [
        {
          key: 'decisions',
          label: th ? 'เรื่องที่รอการตัดสินใจ' : 'Waiting on your decision',
          value: work.decisions,
          tone: (work.decisions > 0 ? RISK_COLOR.critical : RISK_COLOR.normal) as string | undefined,
          to: firstAllowed('/decisions', '/'),
        },
        {
          key: 'plans',
          label: th ? 'เส้นทางโอกาสที่รออนุมัติ' : 'Plans to approve',
          value: work.plans,
          tone: undefined as string | undefined,
          to: firstAllowed('/plan', '/'),
        },
        {
          key: 'refs',
          label: th ? 'การส่งต่อที่รอ ผอ.' : 'Referrals waiting',
          value: work.referrals,
          tone: undefined as string | undefined,
          to: firstAllowed('/referral', '/'),
        },
        {
          key: 'oosc',
          label: th ? 'เด็กนอกระบบที่รอ ผอ.' : 'Out-of-school children waiting',
          value: work.oosc,
          tone: undefined as string | undefined,
          to: firstAllowed('/oosc', '/student', '/'),
        },
        {
          key: 'sla',
          label: th ? 'เคสเกิน SLA ในโรงเรียน' : 'Cases past SLA at your school',
          value: sla,
          tone: sla > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
          to: firstAllowed('/student', '/'),
        },
      ]
    }

    // ครู — ห้าสิ่งนี้คือชิปตัวกรองด่วนของหน้าติดตามการช่วยเหลือเป๊ะ ตรงตัว
    // ต่อตัว ครูเปิดช่องถามจากหน้าไหนก็ไม่เจอเลขที่เถียงกัน
    //
    // เดิมนับจากทะเบียนนักเรียนดิบ ได้ "เคสเลยกำหนด 7 · รอผู้ปกครอง 8"
    // ขณะที่หน้าเดียวกันบอก เกิน SLA 8 · รอผู้ปกครอง 6
    if (caseworker) {
      const today = followCount('today')
      const sla = followCount('sla')
      const high = followCount('high')
      const parent = followCount('parent')
      return [
        {
          key: 'mine',
          label: th ? 'เคสที่เปิดอยู่' : 'Open cases',
          value: followCount('all'),
          tone: undefined as string | undefined,
          to: firstAllowed('/intervention', '/student', '/'),
        },
        {
          key: 'today',
          label: th ? 'วันนี้ต้องติดตาม' : 'Due today',
          value: today,
          tone: today > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
          to: firstAllowed('/intervention', '/student', '/'),
        },
        {
          key: 'sla',
          label: th ? 'เกิน SLA' : 'Past SLA',
          value: sla,
          tone: sla > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
          to: firstAllowed('/intervention', '/student', '/'),
        },
        {
          key: 'high',
          label: th ? 'เสี่ยงสูงและวิกฤต' : 'High and critical risk',
          value: high,
          tone: high > 0 ? RISK_COLOR.high : RISK_COLOR.normal,
          to: firstAllowed('/student', '/'),
        },
        {
          key: 'parent',
          label: th ? 'รอผู้ปกครอง' : 'Waiting on a guardian',
          value: parent,
          tone: parent > 0 ? RISK_COLOR.watch : RISK_COLOR.normal,
          to: firstAllowed('/student', '/'),
        },
      ]
    }

    // เขตกำกับอำเภอและโรงเรียน ตัวเลขเปิดห้องจึงเป็นสี่ตัวเดียวกับหน้าแรก
    // ของเขต (AreaOpsCenter) — คนที่เปิดช่องถามคือคนที่เพิ่งอ่านหน้านั้นอยู่
    // เลขคนละหน่วยแปลว่า "ตอบจากข้อมูลในระบบ" เชื่อไม่ได้ ไม่ใช่แค่อ่านยาก
    if (user?.role === 'esa') {
      const sv = schoolViews(scopedSchools(user), cases, scopedStudents(user), followList)
      const dv = districtViews(scopedDistricts(user), sv, cases, scopedOosc(user), followList)
      const urgentAreas = dv.filter((v) => v.tier === 'urgent').length
      const supportSchools = sv.filter((v) => v.tier === 'urgent' || v.tier === 'follow').length
      const oosNoPlan = scopedOosc(user).filter(
        (r) => !r.planId && r.status !== 'returned' && r.status !== 'working',
      ).length
      return [
        {
          key: 'areas',
          label: th ? 'อำเภอที่ต้องช่วยเร่งด่วน' : 'Districts needing urgent help',
          value: urgentAreas,
          tone: urgentAreas > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
          to: firstAllowed('/area', '/'),
        },
        {
          key: 'overdue',
          label: th ? 'เคสเกิน SLA ในเขต' : 'Cases past SLA in your area',
          value: followOverdue,
          tone: followOverdue > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
          to: firstAllowed('/intervention', '/'),
        },
        {
          key: 'schools',
          label: th ? 'โรงเรียนที่ต้องช่วย' : 'Schools needing support',
          value: supportSchools,
          tone: undefined as string | undefined,
          to: firstAllowed('/school', '/'),
        },
        {
          key: 'noplan',
          // นับด้วยนิยามเดียวกับกล่อง "ยังไม่มีแผนโอกาส" ในหน้าทะเบียนเด็กนอกระบบ
          // และกับคำตอบของชิป "เด็กนอกระบบยังไม่มีแผนกี่คน" — สามที่ เลขเดียว
          label: th ? 'เด็กนอกระบบที่ยังไม่มีแผนโอกาส' : 'Out of school, still no plan',
          value: oosNoPlan,
          tone: oosNoPlan > 0 ? RISK_COLOR.high : RISK_COLOR.normal,
          to: firstAllowed('/oosc', '/student', '/'),
        },
      ]
    }

    // สพฐ. กำกับเขต บรรทัดแรกจึงต้องเป็น "เขตไหนต้องช่วยก่อน" ไม่ใช่ยอดทะเบียน
    // รวม ซึ่งบอกขนาดแต่ไม่บอกว่าจะสั่งการที่ไหน — ตัวเลขชุดเดียวกับหน้าแรก
    if (user?.role === 'obec') {
      const views = esaViews(scopedDistricts(user), scopedSchools(user), cases, scopedOosc(user), followList)
      const urgent = views.filter((v) => v.tier === 'urgent').length
      const noOwner = views.reduce((a, v) => a + v.unassigned, 0)
      const watch = views.reduce((a, v) => a + v.schoolsToWatch, 0)
      return [
        {
          key: 'esa',
          label: th ? 'เขตที่ต้องช่วยเร่งด่วน' : 'Area offices needing urgent help',
          value: urgent,
          tone: urgent > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
          to: firstAllowed('/', '/school'),
        },
        {
          key: 'overdue',
          label: th ? 'เคสเกิน SLA ทุกเขต' : 'Cases past SLA, all areas',
          value: overdue,
          tone: overdue > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
          to: firstAllowed('/intervention', '/'),
        },
        {
          key: 'owner',
          label: th ? 'เคสยังไม่มีผู้รับผิดชอบ' : 'Cases with no owner',
          value: noOwner,
          tone: noOwner > 0 ? RISK_COLOR.high : RISK_COLOR.normal,
          to: firstAllowed('/intervention', '/'),
        },
        {
          key: 'schools',
          label: th ? 'โรงเรียนที่ต้องช่วย' : 'Schools needing support',
          value: watch,
          tone: undefined as string | undefined,
          to: firstAllowed('/school', '/'),
        },
      ]
    }

    return [
      {
        key: 'oos',
        label: th ? 'เด็กนอกระบบในทะเบียน' : 'On the registry',
        value: split.known,
        tone: undefined as string | undefined,
        to: firstAllowed('/oosc', '/student', '/'),
      },
      {
        key: 'still',
        label: th ? 'ยังไม่มีอะไรขับเคลื่อน' : 'Nothing moving yet',
        value: split.stillOut,
        tone: split.stillOut > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
        to: firstAllowed('/oosc', '/student', '/'),
      },
      {
        key: 'risk',
        label: th ? 'เด็กเสี่ยงสูงในระบบ' : 'High-risk, still enrolled',
        value: stats.highRisk,
        tone: undefined,
        to: firstAllowed('/risk-map', '/school', '/student', '/'),
      },
      {
        key: 'overdue',
        label: th ? 'เคสเกินกำหนด' : 'Cases past due',
        value: overdue,
        tone: overdue > 0 ? RISK_COLOR.critical : RISK_COLOR.normal,
        to: firstAllowed('/intervention', '/referral', '/'),
      },
    ]
  }, [open, user, th, caseworker, followOverdue, followList, work])

  const goTo = (to: string) => {
    nav(user && !canAccess(user, to) ? '/' : to)
    setOpen(false)
  }

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || streaming) return
    setInput('')
    const userMsg: ChatMsg = { role: 'user', text: q }

    // เคสรายคนตอบในเครื่องเสมอ แม้ตอนที่โมเดลพร้อมใช้ — คำตอบตรงกับหน้าจอ
    // โดยโครงสร้าง มาทันที และข้อมูลเด็กไม่ต้องออกจากเบราว์เซอร์ (ชุดข้อมูลที่
    // ส่งให้โมเดลจงใจไม่มีชื่อเด็กอยู่แล้ว ดูกฎ PDPA ใน `buildSystemPrompt`)
    // คำถามพิมพ์เองที่ไม่เข้าสาขาไหนยังส่งให้โมเดลตามเดิม
    const direct = caseworker && 'list' in followBuilt ? caseAnswer(q, followBuilt.list, th, work) : null
    if (direct) {
      setMessages((m) => [...m, userMsg, { role: 'assistant', text: direct.text, action: direct.action }])
      return
    }

    if (realAI) {
      setMessages((m) => [...m, userMsg, { role: 'assistant', text: '' }])
      setStreaming(true)
      const apiHistory = [...messages, userMsg]
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const system = buildSystemPrompt(user, lang, esaFollow)
        let acc = ''
        for await (const delta of streamAnswer({
          system,
          history: apiHistory,
          model: getModel(),
          signal: controller.signal,
        })) {
          acc += delta
          setMessages((m) => {
            const next = [...m]
            next[next.length - 1] = { role: 'assistant', text: acc }
            return next
          })
        }
        if (!acc.trim()) throw { status: 0, message: 'empty' }
      } catch (err) {
        if ((err as { status?: number })?.status === 503) setRealAI(false)
        const local = localAnswer(q, user, lang, esaFollow)
        setMessages((m) => {
          const next = [...m]
          next[next.length - 1] = { role: 'assistant', text: local.text, action: local.action }
          return next
        })
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
      return
    }

    // Built-in engine: a lookup over data already in memory, so it lands
    // immediately. Faking a thinking pause only made it feel slower.
    const local = localAnswer(q, user, lang, esaFollow)
    setMessages((m) => [
      ...m,
      userMsg,
      { role: 'assistant', text: local.text, action: local.action },
    ])
  }

  return (
    <>
      {/* Launcher — a navy disc so the pale mascot has something to sit against.
       *  On white cards it used to vanish into the page. */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.4 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label={th ? 'เปิดผู้ช่วย Zero Dropout' : 'Open the Zero Dropout assistant'}
        className="group fixed bottom-20 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full md:bottom-6 md:right-6"
      >
        {/* one slow halo — enough to catch the eye, quiet enough to ignore */}
        {!open && (
          <motion.span
            className="absolute inset-0 rounded-full bg-brand-500/25"
            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* the disc itself */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-600 via-brand-800 to-brand-900 shadow-[0_6px_20px_rgba(15,42,107,0.42)] ring-1 ring-white/25" />

        {open ? (
          <motion.span
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            className="relative text-white"
          >
            <IconClose width={22} height={22} />
          </motion.span>
        ) : (
          <motion.span
            className="relative"
            animate={{ y: [0, -2.5, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Mascot size={40} className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />
          </motion.span>
        )}

        {/* name tag, on hover */}
        {!open && (
          <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full bg-brand-900 px-3 py-1.5 text-[12px] font-semibold text-white opacity-0 shadow-lg transition-all duration-200 group-hover:-translate-x-0.5 group-hover:opacity-100">
            {th ? 'ถามผู้ช่วย Zero Dropout' : 'Ask the Zero Dropout assistant'}
          </span>
        )}
      </motion.button>

      {open && (
        <motion.div
          key="assistant-panel"
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          style={{ transformOrigin: 'bottom right' }}
          /* clears the 56px launcher plus a 12px gap, at both breakpoints. Height
           * follows the content up to a ceiling, so a short brief does not leave
           * a wall of empty white above the suggestions. */
          className="fixed bottom-[148px] right-4 z-[60] flex max-h-[min(560px,70vh)] w-[min(384px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-surface-border bg-white shadow-card-hover md:bottom-[92px] md:right-6"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-br from-brand-700 to-brand-900 px-4 py-3.5 text-white">
            <motion.span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/95 ring-1 ring-white/40"
              animate={{ rotate: [-3, 3, -3] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Mascot size={34} />
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {th ? 'ผู้ช่วย Zero Dropout' : 'Zero Dropout assistant'}
              </p>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-white/80">
                <motion.span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300"
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                {scopeLine}
                {' · '}
                {realAI
                  ? th
                    ? 'ตอบด้วย Claude'
                    : 'via Claude'
                  : th
                    ? 'ตอบจากข้อมูลในระบบ'
                    : 'from the data'}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  abortRef.current?.abort()
                  setMessages([])
                  setInput('')
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {th ? 'เริ่มใหม่' : 'Reset'}
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10"
              aria-label={t('common.close')}
            >
              <IconClose width={18} height={18} />
            </button>
          </div>

          {/* Conversation */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-muted/40 p-3.5"
          >
            {/* Greeting — and the four numbers worth acting on, already filled in */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex gap-2"
            >
              <motion.span
                className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-xl bg-white ring-1 ring-surface-border"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.05 }}
              >
                <Mascot size={24} />
              </motion.span>
              <div className="min-w-0 max-w-[86%] rounded-2xl rounded-tl-md border border-surface-border bg-white p-2.5">
                <p className="text-[13px] leading-relaxed text-ink">
                  {caseworker
                    ? th
                      ? 'สวัสดีครับ นี่คือเคสของคุณตอนนี้ — กดบรรทัดไหนก็เข้าไปทำงานต่อได้เลย'
                      : 'Here is where your caseload stands right now — tap any line to go and work on it.'
                    : th
                      ? 'สวัสดีครับ นี่คือสถานะพื้นที่ของคุณตอนนี้ — กดบรรทัดไหนก็เข้าไปทำงานต่อได้เลย'
                      : 'Here is where your area stands right now — tap any line to go and work on it.'}
                </p>
                <div className="mt-2 space-y-0.5">
                  {brief.map((row, i) => (
                    <motion.button
                      key={row.key}
                      onClick={() => goTo(row.to)}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 + i * 0.06 }}
                      whileHover={{ x: 2 }}
                      className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-brand-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">
                        {row.label}
                      </span>
                      <span
                        className="tabular shrink-0 text-[13px] font-bold"
                        style={{ color: row.tone ?? '#0f1b2d' }}
                      >
                        {formatNumber(row.value, lang)}
                      </span>
                      <IconChevronRight
                        width={12}
                        height={12}
                        className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                      />
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>

            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {m.role === 'assistant' && (
                  <motion.span
                    className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-xl bg-white ring-1 ring-surface-border"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                  >
                    <Mascot size={24} />
                  </motion.span>
                )}
                <div className="min-w-0 max-w-[86%] space-y-2">
                  <div
                    className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === 'user'
                        ? 'rounded-tr-md bg-brand-600 text-white'
                        : 'rounded-tl-md border border-surface-border bg-white text-ink-muted'
                    }`}
                  >
                    {m.role === 'user' ? (
                      m.text
                    ) : m.text ? (
                      <div className="space-y-1">
                        {m.text.split('\n').map((line, k) =>
                          line.trim() ? (
                            <p key={k} className={k === 0 ? 'font-semibold text-ink' : undefined}>
                              <AnswerLine text={line} />
                            </p>
                          ) : (
                            <div key={k} className="h-1" />
                          ),
                        )}
                      </div>
                    ) : (
                      <TypingDots />
                    )}
                  </div>
                  {m.action && (
                    <motion.button
                      onClick={() => goTo(m.action!.to)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 }}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      className="group flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                    >
                      {m.action.label}
                      <IconArrowRight
                        width={14}
                        height={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Suggestions — always reachable, stagger in on open */}
          <div className="flex flex-wrap gap-1.5 border-t border-surface-border px-3 pb-1 pt-2">
            {chips.filter((c) => !messages.some((m) => m.text === (th ? c.th : c.en))).map(
              (c, i) => (
                <motion.button
                  key={c.th}
                  onClick={() => send(th ? c.th : c.en)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + i * 0.04 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  {th ? c.th : c.en}
                </motion.button>
              ),
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 p-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={th ? 'พิมพ์คำถาม…' : 'Type a question…'}
              className="min-w-0 flex-1 rounded-full border border-surface-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand-400"
            />
            <motion.button
              type="submit"
              disabled={streaming || !input.trim()}
              whileHover={input.trim() ? { scale: 1.08 } : undefined}
              whileTap={input.trim() ? { scale: 0.9 } : undefined}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              aria-label={t('ai.send')}
            >
              <IconSend width={18} height={18} />
            </motion.button>
          </form>
        </motion.div>
      )}
    </>
  )
}
