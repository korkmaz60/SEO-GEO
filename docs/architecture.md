# Architecture

## System overview

```
                    ┌──────────────────────────────┐
 Browser ─────────► │ web  (Next.js 16)            │
                    │ UI only; proxies /api/* ─────┼──┐
                    └──────────────────────────────┘  │ same origin
                                                      ▼
 API clients / MCP ─────────────────────► ┌──────────────────────────────┐
 (API key)                                │ api  (NestJS 12, mode=api)   │
                                          │ REST /v1 · auth · OpenAPI    │
                                          │ MCP endpoint                 │
                                          └──────┬──────────────┬────────┘
                                                 │ Prisma       │ enqueue (pg-boss)
                                                 ▼              ▼
                                          ┌──────────────────────────────┐
                                          │ PostgreSQL 16+               │
                                          │ app schema + pgboss schema   │
                                          └──────────────▲───────────────┘
                                                         │ fetch jobs
                                          ┌──────────────┴───────────────┐
                                          │ worker (NestJS, mode=worker) │
                                          │ crawls · rank checks · AI    │
                                          │ runs · reports · alerts      │
                                          └──────┬───────────────┬───────┘
                                                 │               │
                     DataForSEO · LLM providers · Google APIs    │
                     target websites (safe fetcher)              ▼
                                                  Object storage (S3-compatible)
```

- **web** renders the interface. It never talks to the database. In production it forwards
  `/api/*` to the api service, so the browser sees one origin (no CORS, first-party cookies).
- **api** owns authentication, authorization, validation and all business logic. Long or
  paid work is never done inside a request: the api enqueues a job and returns `202` with a
  task resource.
- **worker** is the same NestJS codebase started with `APP_MODE=worker`. It consumes pg-boss
  queues, calls providers, crawls sites, and writes results.
- **PostgreSQL** holds application data and the pg-boss queue tables. Supabase can host it.
- **Object storage** keeps large artifacts: raw SERP/LLM payloads, crawl snapshots, PDFs.
  Self-hosted installs may use the local filesystem driver or MinIO.

## Repository layout

```
apps/
  api/                 NestJS application (api + worker entrypoints)
  web/                 Next.js application
packages/
  contracts/           Zod schemas shared by api and web (DTOs, enums, errors)
  core/                Pure domain logic: domains/URLs, SSRF policy, analyzers, scoring
  dataforseo/          Typed DataForSEO client (envelopes, errors, retries, cost)
  billing/             Cloud billing: plan catalog, provider interface, Stripe adapter
  db/                  Prisma schema, migrations and client factory (M1)
docs/                  Design documentation
docker-compose.yml     Local development services (PostgreSQL)
```

Packages are TypeScript compiled to ESM (`tsc`), consumed through `exports` with type
declarations. Turborepo orders builds (`^build`) and caches lint, typecheck, test and build.

## Runtime modes

`APP_MODE` selects what the api image does:

| Mode | Entry | Responsibilities |
|---|---|---|
| `api` | `dist/main.js` | HTTP server, auth, REST, OpenAPI, MCP |
| `worker` | `dist/worker.js` | Queue consumers and schedules |

Small self-hosted installs can run both in one container (`APP_MODE=all`, M1).

`DEPLOYMENT_MODE` selects the edition (`selfhost` or `cloud`). It enables or disables modules
such as public sign-up and billing; it never forks the code.

## Request flows

**Synchronous read** – `web → /api/v1/... → controller → service → tenant-scoped repository`.

The web app forwards `/api/*` to the api, so the browser only ever talks to one origin and
cookies stay first-party. In M0 this is a Next.js rewrite, which is resolved at build time;
M1 replaces it with a runtime proxy route so one web image works with any `API_URL`.

**Paid or long operation** – e.g. "check rankings now":

1. `POST /v1/projects/:id/rank-tracker/checks` with an `Idempotency-Key`.
2. The service estimates the provider cost, checks the workspace budget, creates a `Task`
   row and enqueues a job with a singleton key.
3. The api responds `202 Accepted` with the task.
4. The worker processes the job, records provider cost in the usage ledger, updates task
   progress, stores results.
5. The web app follows the task (polling, SSE later) and refreshes affected queries.

## Deployment

| | Self-hosted | Cloud |
|---|---|---|
| web | Container (`apps/web`) | Vercel or container |
| api / worker | Same container image, two services | Container platform (Railway, Fly.io, Render…) |
| Database | `postgres:16` container | Supabase Postgres |
| Storage | Local volume or MinIO | Supabase Storage / S3 |
| Email | SMTP | Transactional email provider |

Self-hosted installs use [`deploy/compose.yaml`](../deploy/compose.yaml) (see
[self-hosting.md](self-hosting.md)); the images build from `apps/api/Dockerfile` and
`apps/web/Dockerfile` (Debian slim, non-root, `tini`, health checks). CI builds both and
starts the stack on every change. Publishing images to GitHub Container Registry on tagged
releases comes with the first release. With `MIGRATE_ON_START=true` the api applies
pending migrations before it listens; `prisma migrate deploy` takes a database lock, so
concurrent starts are safe.

## Configuration

All configuration comes from environment variables validated with Zod at boot; the process
exits with a readable error when something is missing. See [`.env.example`](../.env.example).
Groups: runtime (`NODE_ENV`, `APP_MODE`, `DEPLOYMENT_MODE`, `PORT`), URLs (`WEB_URL`,
`API_URL`), database (`DATABASE_URL`, `DIRECT_URL`), security (`AUTH_SECRET`,
`ENCRYPTION_KEY`), providers (optional platform keys for the cloud edition), email, storage.

## Technology decisions

| Area | Choice | Alternatives considered | Why |
|---|---|---|---|
| Backend framework | NestJS 12 (ESM) | Next.js route handlers, Hono, Fastify | Modules + DI shared between api and worker; global guards/pipes make auth and validation structural; mature OpenAPI support |
| Frontend | Next.js 16, React 19, Tailwind v4, shadcn/ui (Base UI) | Vite SPA, TanStack Start | Existing design language; server components for the shell; strong ecosystem |
| Data fetching (web) | TanStack Query + typed client | SWR, server actions | Caching, retries, background refresh, mutation states |
| Validation & contracts | Zod 4 in `packages/contracts` | class-validator | One schema for request validation, OpenAPI generation and web forms |
| Database | PostgreSQL 16+ via Prisma 7 | Drizzle | Mature migrations, driver adapters work with Supabase pooling |
| Queue | pg-boss | BullMQ + Redis, Supabase Queues | Only PostgreSQL to operate; works on Supabase and plain Postgres; retries, schedules, singleton jobs |
| Auth | Better Auth | Auth.js, Supabase Auth | Library, not a service: organizations, invitations, API keys, 2FA; runs on any Postgres |
| i18n | next-intl | i18next | App Router integration, ICU messages, locale-aware formatting |
| Tests | Vitest (all packages), Playwright (web e2e) | Jest | Native ESM, one runner across the monorepo |
| Charts | Recharts via shadcn chart components | ECharts, visx | Already used; themeable with CSS variables |

## Cross-cutting concerns

- **Errors** – RFC 9457 `application/problem+json` with a stable `code`.
- **Logging** – structured JSON logs with request IDs; secrets are never logged.
- **Observability** – health endpoints now; OpenTelemetry traces and metrics in M4.
- **Versioning** – API is versioned in the path (`/v1`); releases follow semver.
