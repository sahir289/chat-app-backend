-- Apply the migration manually
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "leftMessageBackgroundColor" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "leftMessageTextColor" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "rightMessageBackgroundColor" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "rightMessageTextColor" TEXT;

