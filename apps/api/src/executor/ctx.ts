import { fetch } from 'undici'
import type { RequestInit } from 'undici'
import type { AssertionResult } from '@sentinel/shared'

export interface HttpResponse {
  status: number
  body: string
  headers: Record<string, string>
}

export interface HttpOptions {
  headers?: Record<string, string>
  timeout?: number
}

export interface TestContext {
  http: {
    get(url: string, options?: HttpOptions): Promise<HttpResponse>
    post(url: string, body: unknown, options?: HttpOptions): Promise<HttpResponse>
  }
  assert: (name: string, value: unknown, message?: string) => void
  log: (message: string) => void
  now: () => Date
}

type AssertionCapture = Omit<AssertionResult, 'id' | 'test_run_id'>

interface CtxBundle {
  ctx: TestContext
  getLogs: () => string[]
  getAssertions: () => AssertionCapture[]
}

export interface BuildCtxOptions {
  onLog?: (message: string) => void
}

async function doFetch(url: string, init: RequestInit): Promise<HttpResponse> {
  const res = await fetch(url, init)
  const body = await res.text()
  const headers: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    headers[key] = value
  })
  return { status: res.status, body, headers }
}

export function buildCtx(options?: BuildCtxOptions): CtxBundle {
  const logs: string[] = []
  const assertions: AssertionCapture[] = []

  const ctx: TestContext = {
    http: {
      async get(url, options) {
        const init: RequestInit = { method: 'GET' }
        if (options?.headers) init.headers = options.headers
        return doFetch(url, init)
      },
      async post(url, body, options) {
        return doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...options?.headers },
          body: JSON.stringify(body),
        })
      },
    },
    assert(name, value, message) {
      const passed = Boolean(value)
      assertions.push({ name, passed, message: message ?? null })
      if (!passed) {
        throw new Error(message ?? `Assertion "${name}" failed`)
      }
    },
    log(message) {
      logs.push(message)
      options?.onLog?.(message)
    },
    now() {
      return new Date()
    },
  }

  return {
    ctx,
    getLogs: () => logs,
    getAssertions: () => assertions,
  }
}
