import { request } from 'undici'
import type { TestStatus } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import {
  insertNotificationEvent,
  type NotificationEventReason,
} from '../db/queries/notification-events.js'

export interface NotificationCandidate {
  test_id: string
  new_status: TestStatus
  prev_status: TestStatus | null
  error_message: string | null
  duration_ms: number
}

export function triggerNotifications(candidates: NotificationCandidate[]): void {
  runNotifications(candidates).catch((err: unknown) => {
    console.error('notifier: unhandled error', err)
  })
}

async function runNotifications(candidates: NotificationCandidate[]): Promise<void> {
  const actionable = candidates.filter(c => {
    const prevFailing = c.prev_status !== null && c.prev_status !== 'success'
    const nowFailing = c.new_status !== 'success'
    // Always evaluate failing tests so missed threshold crossings can still notify.
    if (nowFailing) return true
    // Recovery only matters on actual fail -> success transition.
    return prevFailing && c.new_status === 'success'
  })
  if (actionable.length === 0) return

  const testIds = actionable.map(c => c.test_id)
  const stateResult = await pool.query<{
    test_id: string
    consecutive_failures: number
    last_notification_at: Date | null
    failure_threshold: number
    cooldown_ms: number
  }>(
    `SELECT ts.test_id, ts.consecutive_failures, ts.last_notification_at,
            t.failure_threshold, t.cooldown_ms
     FROM test_state ts
     JOIN tests t ON t.id = ts.test_id
     WHERE ts.test_id = ANY($1)`,
    [testIds],
  )
  const stateMap = new Map(stateResult.rows.map(r => [r.test_id, r]))

  for (const candidate of actionable) {
    const state = stateMap.get(candidate.test_id)
    const consecutive = state?.consecutive_failures ?? 0
    const lastNotifiedAt = state?.last_notification_at ?? null
    const threshold = state?.failure_threshold ?? 3
    const cooldown = state?.cooldown_ms ?? 300_000

    await logNotificationEventSafe({
      test_id: candidate.test_id,
      event: candidate.new_status !== 'success' ? 'fail' : 'recovery',
      phase: 'evaluated',
      consecutive_failures: consecutive,
      failure_threshold: threshold,
      cooldown_ms: cooldown,
    })

    if (candidate.new_status !== 'success') {
      // fail transition: check per-test threshold and cooldown
      if (consecutive < threshold) {
        await logSkippedEvent(candidate.test_id, 'fail', consecutive, threshold, cooldown, 'below_threshold')
        continue
      }
      if (lastNotifiedAt !== null) {
        const elapsed = Date.now() - lastNotifiedAt.getTime()
        if (elapsed < cooldown) {
          await logSkippedEvent(candidate.test_id, 'fail', consecutive, threshold, cooldown, 'cooldown_active')
          continue
        }
      }
      await dispatchForTest(candidate.test_id, 'fail', consecutive, threshold, cooldown, candidate.error_message, candidate.duration_ms, null)
    } else {
      // recovery transition: only notify if we previously sent a fail alert
      if (lastNotifiedAt === null) {
        await logSkippedEvent(candidate.test_id, 'recovery', consecutive, threshold, cooldown, 'no_prior_notification')
        continue
      }
      await dispatchForTest(candidate.test_id, 'recovery', consecutive, threshold, cooldown, null, candidate.duration_ms, lastNotifiedAt)
    }
  }
}

async function dispatchForTest(
  testId: string,
  event: 'fail' | 'recovery',
  consecutiveFailures: number,
  failureThreshold: number,
  cooldownMs: number,
  errorMessage: string | null,
  durationMs: number,
  lastNotifiedAt: Date | null,
): Promise<void> {
  // Update last_notification_at first to prevent duplicate dispatches
  const newNotifiedAt = event === 'fail' ? new Date() : null
  await pool.query(
    `UPDATE test_state SET last_notification_at = $2 WHERE test_id = $1`,
    [testId, newNotifiedAt],
  )

  const channelResult = await pool.query<{
    id: string
    type: 'discord' | 'slack' | 'webhook'
    webhook_url: string
    test_name: string
  }>(
    `SELECT DISTINCT nc.id, nc.type, nc.webhook_url, t.name AS test_name
     FROM notification_channels nc
     JOIN tests t ON t.id = $1
     WHERE nc.enabled = TRUE
       AND nc.id IN (
         SELECT ca.channel_id FROM channel_assignments ca
         WHERE (ca.scope_type = 'test' AND ca.scope_value = $1)
            OR (
              ca.scope_type = 'tag'
              AND LOWER(BTRIM(ca.scope_value)) = ANY(
                ARRAY(
                  SELECT LOWER(BTRIM(tag_value))
                  FROM unnest(t.tags) AS tag_value
                )
              )
            )
       )`,
    [testId],
  )

  const downtimeMs = lastNotifiedAt !== null ? Date.now() - lastNotifiedAt.getTime() : null

  if (channelResult.rows.length === 0) {
    await logSkippedEvent(testId, event, consecutiveFailures, failureThreshold, cooldownMs, 'no_channels')
    return
  }

  for (const channel of channelResult.rows) {
    await logNotificationEventSafe({
      test_id: testId,
      channel_id: channel.id,
      event,
      phase: 'attempted',
      consecutive_failures: consecutiveFailures,
      failure_threshold: failureThreshold,
      cooldown_ms: cooldownMs,
    })

    try {
      const body = buildPayload(
        channel.type,
        channel.test_name,
        event,
        consecutiveFailures,
        testId,
        errorMessage,
        durationMs,
        downtimeMs,
      )
      const response = await request(channel.webhook_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.statusCode < 200 || response.statusCode >= 300) {
        await logNotificationEventSafe({
          test_id: testId,
          channel_id: channel.id,
          event,
          phase: 'failed',
          reason: 'http_non_2xx',
          consecutive_failures: consecutiveFailures,
          failure_threshold: failureThreshold,
          cooldown_ms: cooldownMs,
          http_status: response.statusCode,
          error_message: `non-2xx status: ${response.statusCode}`,
        })
        continue
      }

      await logNotificationEventSafe({
        test_id: testId,
        channel_id: channel.id,
        event,
        phase: 'sent',
        consecutive_failures: consecutiveFailures,
        failure_threshold: failureThreshold,
        cooldown_ms: cooldownMs,
        http_status: response.statusCode,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      await logNotificationEventSafe({
        test_id: testId,
        channel_id: channel.id,
        event,
        phase: 'failed',
        reason: 'http_error',
        consecutive_failures: consecutiveFailures,
        failure_threshold: failureThreshold,
        cooldown_ms: cooldownMs,
        error_message: message.slice(0, 2000),
      })
      console.error(`notifier: failed to dispatch to ${channel.type} for test ${testId}`, err)
    }
  }
}

async function logSkippedEvent(
  testId: string,
  event: 'fail' | 'recovery',
  consecutiveFailures: number,
  threshold: number,
  cooldownMs: number,
  reason: NotificationEventReason,
): Promise<void> {
  await logNotificationEventSafe({
    test_id: testId,
    event,
    phase: 'skipped',
    reason,
    consecutive_failures: consecutiveFailures,
    failure_threshold: threshold,
    cooldown_ms: cooldownMs,
  })
}

async function logNotificationEventSafe(
  input: Parameters<typeof insertNotificationEvent>[0],
): Promise<void> {
  try {
    await insertNotificationEvent(input)
  } catch (err: unknown) {
    console.error('notifier: failed to write notification event', err)
  }
}

function buildPayload(
  type: 'discord' | 'slack' | 'webhook',
  testName: string,
  event: 'fail' | 'recovery',
  consecutiveFailures: number,
  testId: string,
  errorMessage: string | null,
  durationMs: number,
  downtimeMs: number | null,
): Record<string, unknown> {
  const now = new Date().toISOString()

  if (type === 'discord') {
    if (event === 'fail') {
      const fields: Record<string, unknown>[] = []
      if (errorMessage) {
        fields.push({ name: 'Reason', value: errorMessage, inline: false })
      }
      fields.push({ name: 'Consecutive Failures', value: String(consecutiveFailures), inline: true })
      fields.push({ name: 'Response Time', value: `${durationMs} ms`, inline: true })
      return {
        embeds: [{
          title: `🚨 ${testName} is DOWN`,
          color: 15158332, // red
          fields,
          timestamp: now,
          footer: { text: 'Sentinel' },
        }],
      }
    } else {
      const fields: Record<string, unknown>[] = []
      if (downtimeMs !== null) {
        fields.push({ name: 'Downtime', value: formatDuration(downtimeMs), inline: true })
      }
      fields.push({ name: 'Response Time', value: `${durationMs} ms`, inline: true })
      return {
        embeds: [{
          title: `✅ ${testName} is back UP`,
          color: 3066993, // green
          fields,
          timestamp: now,
          footer: { text: 'Sentinel' },
        }],
      }
    }
  }

  if (type === 'slack') {
    if (event === 'fail') {
      const fields: Record<string, unknown>[] = []
      if (errorMessage) {
        fields.push({ title: 'Reason', value: errorMessage, short: false })
      }
      fields.push({ title: 'Consecutive Failures', value: String(consecutiveFailures), short: true })
      fields.push({ title: 'Response Time', value: `${durationMs} ms`, short: true })
      return {
        attachments: [{
          color: '#e74c3c',
          title: `🚨 ${testName} is DOWN`,
          fields,
          footer: 'Sentinel',
          ts: Math.floor(Date.now() / 1000),
        }],
      }
    } else {
      const fields: Record<string, unknown>[] = []
      if (downtimeMs !== null) {
        fields.push({ title: 'Downtime', value: formatDuration(downtimeMs), short: true })
      }
      fields.push({ title: 'Response Time', value: `${durationMs} ms`, short: true })
      return {
        attachments: [{
          color: '#2ecc71',
          title: `✅ ${testName} is back UP`,
          fields,
          footer: 'Sentinel',
          ts: Math.floor(Date.now() / 1000),
        }],
      }
    }
  }

  // generic webhook
  return {
    test_id: testId,
    test_name: testName,
    event,
    consecutive_failures: consecutiveFailures,
    error_message: errorMessage,
    duration_ms: durationMs,
    downtime_ms: downtimeMs,
    timestamp: now,
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }
  return `${seconds}s`
}
