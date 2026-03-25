import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { CreateTestSchema, UpdateTestSchema, CreateAssignmentSchema } from '@sentinel/shared'
import type { AssertionResult, Incident, Test, TestRun } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import { invalidateCache } from '../executor/compile.js'
import { testEvents } from '../events.js'
import { getAssignedChannels, addAssignment, removeAssignment } from '../db/queries/assignments.js'

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
      `INSERT INTO tests (id, name, code, schedule_ms, timeout_ms, retries, uses_browser, enabled, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, d.name, d.code, d.schedule_ms, d.timeout_ms, d.retries, d.uses_browser, d.enabled, d.tags]
    )
    testEvents.emit('test:created', rows[0])
    return reply.status(201).send(rows[0])
  })

  // GET /tests/export
  app.get('/export', async (_req, reply) => {
    const { rows } = await pool.query<Test>('SELECT * FROM tests ORDER BY created_at ASC')
    const tests = rows.map(({ id: _id, created_at: _c, updated_at: _u, ...rest }) => rest)
    return reply.send({ tests })
  })

  // POST /tests/import
  app.post<{ Body: unknown }>('/import', async (req, reply) => {
    const body = req.body as { tests?: unknown[] }
    if (!Array.isArray(body?.tests)) {
      return reply.status(400).send({ error: 'body must have a "tests" array' })
    }
    const errors: Record<number, unknown> = {}
    const valid: ReturnType<typeof CreateTestSchema.parse>[] = []
    for (let i = 0; i < body.tests.length; i++) {
      const parsed = CreateTestSchema.safeParse(body.tests[i])
      if (!parsed.success) errors[i] = parsed.error.flatten()
      else valid.push(parsed.data)
    }
    if (Object.keys(errors).length > 0) {
      return reply.status(400).send({ error: 'validation failed', errors })
    }
    const client = await pool.connect()
    const created: Test[] = []
    try {
      await client.query('BEGIN')
      for (const d of valid) {
        const id = nanoid()
        const { rows } = await client.query<Test>(
          `INSERT INTO tests (id, name, code, schedule_ms, timeout_ms, retries, uses_browser, enabled, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [id, d.name, d.code, d.schedule_ms, d.timeout_ms, d.retries, d.uses_browser, d.enabled, d.tags]
        )
        if (rows[0]) created.push(rows[0])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    for (const t of created) testEvents.emit('test:created', t)
    return reply.status(201).send({ created: created.length, tests: created })
  })

  // GET /tests
  app.get<{ Querystring: { tag?: string } }>('/', async (req, reply) => {
    const { tag } = req.query
    const { rows } = tag
      ? await pool.query<Test>(
          'SELECT * FROM tests WHERE $1 = ANY(tags) ORDER BY created_at DESC',
          [tag]
        )
      : await pool.query<Test>('SELECT * FROM tests ORDER BY created_at DESC')
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

  // GET /tests/:id/incidents
  app.get<{ Params: { id: string } }>('/:id/incidents', async (req, reply) => {
    const { rows: exists } = await pool.query<{ id: string }>(
      'SELECT id FROM tests WHERE id = $1',
      [req.params.id]
    )
    if (exists.length === 0) return reply.status(404).send({ error: 'not found' })
    const { rows } = await pool.query<{ started_at: Date; finished_at: Date; status: string }>(
      `SELECT started_at, finished_at, status FROM test_runs
       WHERE test_id = $1 ORDER BY started_at ASC LIMIT 500`,
      [req.params.id]
    )
    const incidents: Incident[] = []
    let current: { started_at: Date; ended_at: Date; count: number } | null = null
    for (const run of rows) {
      if (run.status !== 'success') {
        if (!current) {
          current = { started_at: run.started_at, ended_at: run.finished_at, count: 1 }
        } else {
          current.ended_at = run.finished_at
          current.count++
        }
      } else {
        if (current) {
          incidents.push({
            started_at: current.started_at.toISOString(),
            ended_at: current.ended_at.toISOString(),
            duration_ms: current.ended_at.getTime() - current.started_at.getTime(),
            failure_count: current.count,
            ongoing: false,
          })
          current = null
        }
      }
    }
    if (current) {
      incidents.push({
        started_at: current.started_at.toISOString(),
        ended_at: current.ended_at.toISOString(),
        duration_ms: current.ended_at.getTime() - current.started_at.getTime(),
        failure_count: current.count,
        ongoing: true,
      })
    }
    incidents.reverse()
    return reply.send(incidents)
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

  // GET /tests/:id/channels
  app.get<{ Params: { id: string } }>('/:id/channels', async (req, reply) => {
    const { rows: exists } = await pool.query<{ id: string }>(
      'SELECT id FROM tests WHERE id = $1',
      [req.params.id]
    )
    if (exists.length === 0) return reply.status(404).send({ error: 'not found' })
    const channels = await getAssignedChannels('test', req.params.id)
    return reply.send(channels)
  })

  // POST /tests/:id/channels
  app.post<{ Params: { id: string }; Body: unknown }>('/:id/channels', async (req, reply) => {
    const { rows: exists } = await pool.query<{ id: string }>(
      'SELECT id FROM tests WHERE id = $1',
      [req.params.id]
    )
    if (exists.length === 0) return reply.status(404).send({ error: 'not found' })
    const parsed = CreateAssignmentSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const { rows: chExists } = await pool.query<{ id: string }>(
      'SELECT id FROM notification_channels WHERE id = $1',
      [parsed.data.channel_id]
    )
    if (chExists.length === 0) return reply.status(404).send({ error: 'channel not found' })
    await addAssignment(parsed.data.channel_id, 'test', req.params.id)
    return reply.status(201).send()
  })

  // DELETE /tests/:id/channels/:channel_id
  app.delete<{ Params: { id: string; channel_id: string } }>('/:id/channels/:channel_id', async (req, reply) => {
    await removeAssignment(req.params.channel_id, 'test', req.params.id)
    return reply.status(204).send()
  })
}
