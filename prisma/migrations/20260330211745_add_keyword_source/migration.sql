-- CreateEnum
CREATE TYPE "KeywordSource" AS ENUM ('MANUAL', 'GOOGLE_SEARCH_CONSOLE', 'SERPER');

-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "clicks" INTEGER,
ADD COLUMN     "ctr" DOUBLE PRECISION,
ADD COLUMN     "impressions" INTEGER,
ADD COLUMN     "source" "KeywordSource" NOT NULL DEFAULT 'MANUAL';
