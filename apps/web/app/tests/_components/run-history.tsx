'use client'

import { useState } from 'react'
import type { TestStatus } from '@sentinel/shared'

const TRUNCATE = 120

export interface RunRow {
  id: string
  status: TestStatus
  duration_ms: number
  error_message: string | null
  finished_at: string
}

function StatusCell({ status }: { status: TestStatus }) {
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400 w-20 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />
        pass
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-red-400 w-20 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" aria-hidden />
      {status === 'timeout' ? 'timeout' : 'fail'}
    </span>
  )
}

function RunRowView({ run }: { run: RunRow }) {
  const [expanded, setExpanded] = useState(false)
  const msg = run.error_message
  const needsTruncate = msg != null && msg.length > TRUNCATE
  const shown =
    !msg ? null : expanded || !needsTruncate ? msg : `${msg.slice(0, TRUNCATE)}…`

  return (
    <div className="py-3 border-b border-zinc-800/80 last:border-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <time
          className="text-zinc-500 text-xs tabular-nums shrink-0 sm:w-44"
          dateTime={run.finished_at}
        >
          {new Date(run.finished_at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'medium',
          })}
        </time>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 min-w-0 flex-1">
          <StatusCell status={run.status} />
          <span className="text-zinc-400 text-xs tabular-nums shrink-0 w-14 text-right sm:text-left">
            {run.duration_ms}ms
          </span>
          <div className="w-full sm:w-auto sm:flex-1 sm:min-w-0 text-sm">
            {msg ? (
              <>
                <p className={`text-zinc-400 break-words ${expanded ? '' : 'line-clamp-2'}`}>{shown}</p>
                {needsTruncate && (
                  <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    className="text-zinc-500 text-xs mt-1 hover:text-zinc-300"
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </>
            ) : (
              <span className="text-zinc-600">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RunHistory({ runs }: { runs: RunRow[] }) {
  if (runs.length === 0) {
    return <p className="text-zinc-500 text-sm mt-4">No runs yet.</p>
  }
  return (
    <div className="mt-6">
      {runs.map(run => (
        <RunRowView key={run.id} run={run} />
      ))}
    </div>
  )
}
