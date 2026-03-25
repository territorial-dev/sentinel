import Link from 'next/link'
import { cookies } from 'next/headers'
import type { NotificationChannel } from '@sentinel/shared'
import { serverAuthHeaders } from '../../lib/auth-server'
import { ChannelManager } from './_components/channel-manager'

export const dynamic = 'force-dynamic'

async function getChannels(): Promise<NotificationChannel[]> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/channels`, {
      cache: 'no-store',
      headers: serverAuthHeaders(await cookies()),
    })
    if (!res.ok) return []
    return res.json() as Promise<NotificationChannel[]>
  } catch {
    return []
  }
}

export default async function ChannelsPage() {
  const channels = await getChannels()

  return (
    <main className="min-h-screen bg-zinc-950 px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-zinc-100 text-lg hover:text-white transition-colors">sentinel</Link>
        <div className="flex items-center gap-6">
          <Link href="/status" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">status page</Link>
          <Link href="/channels" className="text-zinc-300 text-sm">channels</Link>
          <Link href="/tests/new" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">+ new test</Link>
        </div>
      </div>

      <div className="max-w-3xl">
        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-6">Notification Channels</p>
        <ChannelManager channels={channels} />
      </div>
    </main>
  )
}
