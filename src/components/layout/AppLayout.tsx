import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { ErrorBoundary } from '../ErrorBoundary'
import { AIChatWidget } from '../ai/AIChatWidget'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  // Scroll to top on route change.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-8">
          {/* Page transition is a pure CSS keyframe that animates TRANSFORM
              ONLY (see tailwind `page-rise`) — it never touches opacity, so the
              content is always fully visible regardless of the animation's
              state. This is deliberate: an opacity-based enter animation (framer
              AnimatePresence, or a keyed opacity keyframe) can be interrupted by
              fast menu switching and leave the incoming page stuck at opacity 0
              until a manual refresh. A transform-only entrance can never hide
              content. */}
          <div key={location.pathname} className="animate-page-rise">
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <BottomNav />
      <AIChatWidget />
    </div>
  )
}
