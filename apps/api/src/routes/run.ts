import type { FastifyInstance } from 'fastify'
import type { Test } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import { runTest } from '../executor/run.js'

export async function runRoutes(app: FastifyInstance): Promise<void> {
  // POST /tests/:id/run
  app.post<{ Params: { id: string } }>('/:id/run', async (req, reply) => {
    const { rows } = await pool.query<Test>(
      'SELECT * FROM tests WHERE id = $1',
      [req.params.id]
    )
    const test = rows[0]
    if (test == null) return reply.status(404).send({ error: 'not found' })
    if (!test.enabled) return reply.status(422).send({ error: 'test is disabled' })

    const result = await runTest(test)
    return reply.send(result)
  })
}
