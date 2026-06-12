import { analyticsConfig } from "../../config/analyticsConfig";
import prisma from "../prisma";
import { getModuleLogger } from "../../utils/logger";

const log = getModuleLogger("websiteAnalyticsRetention");

export type PruneWebsiteAnalyticsResult = {
    retentionDays: number;
    cutoff: string;
    deletedPageViews: number;
    deletedSessions: number;
    deletedIpHistory: number;
    deletedVisitors: number;
};

/**
 * Deletes analytics rows older than the configured retention window.
 * Set WEBSITE_ANALYTICS_RETENTION_DAYS (default 0 = disabled).
 */
export async function pruneWebsiteAnalytics(
    retentionDays = analyticsConfig.retentionDays
): Promise<PruneWebsiteAnalyticsResult | null> {
    if (!retentionDays || retentionDays <= 0) {
        return null;
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedPageViews = await prisma.websiteAnalyticsPageView.deleteMany({
        where: { viewedAt: { lt: cutoff } },
    });

    const deletedSessions = await prisma.websiteAnalyticsSession.deleteMany({
        where: { lastSeenAt: { lt: cutoff } },
    });

    const deletedIpHistory = await prisma.websiteAnalyticsVisitorIpHistory.deleteMany({
        where: { lastSeenAt: { lt: cutoff } },
    });

    const deletedVisitors = await prisma.websiteAnalyticsVisitor.deleteMany({
        where: {
            lastSeenAt: { lt: cutoff },
            sessions: { none: {} },
            pageViews: { none: {} },
        },
    });

    const result: PruneWebsiteAnalyticsResult = {
        retentionDays,
        cutoff: cutoff.toISOString(),
        deletedPageViews: deletedPageViews.count,
        deletedSessions: deletedSessions.count,
        deletedIpHistory: deletedIpHistory.count,
        deletedVisitors: deletedVisitors.count,
    };

    log.info("Website analytics retention prune completed", result);

    return result;
}
