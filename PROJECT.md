# Sentinel — Project

This file is the single source of truth for what gets built. Features are grouped by milestone. The **Current Focus** section at the top is the only thing AI should pick up and implement — everything else is backlog.

To start a feature: move it (or describe it) into **Current Focus**. When done, mark it complete and pick the next one.

---

## Current Focus

### ✅ F-07 · Notifications

On each run result, check `test_state` for a state transition (pass→fail, fail→pass). If transitioning to fail: only notify after `consecutive_failures >= threshold` (default 3) and cooldown elapsed (default 5 min). Dispatch to all enabled `notification_channels` for that test (Discord/Slack/webhook) via undici POST. Fire-and-forget — wrap in `try/catch`, never await in execution path.

**Done when:** a test that fails 3 times in a row sends a Discord message; a recovery sends a recovery message; a single flaky failure sends nothing.


---

## Milestone 1 — Core Engine (MVP)

### ✅ F-01 · Database Schema & Migrations

Set up the Postgres schema with all tables from the domain model: `tests`, `test_runs`, `assertion_results`, `uptime_daily`, `notification_channels`, `test_state`. Use time-based partitioning on `test_runs` (monthly). Plain SQL migration files in `apps/api/src/db/migrations/`.

**Done when:** running `node migrate.js` against a fresh Postgres instance creates all tables with correct columns, indexes, and constraints.

---

### ✅ F-02 · API — Test CRUD

`POST /tests`, `GET /tests`, `GET /tests/:id`, `PATCH /tests/:id`, `DELETE /tests/:id`. Validates input with Zod schemas from `@sentinel/shared`. Writes to/reads from Postgres via raw SQL. Returns typed JSON.

**Done when:** can create, read, update, and delete a test via the API; invalid input returns 400 with error detail.

---

### ✅ F-03 · Execution Engine

Compile user JS code on save via `new Function('ctx', code)` and cache. On execution: build `ctx` object (with `ctx.http` via undici, `ctx.log`, `ctx.now()`), run compiled function, enforce timeout with `Promise.race`. Return `{ status, duration_ms, error_message }`.

**Done when:** a test that does `return (await ctx.http.get(url)).status === 200` executes correctly and timeouts are enforced.

---

### ✅ F-04 · Scheduler

On startup, register a `setInterval` for each enabled test. Apply jitter (`interval + random(0, interval * 0.1)`). Use `p-limit` to cap concurrency at 10 HTTP tests. Skip run if queue is full (log + continue). Reload schedules when tests are created/updated/deleted via in-process event.

**Done when:** 50 tests with 30s intervals all fire on schedule without piling up; a queue-full scenario skips gracefully.

---

### ✅ F-05 · Result Persistence

Buffer `TestRun` rows in memory after each execution. Flush to Postgres in batches (max 100 rows, every 2 seconds) using a single `INSERT`. Update `test_state` row (upsert) after each run. Never write individual rows in a loop.

**Done when:** results appear in DB within 3 seconds of execution; 500 concurrent results don't cause connection pool exhaustion.

---

### ✅ F-06 · Daily Aggregation

A daily cron (midnight UTC) computes `uptime_daily` stats per test from that day's `test_runs`. Upserts one row per `(test_id, date)`. Prunes `test_runs` partitions older than 7 days. Prunes `uptime_daily` rows older than 90 days.

**Done when:** after a day of test runs, `uptime_daily` has correct `success_count`, `failure_count`, `avg_latency_ms` for each test.

---

### F-07 · Notifications

On each run result, check `test_state` for a state transition (pass→fail, fail→pass). If transitioning to fail: only notify after `consecutive_failures >= threshold` (default 3) and cooldown elapsed (default 5 min). Dispatch to all enabled `notification_channels` for that test (Discord/Slack/webhook) via undici POST. Fire-and-forget — wrap in `try/catch`, never await in execution path.

**Done when:** a test that fails 3 times in a row sends a Discord message; a recovery sends a recovery message; a single flaky failure sends nothing.

---

### F-08 · Prometheus Metrics

Register with `prom-client`: `sentinel_check_duration_ms` (histogram), `sentinel_check_failures_total` (counter), `sentinel_check_success_total` (counter). Expose at `GET /metrics`. Updated after every test run.

**Done when:** `curl /metrics` returns valid Prometheus text format with all three metrics.

---

### F-09 · Web — Dashboard (Test List)

Next.js page at `/` (server component). Fetches all tests from the API. Displays a table: test name, status badge (pass/fail/unknown), last run time, 7-day pass rate from `uptime_daily`. No client-side data fetching.

**Done when:** the dashboard loads and shows the correct status for each test; page renders without client JS.

---

### F-10 · Web — Test Editor

Page at `/tests/new` and `/tests/[id]`. Monaco Editor (dynamically imported, `ssr: false`) for editing JS code. Form fields for name, interval, timeout. On save, calls the API. Basic error display.

**Done when:** can create a new test with JS code in the editor and have it appear in the dashboard.

---

### F-11 · Web — Test Detail

Page at `/tests/[id]`. Shows: last 20 runs with status badge + duration + error message. Link to edit. Delete button with confirmation.

**Done when:** can navigate to a test, see its run history, and delete it.

---

### F-12 · Web — Public Status Page

Page at `/status` (no auth). Server-rendered from `uptime_daily` only — no raw `test_runs` queries. Shows each test: name, current status, 30-day uptime %, 30-day daily history bar. Fast static render (ISR, 5-minute revalidation).

**Done when:** `/status` loads without auth, is fast, and shows 30-day history correctly.

---

## Milestone 2 — Enhanced Execution

### F-13 · Named Assertions

`ctx.assert(name, value, message?)` — records individual assertion results as `assertion_results` rows linked to the `test_run`. Test still passes/fails as a whole, but individual assertions are stored and displayed.

### F-14 · "Run Now" Button

API endpoint `POST /tests/:id/run` triggers immediate execution outside the scheduler. Returns the `TestRun` result synchronously (with a reasonable timeout). Web UI button on the test detail page.

### F-15 · Real-Time Log Streaming

When a "run now" is triggered, stream `ctx.log()` output back to the browser via SSE (`GET /tests/:id/run/stream`). Display in a live console on the test detail page.

### F-16 · Playwright Browser Tests

Per-test opt-in (`uses_browser: true`). Separate execution queue with `p-limit(1)`. Playwright launched as a child process, not in the main event loop. Results recorded same as HTTP tests.

### F-17 · Test Groups & Tags

Add `tags: string[]` to the `Test` entity. Filter dashboard by tag. Group-level public status page at `/status/[tag]`.

---

## Milestone 3 — Auth & Operations

### F-18 · JWT Authentication

`POST /auth/login` returns a JWT. All non-public API routes require `Authorization: Bearer <token>`. Single hardcoded admin credential for MVP (env vars). Public status pages remain unauthenticated.

### F-19 · Export / Import Tests

`GET /tests/export` returns all test definitions as JSON. `POST /tests/import` bulk-creates tests from the same format. Useful for backup and migration.

### F-20 · Incident Timeline

On the test detail page, show a timeline of incidents (contiguous failure periods) with start time, end time, and duration. Derived from `test_runs` or a new `incidents` table.
