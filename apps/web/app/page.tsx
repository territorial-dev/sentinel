import Link from 'next/link'
import { cookies } from 'next/headers'
import type { TestSummary } from '@sentinel/shared'
import { serverAuthHeaders } from '../lib/auth-server'

export const dynamic = 'force-dynamic'

async function getTests(tag?: string): Promise<TestSummary[]> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const url = tag ? `${apiUrl}/dashboard?tag=${encodeURIComponent(tag)}` : `${apiUrl}/dashboard`
    const res = await fetch(url, { cache: 'no-store', headers: serverAuthHeaders(await cookies()) })
    if (!res.ok) return []
    return res.json() as Promise<TestSummary[]>
  } catch {
    return []
  }
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function StatusBadge({ status }: { status: TestSummary['last_status'] }) {
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        pass
      </span>
    )
  }
  if (status === 'fail' || status === 'timeout') {
    return (
      <span className="flex items-center gap-1.5 text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        fail
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-zinc-500">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block" />
      unknown
    </span>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>
}) {
  const { tag } = await searchParams
  const tests = await getTests(tag)
  const allTags = Array.from(new Set(tests.flatMap(t => t.tags ?? []))).sort()

  return (
    <main className="min-h-screen bg-zinc-950 px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-zinc-100 text-lg">sentinel</h1>
        <div className="flex items-center gap-6">
          <Link href="/status" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">status page</Link>
          <Link href="/channels" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">channels</Link>
          <Link href="/tests/new" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">+ new test</Link>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/"
            className={`text-xs px-3 py-1 rounded-sm transition-colors ${!tag ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
          >
            all
          </Link>
          {allTags.map(t => (
            <Link
              key={t}
              href={`/?tag=${encodeURIComponent(t)}`}
              className={`text-xs px-3 py-1 rounded-sm transition-colors ${tag === t ? 'bg-emerald-900 text-emerald-300' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      {tests.length === 0 ? (
        <p className="text-zinc-500 text-center mt-24">{tag ? `No tests tagged "${tag}".` : 'No tests yet.'}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-600 text-xs tracking-widest uppercase">
              <th className="text-left pb-4 font-normal">Name</th>
              <th className="text-left pb-4 font-normal">Status</th>
              <th className="text-left pb-4 font-normal">Last Run</th>
              <th className="text-left pb-4 font-normal">7-day Pass Rate</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test) => (
              <tr
                key={test.id}
                className="hover:bg-zinc-900/50 transition-opacity duration-150"
              >
                <td className="py-3 pr-8">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/tests/${test.id}`} className="text-zinc-100 hover:text-white transition-colors">
                      {test.name}
                    </Link>
                    {!test.enabled && (
                      <span className="text-zinc-600 text-xs">disabled</span>
                    )}
                    {(test.tags ?? []).map(t => (
                      <Link
                        key={t}
                        href={`/?tag=${encodeURIComponent(t)}`}
                        className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-sm transition-colors"
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-8">
                  <StatusBadge status={test.last_status} />
                </td>
                <td className="py-3 pr-8 text-zinc-400">
                  <time dateTime={test.last_run_at ?? undefined}>
                    {formatRelativeTime(test.last_run_at)}
                  </time>
                </td>
                <td className="py-3 text-zinc-400">
                  {test.pass_rate_7d !== null ? `${test.pass_rate_7d}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
