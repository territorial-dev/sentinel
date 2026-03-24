'use client'

import dynamic from 'next/dynamic'
import type { RunRow } from './run-history'

const RunLatencyChart = dynamic(
  () => import('./run-latency-chart').then(m => ({ default: m.RunLatencyChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full border border-zinc-800/80 rounded-lg bg-zinc-900/30" aria-hidden />
    ),
  }
)

export function RunLatencyChartLoader({ runs }: { runs: RunRow[] }) {
  return <RunLatencyChart runs={runs} />
}
