import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LookupAddress, LookupAllOptions } from 'node:dns'
import {
  LOOKUP_TIMEOUT_MS,
  MAX_CONCURRENT_LOOKUPS,
  MAX_PENDING_LOOKUPS,
  boundedLookup,
  pendingLookups,
  setResolverForTests,
} from './dns-lookup.js'

type Done = (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void

/** A resolver that never answers until the test calls answer(host). */
function stalledResolver(): { calls: string[]; answer: (host: string, addrs?: LookupAddress[]) => void } {
  const waiting = new Map<string, Done[]>()
  const calls: string[] = []
  setResolverForTests((hostname: string, _options: LookupAllOptions, done: Done) => {
    calls.push(hostname)
    waiting.set(hostname, [...(waiting.get(hostname) ?? []), done])
  })
  return {
    calls,
    answer: (host, addrs = [{ address: '192.0.2.10', family: 4 }]) => {
      const list = waiting.get(host) ?? []
      waiting.delete(host)
      for (const done of list) done(null, addrs)
    },
  }
}

function lookupAll(host: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    boundedLookup(host, { all: true }, (err, addresses) => (err ? reject(err) : resolve(addresses as LookupAddress[])))
  })
}

function lookupOne(host: string): Promise<{ address: string; family: number | undefined }> {
  return new Promise((resolve, reject) => {
    boundedLookup(host, {}, (err, address, family) => (err ? reject(err) : resolve({ address: address as string, family })))
  })
}

describe('boundedLookup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    setResolverForTests(null)
  })

  it('returns every address with all: true and the first one otherwise', async () => {
    const r = stalledResolver()
    const all = lookupAll('a.example.com')
    const one = lookupOne('a.example.com')
    r.answer('a.example.com', [
      { address: '192.0.2.1', family: 4 },
      { address: '2001:db8::1', family: 6 },
    ])
    await expect(all).resolves.toHaveLength(2)
    await expect(one).resolves.toEqual({ address: '192.0.2.1', family: 4 })
  })

  it('shares one system lookup per host while it is pending', async () => {
    const r = stalledResolver()
    const lookups = [lookupAll('b.example.com'), lookupAll('b.example.com'), lookupAll('b.example.com')]
    expect(r.calls).toEqual(['b.example.com'])
    r.answer('b.example.com')
    await Promise.all(lookups)
    expect(pendingLookups()).toBe(0)
  })

  it(`runs at most ${MAX_CONCURRENT_LOOKUPS} system lookups at once and queues the rest`, async () => {
    const r = stalledResolver()
    const hosts = Array.from({ length: MAX_CONCURRENT_LOOKUPS + 2 }, (_, i) => `q${i}.example.com`)
    const lookups = hosts.map((h) => lookupAll(h))
    expect(r.calls).toHaveLength(MAX_CONCURRENT_LOOKUPS)
    r.answer(hosts[0] as string)
    await lookups[0]
    expect(r.calls).toHaveLength(MAX_CONCURRENT_LOOKUPS + 1)
    for (const h of hosts) r.answer(h)
    r.answer(hosts[MAX_CONCURRENT_LOOKUPS + 1] as string)
    await Promise.all(lookups)
  })

  it('gives up on a stalled lookup after the timeout but keeps its slot until the resolver returns', async () => {
    const r = stalledResolver()
    const stuck = Array.from({ length: MAX_CONCURRENT_LOOKUPS }, (_, i) => lookupAll(`s${i}.example.com`))
    const queued = lookupAll('later.example.com')
    for (const p of [...stuck, queued]) p.catch(() => {})

    vi.advanceTimersByTime(LOOKUP_TIMEOUT_MS)
    for (const p of stuck) await expect(p).rejects.toMatchObject({ code: 'EAI_AGAIN' })
    await expect(queued).rejects.toMatchObject({ code: 'EAI_AGAIN' })
    // The callers are gone, but the threads are still busy: nothing new starts yet.
    expect(r.calls).toHaveLength(MAX_CONCURRENT_LOOKUPS)

    r.answer('s0.example.com')
    expect(r.calls).toContain('later.example.com')
    for (let i = 1; i < MAX_CONCURRENT_LOOKUPS; i++) r.answer(`s${i}.example.com`)
    r.answer('later.example.com')
    expect(pendingLookups()).toBe(0)
  })

  it(`fails at once beyond ${MAX_PENDING_LOOKUPS} pending lookups`, async () => {
    const r = stalledResolver()
    const hosts = Array.from({ length: MAX_PENDING_LOOKUPS }, (_, i) => `p${i}.example.com`)
    const lookups = hosts.map((h) => lookupAll(h))
    for (const p of lookups) p.catch(() => {})
    await expect(lookupAll('one-too-many.example.com')).rejects.toMatchObject({ code: 'EAI_AGAIN' })
    for (let round = 0; round < hosts.length; round++) for (const h of hosts) r.answer(h)
    await Promise.allSettled(lookups)
    expect(pendingLookups()).toBe(0)
  })

  it('passes resolver errors through', async () => {
    setResolverForTests((hostname: string, _options: LookupAllOptions, done: Done) => {
      done(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), [])
    })
    await expect(lookupOne('missing.example.com')).rejects.toMatchObject({ code: 'ENOTFOUND' })
  })
})
