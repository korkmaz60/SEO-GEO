<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

# SEO-GEO

**AI-powered analytics platform that unifies traditional SEO with next-generation Generative Engine Optimization (GEO).**

Track your website's visibility across both search engines and AI platforms (Google AI Overviews, ChatGPT, Claude, Perplexity, Copilot) from a single dashboard.

---

## Why SEO-GEO?

Search is changing. Users increasingly get answers from AI-powered systems instead of traditional search results. **GEO (Generative Engine Optimization)** is the practice of optimizing your content to be cited and referenced by these AI engines.

SEO-GEO bridges both worlds: it tracks your classic search engine rankings **and** measures how visible your content is in AI-generated responses.

---

## Features

### Dashboard
- Unified SEO & GEO score (0-100) with performance breakdown
- Score components: Authority, Readability, Structure, Technical, Speed
- 28-day trend charts for SEO vs GEO performance
- Quick stats: keywords, citations, indexed pages, backlinks, health score

### SEO Module
- **Keyword Tracking** - Position, volume, CTR, difficulty with historical trends
- **Keyword Discovery** - Bulk import, Google Search Console sync, SerpAPI discovery
- **Core Web Vitals** - LCP, INP, CLS monitoring
- **Page Speed** - Mobile & desktop scores
- **Technical Crawling** - Full site crawl with issue detection (HTTP errors, redirects, missing tags, schema markup, etc.)
- **Backlink Monitoring** - Backlink count, referring domains, and trend snapshots
- **Indexed Pages** - Track indexation ratio

### GEO Module
- **AI Platform Visibility** - Track citations across Google AI Overviews, ChatGPT, Perplexity, Claude, and Copilot
- **Citation Tracking** - Monitor which pages are being cited and by which AI platforms
- **GEO Score Breakdown** - Authority, Readability, Structure, Technical component scores
- **Optimization Checklist** - Actionable pass/warning/fail checks for AI readiness
- **AI Visibility Check** - On-demand visibility scanning across AI platforms

### Content Analysis
- AI-powered content analysis with multi-provider support (Claude, Gemini, GPT-4)
- Content metrics: word count, headings, lists, links, readability
- GEO-specific optimization suggestions (critical / warning / success)
- AI-generated rewrite suggestions

### Action Items
- AI-generated actionable recommendations from your site diagnostics
- Categories: Technical SEO, Content, GEO, Speed, Backlink, Keyword, Structure
- Priority levels with expected impact scoring
- Step-by-step implementation guides

### Competitor Analysis
- Add and track competitor domains
- Side-by-side SEO vs GEO score comparisons
- Traffic, citation, and share-of-voice benchmarking

### Reporting
- PDF report generation with multiple templates (Full, GEO, SEO, Technical, Competitor, Weekly)
- Scheduled reports with cron-based automation
- Email delivery via SMTP integration
- Report history with download capability

### Integrations
- **Google Search Console** - OAuth connection, keyword & position sync
- **Google Analytics** - Organic sessions, users, pageviews
- **DataForSEO** - SERP tracking, backlink data
- **SerpAPI** - Position checking, bulk keyword analysis

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Frontend** | React 19, Tailwind CSS 4, shadcn/ui, Recharts |
| **Language** | TypeScript 5 |
| **Database** | PostgreSQL with Prisma 7 ORM |
| **Auth** | NextAuth.js v5 (Credentials + JWT) |
| **AI Providers** | Claude (Anthropic), Gemini (Google), GPT-4 (OpenAI) |
| **PDF** | jsPDF with AutoTable |
| **Email** | Nodemailer |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- API keys for at least one AI provider

### Installation

```bash
git clone https://github.com/korkmaz60/SEO-GEO.git
cd SEO-GEO
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/seogeo"

# Auth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# AI Providers (at least one required)
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_AI_API_KEY="..."
OPENAI_API_KEY="sk-..."

# Google OAuth (optional - for Search Console & Analytics)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# DataForSEO (optional)
DATAFORSEO_LOGIN="..."
DATAFORSEO_PASSWORD="..."

# SerpAPI (optional)
SERPAPI_KEY="..."

# Email / SMTP (optional)
SMTP_HOST="..."
SMTP_PORT=587
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="noreply@yourdomain.com"
```

### Database Setup

```bash
npx prisma migrate deploy
npx prisma generate
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create your account.

---

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/        # Protected dashboard routes
│   │   ├── seo/            # SEO analysis module
│   │   ├── geo/            # GEO analysis module
│   │   ├── content/        # Content analysis
│   │   ├── actions/        # AI-generated action items
│   │   ├── competitors/    # Competitor benchmarking
│   │   ├── reports/        # Report generation
│   │   ├── settings/       # Integrations & config
│   │   └── onboarding/     # Project setup wizard
│   └── api/                # 49+ API routes
├── components/
│   ├── dashboard/          # Dashboard-specific components
│   ├── layout/             # Header, sidebar, navigation
│   └── ui/                 # Base UI components (shadcn/ui)
├── lib/
│   ├── ai.ts              # Multi-provider AI routing
│   ├── auth.ts            # NextAuth configuration
│   ├── db.ts              # Prisma client
│   ├── serper.ts          # SerpAPI integration
│   ├── dataforseo.ts      # DataForSEO integration
│   └── generate-pdf.ts    # PDF report generation
└── hooks/                  # Custom React hooks
```

---

## Contributing

Contributions are welcome! Whether it's a bug fix, new feature, or documentation improvement, we'd love your help.

1. **Fork** the repository
2. **Create** your feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Guidelines

- Follow the existing code style and project structure
- Write meaningful commit messages
- Update documentation if you add new features
- Test your changes before submitting

---

## Roadmap

- [ ] Multi-language content analysis
- [ ] Webhook integrations (Slack, Discord)
- [ ] Custom scoring formulas
- [ ] API access for external tools
- [ ] Team collaboration features

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with Next.js, powered by AI.
</p>
