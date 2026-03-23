import type { RunResult } from '../executor/run.js'
import { pool } from './pool.js'

let buffer: RunResult[] = []
let flusherTimer: ReturnType<typeof setInterval> | null = null
let flushInProgress = false

export function enqueue(result: RunResult): void {
  buffer.push(result)
  if (buffer.length >= 100) {
    flush().catch((err: unknown) => {
      console.error('result-buffer: immediate flush failed', err)
    })
  }
}

export function startFlusher(): void {
  if (flusherTimer !== null) return
  flusherTimer = setInterval(() => {
    flush().catch((err: unknown) => {
      console.error('result-buffer: timed flush failed', err)
    })
  }, 2000)
}

export function stopFlusher(): void {
  if (flusherTimer !== null) {
    clearInterval(flusherTimer)
    flusherTimer = null
  }
}

export async function flush(): Promise<void> {
  if (flushInProgress || buffer.length === 0) return
  flushInProgress = true
  const rows = buffer
  buffer = []
  try {
    await flushTestRuns(rows)
    await flushTestState(rows)
  } catch (err) {
    buffer = [...rows, ...buffer]
    throw err
  } finally {
    flushInProgress = false
  }
}

async function flushTestRuns(rows: RunResult[]): Promise<void> {
  const values: unknown[] = []
  const placeholders = rows.map((r, i) => {
    const b = i * 7
    values.push(r.id, r.test_id, r.started_at, r.finished_at, r.status, r.duration_ms, r.error_message)
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`
  })
  await pool.query(
    `INSERT INTO test_runs (id, test_id, started_at, finished_at, status, duration_ms, error_message)
     VALUES ${placeholders.join(',')}`,
    values,
  )
}

async function flushTestState(rows: RunResult[]): Promise<void> {
  // Deduplicate: one row per test_id, keep the latest by finished_at
  const latest = new Map<string, RunResult>()
  for (const r of rows) {
    const cur = latest.get(r.test_id)
    if (cur === undefined || r.finished_at > cur.finished_at) latest.set(r.test_id, r)
  }
  const deduped = Array.from(latest.values())

  const values: unknown[] = []
  const placeholders = deduped.map((r, i) => {
    const b = i * 3
    values.push(r.test_id, r.status, r.finished_at)
    return `($${b + 1},$${b + 2},$${b + 3})`
  })

  // LEFT JOIN reads existing consecutive_failures so it can be incremented correctly
  await pool.query(
    `INSERT INTO test_state (test_id, last_status, consecutive_failures, last_run_at)
     SELECT
       v.test_id,
       v.last_status,
       CASE WHEN v.last_status = 'success' THEN 0
            ELSE COALESCE(ts.consecutive_failures, 0) + 1
       END,
       v.last_run_at
     FROM (VALUES ${placeholders.join(',')}) AS v(test_id, last_status, last_run_at)
     LEFT JOIN test_state ts ON ts.test_id = v.test_id
     ON CONFLICT (test_id) DO UPDATE SET
       last_status          = EXCLUDED.last_status,
       consecutive_failures = EXCLUDED.consecutive_failures,
       last_run_at          = EXCLUDED.last_run_at`,
    values,
  )
  // last_notification_at is intentionally excluded — owned by F-07 notifier
}
