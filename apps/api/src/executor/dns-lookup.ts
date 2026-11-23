import { lookup as systemLookup } from 'node:dns'
import type { LookupAddress, LookupAllOptions, LookupOptions } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { Agent } from 'undici'

/**
 * A `lookup` for the sockets of test I/O (ctx.http, ctx.s3, ctx.k8s) that cannot pile up when
 * the resolver stops answering.
 *
 * `dns.lookup` runs getaddrinfo on libuv's thread pool (4 threads), and a pending getaddrinfo
 * cannot be cancelled: aborting the fetch rejects its promise but leaves the lookup queued. With
 * a dead resolver every lookup takes the resolver's full timeout, so a few dozen tests queue
 * lookups faster than four threads clear them. The queue then grows without bound, holding
 * memory, and every other user of the pool waits behind it, including the database driver's
 * connect to its host, so result writes stall for hours.
 *
 * Bounds:
 * - at most MAX_CONCURRENT_LOOKUPS getaddrinfo calls at once, leaving threads for the rest of
 *   the process;
 * - one lookup per host and options in flight, shared by every caller asking meanwhile;
 * - each caller gives up after LOOKUP_TIMEOUT_MS (or when it is aborted with its socket), so a
 *   test reports a DNS error instead of waiting on the queue;
 * - at most MAX_PENDING_LOOKUPS distinct lookups queued or running; beyond that callers fail at
 *   once.
 * Results are not cached: a test sees DNS changes as soon as the system resolver does.
 */
export const MAX_CONCURRENT_LOOKUPS = 3
export const MAX_PENDING_LOOKUPS = 256
export const LOOKUP_TIMEOUT_MS = 10_000

type SystemLookup = (hostname: string, options: LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void

let resolver: SystemLookup = systemLookup as SystemLookup
let active = 0
const queue: Array<() => void> = []
const pending = new Map<string, Promise<LookupAddress[]>>()

function dnsError(code: string, hostname: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code, errno: undefined, syscall: 'getaddrinfo', hostname })
}

function runNext(): void {
  while (active < MAX_CONCURRENT_LOOKUPS && queue.length > 0) {
    const start = queue.shift()
    start?.()
  }
}

/** One getaddrinfo for `hostname`, run when a slot is free; the slot is held until it returns. */
function sharedLookup(hostname: string, family: number, hints: number): Promise<LookupAddress[]> {
  const key = `${hostname}|${family}|${hints}`
  const existing = pending.get(key)
  if (existing !== undefined) return existing
  if (pending.size >= MAX_PENDING_LOOKUPS) {
    return Promise.reject(dnsError('EAI_AGAIN', hostname, `DNS lookup of ${hostname} not started: ${MAX_PENDING_LOOKUPS} lookups already pending`))
  }
  const promise = new Promise<LookupAddress[]>((resolve, reject) => {
    queue.push(() => {
      active++
      resolver(hostname, { all: true, family, hints }, (err, addresses) => {
        active--
        pending.delete(key)
        runNext()
        if (err) reject(err)
        else resolve(addresses)
      })
    })
  })
  pending.set(key, promise)
  runNext()
  return promise
}

function normalize(options: LookupOptions | undefined): { family: number; hints: number; all: boolean } {
  const family = options?.family === 'IPv4' ? 4 : options?.family === 'IPv6' ? 6 : Number(options?.family ?? 0)
  return { family: Number.isFinite(family) ? family : 0, hints: options?.hints ?? 0, all: options?.all === true }
}

/** Drop-in for `dns.lookup` in `net.connect` / `tls.connect` options. */
export const boundedLookup: LookupFunction = (hostname, options, callback) => {
  const { family, hints, all } = normalize(options)
  let done = false
  const finish = (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]): void => {
    if (done) return
    done = true
    clearTimeout(timer)
    if (err) {
      callback(err, all ? [] : '', undefined)
      return
    }
    const first = addresses[0]
    if (all) callback(null, addresses)
    else if (first === undefined) callback(dnsError('ENOTFOUND', hostname, `getaddrinfo ENOTFOUND ${hostname}`), '', undefined)
    else callback(null, first.address, first.family)
  }
  const timer = setTimeout(() => {
    finish(dnsError('EAI_AGAIN', hostname, `DNS lookup of ${hostname} timed out after ${LOOKUP_TIMEOUT_MS}ms`), [])
  }, LOOKUP_TIMEOUT_MS)
  timer.unref()
  sharedLookup(hostname, family, hints).then(
    (addresses) => finish(null, addresses),
    (err: unknown) => finish(err instanceof Error ? (err as NodeJS.ErrnoException) : dnsError('EAI_FAIL', hostname, String(err)), []),
  )
}

/** Lookups queued or running, for metrics and tests. */
export function pendingLookups(): number {
  return pending.size
}

/** Swaps the system resolver, for tests only. */
export function setResolverForTests(fn: SystemLookup | null): void {
  resolver = fn ?? (systemLookup as SystemLookup)
}

/** Connect options every test-I/O dispatcher uses. */
export const testConnectOptions = { lookup: boundedLookup }

/** The dispatcher for ctx.http and ctx.s3 (ctx.k8s builds its own per CA bundle). */
export const testDispatcher = new Agent({ connect: testConnectOptions })
