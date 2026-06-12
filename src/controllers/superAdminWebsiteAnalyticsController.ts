import type { Request, Response } from "express";
import {
    buildWebsiteAnalyticsPaginatedQuery,
    websiteAnalyticsDecryptIpQueryKeys,
    websiteAnalyticsOverviewQueryKeys,
    websiteAnalyticsPageViewsQueryKeys,
    websiteAnalyticsSiteQueryKeys,
    websiteAnalyticsTopPagesQueryKeys,
    websiteAnalyticsVisitorsQueryKeys,
} from "../constants/websiteAnalyticsQuery";
import { pickQueryParams } from "../services/serviotsAnalyticsClient";
import { websiteAnalyticsService } from "../services/websiteAnalyticsService";
import { successResponse } from "../utils/apiResponse";

function buildSiteQuery(req: Request, allowedKeys: readonly string[]): URLSearchParams {
    const params = pickQueryParams(req.query, [...allowedKeys, ...websiteAnalyticsSiteQueryKeys]);
    return params;
}

export async function getWebsiteAnalyticsOverviewHandler(req: Request, res: Response) {
    const query = buildSiteQuery(req, websiteAnalyticsOverviewQueryKeys);
    const data = await websiteAnalyticsService.getOverview(query);
    return successResponse(res, { data, statusCode: 200 });
}

export async function getWebsiteAnalyticsVisitorsHandler(req: Request, res: Response) {
    const query = buildWebsiteAnalyticsPaginatedQuery(
        req.query as Record<string, unknown>,
        [...websiteAnalyticsVisitorsQueryKeys, ...websiteAnalyticsSiteQueryKeys]
    );
    const data = await websiteAnalyticsService.getVisitors(query);
    return successResponse(res, { data, statusCode: 200 });
}

export async function getWebsiteAnalyticsVisitorDetailHandler(req: Request, res: Response) {
    const query = buildSiteQuery(req, []);
    const data = await websiteAnalyticsService.getVisitorDetail(req.params.visitorId, query);
    return successResponse(res, { data, statusCode: 200 });
}

export async function getWebsiteAnalyticsTopPagesHandler(req: Request, res: Response) {
    const query = buildWebsiteAnalyticsPaginatedQuery(
        req.query as Record<string, unknown>,
        [...websiteAnalyticsTopPagesQueryKeys, ...websiteAnalyticsSiteQueryKeys]
    );
    const data = await websiteAnalyticsService.getTopPages(query);
    return successResponse(res, { data, statusCode: 200 });
}

export async function getWebsiteAnalyticsPageViewsHandler(req: Request, res: Response) {
    const query = buildWebsiteAnalyticsPaginatedQuery(
        req.query as Record<string, unknown>,
        [...websiteAnalyticsPageViewsQueryKeys, ...websiteAnalyticsSiteQueryKeys]
    );
    const data = await websiteAnalyticsService.getPageViews(query);
    return successResponse(res, { data, statusCode: 200 });
}

export async function getWebsiteAnalyticsDecryptIpHandler(req: Request, res: Response) {
    const query = buildSiteQuery(req, websiteAnalyticsDecryptIpQueryKeys);
    const data = await websiteAnalyticsService.decryptIp(query);
    return successResponse(res, { data, statusCode: 200 });
}
