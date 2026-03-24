import { buildServer } from './server.js'
import { startScheduler, stopScheduler } from './scheduler/index.js'
import { startFlusher, stopFlusher, flush } from './db/result-buffer.js'
import { startAggregator, stopAggregator } from './db/aggregator.js'

const app = await buildServer()
await startScheduler()
startFlusher()
startAggregator()
await app.listen({ port: 3000, host: '0.0.0.0' })

async function shutdown(): Promise<void> {
  stopScheduler()
  stopFlusher()
  stopAggregator()
  await flush()
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
