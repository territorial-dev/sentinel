import Fastify from 'fastify'
import { testsRoutes } from './routes/tests.js'
import { runRoutes } from './routes/run.js'
import { metricsRoutes } from './routes/metrics.js'

export async function buildServer() {
  const app = Fastify({ logger: true })
  await app.register(testsRoutes, { prefix: '/tests' })
  await app.register(runRoutes, { prefix: '/tests' })
  await app.register(metricsRoutes)
  return app
}
