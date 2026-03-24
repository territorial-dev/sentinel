export type TestStatus = 'success' | 'fail' | 'timeout'
export type NotificationChannelType = 'discord' | 'slack' | 'webhook'

export interface Test {
  id: string
  name: string
  code: string
  schedule_ms: number
  timeout_ms: number
  retries: number
  uses_browser: boolean
  enabled: boolean
  failure_threshold: number
  cooldown_ms: number
  created_at: Date
  updated_at: Date
}

export interface TestRun {
  id: string
  test_id: string
  started_at: Date
  finished_at: Date
  status: TestStatus
  duration_ms: number
  error_message: string | null
}

export interface AssertionResult {
  id: string
  test_run_id: string
  name: string
  passed: boolean
  message: string | null
}

export interface UptimeDaily {
  test_id: string
  date: string // YYYY-MM-DD
  success_count: number
  failure_count: number
  avg_latency_ms: number
}

export interface NotificationChannel {
  id: string
  test_id: string
  type: NotificationChannelType
  webhook_url: string
  enabled: boolean
}

export interface TestState {
  test_id: string
  last_status: TestStatus | null
  consecutive_failures: number
  last_notification_at: Date | null
  last_run_at: Date | null
}
