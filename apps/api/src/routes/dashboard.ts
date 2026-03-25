import type { FastifyInstance } from 'fastify'
import type { TestSummary } from '@sentinel/shared'
import { pool } from '../db/pool.js'

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /dashboard
  app.get<{ Querystring: { tag?: string } }>('/', async (req, reply) => {
    const { tag } = req.query
    const { rows } = tag
      ? await pool.query<TestSummary>(
          `SELECT
            t.id,
            t.name,
            t.enabled,
            t.tags,
            ts.last_status,
            ts.last_run_at,
            ROUND(
              100.0 * SUM(ud.success_count)::numeric /
              NULLIF(SUM(ud.success_count) + SUM(ud.failure_count), 0)
            )::integer AS pass_rate_7d
          FROM tests t
          LEFT JOIN test_state ts ON ts.test_id = t.id
          LEFT JOIN uptime_daily ud
            ON ud.test_id = t.id AND ud.date >= CURRENT_DATE - 6
          WHERE $1 = ANY(t.tags)
          GROUP BY t.id, t.name, t.enabled, t.tags, ts.last_status, ts.last_run_at
          ORDER BY t.created_at DESC`,
          [tag]
        )
      : await pool.query<TestSummary>(`
          SELECT
            t.id,
            t.name,
            t.enabled,
            t.tags,
            ts.last_status,
            ts.last_run_at,
            ROUND(
              100.0 * SUM(ud.success_count)::numeric /
              NULLIF(SUM(ud.success_count) + SUM(ud.failure_count), 0)
            )::integer AS pass_rate_7d
          FROM tests t
          LEFT JOIN test_state ts ON ts.test_id = t.id
          LEFT JOIN uptime_daily ud
            ON ud.test_id = t.id AND ud.date >= CURRENT_DATE - 6
          GROUP BY t.id, t.name, t.enabled, t.tags, ts.last_status, ts.last_run_at
          ORDER BY t.created_at DESC
        `)
    return reply.send(rows)
  })
}
