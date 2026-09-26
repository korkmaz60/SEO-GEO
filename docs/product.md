# Product

## Vision

Search is splitting in two: classic results pages and AI-generated answers (Google AI
Overviews and AI Mode, ChatGPT, Perplexity, Gemini, Claude). SEO-GEO measures and improves
a brand's visibility in **both**, with numbers users can trust and costs they can see.

It is open source and self-hostable. Users bring their own data provider keys and pay
providers directly; the hosted cloud edition removes setup work and adds agency plans.

## Positioning

Commercial suites (Ahrefs, Semrush) own their data but are expensive and closed. OpenSEO
already covers the "open-source Ahrefs on DataForSEO" niche (MIT license, bring-your-own-key,
MCP server, basic AI visibility lookups). Since the underlying data is the same for everyone
using DataForSEO, SEO-GEO competes on the product layer:

1. **GEO/AEO depth** – scheduled prompt tracking across AI platforms, share of voice against
   competitors, citation source analysis, AI Overview / AI Mode ownership per keyword,
   page-level citability scoring, and concrete fixes. Measure → diagnose → fix.
2. **Agency workflows** – many clients in one workspace, roles, client read-only access,
   white-label and scheduled reports, alerts.
3. **Local quality** – Turkish and English from day one (UI, readability metrics, SERP
   defaults), more languages through the same i18n pipeline.
4. **Agent-ready** – every capability exposed through a public REST API and an MCP server.

## Users

| Persona | Needs |
|---|---|
| In-house SEO / marketing lead | One view of rankings, technical health and AI visibility; proof of impact |
| Agency account manager | Many client projects, roles, branded reports, alerts, predictable costs |
| Content strategist | What to write, how to structure it so AI engines cite it, whether it worked |
| Developer / AI agent user | API and MCP access, self-hosting, automation |

## Product principles

1. **Honest data.** Never fabricate or silently estimate a metric. Every number shows its
   source, freshness and method; "no data" is displayed as such, never as zero.
2. **Cost transparency.** Show the estimated provider cost before a paid action runs; record
   the actual cost of every provider call; let workspaces set budgets that stop jobs.
3. **Deterministic scores.** Scores are computed by published, versioned formulas. LLMs are
   used for classification and suggestions, never to invent a score.
4. **Asynchronous by default.** Anything that calls a provider or crawls a site runs as a
   background job with visible progress, retries and idempotency.
5. **Tenant safety.** Every record belongs to a workspace; access is checked in one place.
6. **Self-host parity.** The self-hosted edition is the same application as the cloud edition.

## Module catalog

| Module | Scope | Milestone |
|---|---|---|
| Platform | Workspaces, projects, members and roles, provider credentials (encrypted), usage ledger and budgets, background tasks, notifications, audit log | M1 |
| Project overview | Unified SEO + AI visibility KPIs with trends and provenance | M2–M3 |
| Rank tracker | Keywords × location × language × device; daily or weekly checks; SERP features; AI Overview presence and citation; competitor positions | M2 |
| Keyword explorer | Ideas, suggestions, related keywords, volume, CPC, keyword difficulty, intent; saved lists; add to the rank tracker | M2 |
| Site audit | Own crawler with robots.txt respect; issue catalog with severities, explanations and fixes; AI crawler access and `llms.txt`; run history and diffs; DataForSEO On-Page as an optional provider later | M2 |
| Search Console & GA4 | OAuth connection, property selection, daily query/page sync, organic and AI assistant traffic from GA4 | M2 |
| AI visibility (GEO/AEO) | Prompt library, scheduled runs per AI platform, mentions, citations, share of voice, sentiment, cited sources, AI Overview / AI Mode, citability score | M3 |
| Page experience | Core Web Vitals from the Chrome UX Report (real users) and Lighthouse lab audits through PageSpeed Insights, kept apart | M4 |
| Public API & MCP | Workspace-scoped API keys, OpenAPI, MCP tools over the same services; OAuth sign-in for hosted assistants such as Claude's connectors (M4) | M3–M4 |
| Reports & alerts | Server-rendered PDF (white-label), schedules and email delivery, alert rules (email, Slack, webhook) | M4 |
| Backlinks & domain overview | Domain metrics and history, referring domains, anchors, new/lost links, competitor gaps | M4 |
| Content | Optimizer and briefs based on SERP + AI citations, schema and `llms.txt` generators | M5 |
| Cloud billing | Stripe subscriptions (Checkout, Customer Portal), plans, usage credits, provider cost pass-through (cloud edition only) | M5 |

## Editions

Both editions are built from the same repository and Docker images.

| | Self-hosted | Cloud |
|---|---|---|
| Installation | `docker compose up` (web, api, worker, PostgreSQL) | Managed by us |
| Provider keys | The workspace's own keys, entered in settings | Platform keys with usage credits, or the workspace's own keys |
| Sign-up | First user becomes admin; others join by invitation | Public sign-up with email verification |
| Billing | Not loaded | Stripe subscriptions and usage credits |
| Updates | Pull a new image; migrations run on start | Continuous deployment |
| Telemetry | Off, or opt-in | On |

## Non-goals (for now)

- Building our own web-scale link index or keyword database.
- PPC campaign management, social media management.
- Local SEO / business profile management (may come later through providers).
