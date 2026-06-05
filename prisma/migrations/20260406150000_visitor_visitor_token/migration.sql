-- visitorToken on Visitor: same value as sessionId (widget identity); required for inserts.
ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "visitorToken" TEXT;

UPDATE "Visitor" SET "visitorToken" = "sessionId" WHERE "visitorToken" IS NULL OR trim("visitorToken") = '';

ALTER TABLE "Visitor" ALTER COLUMN "visitorToken" SET NOT NULL;

DROP INDEX IF EXISTS "Visitor_companyId_sessionId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Visitor_companyId_visitorToken_key" ON "Visitor"("companyId", "visitorToken");

CREATE INDEX IF NOT EXISTS "Visitor_visitorToken_idx" ON "Visitor"("visitorToken");
