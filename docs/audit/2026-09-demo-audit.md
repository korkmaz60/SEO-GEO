# Demo audit (September 2026)

Review of the demo application that preceded the current design (Next.js route handlers,
Prisma, ~22k lines, 49 API routes). The demo is kept in git history; this note records why
the system is being rebuilt and which lessons the new design encodes.

## Summary

The demo had a solid visual language and the right product idea, but it was not a safe base
for a multi-tenant, open-source product:

- **Security** – full-read SSRF, an OAuth flow that could attach one person's Google tokens
  to another person's project, a cron endpoint that failed open, IDOR on several updates,
  unauthenticated routes, no rate limiting, plain-text tokens.
- **Data integrity** – several metrics were estimated or wrong while being shown as real
  data (see below).
- **Architecture** – long crawls, SERP checks and AI calls ran synchronously inside HTTP
  requests; no queue, no retries; single-owner projects; one set of API keys for all users;
  location and language fixed to Turkey.
- **Tooling** – no tests, no CI, no license file, lockfile resolved from a regional npm
  mirror, README environment variables not matching the code.

## Data integrity findings

| Finding | Correct approach in the new design |
|---|---|
| Keyword volume and difficulty estimated from Google's "about N results" count | DataForSEO Labs metrics or "no data" |
| Keyword difficulty derived from Google Ads `competition_index` × 100 (paid competition, 0–100 → up to 10,000) | Labs bulk keyword difficulty |
| Competitor "traffic" = matching keywords × 100 or referring domains × 10 | Provider domain metrics with provenance |
| Backlink score invented when no backlink data existed | Shown as "no data" |
| ChatGPT/Claude visibility measured through raw model APIs without search, stored as platform visibility; Gemini results stored as Google AI Overview | Platform-specific sources, method recorded per run ([geo-aeo.md](../geo-aeo.md)) |
| Brand detection by substring; citations without URL attached to the home page | Word-boundary alias matching, registrable-domain matching, unmatched stays unmatched |
| Lab TBT stored as INP | Field data (CrUX) for INP, lab metrics labeled as lab |
| Search Console average position mixed with live SERP rank in one column | Separate tables |
| Technical issues summed across all crawls | Issues belong to one audit run |
| Score formulas differed between endpoints but shared one time series | Versioned formulas; the version is stored with every score |
| SERP checks requested 100 results with `num=100`, which Google removed in September 2025 | DataForSEO depth pagination, billed per page and chosen per feature |

## What was kept

- The visual direction: dark navy theme, semantic SEO/GEO accents, cards and KPI tiles,
  shadcn/ui components.
- The product scope and research ([research/](../research/)).
- Search Console / GA4 property matching ideas, to be rebuilt on the new OAuth flow.
