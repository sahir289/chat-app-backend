-- Pre-req for chat_lifecycle_v2:
-- introduce token columns before VisitorEvent backfill reads them.

ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "visitorToken" TEXT;

UPDATE "Chat"
SET "visitorToken" = "sessionId"
WHERE "visitorToken" IS NULL OR trim("visitorToken") = '';

ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "visitorToken" TEXT;

UPDATE "Visitor"
SET "visitorToken" = "sessionId"
WHERE "visitorToken" IS NULL OR trim("visitorToken") = '';
