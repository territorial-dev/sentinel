import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Test } from '@sentinel/shared'
import { DeleteTestButton } from '../_components/delete-test-button'
import { RunLatencyChartLoader } from '../_components/run-latency-chart-loader'
import { RunHistory, type RunRow } from '../_components/run-history'
import { RunNowPanel } from '../_components/run-now-panel'

export const dynamic = 'force-dynamic'

async function getTest(id: string): Promise<Test | null> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/tests/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json() as Promise<Test>
  } catch {
    return null
  }
}

async function getRuns(id: string): Promise<RunRow[]> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/tests/${id}/runs`, { cache: 'no-store' })
    if (!res.ok) return []
    const rows = (await res.json()) as Array<{
      id: string
      status: RunRow['status']
      duration_ms: number
      error_message: string | null
      finished_at: string
      assertions: Array<{ name: string; passed: boolean; message: string | null }>
    }>
    return rows.map(r => ({
      id: r.id,
      status: r.status,
      duration_ms: r.duration_ms,
      error_message: r.error_message,
      finished_at:
        typeof r.finished_at === 'string'
          ? r.finished_at
          : new Date(r.finished_at as unknown as string).toISOString(),
      assertions: r.assertions,
    }))
  } catch {
    return []
  }
}

export default async function TestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const test = await getTest(id)
  if (!test) notFound()
  const runs = await getRuns(id)

  return (
    <main className="min-h-screen w-full bg-zinc-950 px-8 py-10">
      <Link
        href="/"
        className="text-zinc-500 text-xs hover:text-zinc-300 transition-opacity duration-150 block mb-8"
      >
        ← back
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <h1 className="text-zinc-100 text-lg tracking-tight">{test.name}</h1>
        <div className="flex items-center gap-6">
          <Link
            href={`/tests/${id}/edit`}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-opacity duration-150"
          >
            Edit
          </Link>
          <DeleteTestButton testId={id} testName={test.name} />
          <RunNowPanel testId={id} />
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 lg:items-start">
        <section className="min-w-0">
          <h2 className="text-zinc-500 text-xs tracking-widest uppercase font-normal mb-3">Code</h2>
          <pre
            className="text-sm text-zinc-400 bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-4 max-h-72 overflow-auto leading-relaxed whitespace-pre-wrap break-words"
            style={{ fontFamily: 'Consolas, ui-monospace, monospace' }}
          >
            {test.code}
          </pre>
        </section>

        <section className="min-w-0">
          <h2 className="text-zinc-500 text-xs tracking-widest uppercase font-normal mb-3">
            Latency <span className="text-zinc-600 normal-case tracking-normal font-normal">(oldest → newest)</span>
          </h2>
          <RunLatencyChartLoader runs={runs} />
        </section>
      </div>

      <section className="mt-14 w-full max-w-none">
        <h2 className="text-zinc-500 text-xs tracking-widest uppercase font-normal">Recent runs</h2>
        <RunHistory runs={runs} />
      </section>
    </main>
  )
}
