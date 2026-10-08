import { useEffect, useState } from 'react'

/** Simulates a network fetch so skeleton/loading states are visible in the demo. */
export function useSimulatedLoading(ms = 650): boolean {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    const id = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(id)
  }, [ms])
  return loading
}
