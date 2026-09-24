-- CreateEnum
CREATE TYPE "search_engine" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "rank_frequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "rank_check_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "google_connection_status" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "integration_type" AS ENUM ('GSC', 'GA4');

-- CreateEnum
CREATE TYPE "audit_run_status" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "issue_severity" AS ENUM ('ERROR', 'WARNING', 'NOTICE');

-- CreateTable
CREATE TABLE "provider_cache" (
    "key" TEXT NOT NULL,
    "provider" "provider" NOT NULL,
    "operation" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "cost_usd" DECIMAL(12,6) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "keyword_metric" (
    "keyword" TEXT NOT NULL,
    "location_code" INTEGER NOT NULL,
    "language_code" TEXT NOT NULL,
    "search_volume" INTEGER,
    "cpc" DOUBLE PRECISION,
    "competition" DOUBLE PRECISION,
    "competition_level" TEXT,
    "keyword_difficulty" INTEGER,
    "intent" TEXT,
    "secondary_intents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "monthly_searches" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'dataforseo_labs',
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "keyword_metric_pkey" PRIMARY KEY ("keyword","location_code","language_code")
);

-- CreateTable
CREATE TABLE "tracked_keyword" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "location_code" INTEGER NOT NULL,
    "language_code" TEXT NOT NULL,
    "device" "device" NOT NULL,
    "search_engine" "search_engine" NOT NULL DEFAULT 'GOOGLE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_url" TEXT,
    "frequency" "rank_frequency" NOT NULL DEFAULT 'DAILY',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tracked_keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_check" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "tracked_keyword_id" UUID NOT NULL,
    "checked_on" DATE NOT NULL,
    "status" "rank_check_status" NOT NULL DEFAULT 'PENDING',
    "provider_task_id" TEXT,
    "posted_at" TIMESTAMPTZ(3),
    "checked_at" TIMESTAMPTZ(3),
    "depth" INTEGER NOT NULL,
    "position" INTEGER,
    "rank_absolute" INTEGER,
    "url" TEXT,
    "serp_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "owned_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_overview_present" BOOLEAN NOT NULL DEFAULT false,
    "ai_overview_cited" BOOLEAN NOT NULL DEFAULT false,
    "competitor_ranks" JSONB NOT NULL DEFAULT '{}',
    "serp_snapshot_id" UUID,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rank_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serp_snapshot" (
    "id" UUID NOT NULL,
    "search_engine" "search_engine" NOT NULL DEFAULT 'GOOGLE',
    "keyword" TEXT NOT NULL,
    "location_code" INTEGER NOT NULL,
    "language_code" TEXT NOT NULL,
    "device" "device" NOT NULL,
    "fetched_on" DATE NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "depth" INTEGER NOT NULL,
    "item_types" TEXT[],
    "results_count" BIGINT,
    "organic" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "ai_overview" JSONB,
    "check_url" TEXT,

    CONSTRAINT "serp_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_list" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "keyword_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_list_item" (
    "list_id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "location_code" INTEGER NOT NULL,
    "language_code" TEXT NOT NULL,
    "note" TEXT,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_list_item_pkey" PRIMARY KEY ("list_id","keyword","location_code","language_code")
);

-- CreateTable
CREATE TABLE "google_connection" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "google_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "scopes" TEXT[],
    "encrypted_tokens" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "status" "google_connection_status" NOT NULL DEFAULT 'ACTIVE',
    "last_error" TEXT,
    "connected_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "google_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_integration" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "integration_type" NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMPTZ(3),
    "synced_through" DATE,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_query_daily" (
    "project_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "gsc_query_daily_pkey" PRIMARY KEY ("project_id","date","query")
);

-- CreateTable
CREATE TABLE "gsc_page_daily" (
    "project_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "page" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "gsc_page_daily_pkey" PRIMARY KEY ("project_id","date","page")
);

-- CreateTable
CREATE TABLE "ga4_page_daily" (
    "project_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "page" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "users" INTEGER NOT NULL,
    "engaged_sessions" INTEGER NOT NULL,
    "key_events" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ga4_page_daily_pkey" PRIMARY KEY ("project_id","date","page","channel","source")
);

-- CreateTable
CREATE TABLE "audit_run" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "audit_run_status" NOT NULL DEFAULT 'QUEUED',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "config" JSONB NOT NULL,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "pages_crawled" INTEGER NOT NULL DEFAULT 0,
    "health_score" INTEGER,
    "score_version" INTEGER NOT NULL DEFAULT 1,
    "task_id" UUID,
    "error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_page" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "status_code" INTEGER,
    "fetch_error" TEXT,
    "content_type" TEXT,
    "redirect_target" TEXT,
    "title" TEXT,
    "meta_description" TEXT,
    "h1" TEXT,
    "h1_count" INTEGER NOT NULL DEFAULT 0,
    "canonical" TEXT,
    "robots_meta" TEXT,
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "word_count" INTEGER,
    "content_hash" TEXT,
    "load_ms" INTEGER,
    "bytes" INTEGER,
    "inlinks" INTEGER NOT NULL DEFAULT 0,
    "outlinks" INTEGER NOT NULL DEFAULT 0,
    "external_links" INTEGER NOT NULL DEFAULT 0,
    "schema_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lang" TEXT,
    "hreflang" JSONB NOT NULL DEFAULT '[]',
    "in_sitemap" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_link" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "from_page_id" UUID NOT NULL,
    "to_url" TEXT NOT NULL,
    "anchor" TEXT,
    "nofollow" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_issue" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "page_id" UUID,
    "code" TEXT NOT NULL,
    "severity" "issue_severity" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_cache_expires_at_idx" ON "provider_cache"("expires_at");

-- CreateIndex
CREATE INDEX "tracked_keyword_workspace_id_project_id_idx" ON "tracked_keyword"("workspace_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_keyword_project_id_keyword_location_code_language_c_key" ON "tracked_keyword"("project_id", "keyword", "location_code", "language_code", "device", "search_engine");

-- CreateIndex
CREATE INDEX "rank_check_project_id_checked_on_idx" ON "rank_check"("project_id", "checked_on");

-- CreateIndex
CREATE INDEX "rank_check_status_posted_at_idx" ON "rank_check"("status", "posted_at");

-- CreateIndex
CREATE INDEX "rank_check_provider_task_id_idx" ON "rank_check"("provider_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "rank_check_tracked_keyword_id_checked_on_key" ON "rank_check"("tracked_keyword_id", "checked_on");

-- CreateIndex
CREATE INDEX "serp_snapshot_fetched_at_idx" ON "serp_snapshot"("fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "serp_snapshot_search_engine_keyword_location_code_language__key" ON "serp_snapshot"("search_engine", "keyword", "location_code", "language_code", "device", "fetched_on");

-- CreateIndex
CREATE INDEX "keyword_list_workspace_id_created_at_idx" ON "keyword_list"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "google_connection_workspace_id_google_user_id_key" ON "google_connection"("workspace_id", "google_user_id");

-- CreateIndex
CREATE INDEX "project_integration_connection_id_idx" ON "project_integration"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_integration_project_id_type_key" ON "project_integration"("project_id", "type");

-- CreateIndex
CREATE INDEX "audit_run_project_id_created_at_idx" ON "audit_run"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_page_run_id_url_key" ON "audit_page"("run_id", "url");

-- CreateIndex
CREATE INDEX "audit_link_run_id_to_url_idx" ON "audit_link"("run_id", "to_url");

-- CreateIndex
CREATE INDEX "audit_link_from_page_id_idx" ON "audit_link"("from_page_id");

-- CreateIndex
CREATE INDEX "audit_issue_run_id_code_idx" ON "audit_issue"("run_id", "code");

-- CreateIndex
CREATE INDEX "audit_issue_page_id_idx" ON "audit_issue"("page_id");

-- AddForeignKey
ALTER TABLE "tracked_keyword" ADD CONSTRAINT "tracked_keyword_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_keyword" ADD CONSTRAINT "tracked_keyword_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_check" ADD CONSTRAINT "rank_check_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_check" ADD CONSTRAINT "rank_check_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_check" ADD CONSTRAINT "rank_check_tracked_keyword_id_fkey" FOREIGN KEY ("tracked_keyword_id") REFERENCES "tracked_keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_check" ADD CONSTRAINT "rank_check_serp_snapshot_id_fkey" FOREIGN KEY ("serp_snapshot_id") REFERENCES "serp_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_list" ADD CONSTRAINT "keyword_list_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_list_item" ADD CONSTRAINT "keyword_list_item_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "keyword_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connection" ADD CONSTRAINT "google_connection_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_integration" ADD CONSTRAINT "project_integration_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_integration" ADD CONSTRAINT "project_integration_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_integration" ADD CONSTRAINT "project_integration_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "google_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_query_daily" ADD CONSTRAINT "gsc_query_daily_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_page_daily" ADD CONSTRAINT "gsc_page_daily_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ga4_page_daily" ADD CONSTRAINT "ga4_page_daily_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_run" ADD CONSTRAINT "audit_run_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_run" ADD CONSTRAINT "audit_run_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_page" ADD CONSTRAINT "audit_page_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "audit_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_link" ADD CONSTRAINT "audit_link_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "audit_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_issue" ADD CONSTRAINT "audit_issue_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "audit_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_issue" ADD CONSTRAINT "audit_issue_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "audit_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security without policies on every new table (see the supabase_lockdown
-- migration): the application connects as the table owner; other roles see nothing.
ALTER TABLE "provider_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "keyword_metric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tracked_keyword" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rank_check" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "serp_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "keyword_list" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "keyword_list_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "google_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gsc_query_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gsc_page_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ga4_page_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_issue" ENABLE ROW LEVEL SECURITY;
