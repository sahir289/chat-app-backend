-- chat lifecycle v2 follow-up:
-- add visitorToken to VisitorEvent and align token-based indexes used by widget chat sessions.

ALTER TABLE "VisitorEvent" ADD COLUMN IF NOT EXISTS "visitorToken" TEXT;

UPDATE "VisitorEvent" AS ve
SET "visitorToken" = COALESCE(src."chatVisitorToken", src."visitorVisitorToken", ve."sessionId")
FROM (
  SELECT
    ve_inner.id,
    c."visitorToken" AS "chatVisitorToken",
    v."visitorToken" AS "visitorVisitorToken"
  FROM "VisitorEvent" AS ve_inner
  LEFT JOIN "Chat" AS c ON c.id = ve_inner."chatId"
  LEFT JOIN "Visitor" AS v ON v.id = ve_inner."visitorId"
) AS src
WHERE src.id = ve.id
  AND (ve."visitorToken" IS NULL OR trim(ve."visitorToken") = '');

UPDATE "VisitorEvent"
SET "visitorToken" = "sessionId"
WHERE "visitorToken" IS NULL OR trim("visitorToken") = '';

ALTER TABLE "VisitorEvent" ALTER COLUMN "visitorToken" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "VisitorEvent_visitorToken_idx"
ON "VisitorEvent"("visitorToken");

CREATE INDEX IF NOT EXISTS "VisitorEvent_propertyId_visitorToken_createdAt_idx"
ON "VisitorEvent"("propertyId", "visitorToken", "createdAt");
