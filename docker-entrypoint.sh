#!/bin/sh
set -e

# Start Fastify API on port 3001
PORT=3001 node /app/apps/api/dist/index.js &

# Start Next.js standalone on port 3000
PORT=3000 node /app/apps/web/server.js &

# Start Caddy as PID 1 — receives SIGTERM on container stop
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
