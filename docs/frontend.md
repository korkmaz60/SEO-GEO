# Frontend (apps/web)

## Principles

1. **Data first.** Dense, scannable tables and charts; chrome stays quiet.
2. **Provenance on every number.** Source, freshness and method are one hover away.
3. **Honest states.** Loading, empty, "no data yet", "not connected", "low sample" and
   error are distinct states with distinct copy. Zero is never shown for "unknown".
4. **Cost before action.** Paid actions show the estimated provider cost in the button or
   confirmation.
5. **Shareable state.** Filters, tabs, date ranges and sorting live in the URL.
6. **Bilingual from the start.** Every string goes through the message catalogs.

## Stack

Next.js 16 (App Router, React 19, React Compiler) · Tailwind CSS v4 · shadcn/ui (Base UI
primitives, `base-nova` style) · TanStack Query · TanStack Table · Recharts through shadcn
chart components · next-intl · next-themes · lucide-react · cmdk · Geist Sans and Geist Mono.

## Information architecture

### URL scheme

```
/sign-in, /sign-up, /verify-email                    authentication
/forgot-password, /reset-password, /two-factor
/invite/:invitationId                                accept a workspace invitation
/onboarding                                          workspace → first project → DataForSEO
/account                                             profile, password, 2FA, API keys, sessions
/:workspace                                          opens the first project (admins without
                                                     projects go to project creation)
/:workspace/projects/new                             new project
/:workspace/:project/overview                        project overview
/:workspace/:project/ai-visibility                   AI visibility summary
/:workspace/:project/ai-visibility/prompts           prompt library and results
/:workspace/:project/ai-visibility/sources           cited sources and pages
/:workspace/:project/ai-visibility/competitors       share of voice
/:workspace/:project/rank-tracker                    tracked keywords
/:workspace/:project/site-audit                      audit runs and issues
/:workspace/:project/backlinks                       backlink profile (M4)
/:workspace/:project/search-console                  GSC performance (M2)
/:workspace/:project/reports                         reports and schedules (M4)
/:workspace/:project/settings                        brand name, market, device, time zone,
                                                     competitors, archive and delete
/:workspace/research/keywords                        keyword explorer (workspace-level tool)
/:workspace/research/domains                         domain overview (workspace-level tool)
/:workspace/settings                                 general (rename, delete, leave)
/:workspace/settings/members                         members, roles, invitations
/:workspace/settings/projects                        all projects incl. archived
/:workspace/settings/providers                       DataForSEO connection
/:workspace/settings/usage                           monthly spend and budget
/:workspace/settings/audit-log                       audit log (admins)
/design                                              living style guide
/healthz                                             container health check
```

Workspace and project segments are slugs. Top-level route names (`account`, `api`,
`design`, `invite`, `onboarding`, `sign-in`, …) cannot be used as workspace slugs, and
workspace-level names (`projects`, `research`, `settings`, …) cannot be used as project
slugs; the lists live in `packages/contracts`.

Signed-out visitors are redirected to `/sign-in?next=…` by `proxy.ts` (an optimistic
cookie check); pages still verify the session with the api. The browser only talks to the
web origin: `app/api/[...path]/route.ts` forwards `/api/*` to `API_URL` at request time.

### Navigation

Sidebar (collapsible to icons), in this order:

- Workspace switcher, project switcher (search + recent projects)
- **Overview**
- **AI visibility** – Summary · Prompts · Sources · Competitors
- **SEO** – Rank tracker · Site audit · Backlinks · Search Console
- **Content** – Optimizer (M5)
- **Research** – Keyword explorer · Domain overview
- **Reports**
- **Project settings**
- Footer: usage this month (cost vs budget), user menu

Header: breadcrumbs, command palette (`⌘K`: navigate, switch project, run actions), task
indicator (shown while background tasks run), notifications, theme toggle. The language
is chosen in the user menu and saved on the profile, which also sets the email language.

### Page templates

| Template | Used by | Anatomy |
|---|---|---|
| Dashboard | overview, AI visibility summary | KPI row (4–6 tiles) → primary trend chart → two-column detail cards |
| Data table | rank tracker, prompts, issues, sources | filter bar (one row) → saved views → table with column chooser, server pagination, export |
| Detail sheet | keyword, prompt, issue, page | right-side sheet with history chart, raw evidence, actions |
| Settings form | project and workspace settings | sectioned cards, inline validation, sticky save bar |
| Task progress | crawls, checks, AI runs | progress, estimated vs actual cost, logs, result link |

## Design system

### Typography

- Geist Sans for UI, Geist Mono for code, IDs and URLs (loaded from the `geist` package, no
  network needed at build time).
- Base size 14 px (`text-sm`) for data views, 12 px minimum anywhere. No 10 px text.
- Tabular figures (`tabular-nums`) in tables and axes; proportional figures for big KPI
  values.

### Color tokens (UI)

Defined as OKLCH CSS variables in `app/globals.css` for light and dark themes:
`background`, `foreground`, `card`, `muted`, `accent`, `border`, `ring`, `primary`,
`destructive`, plus semantic tokens:

| Token | Meaning |
|---|---|
| `--primary` | brand blue (Tailwind blue-600): primary buttons, selected controls, the project mark; white text on it is 5:1 |
| `--ring` | focus rings (blue-600 light, blue-500 dark) |
| `--link` | link text: blue-600 on light (5.3:1), blue-400 on dark (7.5:1 on `#0a0a0a`) |
| `--success`, `--warning`, `--serious`, `--critical` | status; always paired with an icon and a label |
| `--positive-text`, `--negative-text` | deltas and trend text (WCAG AA as text) |
| `--chart-1` … `--chart-8` | categorical chart palette (see below) |

Surfaces use the shadcn/ui `neutral` base color (chroma 0). The only brand hue is blue, and
it is kept to interactive emphasis (primary buttons, selected controls, focus rings, the
project mark); navigation and icons stay neutral. Every other hue belongs to data (the chart
palette) or state (status colors). The `link` variants of the shadcn button and badge use
`--link` instead of `--primary` so link text stays readable on black.

Dark theme is the default; light theme is fully supported and selected through the toggle
or the system setting. Dark surfaces are near-black (`background` `#0a0a0a`, `card`
`#171717`; the sidebar shares the page black). Light surfaces are white with a `#fafafa`
sidebar. Text contrast: `muted-foreground` is at least 6.9:1 on dark surfaces and 4.5:1 on
light ones.

### Chart colors

Charts follow the data-viz method: form first, color by job, palette validated.

- **Categorical** (identity): one fixed 8-hue order — blue, orange, aqua, yellow, magenta,
  green, violet, red — with separate steps for light and dark. The palette was validated on
  our surfaces: all adjacent pairs pass color-vision-deficiency separation (worst ΔE 9.1
  light, 8.4 dark) and the normal-vision floor, and every dark-mode slot has at least 3:1
  contrast on both `#0a0a0a` and `#171717`. Three light-mode slots are below 3:1 contrast on
  white, so charts always ship a legend, selective direct labels and a table view.
- **Entities keep their color.** The project's own brand is slot 1; competitors take the
  next slots in creation order and store it (`brand_entity.color`). Filters never repaint.
- **Blue in the interface is limited to interactive emphasis**, never icons or navigation,
  so chart colors keep their meaning. The own brand's chart color (slot 1) is also blue,
  which keeps "your brand" and the product color in the same family.
- **Status** (good / warning / serious / critical) uses its own fixed steps, never as a
  series color.
- **Sequential** (magnitude, e.g. position heatmaps): one blue ramp, light → dark.
- **Diverging** (e.g. rank change): blue ↔ red with a neutral gray midpoint.
- Never dual axes. Thin marks, 2 px lines, rounded bar ends, recessive grid, hover tooltip
  on every chart, legend for two or more series.

### Density, shape and motion

- 4 px spacing grid; table rows 36 px (compact) or 44 px (comfortable).
- Radius from `--radius` (10 px) with the shadcn scale.
- Icons from lucide at 16 px in dense UI, 20 px in headers.
- Motion is limited to 150–200 ms opacity/transform transitions; respects
  `prefers-reduced-motion`.

## Data display rules

- Numbers use `Intl.NumberFormat` with the active locale (`1.234,5` in Turkish,
  `1,234.5` in English); compact notation for large values in tiles.
- **Rank deltas:** a lower position number is better. Moving from 8 to 3 is `▲5` in the
  positive color.
- Dates show a relative time with the absolute timestamp in the tooltip.
- Each KPI tile shows value, change versus the previous period, a sparkline when history
  exists, and a provenance tooltip (source, method, updated at, cost of the last refresh).
- Rates computed from small samples show a "low sample" badge (see [geo-aeo.md](geo-aeo.md)).

## Data fetching and state

- Server components render the shell; data views are client components using TanStack Query
  with a typed API client generated from the OpenAPI document.
- Query keys are scoped by workspace and project; mutations invalidate the related keys.
- `useTask(taskId)` follows background tasks and refreshes affected queries on completion.
- URL state (filters, sort, tab, date range) through search params.

## Internationalization

- next-intl with ICU messages in `messages/tr.json` and `messages/en.json`; the locale comes
  from the user profile, then a cookie, then `Accept-Language`.
- Turkish is the default locale. No hard-coded user-facing strings in components.
- Issue catalog texts, email templates and PDF reports use the same catalogs.

## Accessibility

- WCAG 2.2 AA: text contrast ≥ 4.5:1, visible focus rings, full keyboard navigation, skip
  link, ARIA labels on icon buttons.
- Charts have a table view; identity is never conveyed by color alone.

## Folder structure

```
apps/web/
  app/
    layout.tsx                  root: fonts, theme, i18n, query client
    page.tsx                    redirects to the last workspace/project
    design/page.tsx             style guide
    [workspace]/[project]/...   project pages (layout renders the app shell)
  components/
    ui/                         shadcn primitives
    app-shell/                  sidebar, header, switchers, command palette
    data/                       KPI tile, metric source, empty state, deltas, tables
    charts/                     chart wrappers following the chart rules
  i18n/                         next-intl request config
  lib/                          api client, query client, formatters, navigation config
  messages/                     tr.json, en.json
```
