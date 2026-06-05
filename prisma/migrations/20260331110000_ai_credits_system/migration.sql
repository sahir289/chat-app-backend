CREATE TYPE "AiStatus" AS ENUM ('ACTIVE', 'LIMIT_REACHED');

ALTER TABLE "Company"
ADD COLUMN "aiCreditsMonthlyBase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiCreditsResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "aiStatus" "AiStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "Company"
SET "aiCreditsResetAt" = CURRENT_TIMESTAMP + INTERVAL '1 month'
WHERE "aiCreditsResetAt" <= CURRENT_TIMESTAMP;

CREATE TABLE "AiTopup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "creditsAdded" INTEGER NOT NULL,
    "creditsRemaining" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTopup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Company_aiCreditsResetAt_idx" ON "Company"("aiCreditsResetAt");
CREATE INDEX "Company_aiStatus_idx" ON "Company"("aiStatus");
CREATE INDEX "AiTopup_companyId_idx" ON "AiTopup"("companyId");
CREATE INDEX "AiTopup_companyId_createdAt_idx" ON "AiTopup"("companyId", "createdAt");
CREATE INDEX "AiTopup_companyId_creditsRemaining_idx" ON "AiTopup"("companyId", "creditsRemaining");

ALTER TABLE "AiTopup"
ADD CONSTRAINT "AiTopup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
