type CompiledFn = (ctx: unknown) => Promise<unknown>

interface CacheEntry {
  code: string
  fn: CompiledFn
}

const cache = new Map<string, CacheEntry>()

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => CompiledFn

export function getCompiledFn(testId: string, code: string): CompiledFn {
  const entry = cache.get(testId)
  if (entry && entry.code === code) {
    return entry.fn
  }
  const fn = new AsyncFunction('ctx', code)
  cache.set(testId, { code, fn })
  return fn
}

export function invalidateCache(testId: string): void {
  cache.delete(testId)
}
