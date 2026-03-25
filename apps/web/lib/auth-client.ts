const COOKIE_NAME = 'sentinel_token'

/** Read token from document.cookie (client-side only). */
export function getToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
  return match ? (match.split('=')[1] ?? null) : null
}

/** Authorization header for client-side fetch calls. */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
