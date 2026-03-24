import type { FastifyInstance } from 'fastify'
import { register } from '../metrics/index.js'

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', register.contentType)
    return reply.send(await register.metrics())
  })
}
