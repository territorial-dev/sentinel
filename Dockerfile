# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

# ---- Install all dependencies ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ---- Build API ----
FROM deps AS build-api
COPY packages/shared packages/shared
COPY apps/api apps/api
# Compile TypeScript
RUN pnpm --filter @sentinel/api build
# Create production deployment with only prod node_modules (includes @sentinel/shared)
RUN pnpm --filter @sentinel/api deploy --prod /api-prod

# ---- Build Web ----
FROM deps AS build-web
# Bake /api as the client-side API base path so browser calls go through Caddy
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @sentinel/web build
# Ensure public dir exists (Next.js requires it but the project may not have one)
RUN mkdir -p apps/web/public

# ---- Runner ----
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache caddy

# API: prod node_modules (from pnpm deploy) + compiled dist
COPY --from=build-api /api-prod/node_modules /app/apps/api/node_modules
COPY --from=build-api /app/apps/api/dist /app/apps/api/dist

# Web: Next.js standalone server (self-contained) + static assets + public dir
COPY --from=build-web /app/apps/web/.next/standalone /app/apps/web
COPY --from=build-web /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build-web /app/apps/web/public /app/apps/web/public

# Caddy config and startup script
COPY Caddyfile /etc/caddy/Caddyfile
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
# Server components call the API directly (bypasses Caddy)
ENV API_URL=http://localhost:3001
# HOSTNAME for Next.js standalone server
ENV HOSTNAME=0.0.0.0

EXPOSE 80

CMD ["/app/docker-entrypoint.sh"]
