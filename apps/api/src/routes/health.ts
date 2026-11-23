import type { FastifyInstance } from 'fastify'
import { pool } from '../db/pool.js'
import { resultBufferHealth } from '../db/result-buffer.js'

/**
 * 200 `{ status: 'ok' }` when the database answers and results are being written; 503 when the
 * database is unreachable, or when run results are being dropped or have waited too long to be
 * written (`status: 'degraded'`), so a container health check or an outside monitor notices a
 * Sentinel that keeps running tests but stopped recording them.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_req, reply) => {
    const resultBuffer = resultBufferHealth()
    try {
      await pool.query('SELECT 1')
    } catch (err) {
      return reply.status(503).send({ status: 'error', error: err instanceof Error ? err.message : String(err), result_buffer: resultBuffer })
    }
    if (resultBuffer.degraded) {
      return reply.status(503).send({ status: 'degraded', error: 'run results are not being written to the database', result_buffer: resultBuffer })
    }
    return reply.send({ status: 'ok', result_buffer: resultBuffer })
  })
}
