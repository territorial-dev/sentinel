'use client'

import { useState } from 'react'
import type { NotificationChannel } from '@sentinel/shared'
import { fetchWithAuth } from '../../../lib/auth-client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface TagRowProps {
  tag: string
  allChannels: NotificationChannel[]
  initialAssigned: NotificationChannel[]
}

function TagRow({ tag, allChannels, initialAssigned }: TagRowProps) {
  const [assigned, setAssigned] = useState<NotificationChannel[]>(initialAssigned)
  const [pickerValue, setPickerValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd(channelId: string) {
    if (!channelId) return
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/tags/${encodeURIComponent(tag)}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      })
      if (res.ok) {
        const ch = allChannels.find(c => c.id === channelId)
        if (ch) setAssigned(prev => [...prev, ch])
      }
    } catch {
      // fire-and-forget; silent failure
    } finally {
      setBusy(false)
      setPickerValue('')
    }
  }

  async function handleRemove(channelId: string) {
    setBusy(true)
    try {
      await fetchWithAuth(`${API_URL}/tags/${encodeURIComponent(tag)}/channels/${channelId}`, {
        method: 'DELETE',
      })
      setAssigned(prev => prev.filter(c => c.id !== channelId))
    } catch {
      // silent failure
    } finally {
      setBusy(false)
    }
  }

  const unassigned = allChannels.filter(c => !assigned.some(a => a.id === c.id))

  return (
    <div className="border-b border-zinc-800 py-4">
      <div className="flex items-start justify-between gap-4">
        <span className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-sm shrink-0">{tag}</span>
        <div className="flex flex-wrap gap-1 flex-1">
          {assigned.map(ch => (
            <span key={ch.id} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded-sm">
              {ch.name}
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRemove(ch.id)}
                className="text-zinc-600 hover:text-zinc-300 leading-none disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
          {unassigned.length > 0 && (
            <select
              value={pickerValue}
              disabled={busy}
              onChange={e => void handleAdd(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs px-2 py-0.5 outline-none focus:border-zinc-600 disabled:opacity-50"
            >
              <option value="">+ add</option>
              {unassigned.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          )}
          {assigned.length === 0 && unassigned.length === 0 && (
            <span className="text-zinc-600 text-xs">no channels</span>
          )}
        </div>
      </div>
    </div>
  )
}

interface Props {
  tags: string[]
  allChannels: NotificationChannel[]
  tagAssignments: Record<string, NotificationChannel[]>
}

export function TagAssignmentPanel({ tags, allChannels, tagAssignments }: Props) {
  if (tags.length === 0) return null

  return (
    <div className="mt-12">
      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-6">Tag Assignments</p>
      <div>
        {tags.map(tag => (
          <TagRow
            key={tag}
            tag={tag}
            allChannels={allChannels}
            initialAssigned={tagAssignments[tag] ?? []}
          />
        ))}
      </div>
    </div>
  )
}
