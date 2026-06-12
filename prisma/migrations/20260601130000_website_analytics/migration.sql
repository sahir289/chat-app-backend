-- CreateEnum
CREATE TYPE "WebsiteAnalyticsDeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'BOT', 'UNKNOWN');

-- CreateTable
CREATE TABLE "website_analytics_visitors" (
    "id" TEXT NOT NULL,
    "visitor_key" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "timezone" TEXT,
    "device_type" "WebsiteAnalyticsDeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "browser" TEXT,
    "os" TEXT,
    "user_agent" TEXT,
    "first_page" TEXT,
    "landing_page" TEXT,
    "referrer" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "page_view_count" INTEGER NOT NULL DEFAULT 0,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_analytics_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_analytics_visitor_ip_history" (
    "id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "encrypted_ip" TEXT,
    "masked_ip" TEXT,
    "user_agent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "seen_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_analytics_visitor_ip_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_analytics_sessions" (
    "id" TEXT NOT NULL,
    "session_key" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "device_type" "WebsiteAnalyticsDeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "user_agent" TEXT,

    CONSTRAINT "website_analytics_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_analytics_page_views" (
    "id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "referrer" TEXT,
    "user_agent" TEXT,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_analytics_page_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "website_analytics_visitors_visitor_key_key" ON "website_analytics_visitors"("visitor_key");

-- CreateIndex
CREATE INDEX "website_analytics_visitors_last_seen_at_idx" ON "website_analytics_visitors"("last_seen_at");

-- CreateIndex
CREATE INDEX "website_analytics_visitors_is_bot_idx" ON "website_analytics_visitors"("is_bot");

-- CreateIndex
CREATE INDEX "website_analytics_visitors_city_idx" ON "website_analytics_visitors"("city");

-- CreateIndex
CREATE INDEX "website_analytics_visitors_country_idx" ON "website_analytics_visitors"("country");

-- CreateIndex
CREATE INDEX "website_analytics_visitors_utm_source_idx" ON "website_analytics_visitors"("utm_source");

-- CreateIndex
CREATE INDEX "website_analytics_visitors_device_type_idx" ON "website_analytics_visitors"("device_type");

-- CreateIndex
CREATE INDEX "website_analytics_visitor_ip_history_visitor_id_idx" ON "website_analytics_visitor_ip_history"("visitor_id");

-- CreateIndex
CREATE INDEX "website_analytics_visitor_ip_history_ip_hash_idx" ON "website_analytics_visitor_ip_history"("ip_hash");

-- CreateIndex
CREATE INDEX "website_analytics_visitor_ip_history_masked_ip_idx" ON "website_analytics_visitor_ip_history"("masked_ip");

-- CreateIndex
CREATE INDEX "website_analytics_visitor_ip_history_country_idx" ON "website_analytics_visitor_ip_history"("country");

-- CreateIndex
CREATE INDEX "website_analytics_visitor_ip_history_city_idx" ON "website_analytics_visitor_ip_history"("city");

-- CreateIndex
CREATE UNIQUE INDEX "website_analytics_visitor_ip_history_visitor_id_ip_hash_key" ON "website_analytics_visitor_ip_history"("visitor_id", "ip_hash");

-- CreateIndex
CREATE UNIQUE INDEX "website_analytics_sessions_session_key_key" ON "website_analytics_sessions"("session_key");

-- CreateIndex
CREATE INDEX "website_analytics_sessions_visitor_id_idx" ON "website_analytics_sessions"("visitor_id");

-- CreateIndex
CREATE INDEX "website_analytics_sessions_started_at_idx" ON "website_analytics_sessions"("started_at");

-- CreateIndex
CREATE INDEX "website_analytics_sessions_last_seen_at_idx" ON "website_analytics_sessions"("last_seen_at");

-- CreateIndex
CREATE INDEX "website_analytics_sessions_is_bot_idx" ON "website_analytics_sessions"("is_bot");

-- CreateIndex
CREATE INDEX "website_analytics_sessions_device_type_idx" ON "website_analytics_sessions"("device_type");

-- CreateIndex
CREATE INDEX "website_analytics_page_views_visitor_id_idx" ON "website_analytics_page_views"("visitor_id");

-- CreateIndex
CREATE INDEX "website_analytics_page_views_session_id_idx" ON "website_analytics_page_views"("session_id");

-- CreateIndex
CREATE INDEX "website_analytics_page_views_path_idx" ON "website_analytics_page_views"("path");

-- CreateIndex
CREATE INDEX "website_analytics_page_views_viewed_at_idx" ON "website_analytics_page_views"("viewed_at");

-- CreateIndex
CREATE INDEX "website_analytics_page_views_session_id_path_viewed_at_idx" ON "website_analytics_page_views"("session_id", "path", "viewed_at");

-- AddForeignKey
ALTER TABLE "website_analytics_visitor_ip_history" ADD CONSTRAINT "website_analytics_visitor_ip_history_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "website_analytics_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_analytics_sessions" ADD CONSTRAINT "website_analytics_sessions_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "website_analytics_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_analytics_page_views" ADD CONSTRAINT "website_analytics_page_views_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "website_analytics_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_analytics_page_views" ADD CONSTRAINT "website_analytics_page_views_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "website_analytics_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
