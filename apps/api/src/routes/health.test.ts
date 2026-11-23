import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/pool.js', () => ({
  pool: {
    query: vi.fn(),
  },
}))

const { bufferHealth } = vi.hoisted(() => ({ bufferHealth: vi.fn() }))
vi.mock('../db/result-buffer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/result-buffer.js')>()),
  resultBufferHealth: bufferHealth,
}))

import { pool } from '../db/pool.js'
import { buildServer } from '../server.js'

const mockQuery = vi.mocked(pool.query)
const healthy = { buffered: 0, dropped_total: 0, last_drop_at: null, oldest_buffered_at: null, stalled: false, degraded: false }

describe('health route', () => {
  beforeEach(() => {
    mockQuery.mockClear()
    bufferHealth.mockReset().mockReturnValue(healthy)
  })

  it('returns 200 when the database is reachable, without auth', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never)
    const app = await buildServer()

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok', result_buffer: healthy })
  })

  it('returns 503 when the database is unreachable', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'))
    const app = await buildServer()

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body)).toEqual({ status: 'error', error: 'connection refused', result_buffer: healthy })
  })

  it('returns 503 degraded when run results are being dropped or not written', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never)
    const stalled = { buffered: 5000, dropped_total: 12, last_drop_at: '2026-01-01T00:00:00.000Z', oldest_buffered_at: '2026-01-01T00:00:00.000Z', stalled: true, degraded: true }
    bufferHealth.mockReturnValue(stalled)
    const app = await buildServer()

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body)).toEqual({ status: 'degraded', error: 'run results are not being written to the database', result_buffer: stalled })
  })
})
