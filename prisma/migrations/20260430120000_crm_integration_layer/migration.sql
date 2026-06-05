-- CreateEnum
CREATE TYPE "CrmProvider" AS ENUM ('WEBHOOK', 'HUBSPOT', 'ZOHO', 'SALESFORCE', 'PIPEDRIVE', 'FRESHSALES');

-- CreateEnum
CREATE TYPE "CrmIntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CrmLeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "CrmSyncAction" AS ENUM ('CREATE_CONTACT', 'UPDATE_CONTACT', 'ADD_NOTE', 'SYNC_LEAD', 'TEST_CONNECTION');

-- CreateEnum
CREATE TYPE "CrmSyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "CrmSyncTrigger" AS ENUM ('LEAD_CREATED', 'CHAT_CLOSED', 'CHAT_ASSIGNED', 'MANUAL', 'TEST');

-- CreateTable
CREATE TABLE "CrmIntegration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "CrmProvider" NOT NULL,
    "status" "CrmIntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "encryptedWebhookUrl" TEXT,
    "encryptedWebhookSecret" TEXT,
    "settings" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFieldMapping" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "CrmProvider" NOT NULL,
    "source" "CrmLeadSource" NOT NULL,
    "mappings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSyncLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationId" TEXT,
    "leadId" TEXT,
    "chatId" TEXT,
    "provider" "CrmProvider" NOT NULL,
    "action" "CrmSyncAction" NOT NULL,
    "trigger" "CrmSyncTrigger" NOT NULL,
    "status" "CrmSyncStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCrmLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" "CrmProvider" NOT NULL,
    "crmContactId" TEXT,
    "crmDealId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCrmLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmIntegration_companyId_provider_key" ON "CrmIntegration"("companyId", "provider");

-- CreateIndex
CREATE INDEX "CrmIntegration_companyId_idx" ON "CrmIntegration"("companyId");

-- CreateIndex
CREATE INDEX "CrmIntegration_provider_idx" ON "CrmIntegration"("provider");

-- CreateIndex
CREATE INDEX "CrmIntegration_status_idx" ON "CrmIntegration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFieldMapping_companyId_provider_source_key" ON "CrmFieldMapping"("companyId", "provider", "source");

-- CreateIndex
CREATE INDEX "CrmFieldMapping_companyId_idx" ON "CrmFieldMapping"("companyId");

-- CreateIndex
CREATE INDEX "CrmFieldMapping_provider_source_idx" ON "CrmFieldMapping"("provider", "source");

-- CreateIndex
CREATE INDEX "CrmSyncLog_companyId_idx" ON "CrmSyncLog"("companyId");

-- CreateIndex
CREATE INDEX "CrmSyncLog_integrationId_idx" ON "CrmSyncLog"("integrationId");

-- CreateIndex
CREATE INDEX "CrmSyncLog_leadId_idx" ON "CrmSyncLog"("leadId");

-- CreateIndex
CREATE INDEX "CrmSyncLog_chatId_idx" ON "CrmSyncLog"("chatId");

-- CreateIndex
CREATE INDEX "CrmSyncLog_provider_idx" ON "CrmSyncLog"("provider");

-- CreateIndex
CREATE INDEX "CrmSyncLog_status_idx" ON "CrmSyncLog"("status");

-- CreateIndex
CREATE INDEX "CrmSyncLog_createdAt_idx" ON "CrmSyncLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCrmLink_companyId_leadId_provider_key" ON "LeadCrmLink"("companyId", "leadId", "provider");

-- CreateIndex
CREATE INDEX "LeadCrmLink_companyId_idx" ON "LeadCrmLink"("companyId");

-- CreateIndex
CREATE INDEX "LeadCrmLink_leadId_idx" ON "LeadCrmLink"("leadId");

-- CreateIndex
CREATE INDEX "LeadCrmLink_provider_idx" ON "LeadCrmLink"("provider");

-- CreateIndex
CREATE INDEX "LeadCrmLink_crmContactId_idx" ON "LeadCrmLink"("crmContactId");

-- AddForeignKey
ALTER TABLE "CrmIntegration" ADD CONSTRAINT "CrmIntegration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFieldMapping" ADD CONSTRAINT "CrmFieldMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSyncLog" ADD CONSTRAINT "CrmSyncLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSyncLog" ADD CONSTRAINT "CrmSyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "CrmIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSyncLog" ADD CONSTRAINT "CrmSyncLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCrmLink" ADD CONSTRAINT "LeadCrmLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCrmLink" ADD CONSTRAINT "LeadCrmLink_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
