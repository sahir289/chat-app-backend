import { pickQueryParams } from "../services/serviotsAnalyticsClient";

/** Query params forwarded to Serviots analytics admin APIs. */
export const websiteAnalyticsSiteQueryKeys = ["site"] as const;

export const websiteAnalyticsOverviewQueryKeys = ["excludeBots", "site"] as const;

export const WEBSITE_ANALYTICS_DEFAULT_PAGE = 1;
export const WEBSITE_ANALYTICS_DEFAULT_LIMIT = 10;
export const WEBSITE_ANALYTICS_ALLOWED_LIMITS = [10, 20, 50, 100, 150] as const;

export const websiteAnalyticsVisitorsQueryKeys = [
    "page",
    "limit",
    "excludeBots",
    "site",
] as const;

export const websiteAnalyticsTopPagesQueryKeys = [
    "page",
    "limit",
    "from",
    "to",
    "excludeBots",
    "site",
] as const;

export const websiteAnalyticsPageViewsQueryKeys = [
    "page",
    "limit",
    "path",
    "visitorId",
    "sessionId",
    "from",
    "to",
    "excludeBots",
    "sortBy",
    "sortOrder",
    "site",
] as const;

export const websiteAnalyticsDecryptIpQueryKeys = ["ipHistoryId", "site"] as const;

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLimit(value: string | null): number {
    const parsed = parsePositiveInt(value, WEBSITE_ANALYTICS_DEFAULT_LIMIT);
    return (WEBSITE_ANALYTICS_ALLOWED_LIMITS as readonly number[]).includes(parsed)
        ? parsed
        : WEBSITE_ANALYTICS_DEFAULT_LIMIT;
}

/** Applies default page/limit and clamps limit to allowed sizes. */
export function buildWebsiteAnalyticsPaginatedQuery(
    source: Record<string, unknown>,
    allowedKeys: readonly string[]
): URLSearchParams {
    const params = pickQueryParams(source, allowedKeys);
    const page = parsePositiveInt(params.get("page"), WEBSITE_ANALYTICS_DEFAULT_PAGE);
    const limit = normalizeLimit(params.get("limit"));
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params;
}
