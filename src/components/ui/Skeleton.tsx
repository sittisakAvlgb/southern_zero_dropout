export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />
}

export function SkeletonKpi() {
  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <Skeleton className="h-9 w-9 rounded-xl" />
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-surface-border bg-white p-5 shadow-card ${className}`}
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-[180px] w-full" />
    </div>
  )
}
