-- CreateTable
CREATE TABLE "gsc_site_daily" (
    "project_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "gsc_site_daily_pkey" PRIMARY KEY ("project_id","date")
);

-- AddForeignKey
ALTER TABLE "gsc_site_daily" ADD CONSTRAINT "gsc_site_daily_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security without policies, as for every table.
ALTER TABLE "gsc_site_daily" ENABLE ROW LEVEL SECURITY;
