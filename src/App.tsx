import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import SouthernOverview from './pages/SouthernOverview'
import GeoIntelligence from './pages/GeoIntelligence'
import RiskHeatmap from './pages/RiskHeatmap'
import AreaInsight from './pages/AreaInsight'
import TambonDashboard from './pages/TambonDashboard'
import OoscRegistry from './pages/OoscRegistry'
import CauseAnalysis from './pages/CauseAnalysis'
import OpportunityPlans from './pages/OpportunityPlans'
import Referrals from './pages/Referrals'
import InterventionTracking from './pages/InterventionTracking'
import SchoolPerformance from './pages/SchoolPerformance'
import Student360 from './pages/Student360'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
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
