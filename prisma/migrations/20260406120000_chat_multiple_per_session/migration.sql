-- Allow multiple Chat rows per (propertyId, sessionId) so a new conversation can start after one is closed.

DROP INDEX IF EXISTS "Chat_propertyId_sessionId_key";

CREATE INDEX IF NOT EXISTS "Chat_propertyId_sessionId_idx" ON "Chat"("propertyId", "sessionId");
