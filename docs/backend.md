# Backend (apps/api)

NestJS 12 (ESM) application. The same build runs as the HTTP API (`APP_MODE=api`) or as the
background worker (`APP_MODE=worker`).

## Module map

```
src/
  main.ts                 HTTP bootstrap
  worker.ts               worker bootstrap (application context, no HTTP)
  app.module.ts           modules loaded in api mode
  worker.module.ts        modules loaded in worker mode (M1)
  config/                 Zod-validated environment
  common/                 validation pipe, problem+json filter, guards, decorators
  modules/
    health/               liveness and readiness
    auth/                 Better Auth mount, session and API-key guards        (M1)
    workspaces/ members/  workspace settings, members, invitations             (M1)
    projects/             projects and brand entities (own brand + competitors) (M1)
    credentials/          encrypted provider keys, connection tests            (M1)
    usage/ budgets/       usage ledger, budgets, cost estimates                (M1)
    tasks/ queue/         task resources, pg-boss integration                  (M1)
    notifications/ audit-log/                                                  (M1)
    providers/
      dataforseo/         adapter over packages/dataforseo: credentials, cache, ledger
      llm/                LLM provider registry (AI SDK) for suggestions/classification
      google/             OAuth and API clients for Search Console / GA4
    rank-tracker/ keywords/ site-audit/ integrations/                          (M2)
    ai-visibility/ mcp/                                                        (M3)
    reports/ alerts/ backlinks/ domains/                                       (M4)
    billing/              cloud edition only                                   (M5)
```

**Layering.** Controllers handle HTTP (auth guard, Zod DTOs from `packages/contracts`) and
call services. Services implement use cases, own transactions and call repositories and
provider adapters. Repositories wrap Prisma and always take the workspace ID. Worker
handlers call the same services, so logic is written once.

## API conventions

| Topic | Convention |
|---|---|
| Base path | `/v1`, JSON, UTF-8 |
| Paths | plural nouns, kebab-case: `/v1/projects/:projectId/tracked-keywords` |
| IDs | UUID strings |
| Lists | `?limit=50&cursor=…&sort=-createdAt` → `{ "data": [...], "nextCursor": "…" \| null }` |
| Errors | RFC 9457 `application/problem+json`: `type`, `title`, `status`, `detail`, `code`, `errors[]` (field errors), `requestId` |
| Async work | `202 Accepted` + `{ "task": {...} }`; progress at `GET /v1/tasks/:id` |
| Idempotency | `Idempotency-Key` header on POSTs that create tasks; replays return the original task |
| Rate limits | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers; `429` with problem+json |
| Auth | session cookie (web) or `Authorization: Bearer <api key>` |
| Docs | OpenAPI at `/v1/openapi.json`, generated from the Zod contracts; Swagger UI at `/docs` (can be disabled) |

The web app uses exactly the same API as third parties.

## Authentication and authorization

- **Better Auth** is mounted under `/v1/auth/*`: email + password with verification,
  password reset, optional Google/GitHub sign-in, TOTP 2FA, organizations (workspaces),
  invitations and API keys.
- **Guards**: `SessionOrApiKeyGuard` resolves the principal; `WorkspaceGuard` resolves the
  workspace from the route (directly or through the project) and checks membership;
  `@RequireRole()` / `@RequirePermission()` enforce the matrix below.
- API keys belong to a user inside one workspace and carry scopes: `read`, `write`,
  `run:paid`.

| Action | owner | admin | member | viewer |
|---|:-:|:-:|:-:|:-:|
| Delete workspace, manage billing | ✓ | | | |
| Manage members and roles | ✓ | ✓ | | |
| Manage provider credentials and budgets | ✓ | ✓ | | |
| Create, archive, delete projects | ✓ | ✓ | | |
| Configure projects (keywords, prompts, competitors, audits, integrations) | ✓ | ✓ | ✓ | |
| Start paid operations | ✓ | ✓ | ✓ | |
| View data and reports | ✓ | ✓ | ✓ | ✓ |

## Background jobs (pg-boss)

| Queue | Trigger | Idempotency key | Paid |
|---|---|---|:-:|
| `rank.dispatch` | hourly schedule; selects projects that are due | per hour | |
| `rank.check` | per project batch → DataForSEO SERP task_post (Standard queue) | `rank:{projectId}:{date}` | ✓ |
| `rank.collect` | DataForSEO pingback, or polling `tasks_ready` when no public URL | provider task ID | |
| `audit.crawl` | manual or schedule | one active run per project | |
| `ai.dispatch` | daily schedule | per day | |
| `ai.run` | prompt × platform × sample | `ai:{promptId}:{platform}:{date}:{sample}` | ✓ |
| `ai.rollup` | after runs, nightly | `ai-rollup:{projectId}:{date}` | |
| `keywords.enrich` | keywords added, monthly refresh | batch hash | ✓ |
| `gsc.sync`, `ga4.sync` | daily | `{source}:{projectId}:{date}` | |
| `reports.render`, `reports.deliver` | schedule or manual | report run ID | |
| `alerts.evaluate` | after data updates | rule + window | |
| `maintenance.*` | partitions, retention, usage rollups | per period | |

Rules for every handler: idempotent writes (upserts keyed by natural keys), bounded retries
with exponential backoff, progress reported on the `task` row, provider cost written to
`usage_entry` in the same transaction as the results.

## DataForSEO integration

`packages/dataforseo` is a typed HTTP client with no framework dependencies:

- Basic auth; per-request timeout; retries with backoff and jitter for network errors,
  HTTP 429/5xx and `5xxxx` API codes; no retries for `4xxxx`.
- Checks the envelope `status_code` (must be `20000`) **and** each task's `status_code`
  (`20000` ok, `20100` task created). DataForSEO reports errors inside HTTP 200 responses,
  so both levels are always checked.
- Returns the `cost` reported by the response for the usage ledger.

`modules/providers/dataforseo` adds what needs the application: resolving the workspace
credential (or the platform credential in the cloud edition), the response cache, the
usage ledger, budget checks and concurrency limits per credential.

| Feature | DataForSEO API | Mode |
|---|---|---|
| Connection test, balance | Appendix `user_data` | free |
| Locations and languages | SERP / Labs locations and languages | cached 30 days |
| Rank tracking | SERP API Google organic `task_post` → `tasks_ready` → `task_get` (advanced) | Standard queue |
| On-demand SERP | SERP API Google organic live (advanced) | Live |
| AI Overview / AI Mode | SERP API AI Overview items; Google AI Mode SERP | Standard / Live |
| Keyword explorer | Labs keyword ideas, suggestions, related keywords, keyword overview, bulk keyword difficulty, search intent | Live, cached |
| Search volume (bulk) | Keywords Data Google Ads search volume | Standard |
| Domain overview | Labs domain rank overview, ranked keywords, historical rank overview, competitors, domain intersection | Live, cached |
| Backlinks | Backlinks summary, referring domains, anchors, backlinks, new/lost time series, spam score | Live, cached |
| Site audit (optional provider) | On-Page API task-based crawl, pages, links, duplicates, Lighthouse | Standard |
| AI visibility | AI Optimization API: LLM Responses (ChatGPT, Claude, Gemini, Perplexity), LLM Mentions, AI Keyword Data, LLM Scraper | Standard / Live |

Exact paths and response fields are verified against the DataForSEO v3 documentation when
each integration is built, and pinned with recorded (sanitized) fixtures and Zod schemas.

**Modes.** Live requests serve interactive research. Scheduled bulk work uses the Standard
queue, which is several times cheaper. SERP depth defaults to what the feature needs (e.g.
top 30 for rank tracking) because every extra page of 10 results is billed.

**Cache.** `provider_cache` keeps responses keyed by `(operation, normalized params)` with
TTLs per operation: keyword metrics 30 days, ideas and suggestions 7 days, domain and
backlink summaries 1–7 days, live SERPs 24 hours. Shared market data is reused across
workspaces; the ledger records whether a result came from cache (cost 0).

**Cost control.** A price table gives pre-flight estimates shown in the UI before a paid
action starts. Budgets are checked before enqueueing; a hard-stop budget rejects the action
with problem code `budget_exceeded`. Actual costs come from the responses.

**Postback.** In the cloud edition Standard tasks use a signed `pingback_url`; self-hosted
installs without a public URL poll `tasks_ready`.

## LLM providers

Used for classification (sentiment), recommendations and content suggestions — never to
produce a metric. Implemented with the AI SDK and a provider registry (OpenAI, Anthropic,
Google, OpenRouter) using the workspace's keys. Every call uses a structured output schema
(Zod), a versioned prompt template, and writes token usage and cost to the ledger. Model IDs
are configuration, not code.

## Site audit crawler

- All requests go through the **safe fetcher** (see [security.md](security.md)).
- Identifies itself as `SEO-GEO-Bot/<version> (+<project url>)` and honors `robots.txt`.
- Discovery: start URL, sitemaps (from `robots.txt`, `/sitemap.xml`, sitemap indexes) and
  internal links. Breadth-first with depth and page limits, per-host concurrency and delay.
- URL normalization: lowercase host, no fragment, default ports removed, configurable
  tracking-parameter stripping.
- Parsing with a real HTML parser (htmlparser2/cheerio): titles, meta, headings, canonical,
  robots, hreflang, JSON-LD types, links, word count, content hash.
- JavaScript rendering is optional (Playwright pool in the worker), off by default.
- Rules come from the issue catalog in `packages/core`: page rules (missing title, long
  title, noindex, …) and site rules (duplicates, orphans, redirect chains, broken links).
- Health score v1: `round(100 × (1 − (pages_with_errors + 0.5 × pages_with_only_warnings) / crawled_pages))`.
- Each run is diffed with the previous one: new, fixed and persisting issues.

## Public API and MCP

- Every capability is available through `/v1` with API keys.
- MCP server at `/v1/mcp` (Streamable HTTP, API-key auth). Tools map to services, e.g.
  `list_projects`, `get_project_overview`, `get_rankings`, `get_keyword_ideas`,
  `get_ai_visibility`, `list_ai_citations`, `get_audit_issues`, `run_site_audit`, `get_task`.
- Tools that spend money require `run:paid` scope, return a cost estimate first, and need an
  explicit confirmation argument.

## Testing

| Level | Tooling | Scope |
|---|---|---|
| Unit | Vitest (+ SWC for decorator metadata) | services, guards, pipes, packages |
| Integration | Vitest + real PostgreSQL (CI service container) | repositories, migrations, tenant isolation |
| Provider contracts | recorded DataForSEO fixtures, DataForSEO sandbox | request building, envelope and task error handling |
| End-to-end | Playwright (web) against api + worker with fake providers | critical user journeys |
