import { Prisma, type WebsiteAnalyticsDeviceType } from "@prisma/client";

import type { WebsiteAnalyticsSiteId } from "../../../constants/websiteAnalyticsSites";
import prisma from "../../prisma";
import {
    buildDateRange,
    buildPaginationMeta,
    clampPagination,
    type PaginationMeta,
    type PaginationParams,
    encodeCursor,
    decodeCursor,
    buildPaginationMetaWithCursor,
} from "../admin/pagination";
import {
    pageViewSafeSelect,
    sanitizeIpHistoryRow,
    sessionSafeSelect,
    visitorIpHistorySafeSelect,
    visitorSafeSelect,
    type SafePageView,
    type SafeSession,
    type SafeVisitor,
    type SafeVisitorIpHistory,
} from "../admin/safe-selects";

function visitorFilter(siteId: WebsiteAnalyticsSiteId, excludeBots?: boolean) {
    return {
        siteId,
        ...(excludeBots ? { isBot: false } : {}),
    };
}

export async function getAdminOverview(
    options: { siteId: WebsiteAnalyticsSiteId; excludeBots?: boolean } = {
        siteId: "mitra-varta",
    }
) {
    const { siteId, excludeBots } = options;
    const visitorWhere = visitorFilter(siteId, excludeBots);
    const scopedVisitors = await prisma.websiteAnalyticsVisitor.findMany({
        where: visitorWhere,
        select: { id: true },
    });
    const scopedVisitorIds = scopedVisitors.map((visitor) => visitor.id);
    const sessionWhere: Prisma.WebsiteAnalyticsSessionWhereInput = {
        ...(excludeBots ? { isBot: false } : {}),
        visitorId: { in: scopedVisitorIds },
    };
    const pageViewWhere: Prisma.WebsiteAnalyticsPageViewWhereInput = {
        visitorId: { in: scopedVisitorIds },
    };

    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
        totalVisitors,
        totalSessions,
        totalPageViews,
        botVisitors,
        visitorsLast24h,
        visitorsLast7d,
        sessionsLast24h,
        pageViewsLast24h,
        topCountries,
        deviceBreakdown,
    ] = await Promise.all([
        prisma.websiteAnalyticsVisitor.count({ where: visitorWhere }),
        prisma.websiteAnalyticsSession.count({ where: sessionWhere }),
        prisma.websiteAnalyticsPageView.count({ where: pageViewWhere }),
        prisma.websiteAnalyticsVisitor.count({
            where: {
                ...visitorWhere,
                isBot: true,
            },
        }),
        prisma.websiteAnalyticsVisitor.count({
            where: {
                ...visitorWhere,
                lastSeenAt: { gte: dayAgo },
            },
        }),
        prisma.websiteAnalyticsVisitor.count({
            where: {
                ...visitorWhere,
                lastSeenAt: { gte: weekAgo },
            },
        }),
        prisma.websiteAnalyticsSession.count({
            where: {
                ...sessionWhere,
                lastSeenAt: { gte: dayAgo },
            },
        }),
        prisma.websiteAnalyticsPageView.count({
            where: {
                ...pageViewWhere,
                viewedAt: { gte: dayAgo },
            },
        }),
        prisma.websiteAnalyticsVisitor.groupBy({
            by: ["country"],
            where: {
                ...visitorWhere,
                country: { not: null },
            },
            _count: { _all: true },
            orderBy: { _count: { country: "desc" } },
            take: 10,
        }),
        prisma.websiteAnalyticsVisitor.groupBy({
            by: ["deviceType"],
            where: visitorWhere,
            _count: { _all: true },
        }),
    ]);

    return {
        totals: {
            visitors: totalVisitors,
            sessions: totalSessions,
            pageViews: totalPageViews,
            botVisitors,
        },
        recent: {
            visitorsLast24h,
            visitorsLast7d,
            sessionsLast24h,
            pageViewsLast24h,
        },
        topCountries: topCountries
            .filter((row): row is typeof row & { country: string } => row.country !== null)
            .map((row) => ({
                country: row.country,
                count: row._count._all,
            })),
        deviceBreakdown: deviceBreakdown.map((row) => ({
            deviceType: row.deviceType as WebsiteAnalyticsDeviceType,
            count: row._count._all,
        })),
        excludeBots: Boolean(excludeBots),
    };
}

const VISITOR_SORT_FIELDS = [
    "lastSeenAt",
    "firstSeenAt",
    "pageViewCount",
    "visitCount",
    "createdAt",
] as const;

export type VisitorSortField = (typeof VISITOR_SORT_FIELDS)[number];

export type ListVisitorsOptions = PaginationParams & {
    siteId: WebsiteAnalyticsSiteId;
    excludeBots?: boolean;
    isBot?: boolean;
    country?: string;
    deviceType?: WebsiteAnalyticsDeviceType;
    from?: Date;
    to?: Date;
    sortBy?: VisitorSortField;
    sortOrder?: "asc" | "desc";
};

export type ListVisitorsResult = {
    visitors: SafeVisitor[];
    pagination: PaginationMeta;
};

function buildVisitorWhere(options: ListVisitorsOptions) {
    const lastSeenAt = buildDateRange(options.from, options.to);

    return {
        siteId: options.siteId,
        ...(options.excludeBots ? { isBot: false } : {}),
        ...(options.isBot !== undefined ? { isBot: options.isBot } : {}),
        ...(options.country ? { country: options.country } : {}),
        ...(options.deviceType ? { deviceType: options.deviceType } : {}),
        ...(lastSeenAt ? { lastSeenAt } : {}),
    };
}

export async function listVisitors(options: ListVisitorsOptions): Promise<ListVisitorsResult> {
    const where = buildVisitorWhere(options);
    const sortBy = options.sortBy ?? "lastSeenAt";
    const sortOrder = options.sortOrder ?? "desc";

    // Cursor-based (keyset) pagination if cursor provided
    if ((options as any).cursor) {
        const cursor = (options as any).cursor as string;
        // decode expected format value::id (base64)
        const parsed = decodeCursor(cursor);
        const take = options.limit;

        if (!parsed) {
            return { visitors: [], pagination: buildPaginationMeta(0, 1, options.limit) };
        }

        const cursorValue = parsed.value;
        const cursorId = parsed.id;

        // Only supporting keyset on lastSeenAt and createdAt for now
        if (sortBy !== "lastSeenAt" && sortBy !== "createdAt") {
            // fallback to offset pagination
        } else {
            const date = new Date(cursorValue);
            const opPrimary = sortOrder === "desc" ? { lt: date } : { gt: date };
            const opSecondary = sortOrder === "desc" ? { lt: cursorId } : { gt: cursorId };

                const visitors = await prisma.websiteAnalyticsVisitor.findMany({
                where: {
                    ...where,
                    OR: [
                        { [sortBy]: opPrimary },
                        { AND: [{ [sortBy]: date }, { id: opSecondary }] },
                    ],
                },
                select: visitorSafeSelect,
                orderBy: { [sortBy]: sortOrder },
                take,
            });

                let nextCursor: string | undefined;
                if (visitors.length === take) {
                    const last = visitors[visitors.length - 1] as any;
                    const val = last[sortBy] instanceof Date ? last[sortBy].toISOString() : String(last[sortBy]);
                    nextCursor = encodeCursor(val, last.id);
                }

                return {
                    visitors,
                    pagination: { ...buildPaginationMetaWithCursor(nextCursor, options.limit) } as any,
                };
        }
    }

    // Fallback: offset pagination (existing behavior)
    const total = await prisma.websiteAnalyticsVisitor.count({ where });
    const { page, skip } = clampPagination(total, options.page, options.limit);

    const visitors = await prisma.websiteAnalyticsVisitor.findMany({
        where,
        select: visitorSafeSelect,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: options.limit,
    });

    return {
        visitors,
        pagination: buildPaginationMeta(total, page, options.limit),
    };
}

export type VisitorDetailResult = {
    visitor: SafeVisitor;
    ipHistory: SafeVisitorIpHistory[];
    recentSessions: SafeSession[];
    recentPageViews: SafePageView[];
};

export async function getVisitorDetail(
    visitorId: string,
    siteId: WebsiteAnalyticsSiteId
): Promise<VisitorDetailResult | null> {
    const siteScopedRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM website_analytics_visitors
        WHERE id = ${visitorId} AND site_id = ${siteId}
        LIMIT 1
    `);

    if (siteScopedRows.length === 0) {
        return null;
    }

    const visitor = await prisma.websiteAnalyticsVisitor.findUnique({
        where: { id: visitorId },
        select: visitorSafeSelect,
    });

    if (!visitor) {
        return null;
    }

    const [ipHistoryRows, recentSessions, recentPageViews] = await Promise.all([
        prisma.websiteAnalyticsVisitorIpHistory.findMany({
            where: { visitorId },
            select: visitorIpHistorySafeSelect,
            orderBy: { lastSeenAt: "desc" },
            take: 50,
        }),
        prisma.websiteAnalyticsSession.findMany({
            where: { visitorId },
            select: sessionSafeSelect,
            orderBy: { lastSeenAt: "desc" },
            take: 20,
        }),
        prisma.websiteAnalyticsPageView.findMany({
            where: { visitorId },
            select: pageViewSafeSelect,
            orderBy: { viewedAt: "desc" },
            take: 50,
        }),
    ]);

    return {
        visitor,
        ipHistory: ipHistoryRows.map(sanitizeIpHistoryRow),
        recentSessions,
        recentPageViews,
    };
}

const PAGE_VIEW_SORT_FIELDS = ["viewedAt", "path"] as const;

export type PageViewSortField = (typeof PAGE_VIEW_SORT_FIELDS)[number];

export type ListPageViewsOptions = PaginationParams & {
    siteId: WebsiteAnalyticsSiteId;
    path?: string;
    visitorId?: string;
    sessionId?: string;
    from?: Date;
    to?: Date;
    excludeBots?: boolean;
    sortBy?: PageViewSortField;
    sortOrder?: "asc" | "desc";
};

export type ListPageViewsResult = {
    pageViews: SafePageView[];
    pagination: PaginationMeta;
};

function buildPageViewWhere(options: ListPageViewsOptions) {
    const viewedAt = buildDateRange(options.from, options.to);

    return {
        ...(options.path ? { path: { contains: options.path } } : {}),
        ...(options.visitorId ? { visitorId: options.visitorId } : {}),
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        ...(viewedAt ? { viewedAt } : {}),
        visitor: {
            is: {
                siteId: options.siteId,
                ...(options.excludeBots ? { isBot: false } : {}),
            },
        },
    };
}

export async function listPageViews(options: ListPageViewsOptions): Promise<ListPageViewsResult> {
    const where = buildPageViewWhere(options);
    const sortBy = options.sortBy ?? "viewedAt";
    const sortOrder = options.sortOrder ?? "desc";

    // Cursor-based pagination
    if ((options as any).cursor) {
        const cursor = (options as any).cursor as string;
        const parsed = decodeCursor(cursor);
        const take = options.limit;

        if (parsed && (sortBy === "viewedAt" || sortBy === "path")) {
            const cursorValue = parsed.value;
            const cursorId = parsed.id;

            const date = new Date(cursorValue);
            const opPrimary = sortOrder === "desc" ? { lt: date } : { gt: date };
            const opSecondary = sortOrder === "desc" ? { lt: cursorId } : { gt: cursorId };

            const pageViews = await prisma.websiteAnalyticsPageView.findMany({
                where: {
                    ...where,
                    OR: [
                        { [sortBy]: opPrimary },
                        { AND: [{ [sortBy]: date }, { id: opSecondary }] },
                    ],
                },
                select: pageViewSafeSelect,
                orderBy: { [sortBy]: sortOrder },
                take,
            });

            let nextCursor: string | undefined;
            if (pageViews.length === take) {
                const last = pageViews[pageViews.length - 1] as any;
                const val = last[sortBy] instanceof Date ? last[sortBy].toISOString() : String(last[sortBy]);
                nextCursor = encodeCursor(val, last.id);
            }

            return {
                pageViews,
                pagination: { ...buildPaginationMetaWithCursor(nextCursor, options.limit) } as any,
            };
        }
    }

    // Fallback to offset pagination
    const total = await prisma.websiteAnalyticsPageView.count({ where });
    const { page, skip } = clampPagination(total, options.page, options.limit);

    const pageViews = await prisma.websiteAnalyticsPageView.findMany({
        where,
        select: pageViewSafeSelect,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: options.limit,
    });

    return {
        pageViews,
        pagination: buildPaginationMeta(total, page, options.limit),
    };
}

export type TopPagesOptions = PaginationParams & {
    siteId: WebsiteAnalyticsSiteId;
    from?: Date;
    to?: Date;
    excludeBots?: boolean;
};

export type TopPageRow = {
    path: string;
    views: number;
};

export type TopPagesResult = {
    pages: TopPageRow[];
    pagination: PaginationMeta;
};

function buildTopPagesSqlConditions(options: TopPagesOptions): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`v.site_id = ${options.siteId}`];

    if (options.from) {
        conditions.push(Prisma.sql`pv.viewed_at >= ${options.from}`);
    }
    if (options.to) {
        conditions.push(Prisma.sql`pv.viewed_at <= ${options.to}`);
    }
    if (options.excludeBots) {
        conditions.push(Prisma.sql`v.is_bot = false`);
    }

    return conditions;
}

export async function getTopPages(options: TopPagesOptions): Promise<TopPagesResult> {
    const whereClause = Prisma.join(buildTopPagesSqlConditions(options), " AND ");

    const totalRows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM (
            SELECT pv.path
            FROM website_analytics_page_views pv
            INNER JOIN website_analytics_visitors v ON v.id = pv.visitor_id
            WHERE ${whereClause}
            GROUP BY pv.path
        ) AS grouped_paths
    `;

    const total = Number(totalRows[0]?.count ?? 0);
    const { page, skip } = clampPagination(total, options.page, options.limit);

    const rows = await prisma.$queryRaw<{ path: string; views: bigint }[]>`
        SELECT pv.path, COUNT(*)::bigint AS views
        FROM website_analytics_page_views pv
        INNER JOIN website_analytics_visitors v ON v.id = pv.visitor_id
        WHERE ${whereClause}
        GROUP BY pv.path
        ORDER BY views DESC
        LIMIT ${options.limit} OFFSET ${skip}
    `;

    return {
        pages: rows.map((row) => ({
            path: row.path,
            views: Number(row.views),
        })),
        pagination: buildPaginationMeta(total, page, options.limit),
    };
}

export class IpRevealNotAvailableError extends Error {
    constructor() {
        super("Encrypted IP is not available for this record");
        this.name = "IpRevealNotAvailableError";
    }
}

export type DecryptIpHistoryResult = {
    ipHistoryId: string;
    visitorId: string;
    maskedIp: string | null;
    rawIp: string;
    decryptedAt: string;
};

export async function decryptIpHistory(
    ipHistoryId: string
): Promise<DecryptIpHistoryResult | null> {
    const { decryptVisitorIp } = await import("../encrypt-ip");

    const ipHistory = await prisma.websiteAnalyticsVisitorIpHistory.findUnique({
        where: { id: ipHistoryId },
        select: {
            id: true,
            visitorId: true,
            maskedIp: true,
            encryptedIp: true,
        },
    });

    if (!ipHistory) {
        return null;
    }

    if (!ipHistory.encryptedIp) {
        throw new IpRevealNotAvailableError();
    }

    const rawIp = decryptVisitorIp(ipHistory.encryptedIp);

    return {
        ipHistoryId: ipHistory.id,
        visitorId: ipHistory.visitorId,
        maskedIp: ipHistory.maskedIp,
        rawIp,
        decryptedAt: new Date().toISOString(),
    };
}
