-- CreateEnum
CREATE TYPE "ActionCategory" AS ENUM ('TECHNICAL_SEO', 'CONTENT', 'GEO', 'SPEED', 'BACKLINK', 'KEYWORD', 'STRUCTURE');

-- CreateEnum
CREATE TYPE "ActionPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ActionCategory" NOT NULL,
    "priority" "ActionPriority" NOT NULL,
    "impact" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_items_projectId_completed_priority_idx" ON "action_items"("projectId", "completed", "priority");

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
