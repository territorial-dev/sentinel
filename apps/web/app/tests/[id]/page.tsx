import { notFound } from 'next/navigation'
import type { Test } from '@sentinel/shared'
import TestEditor from '../_components/test-editor'

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

export default async function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const test = await getTest(id)
  if (!test) notFound()
  return <TestEditor test={test} />
}
