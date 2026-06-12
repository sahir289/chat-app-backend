export type WebsiteAnalyticsDeviceType =
    | "DESKTOP"
    | "MOBILE"
    | "TABLET"
    | "BOT"
    | "UNKNOWN";

export type WebsiteAnalyticsVisitorSortField =
    | "lastSeenAt"
    | "firstSeenAt"
    | "pageViewCount"
    | "visitCount"
    | "createdAt";

export type WebsiteAnalyticsPageViewSortField = "viewedAt" | "path";

export interface WebsiteAnalyticsPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    nextCursor?: string | null;
}

export interface WebsiteAnalyticsVisitor {
    id: string;
    visitorKey: string;
    country: string | null;
    region: string | null;
    city: string | null;
    timezone: string | null;
    deviceType: WebsiteAnalyticsDeviceType;
    browser: string | null;
    os: string | null;
    userAgent: string | null;
    firstPage: string | null;
    landingPage: string | null;
    referrer: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm: string | null;
    utmContent: string | null;
    visitCount: number;
    pageViewCount: number;
    isBot: boolean;
    firstSeenAt: string;
    lastSeenAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface WebsiteAnalyticsSession {
    id: string;
    sessionKey: string;
    visitorId: string;
    startedAt: string;
    lastSeenAt: string;
    isBot: boolean;
    deviceType: WebsiteAnalyticsDeviceType;
    userAgent: string | null;
}

export interface WebsiteAnalyticsPageView {
    id: string;
    visitorId: string;
    sessionId: string;
    path: string;
    title: string | null;
    referrer: string | null;
    userAgent: string | null;
    viewedAt: string;
}

export interface WebsiteAnalyticsIpHistory {
    id: string;
    visitorId: string;
    maskedIp: string;
    userAgent: string | null;
    country: string | null;
    city: string | null;
    seenCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
    hasEncryptedIp: boolean;
}

export interface WebsiteAnalyticsOverview {
    totals: {
        visitors: number;
        sessions: number;
        pageViews: number;
        botVisitors: number;
    };
    recent: {
        visitorsLast24h: number;
        visitorsLast7d: number;
        sessionsLast24h: number;
        pageViewsLast24h: number;
    };
    topCountries: Array<{ country: string; count: number }>;
    deviceBreakdown: Array<{ deviceType: string; count: number }>;
    excludeBots: boolean;
}

export interface WebsiteAnalyticsTopPage {
    path: string;
    views: number;
}

export interface WebsiteAnalyticsDecryptIpResult {
    ipHistoryId: string;
    visitorId: string;
    maskedIp: string;
    rawIp: string;
    decryptedAt: string;
}

/** Shapes returned by chat-bot-back super-admin website analytics routes. */
export interface WebsiteAnalyticsVisitorsResponse {
    visitors: WebsiteAnalyticsVisitor[];
    pagination: WebsiteAnalyticsPagination;
}

export interface WebsiteAnalyticsVisitorDetailResponse {
    visitor: WebsiteAnalyticsVisitor;
    ipHistory: WebsiteAnalyticsIpHistory[];
    recentSessions: WebsiteAnalyticsSession[];
    recentPageViews: WebsiteAnalyticsPageView[];
}

export interface WebsiteAnalyticsTopPagesResponse {
    pages: WebsiteAnalyticsTopPage[];
    pagination: WebsiteAnalyticsPagination;
}

export interface WebsiteAnalyticsPageViewsResponse {
    pageViews: WebsiteAnalyticsPageView[];
    pagination: WebsiteAnalyticsPagination;
}

/** Common fields on Serviots analytics admin API JSON responses. */
export type ServiotsAnalyticsSuccess = { success?: boolean; message?: string };

/** Parsed Serviots JSON before narrowing to a typed endpoint body. */
export type ServiotsAnalyticsRawBody = ServiotsAnalyticsSuccess & Record<string, unknown>;

export type ServiotsAnalyticsFetchResult<T> = {
    data: T;
    status: number;
};

/** JSON bodies from Serviots analytics admin APIs. */
export type ServiotsWebsiteAnalyticsOverviewResponse = ServiotsAnalyticsSuccess & {
    data: WebsiteAnalyticsOverview;
};

export type ServiotsWebsiteAnalyticsVisitorsResponse = ServiotsAnalyticsSuccess & {
    visitors: WebsiteAnalyticsVisitor[];
    pagination: WebsiteAnalyticsPagination;
};

export type ServiotsWebsiteAnalyticsVisitorDetailResponse = ServiotsAnalyticsSuccess & {
    data: WebsiteAnalyticsVisitorDetailResponse;
};

export type ServiotsWebsiteAnalyticsTopPagesResponse = ServiotsAnalyticsSuccess & {
    pages: WebsiteAnalyticsTopPage[];
    pagination: WebsiteAnalyticsPagination;
};

export type ServiotsWebsiteAnalyticsPageViewsResponse = ServiotsAnalyticsSuccess & {
    pageViews: WebsiteAnalyticsPageView[];
    pagination: WebsiteAnalyticsPagination;
};

export type ServiotsWebsiteAnalyticsDecryptIpResponse = ServiotsAnalyticsSuccess & {
    data: WebsiteAnalyticsDecryptIpResult;
};
