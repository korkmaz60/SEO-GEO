# SEO-GEO

Open-source platform for **SEO and AI search visibility (GEO/AEO)**: rank tracking, site
audits, keyword research and measurement of how often ChatGPT, Gemini, Claude, Perplexity and
Google AI Overviews mention and cite your brand. Self-hostable, built for in-house teams and
agencies, powered by bring-your-own-key data providers (DataForSEO first).

> **Status: pre-alpha (M0 — foundation).** The repository is being rebuilt from an earlier
> demo. The web app currently shows the new interface with honest empty states; data
> collection starts in M1–M3. See the [roadmap](docs/roadmap.md).

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
apps/api    NestJS 12 — REST /v1 + OpenAPI (APP_MODE=api) and background worker (APP_MODE=worker)
packages/
  contracts   Zod schemas shared by api and web
  core        Domain logic: hostname matching, outbound URL (SSRF) policy, analyzers
  dataforseo  Typed DataForSEO v3 client: status handling, retries, cost reporting
  billing     Cloud edition billing: plans, Stripe Managed Payments checkout and webhooks
docs/       Design documentation
legacy/     The previous demo, kept for reference only
```

The browser only talks to the web app; the web app forwards `/api/*` to the api. Read the
[design documentation](docs/README.md) for the architecture, data model, GEO/AEO methodology,
security model and frontend design system.

## Getting started

Requirements: Node.js 22.12+, pnpm 10 (`corepack enable` installs the pinned version) and
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

To be decided before the first release (AGPL-3.0 is proposed; see decision D11 in
[docs/README.md](docs/README.md)). Until a `LICENSE` file is added, all rights are reserved
by the author.
