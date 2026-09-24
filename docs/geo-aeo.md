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
  └─ Run (platform, model, sample index, time, method)
       ├─ Answer   – full text in object storage, hash in the database
       ├─ Citations – ordered list of cited source URLs
       └─ Mentions – one per tracked brand entity: first rank, count, sentiment
```

Tracked brand entities are the project's own brand and its competitors
(`brand_entity`: name, aliases, domains).

## Data sources

| Platform | Source | Returns |
|---|---|---|
| ChatGPT | DataForSEO LLM Responses; LLM Scraper for results as shown in the ChatGPT interface | answer, sources |
| Claude | DataForSEO LLM Responses | answer, sources when web search is used |
| Gemini | DataForSEO LLM Responses | answer, sources |
| Perplexity | DataForSEO LLM Responses (Live) | answer, citations |
| Google AI Overview | DataForSEO SERP API (AI Overview element) | overview text, references |
| Google AI Mode | DataForSEO SERP API (AI Mode) | answer, references |
| Market view | DataForSEO LLM Mentions, AI Keyword Data | aggregated mention counts, AI search volume |

API answers can differ from what a signed-in user sees (personalization, location, model
version, product features). Every run records platform, model and method so the difference
is visible, and the UI says which method produced a number.

## Detection

1. **Normalization.** Unicode NFKC; whitespace collapsed; case-insensitive comparison with
   Turkish-aware folding (`İ/i/I/ı` compared on one canonical form). Diacritics are kept by
   default; an alias can opt into diacritic-insensitive matching.
2. **Brand mentions.** An alias matches only on word boundaries defined with Unicode letters
   and digits (`\p{L}\p{N}`), so `Apple` does not match `Pineapple`. Aliases shorter than
   three characters, or flagged as ambiguous, count only when the same answer also mentions
   one of the entity's domains or a non-ambiguous alias.
3. **Domain mentions in text.** Hostnames in the answer are reduced to their registrable
   domain with the Public Suffix List (`tldts`) and compared exactly — never with substring
   matching.
4. **Citations.** The order of the sources list is the citation rank. Each URL is reduced to
   its registrable domain and attributed to an entity when it matches one of the entity's
   domains (subdomains included when the project says so).
5. **Cited pages.** Normalized citation URLs are matched against the project's known pages
   (site audit, Search Console). A citation without a match stays unmatched — it is never
   attached to the home page by default.
6. **Mention rank.** Entities are ordered by the position of their first mention in the
   answer; `1` means mentioned first.
7. **Sentiment** (optional, costs LLM tokens). For each mentioned entity an LLM classifier
   returns `positive | neutral | negative` and a confidence through a structured output
   schema. The classifier version is stored with the result.

## Metrics

For a project, platform, period and entity *e*, with *N* completed runs:

| Metric | Formula |
|---|---|
| Mention rate | runs mentioning *e* / *N* |
| Citation rate | runs citing a domain of *e* / *N* |
| Share of voice | M(*e*) / Σₖ M(*k*), where M(*k*) = runs mentioning entity *k*, over all tracked entities |
| Average mention rank | mean of first rank over runs mentioning *e* |
| Source share | citations to domain *d* / all citations (all domains, not only tracked ones) |
| **AI visibility score v1** | 100 × (0.45 × mention rate + 0.35 × citation rate + 0.20 × prominence), prominence = Σ over runs (1 / first rank, or 0 when not mentioned) / *N* |

**Uncertainty.** Rates are shown with 95% Wilson intervals. Periods with fewer than 20 runs
per platform carry a "low sample" badge, and a change is highlighted only when the intervals
of the two periods do not overlap.

## Sampling and cost

- Default schedule: each active prompt runs weekly on each enabled platform with one sample;
  daily schedules and extra samples are opt-in.
- The estimated cost (`prompts × platforms × samples × unit price`) is shown before a
  schedule is saved, and every run is written to the usage ledger.
- Answers vary between runs; weekly aggregates over at least 20 runs per platform are the
  recommended reading.

## AEO in search results

Collected by the rank tracker for every tracked keyword and date:

- featured snippet present / owned by the project,
- People Also Ask present,
- AI Overview present, project cited, citation rank,
- AI Mode answer (separate check) and whether the project is cited.

Derived metrics: AI Overview presence rate across tracked keywords, AI Overview citation
rate (keywords where an overview exists and the project is cited), featured snippet
ownership count.

## Page citability score v1

Deterministic, computed for crawled pages during a site audit. Each factor scores 0–1; the
page score is `100 × Σ weight × factor`.

| Factor | Weight | Full score when |
|---|---:|---|
| Answer-first introduction | 0.15 | first paragraph has 30–80 words and contains the main topic terms of the H1 |
| Question headings | 0.10 | ≥ 30% of H2/H3 are phrased as questions (partial from one) |
| Structured content | 0.10 | lists or tables present, relative to page length |
| Structured data | 0.15 | valid JSON-LD with relevant types (Article, FAQPage, HowTo, Product, Organization, Person, BreadcrumbList) |
| Authorship signals | 0.10 | author identified (Person schema or byline) and about/contact pages linked |
| Freshness | 0.10 | `dateModified` / `datePublished` within 12 months (0.5 within 24 months) |
| Evidence | 0.10 | links to other sources and specific numbers or statistics |
| Readability | 0.10 | Ateşman score 50–70 for Turkish, Flesch Reading Ease 50–70 for English |
| AI crawler access | 0.10 | `robots.txt` allows GPTBot, ClaudeBot and PerplexityBot (share allowed) |

Informational checks, not scored: presence of `llms.txt`, and the `Google-Extended` rule
(it does not control AI Overviews, so it is reported separately).

Readability formulas:

- Ateşman (Turkish): `198.825 − 40.175 × (syllables / words) − 2.610 × (words / sentences)`;
  Turkish syllables are counted as vowels.
- Flesch Reading Ease (English): `206.835 − 1.015 × (words / sentences) − 84.6 × (syllables / words)`.

The weights and thresholds of v1 come from public research and are hypotheses. Once enough
data exists, they are calibrated against observed citations and published as v2.

## Recommendations

Each factor below full score maps to a recommendation template (what is missing, why it
matters, how to fix it). On request, an LLM drafts concrete rewrites (for example an
answer-first introduction); the estimated cost is shown before the request runs.
