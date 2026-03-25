import type { cookies } from 'next/headers'

const COOKIE_NAME = 'sentinel_token'

type CookieStore = Awaited<ReturnType<typeof cookies>>

/** Authorization header for Server Component fetch calls. */
export function serverAuthHeaders(cookieStore: CookieStore): Record<string, string> {
  const token = cookieStore.get(COOKIE_NAME)?.value
  return token ? { Authorization: `Bearer ${token}` } : {}
}
