# CLAUDE.md

Guidance for Claude Code sessions in this repository. The product and technical design live
in [`docs/`](docs/README.md) (decisions D1–D22): read the doc of a module before changing it
and update it in the same change.

## Working with the owner

- Reply to the owner in Turkish (formal "siz") with short progress notes; code, comments,
  commit messages, pull requests and docs are in English.
- GitHub is delegated: work on a branch, open a pull request, get CI green, merge it with a
  merge commit, then report in Turkish. Never push to `master` directly.
- Never ask for API keys, tokens or passwords in chat; they belong in `.env` or in the app's
  settings.

## Repository

- pnpm + Turborepo, Node 22.19+. `apps/api` (NestJS; the same build runs as api or worker),
  `apps/web` (Next.js 16, shadcn on Base UI, Tailwind 4, next-intl), `packages/contracts`
  (zod schemas shared by api and web), `packages/core`, `packages/dataforseo`,
  `packages/db` (Prisma, migrations with row-level security) and `packages/billing`.
- Local setup is in the README: `docker compose up -d`, `pnpm env:setup`, `pnpm db:migrate`,
  `pnpm dev` (web on :3000, api on :4000).

## Before every push

```bash
pnpm format:check
pnpm check   # lint, typecheck, test and build
```

The api integration tests (`apps/api/test/*.int.test.ts`) and the db tests need
`TEST_DATABASE_URL`, a PostgreSQL server URL (each test file creates its own database).
Without it they are skipped, so set it before trusting a green run.

## Conventions

- Conventional commits; one pull request per shippable slice of the roadmap.
- Contracts first: request and response schemas live in `packages/contracts` and the web
  client validates responses with them; errors are problem details.
- DataForSEO: field names follow the official `dataforseo-client` types; every endpoint gets
  a sanitized fixture (domains `example.*`) and a unit test. Api tests use the fake in
  `apps/api/test/support/dataforseo.ts`, never the live API.
- Paid work: quote first, `UsageService.assertCanSpend` before and `usage.record` after.
  Public market data goes through `ProviderCacheService` with versioned operation names;
  bump the `@N` suffix when a cached shape changes.
- Web: every user-facing string lives in `apps/web/messages/{tr,en}.json` (missing keys fail
  the typecheck); numbers and dates go through `apps/web/lib/format.ts`; charts follow
  `docs/frontend.md` (one y-axis, a legend for two or more series, a table view). Check
  Turkish and English, light and dark, and a 390 px wide screen.
- Honest data: missing data is never shown as zero, and every metric says where it came from
  and how fresh it is.

## Where things stand

[`docs/roadmap.md`](docs/roadmap.md) is the source of truth for what is done and what comes
next.
