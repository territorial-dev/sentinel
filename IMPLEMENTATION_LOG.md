# Implementation Log

A running record of what was built and why. Append-only — do not edit past entries.
AI agents must append an entry here after completing any feature from PROJECT.md.

## 2026-03-24 · F-06 · Daily Aggregation

**What was built:** A daily cron (`aggregator.ts`) that fires at midnight UTC, upserts `uptime_daily` stats from the prior day's `test_runs`, drops `test_runs` monthly partitions older than 7 days, and prunes `uptime_daily` rows older than 90 days. Wired into the process lifecycle alongside the scheduler and result flusher.
**Files changed:**
- `apps/api/src/db/aggregator.ts` (new)
- `apps/api/src/db/aggregator.test.ts` (new — 12 unit tests)
- `apps/api/src/index.ts` (wired startAggregator/stopAggregator)

**Decisions:** Each of the three SQL steps is wrapped in an independent try/catch so a pg_class failure (e.g. permissions) cannot block the uptime_daily prune. Partition names are fetched from pg_class with a parameterized regex to avoid client-side assumptions; the YYYY_MM month value (1-indexed) is used directly as the 0-indexed Date month argument, which naturally yields the start of the *next* month as the partition end bound. No transaction is needed — all three operations are idempotent.
**Deferred:** No integration test (would require a real seeded DB with time-partitioned data); partition creation for future months is handled by the initial migration, not the aggregator.

---

<!-- entries go here, newest at the bottom -->

## 2026-03-24 · F-07b · Enriched Notifications + Per-Test Config

**What was built:** Upgraded notification payloads to include failure reason (error_message), response time, and downtime duration on recovery. Discord uses coloured embeds (red/green); Slack uses attachments with a colour bar. Per-test `failure_threshold` and `cooldown_ms` columns added to the `tests` table via migration `002_notification_config.sql`, replacing the previous hardcoded constants. The DB query in `runNotifications` now JOINs `tests` to read per-test thresholds. `lastNotifiedAt` is captured before being cleared on recovery so the downtime duration can be computed accurately.

**Files changed:**
- `apps/api/src/db/migrations/002_notification_config.sql` (new) — ALTER TABLE adds `failure_threshold` and `cooldown_ms`
- `packages/shared/src/types.ts` — added `failure_threshold`, `cooldown_ms` to `Test`
- `packages/shared/src/schemas.ts` — added both fields to `CreateTestSchema` / `UpdateTestSchema`
- `apps/api/src/notifier/dispatch.ts` — rich embeds/attachments, per-test config, downtime calc, `formatDuration` helper
- `apps/api/src/db/result-buffer.ts` — passes `error_message` and `duration_ms` in `NotificationCandidate`

**Decisions:**
- `lastNotifiedAt` is passed into `dispatchForTest` as a parameter (captured before the UPDATE clears it) so downtime is correct even though the DB is already updated.
- Discord uses `embeds[]` (not `content`) for structured fields; Slack uses legacy `attachments` (widely supported, no OAuth needed for incoming webhooks).
- `formatDuration` produces human-readable strings like "2h 10m", "5m 34s", "8s".
- Per-test defaults (threshold=3, cooldown=5min) match the previously hardcoded values, so existing behaviour is unchanged for tests that don't override them.

**Deferred:** Notification channel CRUD endpoints (needed for F-10 web editor); quiet hours / escalation policy.

---

## 2026-03-24 · F-07 · Notifications

**What was built:** State-transition-based notification dispatch. After each batch flush, `flushTestState` fetches the previous `last_status` for all affected tests, performs the upsert as before, then fires `triggerNotifications()` (fire-and-forget). The notifier filters for pass→fail and fail→pass transitions, checks `consecutive_failures >= 3` and 5-minute cooldown before dispatching fail alerts, and sends recovery alerts only when a prior fail notification was sent (non-null `last_notification_at`). Payloads are dispatched via undici POST to Discord, Slack, or generic webhook channels; each dispatch is wrapped in try/catch. `last_notification_at` is set to `NOW()` on fail and `NULL` on recovery.

**Files changed:**
- `apps/api/src/notifier/dispatch.ts` (new) — `triggerNotifications`, transition filtering, threshold/cooldown checks, webhook dispatch
- `apps/api/src/db/result-buffer.ts` — added prev-state SELECT before upsert; added `triggerNotifications` call after upsert
- `apps/api/src/db/result-buffer.test.ts` — updated call-count assertions (2→3) and call-index refs (1→2) for the new SELECT

**Decisions:**
- Prev-state SELECT runs before the upsert (not after) so transition direction is unambiguous without storing old values.
- `last_notification_at` is updated before dispatching to webhooks to prevent duplicate alerts in case of partial webhook failures.
- Recovery sends only if `last_notification_at != null` to avoid spurious recovery pings for tests that never crossed the failure threshold.
- Recovery resets `last_notification_at` to NULL so the next failure cycle starts with a clean cooldown window.

**Deferred:** Per-channel failure threshold or cooldown overrides; notification channel CRUD endpoints (needed by F-10 web editor).


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

## 2026-03-23 · F-04 · Scheduler

**What was built:** An in-process scheduler that fires each enabled test on its configured interval. On startup it loads all enabled tests from the DB and registers a `setInterval` per test with jitter (`schedule_ms + random(0, schedule_ms * 0.1)`). Concurrency is capped at 10 via `p-limit`; if the limiter is saturated when an interval fires, the run is skipped with a warning log. Tests are kept in sync with CRUD operations via an in-process `EventEmitter` (`testEvents`) whose events are emitted by the CRUD routes.

**Files changed:**
- `apps/api/src/events.ts` — singleton `EventEmitter` for test lifecycle events
- `apps/api/src/scheduler/index.ts` — `startScheduler`, `stopScheduler`, `register`, `unregister`
- `apps/api/src/routes/tests.ts` — emits `test:created`, `test:updated`, `test:deleted` after each mutation
- `apps/api/src/index.ts` — calls `startScheduler()` after server build, before `listen()`

**Decisions:**
- Used Node.js built-in `EventEmitter` instead of a third-party pub/sub; no new deps required.
- `p-limit.activeCount >= CONCURRENCY` check before queuing ensures tasks are dropped (not queued) when at capacity, preventing pile-up.
- Jitter is applied once per `register()` call (not recalculated each tick) to keep timer management simple while still staggering tests registered at the same moment.

**Deferred:** `TestState` update after each scheduled run; retry logic; `uses_browser` (Playwright) path.

## 2026-03-24 · F-08 · Prometheus Metrics

**What was built:** Three prom-client metrics registered at startup — `sentinel_check_duration_ms` (histogram), `sentinel_check_failures_total` (counter), `sentinel_check_success_total` (counter) — and exposed at `GET /metrics` in standard Prometheus text format. Metrics are updated after every flush cycle in `result-buffer.ts`.

**Files changed:**
- `apps/api/src/metrics/index.ts` — new module: metric definitions, `recordTestResult` helper, re-exports `register`
- `apps/api/src/routes/metrics.ts` — new route: `GET /metrics` returns `register.metrics()` with correct `Content-Type`
- `apps/api/src/server.ts` — registered `metricsRoutes` without a prefix
- `apps/api/src/db/result-buffer.ts` — calls `recordTestResult(r.status, r.duration_ms)` for each row after successful DB flush

**Decisions:**
- Metrics are recorded after DB writes succeed (not fire-and-forget before), so counter values reflect persisted results — a failed flush does not increment metrics.
- All rows in the flush batch are recorded individually (not deduped), giving accurate histogram observations and counts per test run.
- Default prom-client registry is used (no custom registry) — standard single-process setup.

**Deferred:** Per-test labels (e.g. `test_id`) were not added to avoid high cardinality; can be opt-in later.

---

## 2026-03-23 · F-05 · Result Persistence

**What was built:** An in-memory result buffer (`result-buffer.ts`) that accumulates `RunResult` rows after each test execution and flushes them to Postgres in batches — up to 100 rows per flush, triggered every 2 seconds or when the buffer hits 100. A single multi-row `INSERT` writes all `test_runs` at once; a deduplicated multi-row upsert (latest result per `test_id`) updates `test_state`. The direct single-row INSERT was removed from the executor, and graceful shutdown drains the buffer before exit.

**Files changed:**
- `apps/api/src/db/result-buffer.ts` — new module: `enqueue`, `startFlusher`, `stopFlusher`, `flush`
- `apps/api/src/executor/run.ts` — removed direct `test_runs` INSERT; cleaned unused `TestRun` import
- `apps/api/src/scheduler/index.ts` — added `.then(enqueue)` to p-limit callback
- `apps/api/src/routes/run.ts` — added `enqueue(result)` after manual run
- `apps/api/src/index.ts` — wired flusher lifecycle; added SIGTERM/SIGINT graceful shutdown

**Decisions:**
- `flushInProgress` boolean guard prevents concurrent flush invocations from competing for connections when a 100-row threshold flush and a timer flush overlap.
- Buffer is swapped atomically (reassign to `[]`) before any `await`, so `enqueue()` calls during a flush write into a fresh array and are not lost.
- On flush error, rows are prepended back to the buffer for retry on the next tick.
- `flushTestRuns` and `flushTestState` are sequential (not parallel) to cap peak connection usage at 1 during a flush cycle, well within the `max: 5` pool.
- `last_notification_at` is excluded from the `test_state` upsert — that column is owned by F-07.

**Deferred:** Retry logic; `uses_browser` path; assertion_results are still written immediately in the executor (not buffered) — buffering them would add complexity for minimal gain given they are already batched per run.
