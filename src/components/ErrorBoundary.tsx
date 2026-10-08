import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** changing this value resets the boundary (e.g. the route path) */
  resetKey?: string
}
interface State {
  error: Error | null
  prevKey?: string
}

/** Catches render errors on a page so one bad screen never blanks the whole
 *  app. Resets automatically when the route (`resetKey`) changes. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, prevKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.prevKey) {
      return { error: null, prevKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('Page render error:', error, info)
  }

  render() {
    if (this.state.error) {
      const th = document.documentElement.lang !== 'en'
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-risk-critical/10 text-3xl text-risk-critical">
            !
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">
              {th ? 'หน้านี้เกิดข้อผิดพลาด' : 'This page hit an error'}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              {th
                ? 'ลองโหลดใหม่อีกครั้ง หากยังพบปัญหาโปรดแจ้งผู้ดูแลระบบ'
                : 'Please try again. If it keeps happening, contact the administrator.'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            {th ? 'ลองใหม่อีกครั้ง' : 'Try again'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
