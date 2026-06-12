-- CreateIndex
CREATE INDEX "website_analytics_visitors_site_id_last_seen_at_idx" ON "website_analytics_visitors"("site_id", "last_seen_at");
