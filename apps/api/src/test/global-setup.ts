import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Loads .env from the api directory into process.env before tests run.
 * Only sets variables that aren't already defined (environment variables
 * set externally take precedence).
 */
export function setup(): void {
  const envPath = resolve(import.meta.dirname, '../../.env')
  let content: string
  try {
    content = readFileSync(envPath, 'utf8')
  } catch {
    // No .env file — assume env vars are already set (e.g. in CI)
    return
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
