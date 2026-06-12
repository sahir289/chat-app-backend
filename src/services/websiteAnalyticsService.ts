import {

    parseWebsiteAnalyticsSite,

    isLocalWebsiteAnalyticsSite,

} from "../constants/websiteAnalyticsSites";

import type {

    ServiotsWebsiteAnalyticsDecryptIpResponse,

    ServiotsWebsiteAnalyticsOverviewResponse,

    ServiotsWebsiteAnalyticsPageViewsResponse,

    ServiotsWebsiteAnalyticsTopPagesResponse,

    ServiotsWebsiteAnalyticsVisitorDetailResponse,

    ServiotsWebsiteAnalyticsVisitorsResponse,

    WebsiteAnalyticsDecryptIpResult,

    WebsiteAnalyticsOverview,

    WebsiteAnalyticsPageViewsResponse,

    WebsiteAnalyticsTopPagesResponse,

    WebsiteAnalyticsVisitorDetailResponse,

    WebsiteAnalyticsVisitorsResponse,

} from "../types/websiteAnalytics";

import { localWebsiteAnalyticsService } from "./localWebsiteAnalyticsService";

import { fetchServiotsAnalytics } from "./serviotsAnalyticsClient";
import { cacheGet, cacheSet } from "../lib/cache/redisClient";



const PATHS = {

    overview: "/api/analytics/admin/overview",

    visitors: "/api/analytics/admin/visitors",

    topPages: "/api/analytics/admin/top-pages",

    pageViews: "/api/analytics/admin/page-views",

    decryptIp: "/api/analytics/admin/decrypt-ip",

} as const;



function resolveSite(query: URLSearchParams) {

    return parseWebsiteAnalyticsSite(query.get("site"));

}



export const websiteAnalyticsService = {

    async getOverview(query: URLSearchParams): Promise<WebsiteAnalyticsOverview> {

        const site = resolveSite(query);

        const excludeBots = query.get("excludeBots") === "true";
        const cacheKey = `website_analytics:overview:site=${site}:excludeBots=${excludeBots ? "1" : "0"}`;
        const ttl = Number(process.env.WEBSITE_ANALYTICS_OVERVIEW_CACHE_TTL_SECONDS ?? "60");

        // Try cache first
        try {
            const cached = await cacheGet<WebsiteAnalyticsOverview>(cacheKey);
            if (cached) {
                return cached;
            }
        } catch {
            // ignore cache errors
        }

        // Load from the appropriate source
        let result: WebsiteAnalyticsOverview;
        if (isLocalWebsiteAnalyticsSite(site)) {
            result = await localWebsiteAnalyticsService.getOverview(query);
        } else {
            const { data } = await fetchServiotsAnalytics<ServiotsWebsiteAnalyticsOverviewResponse>(
                PATHS.overview,
                query
            );
            result = data.data;
        }

        // Store in cache for short period
        try {
            await cacheSet(cacheKey, result, ttl);
        } catch {
            // ignore cache errors
        }

        return result;

    },



    async getVisitors(query: URLSearchParams): Promise<WebsiteAnalyticsVisitorsResponse> {

        const site = resolveSite(query);
        const cacheKey = `website_analytics:visitors:${encodeURIComponent(query.toString())}`;
        const ttl = Number(process.env.WEBSITE_ANALYTICS_VISITORS_CACHE_TTL_SECONDS ?? "15");

        // Try cache
        try {
            const cached = await cacheGet<WebsiteAnalyticsVisitorsResponse>(cacheKey);
            if (cached) return cached;
        } catch {
            // ignore cache errors
        }

        let result: WebsiteAnalyticsVisitorsResponse;
        if (isLocalWebsiteAnalyticsSite(site)) {
            result = await localWebsiteAnalyticsService.getVisitors(query);
        } else {
            const { data } = await fetchServiotsAnalytics<ServiotsWebsiteAnalyticsVisitorsResponse>(
                PATHS.visitors,
                query
            );
            result = { visitors: data.visitors, pagination: data.pagination };
        }

        try {
            await cacheSet(cacheKey, result, ttl);
        } catch {
            // ignore cache errors
        }

        return result;

    },



    async getVisitorDetail(

        visitorId: string,

        query: URLSearchParams

    ): Promise<WebsiteAnalyticsVisitorDetailResponse> {

        const site = resolveSite(query);

        if (isLocalWebsiteAnalyticsSite(site)) {

            return localWebsiteAnalyticsService.getVisitorDetail(visitorId, query);

        }



        const { data } = await fetchServiotsAnalytics<ServiotsWebsiteAnalyticsVisitorDetailResponse>(

            `${PATHS.visitors}/${encodeURIComponent(visitorId)}`,

            query

        );

        return data.data;

    },



    async getTopPages(query: URLSearchParams): Promise<WebsiteAnalyticsTopPagesResponse> {

        const site = resolveSite(query);
        const cacheKey = `website_analytics:topPages:${encodeURIComponent(query.toString())}`;
        const ttl = Number(process.env.WEBSITE_ANALYTICS_TOPPAGES_CACHE_TTL_SECONDS ?? "15");

        try {
            const cached = await cacheGet<WebsiteAnalyticsTopPagesResponse>(cacheKey);
            if (cached) return cached;
        } catch {
            // ignore cache errors
        }

        let result: WebsiteAnalyticsTopPagesResponse;
        if (isLocalWebsiteAnalyticsSite(site)) {
            result = await localWebsiteAnalyticsService.getTopPages(query);
        } else {
            const { data } = await fetchServiotsAnalytics<ServiotsWebsiteAnalyticsTopPagesResponse>(
                PATHS.topPages,
                query
            );
            result = { pages: data.pages, pagination: data.pagination };
        }

        try {
            await cacheSet(cacheKey, result, ttl);
        } catch {
            // ignore cache errors
        }

        return result;

    },



    async getPageViews(query: URLSearchParams): Promise<WebsiteAnalyticsPageViewsResponse> {

        const site = resolveSite(query);

        if (isLocalWebsiteAnalyticsSite(site)) {

            return localWebsiteAnalyticsService.getPageViews(query);

        }



        const { data } = await fetchServiotsAnalytics<ServiotsWebsiteAnalyticsPageViewsResponse>(

            PATHS.pageViews,

            query

        );

        return {

            pageViews: data.pageViews,

            pagination: data.pagination,

        };

    },



    async decryptIp(query: URLSearchParams): Promise<WebsiteAnalyticsDecryptIpResult> {

        const site = resolveSite(query);

        if (isLocalWebsiteAnalyticsSite(site)) {

            return localWebsiteAnalyticsService.decryptIp(query);

        }



        const { data } = await fetchServiotsAnalytics<ServiotsWebsiteAnalyticsDecryptIpResponse>(

            PATHS.decryptIp,

            query

        );

        return data.data;

    },

};

