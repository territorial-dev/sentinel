import { createHmac, timingSafeEqual } from 'node:crypto'
import { JWT_SECRET } from '../config.js'

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlEncodeStr(str: string): string {
  return base64urlEncode(Buffer.from(str, 'utf8'))
}

function base64urlDecode(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64').toString('utf8')
}

const HEADER = base64urlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))

function sign(signingInput: string): string {
  return base64urlEncode(createHmac('sha256', JWT_SECRET).update(signingInput).digest())
}

export function signJwt(payload: Record<string, unknown>, expiresInHours = 24): string {
  const now = Math.floor(Date.now() / 1000)
  const claims = { ...payload, iat: now, exp: now + expiresInHours * 3600 }
  const body = base64urlEncodeStr(JSON.stringify(claims))
  const signingInput = `${HEADER}.${body}`
  return `${signingInput}.${sign(signingInput)}`
}

export function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts as [string, string, string]
    const signingInput = `${header}.${body}`
    const expected = sign(signingInput)
    if (sig.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const claims = JSON.parse(base64urlDecode(body)) as Record<string, unknown>
    const now = Math.floor(Date.now() / 1000)
    if (typeof claims['exp'] === 'number' && claims['exp'] < now) return null
    return claims
  } catch {
    return null
  }
}
