type CompiledFn = (ctx: unknown) => unknown

interface CacheEntry {
  code: string
  fn: CompiledFn
}

const cache = new Map<string, CacheEntry>()

export function getCompiledFn(testId: string, code: string): CompiledFn {
  const entry = cache.get(testId)
  if (entry && entry.code === code) {
    return entry.fn
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function('ctx', code) as CompiledFn
  cache.set(testId, { code, fn })
  return fn
}

export function invalidateCache(testId: string): void {
  cache.delete(testId)
}
