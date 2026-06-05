ALTER TABLE "Company"
ADD COLUMN "aiCreditsMonthlyManualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiTokensPerCreditManualOverride" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Company"
SET "aiCreditsMonthlyManualOverride" = true
WHERE "aiCreditsMonthlyBase" > 0
  AND "aiCreditsMonthlyBase" <> 150;

UPDATE "Company"
SET "aiTokensPerCreditManualOverride" = true
WHERE "aiTokensPerCredit" NOT IN (500, 1000);
