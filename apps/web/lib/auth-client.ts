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

/** Clear token cookie and redirect to login. */
function handleUnauthorized(): void {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`
  window.location.replace('/login')
}

/**
 * fetch() wrapper that automatically redirects to /login on 401.
 * Merges authHeaders() into the request — callers should not pass Authorization manually.
 */
export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  })
  if (res.status === 401) handleUnauthorized()
  return res
}
