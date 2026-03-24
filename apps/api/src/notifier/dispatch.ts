import { request } from 'undici'
import type { TestStatus } from '@sentinel/shared'
import { pool } from '../db/pool.js'

const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 5 * 60 * 1000

export interface NotificationCandidate {
  test_id: string
  new_status: TestStatus
  prev_status: TestStatus | null
}

export function triggerNotifications(candidates: NotificationCandidate[]): void {
  runNotifications(candidates).catch((err: unknown) => {
    console.error('notifier: unhandled error', err)
  })
}

async function runNotifications(candidates: NotificationCandidate[]): Promise<void> {
  const transitioned = candidates.filter(c => {
    const prevFailing = c.prev_status !== null && c.prev_status !== 'success'
    const nowFailing = c.new_status !== 'success'
    return (c.prev_status === 'success' && nowFailing) || (prevFailing && c.new_status === 'success')
  })
  if (transitioned.length === 0) return

  const testIds = transitioned.map(c => c.test_id)
  const stateResult = await pool.query<{
    test_id: string
    consecutive_failures: number
    last_notification_at: Date | null
  }>(
    `SELECT test_id, consecutive_failures, last_notification_at FROM test_state WHERE test_id = ANY($1)`,
    [testIds],
  )
  const stateMap = new Map(stateResult.rows.map(r => [r.test_id, r]))

  for (const candidate of transitioned) {
    const state = stateMap.get(candidate.test_id)
    const consecutive = state?.consecutive_failures ?? 0
    const lastNotifiedAt = state?.last_notification_at ?? null

    if (candidate.new_status !== 'success') {
      // fail transition: check threshold and cooldown
      if (consecutive < FAILURE_THRESHOLD) continue
      if (lastNotifiedAt !== null) {
        const elapsed = Date.now() - lastNotifiedAt.getTime()
        if (elapsed < COOLDOWN_MS) continue
      }
      await dispatchForTest(candidate.test_id, 'fail', consecutive)
    } else {
      // recovery transition: only notify if we previously sent a fail alert
      if (lastNotifiedAt === null) continue
      await dispatchForTest(candidate.test_id, 'recovery', consecutive)
    }
  }
}

async function dispatchForTest(
  testId: string,
  event: 'fail' | 'recovery',
  consecutiveFailures: number,
): Promise<void> {
  // Update last_notification_at first to prevent duplicate dispatches
  const newNotifiedAt = event === 'fail' ? new Date() : null
  await pool.query(
    `UPDATE test_state SET last_notification_at = $2 WHERE test_id = $1`,
    [testId, newNotifiedAt],
  )

  const channelResult = await pool.query<{
    type: 'discord' | 'slack' | 'webhook'
    webhook_url: string
    test_name: string
  }>(
    `SELECT nc.type, nc.webhook_url, t.name AS test_name
     FROM notification_channels nc
     JOIN tests t ON t.id = nc.test_id
     WHERE nc.test_id = $1 AND nc.enabled = TRUE`,
    [testId],
  )

  for (const channel of channelResult.rows) {
    try {
      const body = buildPayload(channel.type, channel.test_name, event, consecutiveFailures, testId)
      await request(channel.webhook_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err: unknown) {
      console.error(`notifier: failed to dispatch to ${channel.type} for test ${testId}`, err)
    }
  }
}

function buildPayload(
  type: 'discord' | 'slack' | 'webhook',
  testName: string,
  event: 'fail' | 'recovery',
  consecutiveFailures: number,
  testId: string,
): Record<string, unknown> {
  if (type === 'discord') {
    const content =
      event === 'fail'
        ? `🚨 **${testName}** has failed ${consecutiveFailures} times in a row`
        : `✅ **${testName}** has recovered`
    return { content }
  }

  if (type === 'slack') {
    const text =
      event === 'fail'
        ? `🚨 *${testName}* has failed ${consecutiveFailures} times in a row`
        : `✅ *${testName}* has recovered`
    return { text }
  }

  // generic webhook
  return {
    test_id: testId,
    test_name: testName,
    event,
    consecutive_failures: consecutiveFailures,
    timestamp: new Date().toISOString(),
  }
}
