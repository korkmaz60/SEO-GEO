-- A workspace's own Google OAuth client, entered in the app instead of GOOGLE_CLIENT_ID
CREATE TABLE "google_oauth_client" (
    "workspace_id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "encrypted_secret" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "google_oauth_client_pkey" PRIMARY KEY ("workspace_id")
);

ALTER TABLE "google_oauth_client" ADD CONSTRAINT "google_oauth_client_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security without policies on every new table (see the supabase_lockdown
-- migration): the application connects as the table owner; other roles see nothing.
ALTER TABLE "google_oauth_client" ENABLE ROW LEVEL SECURITY;

-- Refresh tokens only work with the client that issued them.
ALTER TABLE "google_connection" ADD COLUMN "oauth_client_id" TEXT;
