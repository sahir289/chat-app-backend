DROP INDEX IF EXISTS "Subscription_companyId_idx";

CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");
