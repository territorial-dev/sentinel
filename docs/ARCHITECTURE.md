# Sentinel — Architecture

## Guiding Constraint

The entire architecture is driven by a single deployment target: **1GB RAM, 0.5 vCPU**. Every decision below exists to make that work sustainably at ~500 tests/minute.

---

## Repository Layout

```
sentinel/
├── apps/
│   ├── api/       # Fastify API + scheduler + executor + notifier
│   └── web/       # Next.js frontend
├── packages/
│   └── shared/    # Shared TypeScript types + Zod schemas
└── docs/
```

pnpm workspaces manage the monorepo.

---

## Backend (`apps/api`)

### Runtime
- **Node.js + TypeScript** — async event loop, no multi-threading
- Single process, no worker threads (prevents memory fragmentation)
- `tsx` for development, compiled JS for production

### HTTP Layer
- **Fastify** — minimal overhead (~0.5MB vs Express), schema-based validation
- JSON schema on all routes for free input validation

### Database
- **PostgreSQL** via `pg` (raw SQL only — no ORM, no query builder)
- Connection pool: max **5 connections**
- **Batch writes**: results buffered and flushed every 1–2 seconds in batches of 50–100
- **Time-partitioned tables**: `test_runs_YYYY_MM` — old partitions dropped on schedule
- **UptimeDaily**: pre-aggregated stats written once per day per test — public dashboards never query raw `test_runs`
- Retention: raw runs 7 days, aggregated daily stats 30–90 days

### Outbound HTTP (test execution)
- **Undici** — connection pooling per hostname, reuse across tests hitting the same origin
- Never Axios, never `node-fetch`

### Concurrency Control
- **p-limit** — concurrency cap of 5–10 slots for HTTP tests
- **Separate queue** for Playwright browser tests: max 1 concurrent
- **Backpressure**: if queue is full, skip the check and log — never queue unboundedly

### Scheduler
- `setInterval`-based — one interval per test, registered on startup
- **Jitter**: each test fires at `interval + random(0, interval * 0.1)` to prevent thundering herd
- No cron libraries (too heavy for simple interval scheduling)

### Test Execution Engine
- User test code compiled **once on save** via `new Function('ctx', code)` and cached in memory
- Execution: `Promise.race([compiledFn(ctx), timeout(ms)])` — hard kill after timeout
- `ctx` object exposes only: `ctx.http`, `ctx.assert`, `ctx.log`, `ctx.now()`
- No filesystem access, no arbitrary network calls from user code
- Tests must return a boolean (`true` = pass, `false`/throw = fail)

### Notification Pipeline
- Event-driven: `testFailed → notifier → channels`
- **Fire-and-forget**: notifications never block the test execution path
- State tracked per test: `lastStatus`, `consecutiveFailures`, `lastNotificationAt`
- Alert only on **state transitions** (pass→fail, fail→pass)
- Alert only after **3 consecutive failures** (configurable)
- **5-minute cooldown** between duplicate alerts for same test

### Observability
- **Pino** for structured JSON logging — logs are the primary operational output
- **prom-client**: exposes `/metrics` with `check_duration_ms`, `check_failures_total`, `check_success_rate`

---

## Frontend (`apps/web`)

### Framework
- **Next.js** with App Router — kept minimal
- Server Components for all data-fetching pages (zero client JS where possible)
- Client Components only where interactivity is required (code editor, run button)

### Key UI Areas
- **Dashboard**: test list with last status, last run time, 7-day sparkline
- **Test editor**: Monaco Editor (lazy-loaded, not bundled eagerly) for JS code editing
- **Test detail**: recent runs, pass/fail history, duration chart
- **Public status page**: SSG/ISR from `UptimeDaily` only — never queries raw `test_runs`

### Design System

**Aesthetic:** Apple-like — minimal, calm, purposeful. Every pixel earns its place. No decoration, no chrome, no noise.

**Principles:**
- Negative space is a design element — use it aggressively
- Typography does the work (size + weight hierarchy) — not color
- One primary action per screen. Secondary actions recede.
- Status is communicated via color AND shape (never color alone)
- Animations: opacity transitions only, 150ms max. No slide-ins. No bounce.
- Borders are nearly invisible or absent — surfaces differ by background luminance only
- Error states are calm and specific, not alarming

**Theme:**
- **Dark mode by default** — `dark` class on `<html>`, no system-preference toggle needed for MVP
- Background scale: `zinc-950` (page) → `zinc-900` (card) → `zinc-800` (input/hover)
- Text: `zinc-100` primary, `zinc-400` secondary/muted, `zinc-600` disabled
- Accent: `emerald-500` for success/pass, `red-500` for failure, `zinc-500` for neutral/unknown
- Font family: **Consolas, monospace** — used for both UI text and code. Do not mix with a sans-serif UI font.

**Components:** Use **shadcn/ui** (Radix UI headless primitives + Tailwind). Install components individually with `npx shadcn@latest add <component>`. Never wrap shadcn components in additional abstraction layers — edit the generated component file directly if customization is needed.

### Bundle discipline
- Monaco is the only large client-side dependency — must be dynamically imported
- No heavy UI libraries (no MUI, no Chakra, no Ant Design)
- shadcn/ui components are code-owned (not a runtime package) — acceptable
- Public status pages must load fast — no client-side data fetching

---

## Shared Package (`packages/shared`)

- TypeScript interfaces: `Test`, `TestRun`, `AssertionResult`, `UptimeDaily`, `NotificationChannel`, `TestState`
- Zod schemas for API input validation (shared between API and web)
- No runtime dependencies beyond `zod`

---

## Approved Dependencies

### Backend (`apps/api`)
| Package | Purpose |
|---------|---------|
| `fastify` | HTTP API server |
| `undici` | Outbound HTTP with connection pooling |
| `pg` | PostgreSQL client |
| `p-limit` | Concurrency control |
| `p-timeout` | Promise timeout enforcement |
| `pino` | Structured logging |
| `prom-client` | Prometheus metrics |
| `nanoid` | ID generation |
| `zod` | Schema validation (shared) |

### Frontend (`apps/web`)
| Package | Purpose |
|---------|---------|
| `next` | Framework |
| `react` / `react-dom` | UI |
| `tailwindcss` | Utility-first styling |
| `@radix-ui/*` | Headless UI primitives (via shadcn) |
| `class-variance-authority` | Variant styling for shadcn components |
| `clsx` + `tailwind-merge` | Class merging utilities |
| `lucide-react` | Icon set (used by shadcn) |
| `@monaco-editor/react` | Code editor (lazy-loaded) |
| `zod` | Schema validation (shared) |

**Explicitly banned**: `axios`, `express`, `redis`, `bullmq`, `prisma`, `typeorm`, `sequelize`, `lodash`, `moment`, `@mui/material`, `@chakra-ui/react`, `antd`, `styled-components`

---

## Data Flow

```
[Scheduler] → schedules test at interval+jitter
     ↓
[Executor] → compiles fn, runs with ctx, enforces timeout
     ↓
[Result] → buffered in memory
     ↓
[DB Writer] → batch flush every 1-2s to test_runs + assertion_results
     ↓
[Aggregator] → daily job updates uptime_daily
     ↓
[Notifier] → checks state transition → fires webhook (fire-and-forget)
```

---

## Hard Rules

1. **Event loop must never block** — no sync I/O, no heavy CPU in hot paths
2. **Raw SQL only** — no ORM, no query builder
3. **Batch DB writes** — never `INSERT` individual rows in a loop
4. **Notifications are fire-and-forget** — never `await` a notification in the test path
5. **Playwright is opt-in** — never imported unless the test sets `uses_browser: true`
6. **Public dashboards read only from `UptimeDaily`** — never from raw `test_runs`
7. **No new dependencies** without checking this file's approved list
