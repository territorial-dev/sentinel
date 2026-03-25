import type { NotificationChannel } from '@sentinel/shared'
import { pool } from '../pool.js'

export async function getAssignedChannels(
  scopeType: 'test' | 'tag',
  scopeValue: string,
): Promise<NotificationChannel[]> {
  const { rows } = await pool.query<NotificationChannel>(
    `SELECT nc.id, nc.name, nc.type, nc.webhook_url, nc.enabled
     FROM notification_channels nc
     JOIN channel_assignments ca ON ca.channel_id = nc.id
     WHERE ca.scope_type = $1 AND ca.scope_value = $2
     ORDER BY nc.name ASC`,
    [scopeType, scopeValue],
  )
  return rows
}

export async function addAssignment(
  channelId: string,
  scopeType: 'test' | 'tag',
  scopeValue: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO channel_assignments (channel_id, scope_type, scope_value)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [channelId, scopeType, scopeValue],
  )
}

export async function removeAssignment(
  channelId: string,
  scopeType: 'test' | 'tag',
  scopeValue: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM channel_assignments
     WHERE channel_id = $1 AND scope_type = $2 AND scope_value = $3`,
    [channelId, scopeType, scopeValue],
  )
}

export async function getDistinctTags(): Promise<string[]> {
  const { rows } = await pool.query<{ tag: string }>(
    `SELECT DISTINCT unnest(tags) AS tag FROM tests WHERE array_length(tags, 1) > 0 ORDER BY tag ASC`,
  )
  return rows.map(r => r.tag)
}
