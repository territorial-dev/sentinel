import { nanoid } from 'nanoid'
import type { TestStatus } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import { getCompiledFn } from './compile.js'
import { buildCtx } from './ctx.js'

export interface RunResult {
  id: string
  test_id: string
  started_at: Date
  finished_at: Date
  status: TestStatus
  duration_ms: number
  error_message: string | null
}

interface TestInput {
  id: string
  code: string
  timeout_ms: number
}

export async function runTest(test: TestInput): Promise<RunResult> {
  const runId = nanoid()
  const startedAt = new Date()
  const startMs = Date.now()

  let status: TestStatus = 'success'
  let errorMessage: string | null = null

  const fn = getCompiledFn(test.id, test.code)
  const { ctx, getAssertions } = buildCtx()

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${test.timeout_ms}ms`)), test.timeout_ms)
  )

  try {
    await Promise.race([
      Promise.resolve(fn(ctx)),
      timeoutPromise,
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('Timed out after')) {
      status = 'timeout'
    } else {
      status = 'fail'
    }
    errorMessage = msg
  }

  const finishedAt = new Date()
  const durationMs = Date.now() - startMs

  // Persist assertion results (batch)
  const assertions = getAssertions()
  if (assertions.length > 0) {
    const values: unknown[] = []
    const placeholders = assertions.map((a, i) => {
      const base = i * 5
      values.push(nanoid(), runId, a.name, a.passed, a.message)
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
    })
    await pool.query(
      `INSERT INTO assertion_results (id, test_run_id, name, passed, message) VALUES ${placeholders.join(', ')}`,
      values
    )
  }

  return {
    id: runId,
    test_id: test.id,
    started_at: startedAt,
    finished_at: finishedAt,
    status,
    duration_ms: durationMs,
    error_message: errorMessage,
  }
}
