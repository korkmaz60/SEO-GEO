-- Page citability score v1 (docs/geo-aeo.md)
ALTER TABLE "audit_run" ADD COLUMN "citability_score" INTEGER;

ALTER TABLE "audit_page" ADD COLUMN "citability_score" INTEGER,
ADD COLUMN "citability" JSONB;
