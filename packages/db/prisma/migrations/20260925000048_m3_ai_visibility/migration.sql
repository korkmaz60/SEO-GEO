-- CreateEnum
CREATE TYPE "ai_platform" AS ENUM ('CHATGPT', 'GEMINI', 'PERPLEXITY', 'CLAUDE', 'GOOGLE_AI_MODE', 'GOOGLE_AI_OVERVIEW');

-- CreateEnum
CREATE TYPE "ai_frequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ai_run_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "brand_entity" ADD COLUMN     "ambiguous_aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "prompt" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "location_code" INTEGER NOT NULL,
    "language_code" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_ai_settings" (
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "platforms" "ai_platform"[],
    "frequency" "ai_frequency" NOT NULL DEFAULT 'WEEKLY',
    "samples" INTEGER NOT NULL DEFAULT 1,
    "models" JSONB NOT NULL DEFAULT '{}',
    "sentiment" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_ai_settings_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "ai_run" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "prompt_id" UUID NOT NULL,
    "platform" "ai_platform" NOT NULL,
    "method" TEXT NOT NULL,
    "model" TEXT,
    "sample_index" INTEGER NOT NULL DEFAULT 0,
    "run_on" DATE NOT NULL,
    "status" "ai_run_status" NOT NULL DEFAULT 'PENDING',
    "provider_task_id" TEXT,
    "posted_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "answer" TEXT,
    "answer_hash" TEXT,
    "web_search" BOOLEAN,
    "fan_out_queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" JSONB NOT NULL DEFAULT '{}',
    "detector_version" INTEGER NOT NULL DEFAULT 1,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_mention" (
    "run_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "first_rank" INTEGER NOT NULL,
    "first_offset" INTEGER NOT NULL,
    "mention_count" INTEGER NOT NULL,
    "sentiment" TEXT,
    "sentiment_confidence" DOUBLE PRECISION,
    "classifier_version" INTEGER,

    CONSTRAINT "ai_mention_pkey" PRIMARY KEY ("run_id","entity_id")
);

-- CreateTable
CREATE TABLE "ai_citation" (
    "run_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "url" TEXT,
    "host" TEXT,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "entity_id" UUID,
    "page_url" TEXT,

    CONSTRAINT "ai_citation_pkey" PRIMARY KEY ("run_id","rank")
);

-- CreateIndex
CREATE INDEX "prompt_workspace_id_project_id_idx" ON "prompt"("workspace_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_project_id_text_location_code_language_code_key" ON "prompt"("project_id", "text", "location_code", "language_code");

-- CreateIndex
CREATE INDEX "project_ai_settings_workspace_id_idx" ON "project_ai_settings"("workspace_id");

-- CreateIndex
CREATE INDEX "ai_run_project_id_run_on_idx" ON "ai_run"("project_id", "run_on");

-- CreateIndex
CREATE INDEX "ai_run_status_posted_at_idx" ON "ai_run"("status", "posted_at");

-- CreateIndex
CREATE INDEX "ai_run_provider_task_id_idx" ON "ai_run"("provider_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_run_prompt_id_platform_run_on_sample_index_key" ON "ai_run"("prompt_id", "platform", "run_on", "sample_index");

-- CreateIndex
CREATE INDEX "ai_mention_entity_id_idx" ON "ai_mention"("entity_id");

-- CreateIndex
CREATE INDEX "ai_citation_domain_idx" ON "ai_citation"("domain");

-- CreateIndex
CREATE INDEX "ai_citation_entity_id_idx" ON "ai_citation"("entity_id");

-- AddForeignKey
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_ai_settings" ADD CONSTRAINT "project_ai_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_mention" ADD CONSTRAINT "ai_mention_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_mention" ADD CONSTRAINT "ai_mention_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "brand_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_citation" ADD CONSTRAINT "ai_citation_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_citation" ADD CONSTRAINT "ai_citation_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "brand_entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row level security without policies on every new table (see the supabase_lockdown
-- migration): the application connects as the table owner; other roles see nothing.
ALTER TABLE "prompt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_ai_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_mention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_citation" ENABLE ROW LEVEL SECURITY;
