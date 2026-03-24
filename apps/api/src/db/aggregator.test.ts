import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./pool.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

import { pool } from './pool.js'
import { runAggregation, startAggregator, stopAggregator } from './aggregator.js'

const mockQuery = vi.mocked(pool.query)

beforeEach(() => {
  mockQuery.mockClear()
  mockQuery.mockResolvedValue({ rows: [] } as never)
})

afterEach(() => {
  stopAggregator()
  vi.restoreAllMocks()
})

describe('runAggregation', () => {
  it('issues the uptime_daily upsert with yesterday and today dates', async () => {
    await runAggregation()

    const firstCall = mockQuery.mock.calls[0]
    expect(firstCall).toBeDefined()
    const sql = firstCall![0] as string
    expect(sql).toContain('INSERT INTO uptime_daily')
    expect(sql).toContain('ON CONFLICT (test_id, date) DO UPDATE')
    const params = firstCall![1] as string[]
    expect(params).toHaveLength(2)
    // both should be ISO date strings (YYYY-MM-DD)
    expect(params[0]!).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(params[1]!).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // yesterday < today
    expect(params[0]! < params[1]!).toBe(true)
  })

  it('queries pg_class for partition names', async () => {
    await runAggregation()

    const pgClassCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('pg_class'),
    )
    expect(pgClassCall).toBeDefined()
    const sql = pgClassCall![0] as string
    expect(sql).toContain('pg_class')
    expect(sql).toContain("relkind = 'r'")
  })

  it('issues the uptime_daily DELETE for rows older than 90 days', async () => {
    await runAggregation()

    const deleteCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM uptime_daily'),
    )
    expect(deleteCall).toBeDefined()
    expect(deleteCall![0]).toContain('90 days')
  })

  it('makes exactly 3 pool.query calls when no partitions exist', async () => {
    // pg_class query returns empty rows
    mockQuery.mockResolvedValue({ rows: [] } as never)
    await runAggregation()
    expect(mockQuery).toHaveBeenCalledTimes(3)
  })
})

describe('partition pruning', () => {
  it('drops a partition whose end date is beyond the 7-day cutoff', async () => {
    // test_runs_2020_01 ends on 2020-02-01, well beyond 7 days ago
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never) // upsert
      .mockResolvedValueOnce({ rows: [{ relname: 'test_runs_2020_01' }] } as never) // pg_class
      .mockResolvedValueOnce({ rows: [] } as never) // DROP TABLE
      .mockResolvedValueOnce({ rows: [] } as never) // DELETE uptime_daily

    await runAggregation()

    const dropCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('DROP TABLE'),
    )
    expect(dropCall).toBeDefined()
    expect(dropCall![0]).toContain('test_runs_2020_01')
  })

  it('does not drop a partition whose end date is within the 7-day window', async () => {
    const now = new Date()
    // Use next month's partition — its end is in the future, definitely within window
    const futureYear = now.getUTCFullYear()
    const futureMonth = String(now.getUTCMonth() + 2).padStart(2, '0') // +2 because months 0-indexed
    const recentPartition = `test_runs_${futureYear}_${futureMonth}`

    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never) // upsert
      .mockResolvedValueOnce({ rows: [{ relname: recentPartition }] } as never) // pg_class
      .mockResolvedValueOnce({ rows: [] } as never) // DELETE uptime_daily

    await runAggregation()

    const dropCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('DROP TABLE'),
    )
    expect(dropCall).toBeUndefined()
  })

  it('drops multiple old partitions in separate queries', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never) // upsert
      .mockResolvedValueOnce({
        rows: [{ relname: 'test_runs_2019_11' }, { relname: 'test_runs_2019_12' }],
      } as never) // pg_class
      .mockResolvedValue({ rows: [] } as never) // DROP TABLE × 2 + DELETE

    await runAggregation()

    const dropCalls = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('DROP TABLE'),
    )
    expect(dropCalls).toHaveLength(2)
    expect(dropCalls[0]![0]).toContain('test_runs_2019_11')
    expect(dropCalls[1]![0]).toContain('test_runs_2019_12')
  })

  it('continues to prune uptime_daily even if partition pruning throws', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never) // upsert
      .mockRejectedValueOnce(new Error('pg_class failed')) // pg_class error
      .mockResolvedValueOnce({ rows: [] } as never) // DELETE uptime_daily

    await runAggregation()

    const deleteCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM uptime_daily'),
    )
    expect(deleteCall).toBeDefined()
  })
})

describe('startAggregator / stopAggregator', () => {
  it('stopAggregator is safe to call when not started', () => {
    expect(() => stopAggregator()).not.toThrow()
  })

  it('startAggregator schedules a setTimeout that fires at midnight UTC', () => {
    vi.useFakeTimers()
    startAggregator()

    // Advance to just past the next midnight UTC
    const now = new Date()
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    const msToMidnight = midnight.getTime() - now.getTime()

    vi.advanceTimersByTime(msToMidnight + 1)

    // runAggregation fires: expect at least the upsert query to have been called
    expect(mockQuery).toHaveBeenCalled()

    stopAggregator()
    vi.useRealTimers()
  })

  it('stopAggregator prevents the scheduled job from running', () => {
    vi.useFakeTimers()
    startAggregator()
    stopAggregator()

    // Advance well past midnight
    vi.advanceTimersByTime(25 * 60 * 60 * 1000)

    expect(mockQuery).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
