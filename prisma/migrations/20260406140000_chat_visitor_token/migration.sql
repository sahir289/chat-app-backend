-- visitorToken: required for Chat; widget uses same value as sessionId.
-- Safe if column already exists (e.g. added manually): only backfill nulls.

ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "visitorToken" TEXT;

UPDATE "Chat" SET "visitorToken" = "sessionId" WHERE "visitorToken" IS NULL OR trim("visitorToken") = '';

ALTER TABLE "Chat" ALTER COLUMN "visitorToken" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Chat_visitorToken_idx" ON "Chat"("visitorToken");

CREATE INDEX IF NOT EXISTS "Chat_propertyId_visitorToken_createdAt_idx" ON "Chat"("propertyId", "visitorToken", "createdAt");
