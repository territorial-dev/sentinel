import { notFound } from 'next/navigation'
import type { PublicStatusOutcome, PublicStatusTest } from '@sentinel/shared'

export const revalidate = 300

async function getTagStatus(tag: string): Promise<PublicStatusTest[] | null> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/status/tag/${encodeURIComponent(tag)}`, {
      next: { revalidate: 300 },
    })
    if (res.status === 404) return null
    if (!res.ok) return []
    return res.json() as Promise<PublicStatusTest[]>
  } catch {
    return []
  }
}

function outcomeSquareClass(outcome: PublicStatusOutcome): string {
  if (outcome === 'down') return 'bg-red-500/90'
  if (outcome === 'up') return 'bg-emerald-500/90'
  return 'bg-zinc-700/80'
}

function CurrentLabel({ status }: { status: PublicStatusOutcome }) {
  if (status === 'down') {
    return (
      <span className="text-xs tracking-wide text-red-400/90 uppercase">
        down
      </span>
    )
  }
  if (status === 'up') {
    return (
      <span className="text-xs tracking-wide text-emerald-400/90 uppercase">
        up
      </span>
    )
  }
  return (
    <span className="text-xs tracking-wide text-zinc-500 uppercase">
      unknown
    </span>
  )
}

export default async function TagStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const tests = await getTagStatus(slug)

  if (tests === null) notFound()

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-zinc-100 text-lg font-medium">{slug} · status</h1>
          <a href="/status" className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
            all tests →
          </a>
        </div>

        <div className="space-y-8">
          {tests.length === 0 ? (
            <p className="text-zinc-500 text-center text-sm">No tests in this group.</p>
          ) : (
            tests.map((test) => (
              <section
                key={test.id}
                className={`rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-5 py-5 ${!test.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-zinc-100 font-medium text-base">{test.name}</h2>
                    {!test.enabled && (
                      <p className="text-zinc-600 text-xs mt-1">disabled</p>
                    )}
                  </div>
                  <CurrentLabel status={test.current_status} />
                </div>

                <p className="text-4xl font-semibold tabular-nums text-zinc-100 tracking-tight mb-4">
                  {test.uptime_pct_30d !== null ? `${test.uptime_pct_30d}%` : '—'}
                  <span className="block text-xs font-normal text-zinc-500 mt-1 tracking-normal">
                    30-day uptime
                  </span>
                </p>

                <div
                  className="flex gap-1 w-full"
                  role="img"
                  aria-label="30-day daily status, oldest to newest"
                >
                  {test.days.map((d) => (
                    <div
                      key={d.date}
                      title={d.date}
                      className={`flex-1 min-w-0 aspect-square rounded-sm ${outcomeSquareClass(d.outcome)}`}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
