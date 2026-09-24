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
- Self-hosted: the first account becomes the instance admin; public sign-up is off unless
  enabled.

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

The address checks live in `packages/core` and are unit tested.

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
- `audit_log` records credential changes, role changes, API key creation, exports and
  deletions.

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
