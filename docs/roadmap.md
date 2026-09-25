# Roadmap

Each milestone ends with a working, tested, releasable state.

## M0 — Foundation *(done)*

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

## M1 — Platform core *(done)*

- [x] `packages/db`: Prisma schema for identity, workspaces, projects, brand entities,
  credentials, usage, budgets, tasks, audit log, notifications; RLS lockdown migration.
- [x] Better Auth: sign-up/sign-in, email verification, password reset, organizations,
  invitations, roles, API keys, 2FA. Self-hosted first-run admin.
- [x] Workspaces, members, projects and brand entities (own brand + competitors).
- [x] Provider credentials: encrypted storage, DataForSEO connection test with balance.
- [x] Safe fetcher, usage ledger, budgets, task API, pg-boss integration, worker mode.
- [x] Web: auth pages, onboarding (workspace → project → provider key), settings, task indicator.
- [x] Web: replace the build-time `/api` rewrite with a runtime proxy route so one image works
  with any `API_URL`; load `.env` files in dev for the api.
- [x] Docker images and `docker compose` for self-hosting ([self-hosting.md](self-hosting.md)).
- [x] Audit log for workspace, membership, project, credential and budget changes;
  localized in-app notifications (budget thresholds, rejected provider keys).
- [x] Remove `legacy/demo` (it remains in the Git history).

**Exit:** a new user can install with Docker, sign up, create a workspace and project,
connect DataForSEO and see the balance; tenant isolation tests pass.

## M2 — SEO core *(done)*

- [x] Rank tracker: keywords × location × language × device, daily or weekly checks through
  the Standard queue, SERP features, AI Overview presence and citation, competitor
  positions, visibility and share of voice, history charts, cost quote before adding.
- [x] Keyword explorer: ideas, suggestions and related keywords with volume, difficulty,
  intent, CPC and trend; saved lists; adding to the rank tracker; cost preview and a
  7-day cache shared across workspaces.
- [x] Site audit: own crawler on the safe fetcher (robots.txt, sitemaps, internal links),
  43 issues with TR/EN explanations and fixes, AI crawler access and `llms.txt` checks,
  health score v1, new and fixed issues between runs.
- [x] Search Console and GA4: OAuth (sealed state + PKCE), property selection, 90-day
  import and daily sync, top queries and pages, organic and AI assistant traffic.
- [x] Project overview with real data; localized notifications for paused rank checks,
  refused DataForSEO requests and revoked Google access.

**Exit:** a project shows daily rankings, a completed audit and GSC data with provenance and
recorded costs. Verified end to end against recorded DataForSEO responses and a fake Google
API in the integration tests; the first run against live DataForSEO and Google accounts is
still to be done by the project owner.

## M3 — GEO/AEO and agents *(done)*

- [x] Prompt library with tags and markets; weekly or daily schedules with 1–5 samples;
  answers from ChatGPT and Gemini (LLM Scraper), Perplexity and Claude (LLM Responses),
  Google AI Mode and AI Overviews (SERP API); the cost before saving settings or adding
  prompts, and budget stops.
- [x] Mention detection (Turkish-aware, ambiguous names need evidence), citations
  attributed to brands and known pages, optional sentiment.
- [x] Mention and citation rates with 95% intervals, share of voice, average rank, AI
  visibility score v1, significant changes, cited domains and pages, competitor comparison
  and weekly trends.
- [x] Page citability score v1 in the site audit: nine factors, per-page details and
  recommendations, low-score filter.
- [x] Workspace API keys with scopes (`read`, `write`, `run:paid`) and the MCP server with
  12 tools; paid tools need an explicit cost confirmation.
- [x] Web: AI visibility summary, prompts with the answer sheet, sources, competitors; API
  & MCP settings; AI visibility on the project overview.

**Exit:** a project tracks prompts on six AI platforms with trends and competitor share of
voice; an MCP client can query rankings, AI visibility and site audits. Verified against a
fake DataForSEO server in the integration tests and with seeded data in the web app; the
first run against live DataForSEO AI endpoints is still to be done by the project owner.

## M4 — Agency

In this order, each shipped on its own:

- [x] Domain overview for any domain: organic keywords, estimated traffic and its value,
  12-month history, keywords by position, the 100 keywords with the most traffic (track or
  save them), competitors and the backlink summary; a quote before paid loads, a cache shared
  across workspaces, shareable URLs and the `get_domain_overview` MCP tool.
- [ ] Project backlinks: profile, history, new and lost links, referring domains, backlinks,
  anchors, competitors' profiles and the link gap.
- [ ] Alerts: rank drops, new critical audit issues, AI visibility changes, budget thresholds;
  email, Slack and signed webhooks.
- [ ] Reports: templates, white-label branding, server-rendered PDF, schedules, email delivery.
- [ ] Client viewer access per project and read-only share links.
- [ ] OpenTelemetry traces and metrics.

## M5 — Content and growth

- Content optimizer and briefs based on SERP and AI citations; live score while writing.
- Schema (JSON-LD) and `llms.txt` generators.
- WordPress integration.
- Cloud edition: wire `packages/billing` (Stripe Managed Payments) into the api and web:
  webhook endpoint, subscriptions, plan limits, usage credits, billing settings page.
