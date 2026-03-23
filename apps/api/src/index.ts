import { buildServer } from './server.js'
import { startScheduler } from './scheduler/index.js'

const app = await buildServer()
await startScheduler()
await app.listen({ port: 3000, host: '0.0.0.0' })
