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
