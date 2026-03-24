import Fastify from 'fastify'
import { testsRoutes } from './routes/tests.js'
import { runRoutes } from './routes/run.js'
import { metricsRoutes } from './routes/metrics.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { statusRoutes } from './routes/status.js'

export async function buildServer() {
  const app = Fastify({ logger: true })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type')
    if (request.method === 'OPTIONS') {
      return reply.status(204).send()
    }
  })
  await app.register(testsRoutes, { prefix: '/tests' })
  await app.register(runRoutes, { prefix: '/tests' })
  await app.register(metricsRoutes)
  await app.register(dashboardRoutes, { prefix: '/dashboard' })
  await app.register(statusRoutes, { prefix: '/status' })
  return app
}
