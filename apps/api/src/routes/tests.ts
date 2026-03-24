import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { CreateTestSchema, UpdateTestSchema } from '@sentinel/shared'
import type { AssertionResult, Test, TestRun } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import { invalidateCache } from '../executor/compile.js'
import { testEvents } from '../events.js'

export async function testsRoutes(app: FastifyInstance): Promise<void> {
  // POST /tests
  app.post<{ Body: unknown }>('/', async (req, reply) => {
    const parsed = CreateTestSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }
    const d = parsed.data
    const id = nanoid()
    const { rows } = await pool.query<Test>(
      `INSERT INTO tests (id, name, code, schedule_ms, timeout_ms, retries, uses_browser, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, d.name, d.code, d.schedule_ms, d.timeout_ms, d.retries, d.uses_browser, d.enabled]
    )
    testEvents.emit('test:created', rows[0])
    return reply.status(201).send(rows[0])
  })

  // GET /tests
  app.get('/', async (_req, reply) => {
    const { rows } = await pool.query<Test>(
      'SELECT * FROM tests ORDER BY created_at DESC'
    )
    return reply.send(rows)
  })

  // GET /tests/:id/runs
  app.get<{ Params: { id: string } }>('/:id/runs', async (req, reply) => {
    const { rows: exists } = await pool.query<{ id: string }>(
      'SELECT id FROM tests WHERE id = $1',
      [req.params.id]
    )
    if (exists.length === 0) return reply.status(404).send({ error: 'not found' })
    const { rows } = await pool.query<TestRun>(
      `SELECT id, test_id, started_at, finished_at, status, duration_ms, error_message
       FROM test_runs WHERE test_id = $1 ORDER BY finished_at DESC LIMIT 20`,
      [req.params.id]
    )
    const runIds = rows.map(r => r.id)
    const { rows: assertionRows } = await pool.query<AssertionResult>(
      `SELECT id, test_run_id, name, passed, message FROM assertion_results WHERE test_run_id = ANY($1)`,
      [runIds]
    )
    const byRunId = new Map<string, AssertionResult[]>()
    for (const a of assertionRows) {
      const list = byRunId.get(a.test_run_id) ?? []
      list.push(a)
      byRunId.set(a.test_run_id, list)
    }
    return reply.send(rows.map(r => ({ ...r, assertions: byRunId.get(r.id) ?? [] })))
  })

  // GET /tests/:id
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await pool.query<Test>(
      'SELECT * FROM tests WHERE id = $1',
      [req.params.id]
    )
    if (rows.length === 0) return reply.status(404).send({ error: 'not found' })
    return reply.send(rows[0])
  })

  // PATCH /tests/:id
  app.patch<{ Params: { id: string }; Body: unknown }>('/:id', async (req, reply) => {
    const parsed = UpdateTestSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }
    const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    if (entries.length === 0) {
      return reply.status(400).send({ error: 'no fields to update' })
    }
    const set = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ')
    const values = [...entries.map(([, v]) => v), req.params.id]
    const { rows } = await pool.query<Test>(
      `UPDATE tests SET ${set}, updated_at = NOW() WHERE id = $${entries.length + 1} RETURNING *`,
      values
    )
    if (rows.length === 0) return reply.status(404).send({ error: 'not found' })
    invalidateCache(req.params.id)
    testEvents.emit('test:updated', rows[0])
    return reply.send(rows[0])
  })

  // DELETE /tests/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await pool.query(
      'DELETE FROM tests WHERE id = $1',
      [req.params.id]
    )
    if (result.rowCount === 0) return reply.status(404).send({ error: 'not found' })
    invalidateCache(req.params.id)
    testEvents.emit('test:deleted', req.params.id)
    return reply.status(204).send()
  })
}
