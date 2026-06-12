import { parseWebsiteAnalyticsSite } from "../constants/websiteAnalyticsSites";
import type { WebsiteAnalyticsSiteId } from "../constants/websiteAnalyticsSites";
import type {
    WebsiteAnalyticsOverview,
    WebsiteAnalyticsPageViewsResponse,
    WebsiteAnalyticsTopPagesResponse,
    WebsiteAnalyticsVisitorDetailResponse,
    WebsiteAnalyticsVisitorsResponse,
    WebsiteAnalyticsDecryptIpResult,
} from "../types/websiteAnalytics";
import {
    parseOptionalBoolean,
    parseOptionalDate,
    parsePagination,
    parseCursorPagination,
} from "../lib/websiteAnalytics/admin/pagination";
import {
    decryptIpHistory,
    getAdminOverview,
    getTopPages,
    getVisitorDetail,
    IpRevealNotAvailableError,
    listPageViews,
    listVisitors,
    type PageViewSortField,
    type VisitorSortField,
} from "../lib/websiteAnalytics/admin/queries";
import type {
    SafePageView,
    SafeSession,
    SafeVisitor,
    SafeVisitorIpHistory,
} from "../lib/websiteAnalytics/admin/safe-selects";
import { AppError } from "../utils/appError";

function serializeDate(value: Date): string {
    return value.toISOString();
}

function serializeVisitor(visitor: SafeVisitor) {
    return {
        ...visitor,
        firstSeenAt: serializeDate(visitor.firstSeenAt),
        lastSeenAt: serializeDate(visitor.lastSeenAt),
        createdAt: serializeDate(visitor.createdAt),
        updatedAt: serializeDate(visitor.updatedAt),
    };
}

function serializeSession(session: SafeSession) {
    return {
        ...session,
        startedAt: serializeDate(session.startedAt),
        lastSeenAt: serializeDate(session.lastSeenAt),
    };
}

function serializePageView(pageView: SafePageView) {
    return {
        ...pageView,
        viewedAt: serializeDate(pageView.viewedAt),
    };
}

function serializeIpHistory(row: SafeVisitorIpHistory) {
    return {
        ...row,
        maskedIp: row.maskedIp ?? "",
        firstSeenAt: serializeDate(row.firstSeenAt),
        lastSeenAt: serializeDate(row.lastSeenAt),
    };
}

function parseSortOrder(value: string | null): "asc" | "desc" | undefined {
    if (value === "asc" || value === "desc") {
        return value;
    }
    return undefined;
}

function parseVisitorSortField(value: string | null): VisitorSortField | undefined {
    const fields: VisitorSortField[] = [
        "lastSeenAt",
        "firstSeenAt",
        "pageViewCount",
        "visitCount",
        "createdAt",
    ];
    return fields.includes(value as VisitorSortField)
        ? (value as VisitorSortField)
        : undefined;
}

function parsePageViewSortField(value: string | null): PageViewSortField | undefined {
    const fields: PageViewSortField[] = ["viewedAt", "path"];
    return fields.includes(value as PageViewSortField)
        ? (value as PageViewSortField)
        : undefined;
}

function resolveSiteId(query: URLSearchParams): WebsiteAnalyticsSiteId {
    return parseWebsiteAnalyticsSite(query.get("site"));
}

export const localWebsiteAnalyticsService = {
    async getOverview(query: URLSearchParams): Promise<WebsiteAnalyticsOverview> {
        const siteId = resolveSiteId(query);
        const excludeBots = parseOptionalBoolean(query, "excludeBots");
        return getAdminOverview({ siteId, excludeBots });
    },

    async getVisitors(query: URLSearchParams): Promise<WebsiteAnalyticsVisitorsResponse> {
            // Support cursor-based pagination when `cursor` query param is present
            const cursorPagination = parseCursorPagination(query);
            const base = cursorPagination.cursor
                ? { cursor: cursorPagination.cursor, limit: cursorPagination.limit }
                : parsePagination(query);

            const result = await listVisitors({
                ...(base as any),
                siteId: resolveSiteId(query),
                excludeBots: parseOptionalBoolean(query, "excludeBots"),
                sortBy: parseVisitorSortField(query.get("sortBy")),
                sortOrder: parseSortOrder(query.get("sortOrder")),
                from: parseOptionalDate(query, "from"),
                to: parseOptionalDate(query, "to"),
            });

        return {
            visitors: result.visitors.map(serializeVisitor),
            pagination: result.pagination,
        };
    },

    async getVisitorDetail(
        visitorId: string,
        query: URLSearchParams
    ): Promise<WebsiteAnalyticsVisitorDetailResponse> {
        const result = await getVisitorDetail(visitorId, resolveSiteId(query));
        if (!result) {
            throw new AppError(404, "Visitor not found");
        }

        return {
            visitor: serializeVisitor(result.visitor),
            ipHistory: result.ipHistory.map(serializeIpHistory),
            recentSessions: result.recentSessions.map(serializeSession),
            recentPageViews: result.recentPageViews.map(serializePageView),
        };
    },

    async getTopPages(query: URLSearchParams): Promise<WebsiteAnalyticsTopPagesResponse> {
        const pagination = parsePagination(query);
        const result = await getTopPages({
            ...pagination,
            siteId: resolveSiteId(query),
            from: parseOptionalDate(query, "from"),
            to: parseOptionalDate(query, "to"),
            excludeBots: parseOptionalBoolean(query, "excludeBots"),
        });

        return {
            pages: result.pages,
            pagination: result.pagination,
        };
    },

    async getPageViews(query: URLSearchParams): Promise<WebsiteAnalyticsPageViewsResponse> {
        const cursorPagination = parseCursorPagination(query);
        const base = cursorPagination.cursor
            ? { cursor: cursorPagination.cursor, limit: cursorPagination.limit }
            : parsePagination(query);

        const result = await listPageViews({
            ...(base as any),
            siteId: resolveSiteId(query),
            path: query.get("path") || undefined,
            visitorId: query.get("visitorId") || undefined,
            sessionId: query.get("sessionId") || undefined,
            from: parseOptionalDate(query, "from"),
            to: parseOptionalDate(query, "to"),
            excludeBots: parseOptionalBoolean(query, "excludeBots"),
            sortBy: parsePageViewSortField(query.get("sortBy")),
            sortOrder: parseSortOrder(query.get("sortOrder")),
        });

        return {
            pageViews: result.pageViews.map(serializePageView),
            pagination: result.pagination,
        };
    },

    async decryptIp(query: URLSearchParams): Promise<WebsiteAnalyticsDecryptIpResult> {
        const ipHistoryId = query.get("ipHistoryId");
        if (!ipHistoryId) {
            throw new AppError(400, "ipHistoryId is required");
        }

        try {
            const result = await decryptIpHistory(ipHistoryId);
            if (!result) {
                throw new AppError(404, "IP history record not found");
            }
            return {
                ...result,
                maskedIp: result.maskedIp ?? "",
            };
        } catch (error) {
            if (error instanceof IpRevealNotAvailableError) {
                throw new AppError(404, error.message);
            }
            throw error;
        }
    },
};
