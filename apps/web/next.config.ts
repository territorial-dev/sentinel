import path from 'path'
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // Required for pnpm monorepos: traces files relative to the repo root
  // so standalone output contains apps/web/server.js (not standalone/server.js)
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default config
