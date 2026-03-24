import type { TestSummary } from '@sentinel/shared'

export const dynamic = 'force-dynamic'

async function getTests(): Promise<TestSummary[]> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/dashboard`, { cache: 'no-store' })
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

export default async function DashboardPage() {
  const tests = await getTests()

  return (
    <main className="min-h-screen bg-zinc-950 px-8 py-12">
      <h1 className="text-zinc-100 text-lg mb-8">sentinel</h1>

      {tests.length === 0 ? (
        <p className="text-zinc-500 text-center mt-24">No tests yet.</p>
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
                <td className="py-3 pr-8 text-zinc-100">
                  {test.name}
                  {!test.enabled && (
                    <span className="ml-2 text-zinc-600 text-xs">disabled</span>
                  )}
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
