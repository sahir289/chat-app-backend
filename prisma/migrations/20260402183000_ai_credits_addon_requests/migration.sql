-- CreateEnum
CREATE TYPE "AiCreditsAddonRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED');

-- CreateTable
CREATE TABLE "AiCreditsAddonRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "message" TEXT,
    "requestedCredits" INTEGER,
    "status" "AiCreditsAddonRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCreditsAddonRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCreditsAddonRequest_companyId_idx" ON "AiCreditsAddonRequest"("companyId");

-- CreateIndex
CREATE INDEX "AiCreditsAddonRequest_status_idx" ON "AiCreditsAddonRequest"("status");

-- CreateIndex
CREATE INDEX "AiCreditsAddonRequest_createdAt_idx" ON "AiCreditsAddonRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "AiCreditsAddonRequest" ADD CONSTRAINT "AiCreditsAddonRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCreditsAddonRequest" ADD CONSTRAINT "AiCreditsAddonRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
