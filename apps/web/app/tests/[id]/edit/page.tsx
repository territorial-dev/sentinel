import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Test } from '@sentinel/shared'
import TestEditor from '../../_components/test-editor'
import { serverAuthHeaders } from '../../../../lib/auth-server'

async function getTest(id: string): Promise<Test | null> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/tests/${id}`, { cache: 'no-store', headers: serverAuthHeaders(await cookies()) })
    if (!res.ok) return null
    return res.json() as Promise<Test>
  } catch {
    return null
  }
}

export default async function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const test = await getTest(id)
  if (!test) notFound()
  return <TestEditor test={test} />
}
