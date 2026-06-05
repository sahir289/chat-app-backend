-- Company-level token tracking, derived credits, and per-response usage history

ALTER TABLE "Company" ADD COLUMN "aiCreditsRemaining" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiTokensPerCredit" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "Company" ADD COLUMN "aiPromptTokensUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiCompletionTokensUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiTotalTokensUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiMonthlyPromptTokensUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiMonthlyCompletionTokensUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiMonthlyTokensUsed" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AiTokenUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chatId" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "monthlyCreditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "topupCreditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTokenUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiTokenUsage_companyId_idx" ON "AiTokenUsage"("companyId");
CREATE INDEX "AiTokenUsage_chatId_idx" ON "AiTokenUsage"("chatId");
CREATE INDEX "AiTokenUsage_createdAt_idx" ON "AiTokenUsage"("createdAt");
CREATE INDEX "AiTokenUsage_companyId_createdAt_idx" ON "AiTokenUsage"("companyId", "createdAt");

ALTER TABLE "AiTokenUsage" ADD CONSTRAINT "AiTokenUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTokenUsage" ADD CONSTRAINT "AiTokenUsage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
