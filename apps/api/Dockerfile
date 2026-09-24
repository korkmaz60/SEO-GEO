# syntax=docker/dockerfile:1.7
#
# SEO-GEO api and worker in one image. The api is the default command; the worker runs
# `node dist/worker.js`. Build from the repository root:
#
#   docker build -f apps/api/Dockerfile -t seo-geo-api .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Reduce the workspace to the api and the packages it depends on.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @seo-geo/api --docker

FROM base AS build
# Prisma picks its migration engine by the OpenSSL version it finds.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*
# Manifests first, so dependency installs are cached until a package.json changes.
COPY --from=prune /repo/out/json/ .
COPY .pnpmfile.cjs tsconfig.base.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@seo-geo/api...
# Production dependencies and build output only; workspace packages are copied in.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm deploy --filter=@seo-geo/api --prod --legacy /app

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tini \
 && rm -rf /var/lib/apt/lists/*
ARG APP_VERSION
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 4000}/api/v1/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# tini forwards signals and reaps the migration subprocess.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
