import { pool } from './pool.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

let timeoutHandle: ReturnType<typeof setTimeout> | null = null
let intervalHandle: ReturnType<typeof setInterval> | null = null

function msUntilMidnightUTC(): number {
  const now = new Date()
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return midnight.getTime() - now.getTime()
}

export function startAggregator(): void {
  void runAggregation()
  timeoutHandle = setTimeout(() => {
    void runAggregation()
    intervalHandle = setInterval(() => {
      void runAggregation()
    }, MS_PER_DAY)
  }, msUntilMidnightUTC())
  console.info('aggregator: scheduled — fires at next midnight UTC')
}

export function stopAggregator(): void {
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle)
    timeoutHandle = null
  }
  if (intervalHandle !== null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

export async function runAggregation(): Promise<void> {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterday = new Date(today.getTime() - MS_PER_DAY)
  const tomorrow = new Date(today.getTime() + MS_PER_DAY)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  // 1. Aggregate yesterday's and today's test_runs into uptime_daily
  try {
    await pool.query(
      `INSERT INTO uptime_daily (test_id, date, success_count, failure_count, avg_latency_ms)
       SELECT
         test_id,
         started_at::date                                                AS date,
         COUNT(*) FILTER (WHERE status = 'success')                     AS success_count,
         COUNT(*) FILTER (WHERE status IN ('fail', 'timeout'))          AS failure_count,
         ROUND(AVG(duration_ms)::numeric, 2)                            AS avg_latency_ms
       FROM test_runs
       WHERE started_at >= $1::date
         AND started_at <  $2::date
       GROUP BY test_id, started_at::date
       ON CONFLICT (test_id, date) DO UPDATE SET
         success_count  = EXCLUDED.success_count,
         failure_count  = EXCLUDED.failure_count,
         avg_latency_ms = EXCLUDED.avg_latency_ms`,
      [yesterdayStr, tomorrowStr],
    )
    console.info(`aggregator: upserted uptime_daily for ${yesterdayStr} and today`)
  } catch (err) {
    console.error('aggregator: failed to upsert uptime_daily', err)
  }

  // 2. Prune test_runs partitions older than 7 days
  try {
    const cutoff = new Date(now.getTime() - 7 * MS_PER_DAY)
    const { rows } = await pool.query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relname ~ $1 AND relkind = 'r'`,
      ['^test_runs_\\d{4}_\\d{2}$'],
    )
    for (const { relname } of rows) {
      const match = relname.match(/^test_runs_(\d{4})_(\d{2})$/)
      if (!match) continue
      const year = parseInt(match[1]!, 10)
      const month = parseInt(match[2]!, 10)
      // month from relname is 1-indexed; using it directly as Date month (0-indexed) gives start of next month
      const partitionEnd = new Date(Date.UTC(year, month, 1))
      if (partitionEnd <= cutoff) {
        await pool.query(`DROP TABLE IF EXISTS ${relname}`)
        console.info(`aggregator: dropped partition ${relname}`)
      }
    }
  } catch (err) {
    console.error('aggregator: failed to prune test_runs partitions', err)
  }

  // 3. Prune uptime_daily rows older than 90 days
  try {
    await pool.query(`DELETE FROM uptime_daily WHERE date < CURRENT_DATE - INTERVAL '90 days'`)
    console.info('aggregator: pruned uptime_daily rows older than 90 days')
  } catch (err) {
    console.error('aggregator: failed to prune uptime_daily', err)
  }
}
