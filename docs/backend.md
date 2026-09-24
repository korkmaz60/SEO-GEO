# Backend (apps/api)

NestJS 12 (ESM) application. The same build runs as the HTTP API (`APP_MODE=api`) or as the
background worker (`APP_MODE=worker`).

## Module map

```
src/
  main.ts                 HTTP bootstrap (applies migrations first with MIGRATE_ON_START)
  worker.ts               worker bootstrap (application context, no HTTP)
  app.module.ts           modules loaded in api mode
  worker.module.ts        modules loaded in worker mode
  app.setup.ts            HTTP concerns shared with the tests: Better Auth mount, body
                          parser, /api/v1 prefix, problem+json filter, OpenAPI
  config/                 Zod-validated environment, .env loading in development, logger
  common/                 validation pipe, problem+json filter, params, serialization
  auth/                   Better Auth instance and hooks, AuthGuard, WorkspaceGuard,
                          decorators (@Public, @WorkspaceScoped, @RequireRole)
  mail/                   SMTP or console mailer, TR/EN email templates
  crypto/                 AES-256-GCM secret box for provider credentials
  net/                    SafeFetcherService: the only client for user-supplied URLs
  platform/               module groups shared by api and worker
  audit/                  audit log service and GET /audit-log
  notifications/          per-user notifications (type + data, localized by the client)
  usage/                  usage ledger, monthly summary, budgets and thresholds
  tasks/                  task rows, pg-boss queue, task registry, worker runner
  projects/               projects and brand entities (own brand + competitors)
  credentials/            encrypted provider keys, DataForSEO verification, daily re-check,
                          the workspace's DataForSEO client (dataforseo.gateway.ts)
  providers/              shared provider cache (provider_cache), provider error mapping
  keywords/               keyword metrics (Labs keyword overview), research (ideas,
                          suggestions, related keywords), keyword lists
  rank-tracker/           tracked keywords, SERP checks (post and collect), read model
  site-audit/             audit runs; crawl and analysis run in the worker
  google/                 Google OAuth connections, Search Console and GA4 sources, sync
  modules/
    health/               liveness
    account/              GET /instance (sign-up mode), GET /me
    workspaces/           GET /workspaces/:id (membership and role)
  ai-visibility/ mcp/ llm/                                                    (M3)
  reports/ alerts/ backlinks/ domains/                                        (M4)
  billing/                cloud edition only                                  (M5)
```

**Layering.** Controllers handle HTTP (auth guard, Zod DTOs from `packages/contracts`) and
call services. Services implement use cases, own transactions and call repositories and
provider adapters. Repositories wrap Prisma and always take the workspace ID. Worker
handlers call the same services, so logic is written once.

## API conventions

| Topic | Convention |
|---|---|
| Base path | `/api/v1`, JSON, UTF-8 (the same path on the api and, through the proxy, on the web origin) |
| Paths | plural nouns, kebab-case, nested under the workspace: `/api/v1/workspaces/:workspaceId/projects/:projectId/tracked-keywords` |
| IDs | UUID strings |
| Lists | `?limit=50&cursor=…&sort=-createdAt` → `{ "data": [...], "nextCursor": "…" \| null }` |
| Errors | RFC 9457 `application/problem+json`: `type`, `title`, `status`, `detail`, `code`, `errors[]` (field errors), `requestId` |
| Async work | `202 Accepted` + `{ "task": {...} }`; progress at `GET /api/v1/workspaces/:workspaceId/tasks/:taskId` |
| Idempotency | `Idempotency-Key` header on POSTs that create tasks; replays return the original task |
| Rate limits | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers; `429` with problem+json |
| Auth | session cookie (web) or `x-api-key: <api key>` |
| Docs | OpenAPI at `/api/v1/openapi.json`, generated from the Zod contracts; Swagger UI at `/api/docs` (can be disabled) |

The web app uses exactly the same API as third parties.

## Authentication and authorization

- **Better Auth** is mounted under `/api/auth/*`, outside the versioned API: email +
  password with verification, password reset, TOTP 2FA, organizations (workspaces),
  invitations and API keys. Workspace creation, renaming, members and invitations use its
  organization endpoints; its role statements mirror the matrix below.
- **Email verification** is required when SMTP is configured. Without SMTP it is skipped,
  and in development emails (links included) are printed to the api console.
- **Self-hosted sign-up**: the first account can sign up freely; after that, sign-up needs
  a pending invitation. The cloud edition has open sign-up. `GET /api/v1/instance` tells the
  web app which applies.
- **Guards**: a global `AuthGuard` requires a session or API key unless a route is
  `@Public()`; `@WorkspaceScoped()` adds `WorkspaceGuard`, which resolves `:workspaceId`,
  checks membership (non-members get 404, so IDs cannot be probed) and the minimum role set
  with `@RequireRole()`.
- **API keys** (`sg_…`, sent as `x-api-key`) are personal: a key acts as its user, with the
  user's roles in each workspace. Keys can expire and are listed and revoked on the account
  page. Workspace-bound keys with scopes (`read`, `write`, `run:paid`) arrive with the
  public API (M3).
- **Audit trail**: project, credential and budget changes are recorded by their services;
  workspace, invitation and membership changes happen inside Better Auth and are recorded
  by its organization hooks. The acting user, IP and user agent come from a request
  context around the auth handler.

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

| Queue | Trigger | Concurrency and idempotency | Paid |
|---|---|---|:-:|
| `rank.dispatch` | hourly at :07 | queues `rank.check` for projects with keywords due today in the project's time zone | |
| `rank.check` | dispatch, new keywords, "check now" | one job per project (`stately`, singleton key); one check per keyword and day | ✓ |
| `rank.collect` | every minute | polls `tasks_ready`; tasks not listed after 20 minutes are fetched directly; one run at a time | |
| `rank.cleanup` | daily 04:40 UTC | gives up checks pending for 24 hours, deletes SERP snapshots older than 90 days | |
| `keywords.enrich` | keywords added; a due rank check whose metrics are older than 30 days | batches of stale keywords per market | ✓ |
| `audit.crawl` | "start audit" | a task row per run; one active run per project; no retries; expires after 3 hours | |
| `google.sync.dispatch` | daily 05:40 UTC | queues `google.sync` for every source | |
| `google.sync` | dispatch, new source, "sync now" | one job per source (`stately`) | |
| `credentials.reverify` | daily 03:15 UTC | re-checks DataForSEO keys | |
| `maintenance.provider-cache` | daily 04:25 UTC | deletes expired cache entries | |
| `ai.*`, `reports.*`, `alerts.*` | M3–M4 | | |

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

The api adds what needs the application: `credentials/dataforseo.gateway.ts` builds the
client from the workspace credential (the platform credential in the cloud edition, later),
`providers/` holds the shared response cache, and each feature service records costs in the
usage ledger and checks the budget before paid work.

| Feature | DataForSEO API | Mode |
|---|---|---|
| Connection test, balance | Appendix `user_data` | free |
| Locations and languages | SERP / Labs locations and languages | cached 30 days |
| Rank tracking *(M2)* | SERP API Google organic `task_post` → `tasks_ready` → `task_get` (advanced) | Standard queue |
| On-demand SERP | SERP API Google organic live (advanced) | Live |
| AI Overview / AI Mode | SERP API AI Overview items; Google AI Mode SERP | Standard / Live |
| Keyword explorer *(M2)* | Labs keyword ideas, keyword suggestions, related keywords; keyword overview for the metrics of tracked keywords | Live, cached |
| Search volume (bulk) | Keywords Data Google Ads search volume | Standard |
| Domain overview | Labs domain rank overview, ranked keywords, historical rank overview, competitors, domain intersection | Live, cached |
| Backlinks | Backlinks summary, referring domains, anchors, backlinks, new/lost time series, spam score | Live, cached |
| Site audit (optional provider) | On-Page API task-based crawl, pages, links, duplicates, Lighthouse | Standard |
| AI visibility | AI Optimization API: LLM Responses (ChatGPT, Claude, Gemini, Perplexity), LLM Mentions, AI Keyword Data, LLM Scraper | Standard / Live |

Exact paths and response fields are verified against the DataForSEO v3 documentation when
each integration is built, and pinned with recorded (sanitized) fixtures and Zod schemas.

**Modes.** Live requests serve interactive research. Scheduled bulk work uses the Standard
queue, which is several times cheaper. SERP depth defaults to what the feature needs (top 30
for rank tracking) because every extra page of 10 results is billed.

**Prices.** `DATAFORSEO_PRICES` in `packages/dataforseo` holds the list prices used for
estimates (checked 2026-09-24):

| Item | Price (USD) |
|---|---|
| Google organic SERP, first page of 10 results | 0.0006 Standard · 0.0012 priority · 0.002 Live |
| Each further page of 10 results | 75% of the first page |
| `load_async_ai_overview` | +0.0006, refunded when the SERP has no asynchronous AI Overview |
| Labs (ideas, suggestions, related keywords, keyword overview) | 0.012 per request + 0.00012 per returned keyword |

A daily rank check at depth 30 with AI Overview loading costs at most
`0.0006 × (1 + 0.75 × 2) + 0.0006 = 0.0021` per keyword, about 6.30 per month for 100
keywords. Estimates only size previews and budget checks and err on the high side; what an
action cost always comes from the `cost` field of the responses.

**Cache.** Public market data is shared by all workspaces:

| Data | Where | Fresh for |
|---|---|---|
| Keyword metrics (volume, CPC, difficulty, intent, monthly searches) | `keyword_metric` | 30 days |
| Keyword ideas, suggestions and related keywords | `provider_cache`, keyed by a versioned operation and normalized parameters | 7 days |
| Google organic SERPs of tracked keywords | `serp_snapshot`; a SERP of the same query and market fetched in the last 20 hours is reused instead of paying again | kept 90 days |

Cache hits are free: they are not written to the usage ledger, and responses say
`cached: true` with a cost of 0. Only data that is the same for everyone is cached; nothing
workspace-specific goes into these tables.

**Cost control.** Paid actions show an estimate first (e.g. the quote when adding keywords
to the rank tracker). Budgets are checked before posting; a hard-stop budget rejects the
action with problem code `budget_exceeded`, and scheduled rank checks pause with a
`rank.budget_blocked` notification to owners and admins. DataForSEO account errors (no
balance, blocked access) stop posting for the workspace and notify owners and admins with
`dataforseo.account_blocked`.

**Postback.** M2 polls `tasks_ready` every minute in both editions. A signed `pingback_url`
for the cloud edition can replace polling later.

## Rank tracking

- A tracked keyword is a keyword in the project's market (location, language, device), with
  tags, an optional target URL and a daily or weekly frequency. Up to 5,000 keywords per
  project and 1,000 per request.
- Checks run once per keyword and period in the project's time zone, through the Standard
  queue at depth 30 with asynchronous AI Overviews loaded.
- A check stores the own position (the best result on one of the own brand's domains), the
  ranking URL, competitor positions (their brand domains), SERP features, the features the
  own site holds, and whether an AI Overview appeared and cited the site.
- Visibility and estimated traffic use CTR model v1 in `packages/core` (positions 1–10 on a
  typical desktop curve from 28% to 2%, 11–20 at 1%, deeper results 0), weighted by search
  volume. Share of voice compares the visibility of the own brand and competitors over the
  same keywords. These are models, not measurements, and the UI says so.
- Metrics (volume, difficulty, CPC, intent) come from Labs keyword overview when keywords
  are added; metrics older than 30 days are fetched again when the keyword is next checked.
- Weekly keywords carry their last position forward for up to 7 days in daily series;
  changes compare with the check 7 and 30 days earlier, within a tolerance of 7 days.

## LLM providers

Used for classification (sentiment), recommendations and content suggestions — never to
produce a metric. Implemented with the AI SDK and a provider registry (OpenAI, Anthropic,
Google, OpenRouter) using the workspace's keys. Every call uses a structured output schema
(Zod), a versioned prompt template, and writes token usage and cost to the ledger. Model IDs
are configuration, not code.

## Site audit crawler

- All requests go through the **safe fetcher** (see [security.md](security.md)) with
  redirects handled one hop at a time, so every hop is checked.
- Identifies itself as `SEO-GEO-Bot/<version> (+https://github.com/korkmaz60/SEO-GEO)` and
  honors `robots.txt` (`robots-parser`). A crawl delay (capped at 10 seconds) means one
  request at a time with that pause; otherwise 3 requests run in parallel.
- Discovery: the start URL (after its redirects), sitemaps from `robots.txt` and
  `/sitemap.xml` (sitemap indexes and `.xml.gz` included; at most 25 sitemaps and 50,000
  URLs) and internal links, breadth-first. Up to 5,000 pages per run (500 by default) and a
  click depth of 1–20 (10 by default).
- URL normalization: no fragment or credentials, lower-case host without a trailing dot, no
  default port, tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`, …) removed and
  the remaining parameters sorted.
- Parsing with cheerio (parse5): title, meta description, robots directives, canonical,
  headings, hreflang, `lang`, viewport, JSON-LD types (and invalid blocks), images without
  alt text, links with anchors and `nofollow`, word count and a content hash.
- JavaScript rendering is not part of M2.
- The issue catalog lives in `packages/contracts` (43 issues with severity, category and
  scope); the rules that find them are in `packages/core/src/audit`. Titles, explanations
  and fixes are translated in the web app, and a test fails when an issue has no texts.
- AI search readiness is checked with the rest: AI search crawlers (OAI-SearchBot,
  ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User) and training
  crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot) against
  `robots.txt`, and `/llms.txt`.
- Health score v1: `round(100 × (1 − (pages_with_errors + 0.5 × pages_with_only_warnings) / crawled_pages))`,
  over pages that were requested (not blocked by `robots.txt`).
- Each run is compared with the previous completed run: new and fixed occurrences per
  issue, matched by issue code and URL.
- One active run per project; runs can be canceled. Pages, links and issues are kept for
  the last 10 runs of a project; older runs keep their summary and score.

## Google Search Console and GA4

- **OAuth.** Authorization code flow with PKCE (S256), `access_type=offline` and
  `prompt=consent`. The `state` parameter is sealed with the secret box and carries the
  workspace, project, user, PKCE verifier and a 10-minute expiry; the callback checks that
  the same signed-in user returns and that they are an owner or admin. Scopes: `openid`,
  `email`, `webmasters.readonly`, `analytics.readonly`.
- **Tokens** are sealed (AES-256-GCM, bound to the workspace and Google account) and never
  returned by the API. Access tokens are refreshed on demand; when Google answers
  `invalid_grant`, the connection is marked revoked and owners and admins get a
  `google.revoked` notification. Disconnecting revokes the token at Google and deletes the
  connection, the project sources that used it and the data they imported.
- **Sources.** A project has at most one Search Console property and one GA4 property.
  Choosing a different property deletes the data of the previous one.
- **Sync.** The first import covers 90 days; after that the last 4 days are imported again
  every day, because Search Console data settles over a few days. Search Console:
  `searchAnalytics` by date, date + query and date + page, `dataState=all`, 25,000 rows per
  page. GA4: `runReport` by date, landing page, default channel group and session source,
  with sessions, total users, engaged sessions and key events.
- **AI referrals.** GA4 session sources are matched against the assistant hosts in
  `packages/core` (chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com,
  claude.ai, …) to show traffic from AI assistants next to organic search.
- **Configuration.** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; without them the
  Search Console page explains the setup (see [self-hosting.md](self-hosting.md)).

## Public API and MCP

- Every capability is available through `/v1` with API keys.
- MCP server at `/v1/mcp` (Streamable HTTP, API-key auth). Tools map to services, e.g.
  `list_projects`, `get_project_overview`, `get_rankings`, `get_keyword_ideas`,
  `get_ai_visibility`, `list_ai_citations`, `get_audit_issues`, `run_site_audit`, `get_task`.
- Tools that spend money require `run:paid` scope, return a cost estimate first, and need an
  explicit confirmation argument.

## Billing (cloud edition)

Payments go through Stripe, on the owner's company outside Turkey. The `billing` module is
registered only when `DEPLOYMENT_MODE=cloud`; self-hosted installs never load it and need no
Stripe keys.

- **The workspace is the customer.** Each workspace maps to one Stripe customer and at most
  one subscription. Owners manage billing (see the role matrix above).
- **Stripe-hosted pages.** Plans are bought through Stripe Checkout; plan changes, payment
  methods, invoices and cancellation go through the Stripe Customer Portal. Card data never
  reaches our servers.
- **Webhooks are the source of truth.** `checkout.session.completed`,
  `customer.subscription.*` and `invoice.paid` / `invoice.payment_failed` update the
  `subscription` row. Signatures are verified with the endpoint secret, and processed event
  IDs are stored so that retries and replays are no-ops. The browser's redirect after
  Checkout is never trusted as proof of payment.
- **Plans and limits.** A plan sets limits (projects, tracked keywords, AI prompts, members)
  and a monthly credit allowance. Limits are enforced in services on every write.
- **Usage credits.** Provider costs from the usage ledger that were paid with platform keys
  are converted to credits. When credits run out, paid jobs stop until the next period or a
  top-up (a one-off Checkout payment); a workspace can also switch to its own provider keys.
- **Tax: Stripe Managed Payments.** Stripe is the merchant of record: it calculates,
  collects and remits sales tax and VAT (80+ countries, including EU and UK VAT and Turkish
  VAT on electronic services) and handles fraud and disputes. It adds 3.5% per transaction
  on top of Stripe's processing fees, works only with hosted Checkout and Payment Links, and
  needs an eligible account (a business in one of about 35 supported countries, reviewed by
  Stripe) and products with an eligible tax code. The company is run by one person without
  an accountant, which is why a merchant of record beats plain Stripe Tax (which calculates
  tax but leaves registrations and filings to us). Fallback if the account is not eligible:
  Paddle. Lemon Squeezy was not chosen: it now belongs to Stripe, and its team builds
  Managed Payments.
- **Implementation.** `packages/billing` holds the plan catalog, the provider interface,
  normalized webhook events and the Stripe adapter (`managed_payments.enabled` on Checkout
  Sessions). The api module (raw-body webhook endpoint, persistence, limits, credits) is
  wired once workspaces and the database exist. Paddle would only need a second adapter.

Stripe setup, done by the owner in test mode first:

1. Activate Managed Payments in the Dashboard (eligibility review).
2. Create a product per plan with an eligible SaaS tax code and a monthly price, and a
   product per credit top-up with a one-time price. The price IDs go into the billing
   catalog.
3. Configure the Customer Portal: switching between our plans, cancellation at period end,
   invoice history.
4. Add a webhook endpoint `https://<api>/v1/billing/webhooks/stripe` for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created`, `.updated`, `.deleted`, `invoice.paid` and
   `invoice.payment_failed`.
5. Set `STRIPE_SECRET_KEY` (a restricted key), `STRIPE_WEBHOOK_SECRET` and
   `STRIPE_MANAGED_PAYMENTS=true` on the cloud deployment.

## Testing

| Level | Tooling | Scope |
|---|---|---|
| Unit | Vitest (+ SWC for decorator metadata) | services, guards, pipes, packages |
| Integration | Vitest + real PostgreSQL (CI service container) | repositories, migrations, tenant isolation |
| Provider contracts | recorded DataForSEO fixtures, DataForSEO sandbox | request building, envelope and task error handling |
| End-to-end | Playwright (web) against api + worker with fake providers | critical user journeys |
