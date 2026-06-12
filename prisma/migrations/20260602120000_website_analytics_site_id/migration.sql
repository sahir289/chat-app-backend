-- Add site tenancy to website analytics visitors
ALTER TABLE "website_analytics_visitors" ADD COLUMN "site_id" TEXT NOT NULL DEFAULT 'mitra-varta';

DROP INDEX IF EXISTS "website_analytics_visitors_visitor_key_key";

CREATE UNIQUE INDEX "website_analytics_visitors_site_id_visitor_key_key"
ON "website_analytics_visitors"("site_id", "visitor_key");

CREATE INDEX "website_analytics_visitors_site_id_idx" ON "website_analytics_visitors"("site_id");
