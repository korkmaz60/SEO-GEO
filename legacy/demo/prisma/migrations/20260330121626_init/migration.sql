-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('ACTIVE', 'REDIRECTED', 'NOT_FOUND', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AiPlatform" AS ENUM ('GOOGLE_AI_OVERVIEW', 'CHATGPT', 'PERPLEXITY', 'CLAUDE', 'COPILOT');

-- CreateEnum
CREATE TYPE "KeywordTrend" AS ENUM ('UP', 'DOWN', 'STABLE');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('CRITICAL', 'WARNING', 'NOTICE', 'INFO');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PASS', 'WARNING', 'FAIL');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('FULL', 'GEO', 'SEO', 'TECHNICAL', 'COMPETITOR', 'WEEKLY_SUMMARY');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('SUCCESS', 'WARNING', 'INFO', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "slug" TEXT,
    "wordCount" INTEGER,
    "status" "PageStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastCrawl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_scores" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "authorityScore" DOUBLE PRECISION NOT NULL,
    "readabilityScore" DOUBLE PRECISION NOT NULL,
    "structureScore" DOUBLE PRECISION NOT NULL,
    "technicalScore" DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citations" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "platform" "AiPlatform" NOT NULL,
    "query" TEXT NOT NULL,
    "snippet" TEXT,
    "position" INTEGER,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_visibility" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" "AiPlatform" NOT NULL,
    "visibility" DOUBLE PRECISION NOT NULL,
    "citations" INTEGER NOT NULL,
    "change" DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_visibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_scores" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "healthScore" DOUBLE PRECISION,
    "speedMobile" DOUBLE PRECISION,
    "speedDesktop" DOUBLE PRECISION,
    "lcpValue" DOUBLE PRECISION,
    "fidValue" DOUBLE PRECISION,
    "clsValue" DOUBLE PRECISION,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "position" INTEGER,
    "prevPosition" INTEGER,
    "volume" INTEGER,
    "difficulty" INTEGER,
    "geoScore" DOUBLE PRECISION,
    "trend" "KeywordTrend" NOT NULL DEFAULT 'STABLE',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_history" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "volume" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "issuesFound" INTEGER NOT NULL DEFAULT 0,
    "status" "CrawlStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "crawl_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_issues" (
    "id" TEXT NOT NULL,
    "pageId" TEXT,
    "crawlId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "seoScore" DOUBLE PRECISION,
    "geoScore" DOUBLE PRECISION,
    "traffic" INTEGER,
    "citations" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_checks" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "impact" TEXT NOT NULL,
    "message" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "fileUrl" TEXT,
    "fileSize" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pages_projectId_url_key" ON "pages"("projectId", "url");

-- CreateIndex
CREATE INDEX "geo_scores_projectId_measuredAt_idx" ON "geo_scores"("projectId", "measuredAt");

-- CreateIndex
CREATE INDEX "geo_scores_pageId_measuredAt_idx" ON "geo_scores"("pageId", "measuredAt");

-- CreateIndex
CREATE INDEX "citations_pageId_platform_idx" ON "citations"("pageId", "platform");

-- CreateIndex
CREATE INDEX "citations_platform_detectedAt_idx" ON "citations"("platform", "detectedAt");

-- CreateIndex
CREATE INDEX "ai_visibility_projectId_platform_measuredAt_idx" ON "ai_visibility"("projectId", "platform", "measuredAt");

-- CreateIndex
CREATE INDEX "seo_scores_projectId_measuredAt_idx" ON "seo_scores"("projectId", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_projectId_keyword_key" ON "keywords"("projectId", "keyword");

-- CreateIndex
CREATE INDEX "keyword_history_keywordId_recordedAt_idx" ON "keyword_history"("keywordId", "recordedAt");

-- CreateIndex
CREATE INDEX "crawl_sessions_projectId_startedAt_idx" ON "crawl_sessions"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "technical_issues_crawlId_severity_idx" ON "technical_issues"("crawlId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_projectId_domain_key" ON "competitors"("projectId", "domain");

-- CreateIndex
CREATE INDEX "content_checks_pageId_checkedAt_idx" ON "content_checks"("pageId", "checkedAt");

-- CreateIndex
CREATE INDEX "reports_projectId_createdAt_idx" ON "reports"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_userId_read_createdAt_idx" ON "alerts"("userId", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_scores" ADD CONSTRAINT "geo_scores_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_scores" ADD CONSTRAINT "geo_scores_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_scores" ADD CONSTRAINT "seo_scores_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_scores" ADD CONSTRAINT "seo_scores_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_history" ADD CONSTRAINT "keyword_history_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_sessions" ADD CONSTRAINT "crawl_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_issues" ADD CONSTRAINT "technical_issues_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_issues" ADD CONSTRAINT "technical_issues_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_checks" ADD CONSTRAINT "content_checks_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
