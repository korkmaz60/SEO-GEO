-- Workspace-bound API keys with scopes
CREATE TABLE "workspace_api_key" (
    "key_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scopes" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_api_key_pkey" PRIMARY KEY ("key_id")
);

CREATE INDEX "workspace_api_key_workspace_id_idx" ON "workspace_api_key"("workspace_id");

ALTER TABLE "workspace_api_key" ADD CONSTRAINT "workspace_api_key_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "apikey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_api_key" ADD CONSTRAINT "workspace_api_key_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security without policies on every new table (see the supabase_lockdown
-- migration): the application connects as the table owner; other roles see nothing.
ALTER TABLE "workspace_api_key" ENABLE ROW LEVEL SECURITY;

-- API keys were limited to 10 requests a day (the plugin's default); allow 600 a minute.
ALTER TABLE "apikey" ALTER COLUMN "rate_limit_time_window" SET DEFAULT 60000,
ALTER COLUMN "rate_limit_max" SET DEFAULT 600;
UPDATE "apikey" SET "rate_limit_time_window" = 60000, "rate_limit_max" = 600
WHERE "rate_limit_time_window" = 86400000 AND "rate_limit_max" = 10;
