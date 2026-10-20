import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import { RouteFallback } from './components/layout/RouteFallback'
import { AuthFallback } from './components/auth/AuthFallback'

/** ทุกหน้าถูกโหลดเมื่อเปิดจริง ไม่ใช่ตอนเปิดเว็บ — `navFor()` เปิดให้แต่ละ
 *  ที่นั่งเห็นเมนูคนละชุดอยู่แล้ว ครูที่เข้าหน้า "เคสของฉัน" จึงไม่ควรต้อง
 *  ดาวน์โหลดหน้าของ ผอ. เขต และ สพฐ. ที่ตัวเองเปิดไม่ได้
 *
 *  หน้าเข้าสู่ระบบก็แยกด้วย เพราะครูที่ล็อกอินค้างไว้ไม่ได้เปิดมันอีก แต่เคย
 *  ต้องดาวน์โหลดมันทุกครั้ง — พร้อมกับเส้นขอบจังหวัดทั้งประเทศ (116 kB) ที่
 *  `SignInTransition` ใช้ ซึ่งเป็นก้อนเดียวที่ใหญ่ที่สุดในไฟล์แรก
 *
 *  ชื่อไฟล์ chunk ถูกอ้างผ่าน `import.meta.env.BASE_URL` โดย Vite เองเสมอ จึง
 *  โหลดถูกทั้งบน Netlify (`/`) และ GitHub Pages (`/southern_zero_dropout/`)
 *  — ดูกฎเรื่อง base สองแบบใน CLAUDE.md */
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const SouthernOverview = lazy(() => import('./pages/SouthernOverview'))
const GeoIntelligence = lazy(() => import('./pages/GeoIntelligence'))
const RiskHeatmap = lazy(() => import('./pages/RiskHeatmap'))
const AreaInsight = lazy(() => import('./pages/AreaInsight'))
const TambonDashboard = lazy(() => import('./pages/TambonDashboard'))
const OoscRegistry = lazy(() => import('./pages/OoscRegistry'))
const CauseAnalysis = lazy(() => import('./pages/CauseAnalysis'))
const OpportunityPlans = lazy(() => import('./pages/OpportunityPlans'))
const Referrals = lazy(() => import('./pages/Referrals'))
const InterventionTracking = lazy(() => import('./pages/InterventionTracking'))
const SchoolPerformance = lazy(() => import('./pages/SchoolPerformance'))
const Student360 = lazy(() => import('./components/student/StudentRoute'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const DirectorDecisions = lazy(() => import('./pages/DirectorDecisions'))

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<AuthFallback />}>
            <Login />
          </Suspense>
        }
      />
      <Route
        path="/register"
        element={
          <Suspense fallback={<AuthFallback />}>
            <Register />
          </Suspense>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<SouthernOverview />} />
        <Route path="/geo" element={<GeoIntelligence />} />
        <Route path="/risk-map" element={<RiskHeatmap />} />
        <Route path="/area" element={<AreaInsight />} />
        <Route path="/tambon" element={<TambonDashboard />} />
        <Route path="/oosc" element={<OoscRegistry />} />
        <Route path="/cause" element={<CauseAnalysis />} />
        <Route path="/plan" element={<OpportunityPlans />} />
        <Route path="/referral" element={<Referrals />} />
        <Route path="/intervention" element={<InterventionTracking />} />
        <Route path="/decisions" element={<DirectorDecisions />} />
        <Route path="/school" element={<SchoolPerformance />} />
        <Route path="/student" element={<Student360 />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        {/* Any URL with no page — a mistyped address, or a bookmark to a route
            that has since been removed — lands on the overview instead of a
            blank screen. Without this, React Router matches nothing and the
            layout itself never renders, so there is not even a menu to escape
            with. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
