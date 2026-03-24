'use client'

import { useEffect, useRef, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface RunResult {
  status: 'success' | 'fail' | 'timeout'
  duration_ms: number
  error_message: string | null
}

interface Props {
  testId: string
}

export function RunNowPanel({ testId }: Props) {
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    return () => {
      esRef.current?.close()
    }
  }, [])

  function handleRun() {
    if (running) return
    setRunning(true)
    setLogs([])
    setResult(null)
    setError(null)

    const es = new EventSource(`${API_URL}/tests/${testId}/run/stream`)
    esRef.current = es

    es.addEventListener('log', (e) => {
      const data = JSON.parse(e.data) as { message: string }
      setLogs((prev) => [...prev, data.message])
    })

    es.addEventListener('done', (e) => {
      const data = JSON.parse(e.data) as RunResult
      setResult(data)
      es.close()
      esRef.current = null
      setRunning(false)
    })

    es.addEventListener('error', (e) => {
      if ('data' in e) {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { error: string }
          setError(data.error)
        } catch {
          setError('Run failed.')
        }
      } else {
        setError('Connection error. Is the API running?')
      }
      es.close()
      esRef.current = null
      setRunning(false)
    })
  }

  const hasOutput = logs.length > 0 || result !== null || error !== null

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleRun}
        disabled={running}
        className="border border-zinc-700 text-zinc-400 px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:border-zinc-500 hover:text-zinc-200 transition-colors"
      >
        {running ? 'Running…' : 'Run now'}
      </button>

      {hasOutput && (
        <div className="w-80 border border-zinc-800 bg-zinc-900/50 rounded text-xs">
          {logs.length > 0 && (
            <div className="max-h-40 overflow-auto p-3 font-mono" style={{ fontFamily: 'Consolas, ui-monospace, monospace' }}>
              {logs.map((line, i) => (
                <div key={i} className="text-zinc-400 leading-5">{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {result && (
            <div className={`px-3 py-2 flex items-center justify-between border-t border-zinc-800 ${
              result.status === 'success' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              <span>{result.status}</span>
              <span className="text-zinc-500">{result.duration_ms}ms</span>
            </div>
          )}

          {result?.error_message && (
            <div className="px-3 pb-2 text-zinc-400 break-words">{result.error_message}</div>
          )}

          {error && (
            <div className="px-3 py-2 text-red-400 break-words">{error}</div>
          )}
        </div>
      )}
    </div>
  )
}
