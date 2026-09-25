# SEO-GEO

Open-source platform for **SEO and AI search visibility (GEO/AEO)**: rank tracking, site
audits, keyword research and measurement of how often ChatGPT, Gemini, Claude, Perplexity and
Google AI Overviews mention and cite your brand. Self-hostable, built for in-house teams and
agencies, powered by bring-your-own-key data providers (DataForSEO first).

> **Status: pre-alpha (M4 — Agency, in progress).** Accounts, workspaces, projects and
> competitors, DataForSEO connection with budgets, rank tracking with AI Overview citations,
> keyword research, domain overviews of any site (organic keywords and traffic, history,
> competitors, backlink summary), project backlinks (profile, history, new and lost links,
> referring domains, backlinks, anchors, competitors' profiles and the link gap), site audits
> with page citability scores, Search Console and GA4 with AI assistant traffic, AI
> visibility (prompts answered by ChatGPT, Gemini, Perplexity, Claude, Google AI Mode and AI
> Overviews; mentions, citations, share of voice and trends), workspace API keys with an MCP
> server, and self-hosting with Docker work. Alerts and reports come next. See the
> [roadmap](docs/roadmap.md).

**Türkçe özet:** SEO-GEO; sıralama takibi, site denetimi, anahtar kelime araştırması ve
markanızın yapay zekâ yanıtlarındaki (ChatGPT, Gemini, Claude, Perplexity, Google AI
Overviews) görünürlüğünü ölçen, kendi sunucunuza kurabileceğiniz açık kaynak bir platformdur.
Arayüz Türkçe ve İngilizce olarak geliştirilmektedir.

## Principles

- **Honest data** — every number shows its source and freshness; missing data is never shown as zero.
- **Cost transparency** — estimated provider cost before paid actions, a ledger of actual spend, budgets.
- **Deterministic, versioned scores** — LLMs suggest, formulas score.
- **One codebase** for self-hosted and cloud editions.

## Architecture

```
apps/web    Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui · next-intl (tr, en)
apps/api    NestJS 12 — REST /api/v1 + OpenAPI (APP_MODE=api) and background worker (APP_MODE=worker)
packages/
  contracts   Zod schemas shared by api and web
  core        Domain logic: hostname matching, SSRF-safe HTTP client, analyzers
  db          Prisma schema, migrations and client
  dataforseo  Typed DataForSEO v3 client: status handling, retries, cost reporting
  billing     Cloud edition billing: plans, Stripe Managed Payments checkout and webhooks
deploy/     Docker Compose stack for self-hosting
docs/       Design documentation
```

The browser only talks to the web app; the web app forwards `/api/*` to the api. Read the
[design documentation](docs/README.md) for the architecture, data model, GEO/AEO methodology,
security model and frontend design system.

## Self-hosting

```bash
git clone https://github.com/korkmaz60/SEO-GEO.git && cd SEO-GEO
./deploy/init.sh                                   # creates deploy/.env with fresh secrets
docker compose -f deploy/compose.yaml up -d --build
```

Open http://localhost:3000 and sign up: the first account on a new server needs no
invitation. HTTPS, email, upgrades and backups are covered in
[docs/self-hosting.md](docs/self-hosting.md).

## Development

Requirements: Node.js 22.19+, pnpm 10 (`corepack enable` installs the pinned version) and
PostgreSQL 16+ (`docker compose up -d` starts one).

```bash
pnpm install
docker compose up -d     # PostgreSQL on localhost:5432
pnpm env:setup           # creates .env with fresh secrets
pnpm db:migrate          # applies the database migrations
pnpm dev
```

- Web app: http://localhost:3000
- API: http://localhost:4000/api/v1/health — API docs: http://localhost:4000/api/docs
- Style guide: http://localhost:3000/design

Configuration is read from environment variables; see [`.env.example`](.env.example).
Without SMTP settings, sign-up works without email verification and emails are printed to
the api console.

## Scripts

| Command                              | What it does                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                           | Runs packages in watch mode, the api (`nest start --watch`) and the web app (`next dev`) |
| `pnpm build`                         | Builds every package and app                                                             |
| `pnpm test`                          | Runs all Vitest suites                                                                   |
| `pnpm lint` / `pnpm typecheck`       | ESLint and TypeScript checks                                                             |
| `pnpm format` / `pnpm format:check`  | Prettier                                                                                 |
| `pnpm check`                         | Lint, typecheck, test and build — what CI runs                                           |
| `pnpm db:migrate` / `db:migrate:dev` | Apply migrations / create one from schema changes                                        |

## Contributing

Issues and pull requests are welcome. Please read the [design documentation](docs/README.md)
first; changes that affect architecture or data should update the relevant document.

## License

SEO-GEO is free software: you can redistribute it and/or modify it under the terms of the
[GNU Affero General Public License, version 3](LICENSE) (AGPL-3.0-only). You may use,
change and self-host it; if you let people use a modified version over a network, you must
offer them its source code under the same license.

Copyright © 2026 the SEO-GEO contributors.
