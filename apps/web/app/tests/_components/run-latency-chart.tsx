'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RunRow } from './run-history'

type ChartPoint = {
  run: number
  duration_ms: number
  failureDuration: number | null
  finished_at: string
  status: RunRow['status']
}

function buildData(runs: RunRow[]): ChartPoint[] {
  const chronological = [...runs].reverse()
  return chronological.map((r, i) => ({
    run: i + 1,
    duration_ms: r.duration_ms,
    failureDuration: r.status === 'success' ? null : r.duration_ms,
    finished_at: r.finished_at,
    status: r.status,
  }))
}

export function RunLatencyChart({ runs }: { runs: RunRow[] }) {
  const data = buildData(runs)

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-zinc-500 text-sm border border-zinc-800/80 rounded-lg bg-zinc-900/30">
        No data to chart yet.
      </div>
    )
  }

  const maxMs = Math.max(...data.map(d => d.duration_ms), 1)

  return (
    <div className="h-64 w-full border border-zinc-800/80 rounded-lg bg-zinc-900/30 px-1 py-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="run"
            tick={{ fill: '#71717a', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#3f3f46' }}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#3f3f46' }}
            domain={[0, Math.ceil(maxMs * 1.15)]}
            width={48}
            tickFormatter={v => `${v} ms`}
          />
          <Tooltip
            cursor={{ stroke: '#52525b', strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 4,
              fontSize: 12,
              color: '#e4e4e7',
              fontFamily: 'Consolas, ui-monospace, monospace',
            }}
            labelFormatter={(_label, payload) => {
              const first = payload?.[0]
              const p = first?.payload as ChartPoint | undefined
              if (!p) return ''
              return new Date(p.finished_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'medium',
              })
            }}
            formatter={(value, name) => {
              if (name === 'duration_ms') return [`${value} ms`, 'Duration']
              if (name === 'failureDuration' && value != null && value !== '') {
                return [`${value} ms`, 'Failure']
              }
              return null
            }}
          />
          <Bar
            dataKey="failureDuration"
            fill="#ef4444"
            barSize={7}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="duration_ms"
            stroke="#a1a1aa"
            strokeWidth={1.5}
            dot={{ r: 2, fill: '#71717a', strokeWidth: 0 }}
            activeDot={{ r: 4, fill: '#d4d4d8' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
