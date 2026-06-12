-- Align Lead.email with schema: optional for widget capture (userId/phone without email)
ALTER TABLE "Lead" ALTER COLUMN "email" DROP NOT NULL;
