# Sentinel

A lightweight synthetic testing and uptime monitoring platform for developers.

## Docs

- [Product Overview](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Feature Backlog](docs/FEATURES.md)
- [Domain Model](docs/DOMAINS.md)
- [Repository Structure](docs/REPOSITORY.md)

## Structure

```
apps/api    — Fastify API + scheduler + executor + notifier
apps/web    — Next.js dashboard + public status pages
packages/shared — Shared TypeScript types + Zod schemas
```

## Requirements

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+

## Getting Started

```bash
pnpm install
pnpm dev
```

## Exporting and Importing Tests

Sentinel supports exporting all test definitions to JSON and importing them back. This is useful for backups, migrations between environments, or seeding a fresh instance.

### Export

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/tests/export
```

Returns a JSON object with a `tests` array. Each entry contains all test fields except `id`, `created_at`, and `updated_at`, making it directly importable.

```json
{
  "tests": [
    {
      "name": "Homepage check",
      "code": "return (await ctx.http.get('https://example.com')).status === 200",
      "schedule_ms": 60000,
      "timeout_ms": 5000,
      "retries": 0,
      "uses_browser": false,
      "enabled": true,
      "failure_threshold": 3,
      "cooldown_ms": 300000,
      "tags": ["web", "critical"]
    }
  ]
}
```

### Import

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d @export.json \
  http://localhost:3001/tests/import
```

Each test in the array is validated. If any entry is invalid the entire request is rejected with a `400` and a per-index error map — no tests are created. On success, all tests are inserted atomically and the scheduler picks them up immediately.

**Round-trip backup example:**

```bash
# Save
curl -s -H "Authorization: Bearer <token>" \
  http://localhost:3001/tests/export > backup.json

# Restore on a new instance
curl -s -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d @backup.json \
  http://localhost:3001/tests/import
```

> Note: notification channels are not included in the export. They must be reconfigured separately.
