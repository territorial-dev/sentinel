# Implementation Log

A running record of what was built and why. Append-only — do not edit past entries.
AI agents must append an entry here after completing any feature from PROJECT.md.

---

<!-- entries go here, newest at the bottom -->

## 2026-03-23 · F-01 · Database Schema & Migrations

**What was built:** Plain SQL migration file creating all six domain tables (`tests`, `test_runs`, `assertion_results`, `uptime_daily`, `notification_channels`, `test_state`) with constraints, indexes, and monthly range partitioning on `test_runs`. A `tsx`-based migration runner tracks applied migrations via a `schema_migrations` table and runs each file in a transaction.

**Files changed:**
- `apps/api/src/db/migrations/001_initial_schema.sql` — full DDL for all tables and initial partitions
- `apps/api/src/db/migrate.ts` — migration runner script
- `apps/api/src/config.ts` — exports `DATABASE_URL` from env (single env-var entry point per RULES.md)
- `apps/api/package.json` — added `"migrate": "tsx src/db/migrate.ts"` script

**Decisions:**
- `test_runs` PK is `(id, started_at)` because Postgres requires the partition key in every unique constraint on a partitioned table.
- No hard FK from `assertion_results` → `test_runs`: enforcing it would require `started_at` in `assertion_results`, which the domain model doesn't include. Integrity is application-enforced.
- Monthly partitions are created via a `DO` block at apply-time so filenames are calendar-correct without hardcoding dates.

**Deferred:** Logic to create new monthly partitions automatically (needed for F-06 daily aggregation job).

## 2026-03-23 · F-02 · API — Test CRUD

**What was built:** Five REST endpoints (`POST /tests`, `GET /tests`, `GET /tests/:id`, `PATCH /tests/:id`, `DELETE /tests/:id`) on a Fastify v5 server. Input validation uses existing Zod schemas from `@sentinel/shared`. All DB access is raw SQL via a `pg.Pool` singleton. IDs generated with `nanoid`.

**Files changed:**
- `apps/api/src/db/pool.ts` — pg Pool singleton (max 5 connections)
- `apps/api/src/routes/tests.ts` — all five route handlers
- `apps/api/src/server.ts` — Fastify instance with route plugin registration
- `apps/api/src/index.ts` — entry point that starts the server on port 3000

**Decisions:**
- PATCH builds a dynamic SET clause from Zod-parsed keys (field names are never raw user input, safe to interpolate); also sets `updated_at = NOW()` on each update.
- 400 returned for both schema violations (via `safeParse`) and empty PATCH bodies.
- 404 for GET/PATCH/DELETE on unknown IDs; 204 no body on successful DELETE.

**Deferred:** Route-level JSON schema for Fastify serialization (perf optimization); pagination for GET /tests.

## 2026-03-23 · F-03 · Execution Engine

**What was built:** Core test execution engine: a compile-and-cache module (`compile.ts`) that wraps user code via `new Function('ctx', code)` and caches compiled functions per test ID; a `ctx` builder (`ctx.ts`) providing `ctx.http` (undici), `ctx.assert`, `ctx.log`, and `ctx.now()`; a `runTest` function (`run.ts`) that executes the compiled function with `Promise.race` timeout enforcement and persists results to `test_runs` + `assertion_results`. A `POST /tests/:id/run` endpoint exposes manual execution.

**Files changed:**
- `apps/api/src/executor/compile.ts` — compile cache with invalidation
- `apps/api/src/executor/ctx.ts` — sandboxed `ctx` object builder
- `apps/api/src/executor/run.ts` — execution, timeout, DB persistence
- `apps/api/src/routes/run.ts` — `POST /tests/:id/run` handler
- `apps/api/src/routes/tests.ts` — calls `invalidateCache` on PATCH and DELETE
- `apps/api/src/server.ts` — registers `runRoutes`

**Decisions:**
- Timeout uses a plain `Promise.race` against a `setTimeout` rejection — no extra dependency.
- `ctx.assert` throws on failure so the executor catches it as `status: 'fail'`; the throw message is preserved as `error_message`.
- Timeout vs non-timeout errors distinguished by checking if the message starts with "Timed out after", keeping the sentinel string in one place.
- Assertion results inserted in one bulk query after execution to avoid per-assertion round-trips.

**Deferred:** Retry logic (`test.retries`); `uses_browser` (Playwright) path; `TestState` update after each run; scheduler integration.
