import { register, Histogram, Counter } from 'prom-client'

export const checkDurationMs = new Histogram({
  name: 'sentinel_check_duration_ms',
  help: 'Test execution duration in milliseconds',
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
})

export const checkFailuresTotal = new Counter({
  name: 'sentinel_check_failures_total',
  help: 'Total number of failed or timed-out test executions',
})

export const checkSuccessTotal = new Counter({
  name: 'sentinel_check_success_total',
  help: 'Total number of successful test executions',
})

export function recordTestResult(status: string, duration_ms: number): void {
  checkDurationMs.observe(duration_ms)
  if (status === 'success') checkSuccessTotal.inc()
  else checkFailuresTotal.inc()
}

export { register }
