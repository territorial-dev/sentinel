import type { FastifyInstance } from 'fastify'
import type { PublicStatusDay, PublicStatusTest } from '@sentinel/shared'
import { pool } from '../db/pool.js'

type TestRow = { id: string; name: string; enabled: boolean }

type UdRow = {
  test_id: string
  date: string
  success_count: number
  failure_count: number
}

function dayOutcome(successCount: number, failureCount: number): PublicStatusDay['outcome'] {
  if (failureCount > 0) return 'down'
  if (successCount > 0) return 'up'
  return 'unknown'
}

/** Last 30 UTC calendar days, oldest first. */
function utcDayStrings(): string[] {
  const out: string[] = []
  const now = new Date()
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = 29; i >= 0; i--) {
    const t = end - i * 86_400_000
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

function buildPublicStatus(tests: TestRow[], udRows: UdRow[]): PublicStatusTest[] {
  const dayStrings = utcDayStrings()
  const udByTest = new Map<string, Map<string, { s: number; f: number }>>()

  for (const row of udRows) {
    const d =
      typeof row.date === 'string'
        ? row.date.slice(0, 10)
        : (row.date as unknown as Date).toISOString().slice(0, 10)
    let m = udByTest.get(row.test_id)
    if (!m) {
      m = new Map()
      udByTest.set(row.test_id, m)
    }
    m.set(d, { s: Number(row.success_count), f: Number(row.failure_count) })
  }

  return tests.map((t) => {
    const m = udByTest.get(t.id) ?? new Map()
    let totalS = 0
    let totalF = 0
    const days: PublicStatusDay[] = dayStrings.map((date) => {
      const cell = m.get(date)
      const s = cell?.s ?? 0
      const f = cell?.f ?? 0
      totalS += s
      totalF += f
      return { date, outcome: dayOutcome(s, f) }
    })

    const denom = totalS + totalF
    const uptime_pct_30d = denom === 0 ? null : Math.round((100 * totalS) / denom)

    let current_status: PublicStatusTest['current_status'] = 'unknown'
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i]
      if (!day || day.outcome === 'unknown') continue
      current_status = day.outcome
      break
    }

    return {
      id: t.id,
      name: t.name,
      enabled: t.enabled,
      current_status,
      uptime_pct_30d,
      days,
    }
  })
}

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_req, reply) => {
    const { rows: tests } = await pool.query<TestRow>(
      `SELECT id, name, enabled FROM tests ORDER BY created_at DESC`,
    )
    const { rows: udRows } = await pool.query<UdRow>(
      `SELECT test_id, date::text AS date, success_count, failure_count
       FROM uptime_daily
       WHERE date >= (CURRENT_DATE - 29)
         AND date <= CURRENT_DATE`,
    )
    return reply.send(buildPublicStatus(tests, udRows))
  })
}
