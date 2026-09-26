# GEO / AEO methodology

How SEO-GEO measures visibility in AI-generated answers and answer features, and how the
page-level citability score is computed. Formulas are versioned; every stored metric keeps
the version that produced it.

## Definitions

- **SEO** – ranking in classic search results.
- **GEO** (Generative Engine Optimization) – being mentioned and cited in answers generated
  by AI systems (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews and AI Mode).
- **AEO** (Answer Engine Optimization) – being the source of direct answers: featured
  snippets, People Also Ask, AI Overviews, voice answers.

## Measurement model

```
Prompt (text, language, location, tags)
  └─ Run (platform, method, model, sample index, day)
       ├─ Answer    – text and hash in ai_run, with the searches the model ran
       ├─ Citations – ordered list of cited sources, attributed to tracked brands
       └─ Mentions  – one per tracked brand: first rank, count, sentiment
```

Tracked brands are the project's own brand and its competitors (`brand_entity`: name,
aliases, ambiguous names, domains). Answers are kept in the database: they are a few
kilobytes each, and the prompt sheet shows them with the mentions highlighted.

## Data sources

| Platform | Source | Mode | Returns |
|---|---|---|---|
| ChatGPT | DataForSEO AI Optimization **LLM Scraper**: the answer as the ChatGPT web interface shows it | Standard queue | answer, sources, the searches the model ran |
| Gemini | LLM Scraper: the Gemini web interface | Standard queue | answer, sources, the searches the model ran |
| Perplexity | **LLM Responses**, Sonar models (Perplexity has no queue) | Live | answer, citations |
| Claude | LLM Responses with web search | Live | answer, sources of the web searches |
| Google AI Mode | SERP API, Google AI Mode | Standard queue | answer, references, the searches Google ran |
| Google AI Overviews | SERP API, Google organic first page with `load_async_ai_overview`; the answer is the AI Overview | Standard queue | overview text and references, or no overview |

The models asked on Claude and Perplexity are chosen per project; by default the cheapest
model of each family that searches the web (`claude-haiku-4-5`, `sonar`), resolved against
the models DataForSEO lists. Market-level data (DataForSEO LLM Mentions, AI Keyword Data)
is not used yet.

API and interface answers can differ from what a signed-in user sees (personalization,
location, model version, product features). Every run records platform, method and model,
and the UI says how the answers were collected.

## Detection

Rules version 1 (`MENTION_DETECTOR_VERSION`, stored with every answer):

1. **Normalization.** Answers are stored in Unicode NFC. Names are compared after NFKC and
   lower-casing, with the Turkish `İ`, `I`, `ı` and `i` folded to one form, so "İstanbul"
   and "ISTANBUL" match. Other diacritics are kept (`ş` does not match `s`); spelling
   variants are added as aliases.
2. **Brand names.** The name and aliases match on word boundaries of any script
   (`\p{L}\p{N}`), so `Apple` does not match `Pineapple`; words may be separated by any
   whitespace. Where matches overlap, the longest wins ("Example Store" over "Example").
3. **Ambiguous names.** Names shorter than three letters, and names listed as ambiguous
   (ordinary words such as "Kahve"), count only when the same answer shows stronger evidence
   for the brand: an unambiguous name, one of its domains in the text, or a citation of its
   domains.
4. **Domains in text.** Host names written in the answer count for the brand that owns
   their registrable domain (Public Suffix List, `tldts`), compared exactly — never as
   substrings. Names inside host names are not mentions (`example` in
   `example.com.evil.net`), and Markdown link targets are not visible text.
5. **Citations.** The order of the sources list is the citation rank. Each URL is reduced to
   its registrable domain and attributed to a brand when it is one of the brand's domains
   (the own brand also owns the project domain and follows the project's subdomain setting;
   competitors include subdomains). Where two brands list a domain, the own brand wins.
6. **Cited pages.** Normalized citation URLs are matched against the project's known pages:
   the latest site audit and pages with Search Console data in the last 90 days. A citation
   without a match stays unmatched — it is never attached to the home page.
7. **Mention rank.** Brands are ordered by the position of their first mention; `1` means
   mentioned first among the tracked brands.
8. **Sentiment** (optional). For each mention in answers of the last 48 hours, the sentence
   around the first mention (at most 320 characters) is classified by the cheapest ChatGPT
   model DataForSEO lists, through LLM Responses without web search, as `positive`, `neutral` or
   `negative` with a confidence. The prompt asks for JSON only; a reply that is not valid
   JSON is stored as unclassified and not asked again. The classifier version is stored
   with the result. Sentiment never changes a score.

## Metrics

For a project, platform, period and brand *e*, with *N* completed answers (a Google search
without an AI Overview is a completed answer that mentions nobody):

| Metric | Formula |
|---|---|
| Mention rate | answers mentioning *e* / *N* |
| Citation rate | answers citing a domain of *e* / *N* |
| Share of voice | M(*e*) / Σₖ M(*k*), where M(*k*) = answers mentioning brand *k*, over all tracked brands |
| Average mention rank | mean of first rank over answers mentioning *e* |
| Prominence | Σ over answers (1 / first rank, or 0 when not mentioned) / *N* |
| Source share | citations of domain *d* / all citations (all domains, not only tracked ones) |
| **AI visibility score v1** | 100 × (0.45 × mention rate + 0.35 × citation rate + 0.20 × prominence) |

Pages compare the selected range (7, 30 or 90 days) with the range of the same length
before it; trends are weekly (weeks start on Monday). Aggregates are computed in SQL from
the stored answers, mentions and citations.

**Uncertainty.** Rates are shown with 95% Wilson intervals. Fewer than 20 answers
(`LOW_SAMPLE_RUNS`) carry a "low sample" badge, and a change is marked significant only
when the intervals of the two periods do not overlap.

## Sampling and cost

- A project chooses its platforms (all but Claude by default, whose answers cost the most),
  a weekly or daily frequency and 1–5 samples per prompt and platform. Up to 1,000 prompts
  per project, 500 characters each.
- An answer is due when a prompt has none for that platform and sample in the current
  period (7 days, or 1 day for daily schedules) in the project's time zone. An hourly
  dispatcher creates the due answers; "Ask now" runs it at once.
- Costs are estimated before saving settings and before adding prompts
  (`prompts × platforms × samples × price per answer`, plus sentiment when enabled), and
  every request is written to the usage ledger with what DataForSEO charged.
- Prices per answer (list prices, checked 2026-09-24): LLM Scraper and Google AI Mode 0.0012
  Standard; AI Overview search 0.0012 (0.0006 SERP + 0.0006 overview loading, refunded when
  there is no asynchronous overview); LLM Responses 0.0006 live task fee plus what the model
  provider charges (estimated per model family, e.g. 0.05 for Claude Haiku and 0.01 for
  Sonar, and reported per answer); sentiment about 0.001 per mention.
- Budgets are checked before every post and live request. When a hard-stop budget would be
  exceeded, scheduled answers pause and owners and admins get an `ai.budget_blocked`
  notification.
- Answers vary between runs; weekly aggregates over at least 20 answers per platform are
  the recommended reading.

## AEO in search results

Collected by the rank tracker for every tracked keyword and date:

- featured snippet present / owned by the project,
- People Also Ask present,
- AI Overview present, project cited, citation rank.

Derived metrics: AI Overview presence rate across tracked keywords, AI Overview citation
rate (keywords where an overview exists and the project is cited), featured snippet
ownership count. Google AI Mode answers are tracked through prompts, as an AI visibility
platform.

## Page citability score v1

Deterministic, computed during a site audit for every indexable HTML page (redirects,
errors, `noindex` and canonicalized pages are not scored). Each factor scores 0–1; the page
score is `100 × Σ weight × factor / Σ weight` over the factors that can be judged, so a
factor without data (readability of a language without a formula, or of fewer than 100
words) does not count against the page.

| Factor | Weight | Full score when |
|---|---:|---|
| Answer-first introduction | 0.15 | the first paragraph of the main content has 30–80 words (half from 15–120) and contains at least half of the H1's topic terms |
| Question headings | 0.10 | ≥ 30% of H2/H3 headings of the main content are questions (partial below) |
| Structured content | 0.10 | at least one list or table per 600 words of main text |
| Structured data | 0.15 | valid JSON-LD with a citable type: Article (and news, blog, tech and scholarly articles), Report, FAQPage, QAPage, HowTo, Recipe, Product, Review, Organization, LocalBusiness, Corporation, Person, BreadcrumbList (0.5 when a block is invalid, 0.25 for other types) |
| Authorship signals | 0.10 | an author is named (JSON-LD author or Person, `meta name="author"`, or a byline) and about or contact pages are linked (half each) |
| Freshness | 0.10 | the stated modification or publication date is within 12 months (0.5 within 24 months; dates in the future are ignored) |
| Evidence | 0.10 | links to other sites, and at least three specific figures (percentages, decimals, measurements) in the main text (half each) |
| Readability | 0.10 | Ateşman (Turkish) or Flesch Reading Ease (English) score of at least 50 (0.5 from 30); easier text is not penalized |
| AI search crawler access | 0.10 | `robots.txt` lets the AI search crawlers fetch the page: OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot and Claude-User (share allowed) |

The main content is the page's single `article`, else `main` or `[role=main]`, else the
body, without navigation, headers, footers, forms and scripts; the H1 is read from the whole
page (headers included), and the title stands in when there is none. Question headings are
recognized by a question mark or a question word (Turkish stems such as `hangi`, `nere`,
`nasıl` and particles `mı/mi/mu/mü`; English `what`, `how`, `why`, …). The language is
the page's `lang`, else the project's default language.

Informational checks, not scored: training crawlers (GPTBot, ClaudeBot, Google-Extended,
Applebot-Extended, CCBot), the presence of `llms.txt`, and the `Google-Extended` rule (it
does not control AI Overviews, so it is reported separately). They appear as site audit
issues.

Readability formulas:

- Ateşman (Turkish): `198.825 − 40.175 × (syllables / words) − 2.610 × (words / sentences)`;
  Turkish syllables are counted as vowels.
- Flesch Reading Ease (English): `206.835 − 1.015 × (words / sentences) − 84.6 × (syllables / words)`.

A run stores the average score and, per factor, the average value and the number of pages
below full score; the site audit page shows the factors with the most to gain first.

The weights and thresholds of v1 come from public research and are hypotheses. Once enough
data exists, they are calibrated against observed citations and published as v2.

## Recommendations

Each factor below full score maps to a recommendation template (what is missing, why it
matters, how to fix it), ordered by the score to gain (`weight × (1 − value)`). The page
sheet shows them with the data the factor was computed from. LLM-drafted rewrites (for
example an answer-first introduction, with the cost shown first) are planned with the
content optimizer (M5).
