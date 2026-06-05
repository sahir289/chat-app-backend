-- Add persisted lead channel metadata and backfill existing leads.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'web_widget';

UPDATE "Lead"
SET "channel" = 'manual'
WHERE "source" = 'MANUAL';

UPDATE "Lead"
SET "source" = 'WEBSITE'
WHERE "source" = 'CHAT';

ALTER TYPE "LeadSource" RENAME VALUE 'CHAT' TO 'chat';
ALTER TYPE "LeadSource" RENAME VALUE 'OFFLINE_FORM' TO 'offline_form';
ALTER TYPE "LeadSource" RENAME VALUE 'WEBSITE' TO 'website';
ALTER TYPE "LeadSource" RENAME VALUE 'FACEBOOK_ADS' TO 'facebook_ads';
ALTER TYPE "LeadSource" RENAME VALUE 'GOOGLE_ADS' TO 'google_ads';
ALTER TYPE "LeadSource" RENAME VALUE 'REFERRAL' TO 'referral';
ALTER TYPE "LeadSource" RENAME VALUE 'API' TO 'api';
ALTER TYPE "LeadSource" RENAME VALUE 'MANUAL' TO 'manual';

ALTER TABLE "Lead" ALTER COLUMN "source" SET DEFAULT 'website';
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW';
