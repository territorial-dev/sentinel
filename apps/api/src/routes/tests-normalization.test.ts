import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/pool.js', () => ({
  pool: {
    query: vi.fn(),
  },
}))

vi.mock('../auth/jwt.js', () => ({
  verifyJwt: vi.fn(() => true),
}))

import { pool } from '../db/pool.js'
import { buildServer } from '../server.js'

const mockQuery = vi.mocked(pool.query)

describe('tests routes tag normalization', () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  it('normalizes and dedupes tags on test create', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'test-1',
        name: 'Check API',
        code: 'return true',
        schedule_ms: 60000,
        timeout_ms: 5000,
        retries: 0,
        uses_browser: false,
        enabled: true,
        failure_threshold: 3,
        cooldown_ms: 300000,
        tags: ['prod', 'on call'],
        created_at: new Date(),
        updated_at: new Date(),
      }],
    } as never)

    const app = await buildServer()
    const res = await app.inject({
      method: 'POST',
      url: '/tests',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        name: 'Check API',
        code: 'return true',
        schedule_ms: 60000,
        tags: [' Prod ', 'prod', 'On   Call'],
      },
    })

    expect(res.statusCode).toBe(201)
    const insertCall = mockQuery.mock.calls[0]
    expect(insertCall).toBeDefined()
    const params = insertCall![1] as unknown[]
    expect(params[8]).toEqual(['prod', 'on call'])
  })

  it('normalizes tags on patch update', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'test-1',
        name: 'Check API',
        code: 'return true',
        schedule_ms: 60000,
        timeout_ms: 5000,
        retries: 0,
        uses_browser: false,
        enabled: true,
        failure_threshold: 3,
        cooldown_ms: 300000,
        tags: ['prod'],
        created_at: new Date(),
        updated_at: new Date(),
      }],
    } as never)

    const app = await buildServer()
    const res = await app.inject({
      method: 'PATCH',
      url: '/tests/test-1',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        tags: [' Prod ', 'prod', ' On  Call '],
      },
    })

    expect(res.statusCode).toBe(200)
    const updateCall = mockQuery.mock.calls[0]
    expect(updateCall).toBeDefined()
    const params = updateCall![1] as unknown[]
    expect(params[0]).toEqual(['prod', 'on call'])
  })
})
