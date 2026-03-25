'use client'

import { useState } from 'react'
import type { StatusBucket, StatusPeriod } from '@sentinel/shared'

interface Props {
  testId: string
  buckets: StatusBucket[]
  period: StatusPeriod
}

function bucketColorClass(b: StatusBucket): string {
  if (b.failure_count > 0 && b.success_count === 0) return 'bg-red-500/90'
  if (b.failure_count > 0 && b.success_count > 0) return 'bg-yellow-500/90'
  if (b.success_count > 0) return 'bg-emerald-500/90'
  return 'bg-zinc-700/80'
}

function formatBucketTime(iso: string, period: StatusPeriod): string {
  const d = new Date(iso)
  if (period === '30d') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  }
  if (period === '7d') {
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: period === '1h' ? '2-digit' : undefined })
}

export function StatusBucketsView({ testId, buckets, period }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const hovered = hoveredIdx !== null ? (buckets[hoveredIdx] ?? null) : null

  return (
    <div className="relative">
      <div
        className="flex gap-px w-full"
        role="img"
        aria-label={`${period} status history for ${testId}`}
      >
        {buckets.map((b, i) => (
          <div
            key={i}
            className={`relative flex-1 min-w-0 aspect-square rounded-[1px] cursor-default ${bucketColorClass(b)}`}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}
      </div>

      {hovered !== null && hoveredIdx !== null && (
        <div
          className="absolute z-20 bottom-full mb-2 pointer-events-none"
          style={{
            left: `${Math.min(Math.max((hoveredIdx / buckets.length) * 100, 0), 75)}%`,
          }}
        >
          <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 whitespace-nowrap shadow-lg">
            <div className="text-zinc-400 mb-1">
              {formatBucketTime(hovered.bucket_start, period)}
              {' – '}
              {formatBucketTime(hovered.bucket_end, period)}
            </div>
            <div>{hovered.success_count + hovered.failure_count} runs</div>
            <div className="text-emerald-400">{hovered.success_count} passed</div>
            <div className="text-red-400">{hovered.failure_count} failed</div>
            <div className="text-zinc-400">
              avg {hovered.avg_latency_ms !== null ? `${Math.round(hovered.avg_latency_ms)}ms` : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
