import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../config.js'
import { signJwt } from '../auth/jwt.js'

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: unknown }>('/login', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (typeof body?.['username'] !== 'string' || typeof body?.['password'] !== 'string') {
      return reply.status(400).send({ error: 'username and password required' })
    }
    const { username, password } = body as { username: string; password: string }
    const validUser = safeEqual(username, ADMIN_USERNAME)
    const validPass = safeEqual(password, ADMIN_PASSWORD)
    if (!validUser || !validPass) {
      return reply.status(401).send({ error: 'invalid credentials' })
    }
    const token = signJwt({ sub: 'admin' })
    return reply.send({ token })
  })
}
