-- AgentModuleAccess: optional access to company, billing, and account settings for agents
-- IF NOT EXISTS: safe if columns were applied earlier via `db execute` or partial runs (PostgreSQL 11+)
ALTER TABLE "AgentModuleAccess" ADD COLUMN IF NOT EXISTS "companyAccess" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentModuleAccess" ADD COLUMN IF NOT EXISTS "billingAccess" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentModuleAccess" ADD COLUMN IF NOT EXISTS "settingsAccess" BOOLEAN NOT NULL DEFAULT false;
