-- Anniversary-based monthly billing.
-- New paid subscriptions renew from their actual subscription datetime in UTC,
-- not from the first/last day of the calendar month.

ALTER TABLE "Subscription"
  ADD COLUMN "subscriptionStartDate" TIMESTAMP(3),
  ADD COLUMN "billingAnchorDay" INTEGER,
  ADD COLUMN "nextBillingAt" TIMESTAMP(3);

-- Backfill existing PRO rows using the best available historical timestamp.
-- `createdAt` is used as the durable anchor because prior schema did not persist
-- the actual subscription start date separately.
WITH seeded AS (
  SELECT
    s."id",
    COALESCE(s."subscriptionStartDate", s."createdAt") AS start_at
  FROM "Subscription" s
  WHERE s."planTier" = 'PRO'::"PlanTier"
),
anchored AS (
  SELECT
    seeded."id",
    seeded.start_at,
    EXTRACT(DAY FROM seeded.start_at)::int AS anchor_day
  FROM seeded
),
next_cycles AS (
  SELECT
    anchored."id",
    anchored.start_at,
    anchored.anchor_day,
    make_timestamp(
      EXTRACT(YEAR FROM (anchored.start_at + interval '1 month'))::int,
      EXTRACT(MONTH FROM (anchored.start_at + interval '1 month'))::int,
      LEAST(
        anchored.anchor_day,
        EXTRACT(
          DAY FROM (
            date_trunc('month', anchored.start_at + interval '2 month') - interval '1 day'
          )
        )::int
      ),
      EXTRACT(HOUR FROM anchored.start_at)::int,
      EXTRACT(MINUTE FROM anchored.start_at)::int,
      EXTRACT(SECOND FROM anchored.start_at)
    ) AS next_billing_at
  FROM anchored
)
UPDATE "Subscription" s
SET
  "subscriptionStartDate" = next_cycles.start_at,
  "billingAnchorDay" = next_cycles.anchor_day,
  "currentPeriodStart" = next_cycles.start_at,
  "nextBillingAt" = next_cycles.next_billing_at,
  "currentPeriodEnd" = next_cycles.next_billing_at - interval '1 millisecond'
FROM next_cycles
WHERE s."id" = next_cycles."id";

UPDATE "Subscription"
SET
  "subscriptionStartDate" = NULL,
  "billingAnchorDay" = NULL,
  "currentPeriodStart" = NULL,
  "currentPeriodEnd" = NULL,
  "nextBillingAt" = NULL
WHERE "planTier" = 'FREE'::"PlanTier";

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_billingAnchorDay_check"
  CHECK ("billingAnchorDay" IS NULL OR ("billingAnchorDay" >= 1 AND "billingAnchorDay" <= 31));
