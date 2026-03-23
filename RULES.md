# Sentinel — Rules for AI Agents & Contributors

These rules are non-negotiable. They exist because of hard constraints (1GB RAM, 0.5 vCPU) and deliberate design decisions. Do not work around them.

---

## Before You Touch Code

1. **Read `docs/ARCHITECTURE.md`** before modifying anything in `apps/api/src/executor/`, `apps/api/src/scheduler/`, or `apps/api/src/db/`.
2. **Read `docs/DOMAINS.md`** before adding or changing any database schema or entity types.
3. **Read `docs/FEATURES.md`** to understand what is in scope before adding new functionality.

---

## Dependencies

4. **No new dependencies without checking the approved list** in `docs/ARCHITECTURE.md`. The approved list is intentionally short.
5. **Banned packages**: `axios`, `express`, `redis`, `bullmq`, `prisma`, `typeorm`, `sequelize`, `lodash`, `moment`. Do not add these.
6. **No new packages that import native bindings** (`.node` files) without explicit user approval — they complicate deployment.

---

## Database

7. **Raw SQL only** — no ORM, no query builder, no `knex`, no `drizzle`. All SQL lives in `apps/api/src/db/queries/`.
8. **Batch writes** — never `INSERT` individual rows in a loop. Buffer results and flush in batches of 50–100.
9. **Connection pool max is 5** — do not increase this without understanding the RAM implications.
10. **Public dashboards query `uptime_daily` only** — never query raw `test_runs` in any route used by the public status page.
11. **Migrations are plain SQL files** — no migration framework. Number them sequentially: `001_init.sql`, `002_add_field.sql`.

---

## Execution Engine

12. **Event loop must never block** — no `fs.readFileSync`, no `JSON.parse` on large payloads in hot paths, no CPU-heavy loops.
13. **All test execution must use `Promise.race` with a timeout** — never `await` user code without a timeout guard.
14. **User code gets only the `ctx` object** — no `require`, no `import`, no `process`, no `__dirname` in user test functions.
15. **Compile user code once on save** via `new Function('ctx', code)` and cache — do not recompile on every run.

---

## Notifications

16. **Notifications are fire-and-forget** — wrap all notification dispatches in `try/catch`, never `await` them in the test execution path.
17. **Alert on state transitions only** — do not fire a notification if the status hasn't changed.
18. **Respect the failure threshold and cooldown** — check `consecutive_failures >= threshold` and `cooldown elapsed` before firing.

---

## Frontend

19. **Monaco Editor must be dynamically imported** — never include it in the initial bundle. Use `next/dynamic` with `ssr: false`.
20. **No heavy UI component libraries** — no MUI, Chakra, Mantine. Use Tailwind or plain CSS modules.
21. **Server Components by default** — use Client Components only where browser interactivity is required. Minimize client JS.
22. **Public status pages are static** — use `generateStaticParams` + ISR. Never fetch from the API at request time on public routes.

---

## Code Style

23. **TypeScript strict mode** — no `any`. Use `unknown` and narrow explicitly.
24. **No barrel `index.ts` re-exports** inside `apps/api/src/` — import directly from the source file.
25. **File names in `kebab-case`** — e.g., `test-executor.ts`, not `testExecutor.ts`.
26. **Environment variables are loaded once** in `apps/api/src/config.ts` — do not call `process.env` elsewhere.

---

## What to Check Before Submitting

- [ ] Does this introduce a new dependency? Is it on the approved list?
- [ ] Does this write to the DB? Is it batched?
- [ ] Does this run user code? Is there a timeout?
- [ ] Does this add a client-side import in Next.js? Is it dynamically imported?
- [ ] Does this query `test_runs` from a public route? It shouldn't.
