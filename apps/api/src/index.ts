import { buildServer } from './server.js'

const app = await buildServer()
await app.listen({ port: 3000, host: '0.0.0.0' })
