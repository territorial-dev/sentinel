import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { CreateTestSchema, UpdateTestSchema } from '@sentinel/shared'
import type { Test } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import { invalidateCache } from '../executor/compile.js'

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
    return reply.status(201).send(rows[0])
  })

  // GET /tests
  app.get('/', async (_req, reply) => {
    const { rows } = await pool.query<Test>(
      'SELECT * FROM tests ORDER BY created_at DESC'
    )
    return reply.send(rows)
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
    return reply.status(204).send()
  })
}
