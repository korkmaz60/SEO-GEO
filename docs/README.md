# Design documentation

This folder describes the target design of SEO-GEO: an open-source, self-hostable
platform for **SEO + AI search visibility (GEO/AEO)**, built for in-house teams and
agencies, powered by bring-your-own-key data providers (DataForSEO first).

The previous code in this repository was a demo. Its review is recorded in
[`audit/2026-09-demo-audit.md`](audit/2026-09-demo-audit.md); the new system is built
from scratch in a monorepo, reusing the demo's visual language.

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
| [research/](research/) | Market and GEO research notes |

## Decision log

Status: **Accepted** = agreed with the project owner, **Proposed** = recommended default,
open for change until the milestone that depends on it starts.

| # | Decision | Status |
|---|---|---|
| D1 | Monorepo with pnpm workspaces + Turborepo | Accepted |
| D2 | Backend: NestJS 12 (ESM), one codebase running in `api` and `worker` modes | Accepted |
| D3 | Frontend: Next.js 16 (App Router) + Tailwind CSS v4 + shadcn/ui | Accepted |
| D4 | One codebase for self-hosted and cloud editions (`DEPLOYMENT_MODE`) | Accepted |
| D5 | PostgreSQL; Supabase-compatible but not Supabase-dependent | Proposed |
| D6 | Job queue on PostgreSQL with pg-boss (no Redis requirement) | Proposed |
| D7 | Authentication with Better Auth (organizations, API keys, 2FA) | Proposed |
| D8 | Shared Zod contracts for validation, OpenAPI and typed clients | Proposed |
| D9 | DataForSEO as the first-class data provider, bring-your-own-key | Accepted |
| D10 | Positioning: GEO/AEO depth + agency workflows, Turkish + English at launch | Proposed |
| D11 | License: AGPL-3.0 | Proposed — needs the owner's explicit approval before a `LICENSE` file is added |
| D12 | Cloud billing with Stripe, through the owner's company outside Turkey; loaded only in the cloud edition. Tax: prefer a merchant of record (see backend.md) | Accepted; tax setup to confirm before launch |
