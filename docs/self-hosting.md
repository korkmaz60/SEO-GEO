# Self-hosting

SEO-GEO runs on your own server with Docker. The stack in
[`deploy/compose.yaml`](../deploy/compose.yaml) has four services:

| Service | Image | What it does |
|---|---|---|
| `postgres` | `postgres:16-alpine` | All data, the job queue (pg-boss) and sessions |
| `api` | built from `apps/api/Dockerfile` | REST API and authentication; applies database migrations on start |
| `worker` | same image as `api` | Background work and schedules (`node dist/worker.js`) |
| `web` | built from `apps/web/Dockerfile` | The web app; forwards `/api/*` to the api |

An optional `caddy` service (profile `https`) terminates TLS with automatic certificates.

## Requirements

- Docker Engine 24+ with the Compose plugin.
- 2 GB of RAM and 10 GB of disk to start; the database grows with tracked keywords, audits
  and AI answers.
- A [DataForSEO](https://dataforseo.com/) account for search and AI data (you pay
  DataForSEO directly; SEO-GEO shows the cost of each action and keeps a ledger).
- For HTTPS: a domain name pointing at the server, and ports 80 and 443 open.

## Install

```bash
git clone https://github.com/korkmaz60/SEO-GEO.git
cd SEO-GEO
./deploy/init.sh                                   # creates deploy/.env with fresh secrets
docker compose -f deploy/compose.yaml up -d --build
```

The first build takes a few minutes. When `docker compose -f deploy/compose.yaml ps` shows
the services as healthy, open <http://localhost:3000> (or `WEB_URL`):

1. **Sign up.** On a new server the first account is created without an invitation; after
   that, sign-up is closed and people join through invitations.
2. **Create a workspace and a project** in the onboarding wizard.
3. **Connect DataForSEO** with the API login and API password from the DataForSEO
   dashboard (*API Access*, not your account password). The credentials are checked before
   they are saved, stored encrypted, and the balance is shown.

## Configuration

Settings live in `deploy/.env` (created from [`deploy/.env.example`](../deploy/.env.example)).
After a change, apply it with `docker compose -f deploy/compose.yaml up -d`.

| Variable | Default | Notes |
|---|---|---|
| `WEB_URL` | `http://localhost:3000` | The address people open. Sign-in only works from this origin; `https://` enables secure cookies. |
| `WEB_BIND`, `WEB_PORT` | `0.0.0.0`, `3000` | Where the web app is published. Use `127.0.0.1` behind a reverse proxy. |
| `POSTGRES_PASSWORD` | generated | Database password. |
| `AUTH_SECRET` | generated | Signs sessions. Changing it signs everyone out. |
| `ENCRYPTION_KEY` | generated | Encrypts provider credentials. **Back it up**: without it, stored keys cannot be read and must be entered again. |
| `SMTP_*` | unset | Email for verification, password resets and invitations. Without SMTP, sign-up needs no verification and invitation links are copied from *Workspace settings → Members*. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | unset | Google OAuth client for Search Console and GA4; see [below](#google-search-console-and-ga4). Set both or neither. |
| `OUTBOUND_ALLOWED_PORTS` | `80,443` | Ports the crawler may use on audited sites. Internal and private addresses are always refused. |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Which hops may set `X-Forwarded-For` for the api. The default trusts the web container on the Docker network. |
| `API_DOCS` | `false` | Serves the OpenAPI documentation at `/api/docs` on the api container. |
| `LOG_LEVEL` | `log` | `fatal`, `error`, `warn`, `log`, `debug` or `verbose`. Logs are JSON lines. |

### Google Search Console and GA4

Search Console and GA4 data are read with the user's consent through an OAuth client that
you create once in Google Cloud:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project (or
   use an existing one) and enable the **Google Search Console API**, the **Google Analytics
   Data API** and the **Google Analytics Admin API**.
2. Configure the OAuth consent screen (*Google Auth Platform → Branding and Audience*).
   SEO-GEO asks for `openid`, `email`, `webmasters.readonly` and `analytics.readonly`.
   While the app is in *Testing*, only the test users you add can connect, and Google
   expires their access after 7 days; publish the app (and complete verification if Google
   asks for it), or choose *Internal* in a Google Workspace organization.
3. Create an OAuth client ID of type **Web application** with this authorized redirect URI
   (the origin of `WEB_URL` followed by the callback path):
   `https://seo.example.com/api/v1/integrations/google/callback`.
4. Put the client ID and secret in `deploy/.env` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` and apply them with `docker compose -f deploy/compose.yaml up -d`.

Then an owner or admin opens a project's **Search Console** page, connects a Google account
and chooses the Search Console property (and optionally a GA4 property). The last 90 days
are imported right away and new days every morning (05:40 UTC). Connected accounts are
listed, and can be disconnected, in *Workspace settings → Providers*.

### HTTPS

The bundled Caddy obtains and renews certificates from Let's Encrypt:

1. Point your domain's DNS at the server.
2. In `deploy/.env` set `DOMAIN=seo.example.com`, `WEB_URL=https://seo.example.com` and
   `WEB_BIND=127.0.0.1`.
3. Start with the profile:
   `docker compose -f deploy/compose.yaml --profile https up -d`.

To use your own reverse proxy instead (nginx, Traefik, a load balancer), forward to the
web container on `WEB_PORT`, set `WEB_URL` to the public HTTPS address and let the proxy
set `X-Forwarded-For` and `X-Forwarded-Proto`. Keep the web app off the public internet
except through the proxy: rate limits and the audit log use the client address that the
proxy reports.

## Upgrades

```bash
git pull
docker compose -f deploy/compose.yaml up -d --build
```

The api applies pending database migrations before it accepts requests (Prisma
`migrate deploy`, guarded by a database lock), and the worker starts once the api is
healthy. Read the release notes before upgrading across major versions.

## Backups

Back up the database and `deploy/.env` (it holds `ENCRYPTION_KEY`):

```bash
docker compose -f deploy/compose.yaml exec -T postgres \
  pg_dump -U seogeo -d seogeo --format=custom > seogeo-$(date +%F).dump
```

Restore into an empty database with `pg_restore --clean --if-exists -U seogeo -d seogeo`
while the api and worker are stopped.

## Operations

- **Logs:** `docker compose -f deploy/compose.yaml logs -f api worker web`.
- **Health:** the api answers `GET /api/v1/health` and the web app `GET /healthz`; the
  worker touches a heartbeat file while it can reach the database, checked by
  `node dist/worker-health.js`. All three have Docker health checks, so
  `docker compose -f deploy/compose.yaml up -d --wait` returns once the stack is ready.
- **Scaling:** the api is stateless and can run several replicas; so can the worker (jobs
  are claimed from the database). Keep one PostgreSQL.
- **Using an existing PostgreSQL:** remove the `postgres` service and point
  `DATABASE_URL` in the api and worker environment at your server (PostgreSQL 16+). The
  database user needs permission to create tables; the queue uses its own `pgboss` schema.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `required variable ... is missing a value` | `deploy/.env` is missing; run `./deploy/init.sh`. |
| The api container restarts | See `docker compose -f deploy/compose.yaml logs api`; configuration errors name the variable. |
| Sign-in fails with "invalid origin" | `WEB_URL` does not match the address in the browser (scheme, host and port must match). |
| DataForSEO "could not be reached" | The server has no outbound HTTPS access to `api.dataforseo.com`. |
| Invitation emails do not arrive | Configure `SMTP_*`, or copy the link from *Members → Pending invitations*. |
| Google shows `redirect_uri_mismatch` | The OAuth client's redirect URI must be exactly `<origin of WEB_URL>/api/v1/integrations/google/callback`. |
| Search Console stops updating after a week | The OAuth consent screen is in *Testing*; publish it and reconnect the account. |
| A site audit finds only a few pages | The site blocks `SEO-GEO-Bot` in `robots.txt`, or its pages are only linked through JavaScript (not rendered in this version). |
