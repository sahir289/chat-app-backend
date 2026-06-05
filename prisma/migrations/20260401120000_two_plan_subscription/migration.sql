-- Two-plan subscription: only FREE | PRO. Pro is monthly-only; Free has no billing cycle or period.
--
-- Data mapping:
-- * PROFESSIONAL, ENTERPRISE -> PRO (single paid tier).
-- * STARTER -> FREE (safer default: avoids granting Pro features without an explicit PRO assignment).
-- * YEARLY billing -> MONTHLY (yearly billing is removed; Pro is monthly only).

-- 1) Nullable billing fields for FREE plan
ALTER TABLE "Subscription" ALTER COLUMN "billingCycle" DROP NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "currentPeriodStart" DROP NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "currentPeriodEnd" DROP NOT NULL;

-- 2) Replace PlanTier enum (FREE | PRO only)
CREATE TYPE "PlanTier_new" AS ENUM ('FREE', 'PRO');

ALTER TABLE "Subscription" ALTER COLUMN "planTier" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "planTier" TYPE "PlanTier_new" USING (
  CASE
    WHEN "planTier"::text IN ('PROFESSIONAL', 'ENTERPRISE') THEN 'PRO'::"PlanTier_new"
    ELSE 'FREE'::"PlanTier_new"
  END
);
ALTER TABLE "Subscription" ALTER COLUMN "planTier" SET DEFAULT 'FREE'::"PlanTier_new";

ALTER TABLE "SubscriptionChange" ALTER COLUMN "oldPlanTier" TYPE "PlanTier_new" USING (
  CASE
    WHEN "oldPlanTier" IS NULL THEN NULL
    WHEN "oldPlanTier"::text IN ('PROFESSIONAL', 'ENTERPRISE') THEN 'PRO'::"PlanTier_new"
    ELSE 'FREE'::"PlanTier_new"
  END
);
ALTER TABLE "SubscriptionChange" ALTER COLUMN "newPlanTier" TYPE "PlanTier_new" USING (
  CASE
    WHEN "newPlanTier" IS NULL THEN NULL
    WHEN "newPlanTier"::text IN ('PROFESSIONAL', 'ENTERPRISE') THEN 'PRO'::"PlanTier_new"
    ELSE 'FREE'::"PlanTier_new"
  END
);

DROP TYPE "PlanTier";
ALTER TYPE "PlanTier_new" RENAME TO "PlanTier";

-- 3) Collapse YEARLY to MONTHLY before replacing BillingCycle enum
UPDATE "Subscription" SET "billingCycle" = 'MONTHLY'::"BillingCycle" WHERE "billingCycle"::text = 'YEARLY';

UPDATE "Subscription" SET "billingCycle" = NULL WHERE "planTier" = 'FREE'::"PlanTier";
UPDATE "Subscription" SET "billingCycle" = 'MONTHLY'::"BillingCycle" WHERE "planTier" = 'PRO'::"PlanTier";

CREATE TYPE "BillingCycle_new" AS ENUM ('MONTHLY');

ALTER TABLE "Subscription" ALTER COLUMN "billingCycle" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "billingCycle" TYPE "BillingCycle_new" USING (
  CASE
    WHEN "billingCycle" IS NULL THEN NULL
    ELSE 'MONTHLY'::"BillingCycle_new"
  END
);

DROP TYPE "BillingCycle";
ALTER TYPE "BillingCycle_new" RENAME TO "BillingCycle";

-- 4) Period dates: Free clears; Pro uses current UTC calendar month window
UPDATE "Subscription" SET
  "currentPeriodStart" = NULL,
  "currentPeriodEnd" = NULL
WHERE "planTier" = 'FREE'::"PlanTier";

UPDATE "Subscription" SET
  "currentPeriodStart" = date_trunc('month', (now() AT TIME ZONE 'utc')),
  "currentPeriodEnd" = (date_trunc('month', (now() AT TIME ZONE 'utc')) + interval '1 month' - interval '1 microsecond')
WHERE "planTier" = 'PRO'::"PlanTier";

-- 5) One subscription row per company (create missing rows)
INSERT INTO "Subscription" (
  "id",
  "companyId",
  "planTier",
  "billingCycle",
  "status",
  "currentPeriodStart",
  "currentPeriodEnd",
  "cancelAtPeriodEnd",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  CASE WHEN c."isPro" THEN 'PRO'::"PlanTier" ELSE 'FREE'::"PlanTier" END,
  CASE WHEN c."isPro" THEN 'MONTHLY'::"BillingCycle" ELSE NULL END,
  'ACTIVE'::"SubscriptionStatus",
  CASE WHEN c."isPro" THEN date_trunc('month', (now() AT TIME ZONE 'utc')) ELSE NULL END,
  CASE WHEN c."isPro" THEN (date_trunc('month', (now() AT TIME ZONE 'utc')) + interval '1 month' - interval '1 microsecond') ELSE NULL END,
  false,
  NOW(),
  NOW()
FROM "Company" c
WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."companyId" = c."id");
