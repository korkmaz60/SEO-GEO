# Roadmap

Each milestone ends with a working, tested, releasable state.

## M0 — Foundation *(this change)*

- Design documentation (this folder).
- Monorepo: pnpm workspaces, Turborepo, shared TypeScript and lint configuration.
- `apps/api`: NestJS 12 skeleton — validated configuration, health endpoint, problem+json
  errors, Zod validation pipe, OpenAPI document, api and worker entrypoints.
- `apps/web`: Next.js 16 skeleton — design tokens, shadcn/ui components, app shell with the
  new information architecture, Turkish and English messages, honest empty states,
  `/design` style guide.
- `packages/contracts`, `packages/core` (domain matching, SSRF address policy),
  `packages/dataforseo` (client core: envelope and task status handling, retries, cost).
- CI: lint, typecheck, test, build.

**Exit:** `pnpm install && pnpm build && pnpm test` passes locally and in CI; the web shell
runs against the api health endpoint.

## M1 — Platform core

- `packages/db`: Prisma schema for identity, workspaces, projects, brand entities,
  credentials, usage, budgets, tasks, audit log, notifications; RLS lockdown migration.
- Better Auth: sign-up/sign-in, email verification, password reset, organizations,
  invitations, roles, API keys, 2FA. Self-hosted first-run admin.
- Workspaces, members, projects and brand entities (own brand + competitors).
- Provider credentials: encrypted storage, DataForSEO connection test with balance.
- Safe fetcher, usage ledger, budgets, task API, pg-boss integration, worker mode.
- Web: auth pages, onboarding (workspace → project → provider key), settings, task indicator.
- Web: replace the build-time `/api` rewrite with a runtime proxy route so one image works
  with any `API_URL`; load `.env` files in dev for the api.
- Docker images and `docker compose` for self-hosting.
- Remove `legacy/demo` once nothing references it.

**Exit:** a new user can install with Docker, sign up, create a workspace and project,
connect DataForSEO and see the balance; tenant isolation tests pass.

## M2 — SEO core

- Rank tracker: keywords × location × language × device, Standard-queue checks, SERP
  features, AI Overview presence and citation, competitor positions, history charts.
- Keyword explorer: ideas, suggestions, related keywords, keyword difficulty, intent, save to
  lists or to the rank tracker, with cost preview and caching.
- Site audit: crawler, issue catalog (TR/EN), health score, run diffs.
- Search Console and GA4: OAuth (session-bound state + PKCE), property selection, daily sync.
- Project overview with real data.

**Exit:** a project shows daily rankings, a completed audit and GSC data with provenance and
recorded costs.

## M3 — GEO/AEO and agents

- Prompt library, schedules and sampling; runs through the DataForSEO AI Optimization API;
  AI Overview and AI Mode via SERP API.
- Mentions, citations, share of voice, sentiment, cited sources and pages, visibility score
  with uncertainty.
- Page citability score and recommendations from the site audit.
- Public REST API with API keys and the MCP server.

**Exit:** a project tracks prompts on at least four AI platforms with trends and competitor
share of voice; an MCP client can query rankings and AI visibility.

## M4 — Agency

- Reports: templates, white-label branding, server-rendered PDF, schedules, email delivery.
- Alerts: rank drops, new critical audit issues, AI visibility changes, budget thresholds;
  email, Slack and signed webhooks.
- Client viewer access per project and read-only share links.
- Backlinks and domain overview; competitor keyword and backlink gaps.
- OpenTelemetry traces and metrics.

## M5 — Content and growth

- Content optimizer and briefs based on SERP and AI citations; live score while writing.
- Schema (JSON-LD) and `llms.txt` generators.
- WordPress integration.
- Cloud edition: Stripe billing (Checkout, Customer Portal, webhooks), plans and usage credits.
