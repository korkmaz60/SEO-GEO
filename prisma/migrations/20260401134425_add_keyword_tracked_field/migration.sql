-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "tracked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "keywords_projectId_tracked_idx" ON "keywords"("projectId", "tracked");
