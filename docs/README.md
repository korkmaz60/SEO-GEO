# Design documentation

This folder describes the target design of SEO-GEO: an open-source, self-hostable
platform for **SEO + AI search visibility (GEO/AEO)**, built for in-house teams and
agencies, powered by bring-your-own-key data providers (DataForSEO first).

The previous code in this repository was a demo. Its review is recorded in
[`audit/2026-09-demo-audit.md`](audit/2026-09-demo-audit.md); the new system is built
from scratch in a monorepo, reusing the demo's visual language. The demo was removed in
M1 and remains available in the Git history.

## Documents

| Document | What it covers |
|---|---|
| [product.md](product.md) | Positioning, users, principles, module catalog, editions |
| [architecture.md](architecture.md) | System topology, monorepo layout, deployment modes, technology decisions |
| [data-model.md](data-model.md) | Entities, tenancy rules, time-series and cache strategy |
| [backend.md](backend.md) | NestJS module map, API conventions, auth/RBAC, jobs, DataForSEO, crawler, MCP |
| [geo-aeo.md](geo-aeo.md) | How AI visibility is measured: detection rules, metric formulas, scores |
| [security.md](security.md) | Threat model and security controls |
| [frontend.md](frontend.md) | Information architecture, design system, data display rules, i18n |
| [roadmap.md](roadmap.md) | Milestones M0–M5 with exit criteria |
| [self-hosting.md](self-hosting.md) | Installing, configuring, upgrading and backing up with Docker |
| [research/](research/) | Market and GEO research notes |

## Decision log

Status: **Accepted** = agreed with the project owner, or a proposed default that the
milestone depending on it has been built on; **Proposed** = recommended default, open for
change until the milestone that depends on it starts.

| # | Decision | Status |
|---|---|---|
| D1 | Monorepo with pnpm workspaces + Turborepo | Accepted |
| D2 | Backend: NestJS 12 (ESM), one codebase running in `api` and `worker` modes | Accepted |
| D3 | Frontend: Next.js 16 (App Router) + Tailwind CSS v4 + shadcn/ui | Accepted |
| D4 | One codebase for self-hosted and cloud editions (`DEPLOYMENT_MODE`) | Accepted |
| D5 | PostgreSQL; Supabase-compatible but not Supabase-dependent | Accepted (M1) |
| D6 | Job queue on PostgreSQL with pg-boss (no Redis requirement) | Accepted (M1) |
| D7 | Authentication with Better Auth (organizations, API keys, 2FA) | Accepted (M1) |
| D8 | Shared Zod contracts for validation, OpenAPI and typed clients | Accepted (M1) |
| D9 | DataForSEO as the first-class data provider, bring-your-own-key | Accepted |
| D10 | Positioning: GEO/AEO depth + agency workflows, Turkish + English at launch | Proposed |
| D11 | License: AGPL-3.0-only ([LICENSE](../LICENSE)); one license for the self-hosted and cloud editions | Accepted |
| D12 | Cloud billing with Stripe Managed Payments (Stripe is the merchant of record and handles sales tax and VAT) on the owner's company outside Turkey; Paddle as fallback; loaded only in the cloud edition | Accepted |
| D13 | Self-hosting with Docker: one image for api and worker, one for the web app, Docker Compose with PostgreSQL and optional Caddy for HTTPS; migrations run on api start | Accepted (M1) |
| D14 | Rank checks through the DataForSEO Standard queue at depth 30, collected by polling `tasks_ready`; SERPs of the same query and market are shared across projects for 20 hours | Accepted (M2) |
| D15 | Own site crawler in `packages/core` (safe fetcher, cheerio) instead of the On-Page API, so audits cost nothing and work without a provider key | Accepted (M2) |
| D16 | Search Console and GA4 through each workspace's own Google OAuth consent (read-only scopes, sealed state + PKCE); imported rows are private to the project and never cached across workspaces | Accepted (M2) |
| D17 | AI answers through DataForSEO: LLM Scraper (ChatGPT, Gemini) and SERP API (Google AI Mode, AI Overviews) in the Standard queue, LLM Responses live (Claude, Perplexity); weekly with one sample by default; answers stored in the database | Accepted (M3) |
| D18 | AI visibility score v1 and page citability score v1 are deterministic, versioned formulas; rates carry 95% Wilson intervals; LLMs classify (sentiment) but never produce a metric | Accepted (M3) |
| D19 | Workspace-bound API keys with scopes (`read`, `write`, `run:paid`) built on Better Auth keys; keys act as their creator and are refused on account endpoints | Accepted (M3) |
| D20 | MCP server inside the api at `/api/v1/mcp` (Streamable HTTP, stateless, API-key auth); paid tools return an estimate and need `confirm_cost_usd` | Accepted (M3) |
