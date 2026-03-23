import Fastify from 'fastify'
import { testsRoutes } from './routes/tests.js'

export async function buildServer() {
  const app = Fastify({ logger: true })
  await app.register(testsRoutes, { prefix: '/tests' })
  return app
}
