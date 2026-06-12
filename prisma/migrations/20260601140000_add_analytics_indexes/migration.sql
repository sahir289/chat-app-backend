-- Add optimized indexes for analytics queries

-- WebsiteAnalyticsVisitor: Support date-range queries on when visitors were first seen
CREATE INDEX IF NOT EXISTS "website_analytics_visitors_first_seen_at_idx" ON "website_analytics_visitors"("first_seen_at");

-- WebsiteAnalyticsVisitor: Support filtering by bot + date range for recent/historical reports
CREATE INDEX IF NOT EXISTS "website_analytics_visitors_is_bot_last_seen_idx" ON "website_analytics_visitors"("is_bot", "last_seen_at");

-- WebsiteAnalyticsPageView: Support time-range queries with visitor filtering for analytics overview
CREATE INDEX IF NOT EXISTS "website_analytics_page_views_viewed_at_visitor_idx" ON "website_analytics_page_views"("viewed_at", "visitor_id");

-- WebsiteAnalyticsPageView: Support visitor's page views timeline
CREATE INDEX IF NOT EXISTS "website_analytics_page_views_visitor_viewed_at_idx" ON "website_analytics_page_views"("visitor_id", "viewed_at");

-- WebsiteAnalyticsSession: Support filtering by bot status with time-based queries
CREATE INDEX IF NOT EXISTS "website_analytics_sessions_is_bot_last_seen_idx" ON "website_analytics_sessions"("is_bot", "last_seen_at");

-- WebsiteAnalyticsPageView: Support pagination by path (top pages queries)
CREATE INDEX IF NOT EXISTS "website_analytics_page_views_path_viewed_at_idx" ON "website_analytics_page_views"("path", "viewed_at");
