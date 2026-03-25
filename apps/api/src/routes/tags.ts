import type { FastifyInstance } from 'fastify'
import { CreateAssignmentSchema } from '@sentinel/shared'
import { pool } from '../db/pool.js'
import { getAssignedChannels, addAssignment, removeAssignment, getDistinctTags } from '../db/queries/assignments.js'

export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  // GET /tags
  app.get('/', async (_req, reply) => {
    const tags = await getDistinctTags()
    return reply.send(tags)
  })

  // GET /tags/:tag/channels
  app.get<{ Params: { tag: string } }>('/:tag/channels', async (req, reply) => {
    const channels = await getAssignedChannels('tag', req.params.tag)
    return reply.send(channels)
  })

  // POST /tags/:tag/channels
  app.post<{ Params: { tag: string }; Body: unknown }>('/:tag/channels', async (req, reply) => {
    const parsed = CreateAssignmentSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const { rows: chExists } = await pool.query<{ id: string }>(
      'SELECT id FROM notification_channels WHERE id = $1',
      [parsed.data.channel_id]
    )
    if (chExists.length === 0) return reply.status(404).send({ error: 'channel not found' })
    await addAssignment(parsed.data.channel_id, 'tag', req.params.tag)
    return reply.status(201).send()
  })

  // DELETE /tags/:tag/channels/:channel_id
  app.delete<{ Params: { tag: string; channel_id: string } }>('/:tag/channels/:channel_id', async (req, reply) => {
    await removeAssignment(req.params.channel_id, 'tag', req.params.tag)
    return reply.status(204).send()
  })
}
