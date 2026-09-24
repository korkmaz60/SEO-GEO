# Security

## Threat model

| Actor | Examples of what they may try |
|---|---|
| Anonymous internet user | brute-force sign-in, abuse open sign-up to reach expensive or internal functionality |
| User of another workspace | read or modify data across the tenant boundary (IDOR) |
| Member with a lower role | escalate privileges, read credentials, spend budget |
| Malicious website being crawled | redirect the crawler to internal addresses, serve huge or slow responses, crawler traps |
| Attacker holding a leaked API key | exfiltrate data, run paid operations |

| Asset | Why it matters |
|---|---|
| Provider credentials (DataForSEO, LLM keys) | direct financial loss |
| Google OAuth tokens | access to Search Console and Analytics data |
| Workspace data | client confidentiality for agencies |
| Internal network and cloud metadata | infrastructure compromise through SSRF |

## Controls

### Tenant isolation
- Every tenant row carries `workspace_id`; repositories require it and never load by ID
  alone. The workspace is resolved by a guard from the route (directly or via the project)
  and membership is checked before any handler runs.
- Integration tests assert that cross-workspace access returns `404`.
- On Supabase, RLS is enabled on every table without policies and `anon`/`authenticated`
  have no grants, so the auto-generated Data API exposes nothing.

### Authentication
- Better Auth: hashed passwords, email verification (required in the cloud edition),
  password reset, optional TOTP 2FA, rate-limited sign-in.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`; sessions rotate on sign-in and
  role changes.
- Self-hosted: the first account can sign up without an invitation; after that, sign-up
  needs a pending invitation.
- Client addresses (rate limits, sessions, audit log): Express resolves them from the proxy
  chain it trusts (`TRUST_PROXY`) and hands Better Auth that single address, so a client
  cannot pick its own address with `X-Forwarded-For`. Internet-facing installs put the web
  app behind a reverse proxy that sets the header (the bundled Caddy does).
- Invalid, expired or revoked API keys are rejected with `401`.

### Authorization
- Role matrix and API-key scopes are defined in [backend.md](backend.md); enforced by
  decorators on every controller method, default deny.

### Input validation and limits
- Every body, query, path parameter and header is parsed with Zod; unknown fields are
  rejected.
- Hard limits: JSON body 1 MB, page size ≤ 200, keywords per request ≤ 1,000, prompts,
  platforms and samples per project capped by plan.

### Outbound requests (SSRF policy)
All server-side fetches of user-influenced URLs — crawler, sitemaps, `robots.txt`,
`llms.txt`, webhooks — use one safe fetcher:
- Only `http` and `https`; ports 80 and 443 unless the operator allows more.
- DNS is resolved first; the request is refused if any address is loopback, private
  (RFC 1918), link-local (incl. `169.254.169.254`), CGNAT, multicast, reserved, IPv6
  unique-local or link-local, or an IPv4-mapped private address. The connection goes to the
  validated address, which defeats DNS rebinding.
- Redirects are followed manually (at most 5) and every hop is validated again.
- Connect and total timeouts, a maximum response size and a content-type allowlist.
- No cookies or credentials are forwarded; the crawler identifies itself and honors
  `robots.txt`.

The address checks and the client live in `packages/core` (`@seo-geo/core/net`) and are
tested against a local server. `createSafeFetcher` resolves and checks host names inside
the socket's own lookup, so the connection goes to exactly the address that passed the
check; IP literals are checked before the request. Redirects are followed by hand with
every hop checked again, and `Authorization` and cookies are dropped when a redirect
leaves the origin. Limits apply to the decoded body (a small gzip response cannot expand
past `maxBytes`). Operators can allow extra ports with `OUTBOUND_ALLOWED_PORTS`; internal
addresses cannot be allowed by configuration. In the api the client is
`SafeFetcherService`.

### Secrets at rest
- Provider credentials and OAuth tokens are encrypted with AES-256-GCM (random 96-bit IV,
  authentication tag, key version). The key comes from `ENCRYPTION_KEY`; rotation
  re-encrypts with a new version.
- Secrets are never logged and never returned by the API; the UI shows a masked suffix and
  the last verification time.

### Google OAuth
- `state` is a random nonce bound to the initiating session (short-lived httpOnly cookie)
  and PKCE is used. The callback checks that the signed-in user is the one who started the
  flow before storing tokens. Scopes are read-only.

### CSRF and browser security
- Cookie-authenticated state-changing requests require a matching `Origin`; API-key
  requests are not cookie-based.
- The web app sends CSP (nonce-based scripts), HSTS, `X-Content-Type-Options`,
  `Referrer-Policy` and `frame-ancestors 'none'`.
- The browser reaches the api through the web origin, so CORS stays closed except for
  explicitly configured public API origins.

### Cost abuse and denial of service
- Rate limits per IP (auth endpoints) and per user or API key (API).
- Concurrent job limits per workspace, budgets with hard stops, cost estimates before paid
  actions, idempotency keys on task-creating requests.

### Scheduled and internal work
- Schedules run inside the worker (pg-boss); no public cron endpoint exists. Any maintenance
  endpoint requires a secret and fails closed when the secret is not configured.

### Output safety
- Email templates escape every user-provided value.
- CSV exports quote fields and neutralize formula injection (cells starting with `=`, `+`,
  `-` or `@`).
- Content fetched from crawled sites is shown as text, never rendered as HTML.
- Outgoing webhooks are signed with HMAC (`X-SEO-GEO-Signature`, timestamped).

### Logging and audit
- Structured logs with request IDs; `Authorization`, cookies and secrets are redacted.
- `audit_log` records workspace creation and changes, invitations, joins, role changes,
  removals and departures, project creation, archiving and deletion, provider credential
  changes and budget changes — with the acting user, IP and user agent, never secrets.
  API key creation, exports and deletions are added as those features land.

### Supply chain and releases
- The lockfile resolves from `registry.npmjs.org`; automated dependency updates; CodeQL and
  dependency audit in CI; GitHub Actions pinned by commit SHA.
- Docker images run as non-root on minimal bases and ship an SBOM.

### Privacy
- Users can export and delete their data; deleting a workspace deletes its data.
- Retention periods are configurable (see [data-model.md](data-model.md)); the design keeps
  GDPR and KVKK requirements in mind.
- Vulnerabilities are reported privately through GitHub Security Advisories (`SECURITY.md`).

## Issues found in the demo and the control that prevents them

| Demo issue | Control |
|---|---|
| Endpoints fetched any user-supplied URL and returned the body (SSRF) | Safe fetcher; no endpoint returns raw fetched content |
| OAuth `state` was `userId:projectId`, unsigned, callback ignored the session | Session-bound nonce + PKCE, initiator check |
| Cron endpoint accepted `Bearer undefined` when the secret was unset | No public cron; secrets fail closed |
| Updates by ID without ownership checks (IDOR) | Tenant-scoped repositories, guards, isolation tests |
| Unauthenticated endpoints | Global default-deny guard |
| Unbounded paid requests and user-chosen models | Limits, budgets, server-side model configuration |
| OAuth tokens stored in plain text | AES-256-GCM encryption |
