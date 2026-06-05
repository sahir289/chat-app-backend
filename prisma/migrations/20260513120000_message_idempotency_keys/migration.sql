ALTER TABLE "Message"
ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT,
ADD COLUMN IF NOT EXISTS "replyToClientMessageId" TEXT;

WITH ranked_client_keys AS (
  SELECT
    "id",
    "metadata"->>'clientMessageId' AS "clientMessageId",
    ROW_NUMBER() OVER (
      PARTITION BY "chatId", "senderType", "metadata"->>'clientMessageId'
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "Message"
  WHERE "clientMessageId" IS NULL
    AND "metadata" IS NOT NULL
    AND "metadata" ? 'clientMessageId'
)
UPDATE "Message" m
SET "clientMessageId" = ranked_client_keys."clientMessageId"
FROM ranked_client_keys
WHERE m."id" = ranked_client_keys."id"
  AND ranked_client_keys.rn = 1;

WITH ranked_reply_keys AS (
  SELECT
    "id",
    "metadata"->>'replyToClientMessageId' AS "replyToClientMessageId",
    ROW_NUMBER() OVER (
      PARTITION BY "chatId", "senderType", "metadata"->>'replyToClientMessageId'
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "Message"
  WHERE "replyToClientMessageId" IS NULL
    AND "metadata" IS NOT NULL
    AND "metadata" ? 'replyToClientMessageId'
)
UPDATE "Message" m
SET "replyToClientMessageId" = ranked_reply_keys."replyToClientMessageId"
FROM ranked_reply_keys
WHERE m."id" = ranked_reply_keys."id"
  AND ranked_reply_keys.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Message_chatId_senderType_clientMessageId_key"
ON "Message"("chatId", "senderType", "clientMessageId");

CREATE UNIQUE INDEX IF NOT EXISTS "Message_chatId_senderType_replyToClientMessageId_key"
ON "Message"("chatId", "senderType", "replyToClientMessageId");
