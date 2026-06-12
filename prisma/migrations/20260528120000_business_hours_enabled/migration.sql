-- Business hours master toggle (Use Business Hours). Column was added to schema.prisma
-- but missing from init migration; production DBs created via migrate deploy need this.
ALTER TABLE "BusinessHours" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT false;
