import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Test } from '@sentinel/shared'
import { DeleteTestButton } from '../_components/delete-test-button'
import { RunHistory, type RunRow } from '../_components/run-history'

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
    <main className="min-h-screen bg-zinc-950 px-8 py-12 max-w-3xl">
      <Link href="/" className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors block mb-8">
        ← back
      </Link>

      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-zinc-800 pb-6">
        <h1 className="text-zinc-100 text-lg">{test.name}</h1>
        <div className="flex items-center gap-6">
          <Link href={`/tests/${id}/edit`} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Edit
          </Link>
          <DeleteTestButton testId={id} testName={test.name} />
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-zinc-500 text-xs tracking-widest uppercase font-normal">Recent runs</h2>
        <RunHistory runs={runs} />
      </section>
    </main>
  )
}
