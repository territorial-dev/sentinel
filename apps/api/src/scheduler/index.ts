import pLimit from 'p-limit'
import type { Test } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import { runTest } from '../executor/run.js'
import { testEvents } from '../events.js'

const CONCURRENCY = 10
const limit = pLimit(CONCURRENCY)
const timers = new Map<string, ReturnType<typeof setInterval>>()

function register(test: Test): void {
  unregister(test.id)
  if (!test.enabled) return

  const jitteredInterval = test.schedule_ms + Math.random() * test.schedule_ms * 0.1

  const timer = setInterval(() => {
    if (limit.activeCount >= CONCURRENCY) {
      console.warn(`scheduler: queue full, skipping test ${test.id}`)
      return
    }
    limit(() => runTest(test)).catch((err: unknown) => {
      console.error(`scheduler: run failed for test ${test.id}`, err)
    })
  }, jitteredInterval)

  timers.set(test.id, timer)
}

function unregister(testId: string): void {
  const timer = timers.get(testId)
  if (timer !== undefined) {
    clearInterval(timer)
    timers.delete(testId)
  }
}

export async function startScheduler(): Promise<void> {
  const { rows } = await pool.query<Test>('SELECT * FROM tests WHERE enabled = true')
  for (const test of rows) {
    register(test)
  }

  testEvents.on('test:created', (test: Test) => register(test))
  testEvents.on('test:updated', (test: Test) => {
    unregister(test.id)
    if (test.enabled) register(test)
  })
  testEvents.on('test:deleted', (testId: string) => unregister(testId))

  console.info(`scheduler: started with ${rows.length} test(s)`)
}

export function stopScheduler(): void {
  for (const timer of timers.values()) {
    clearInterval(timer)
  }
  timers.clear()
}
