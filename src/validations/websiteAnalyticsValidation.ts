import { z } from "zod";

export const websiteAnalyticsVisitorIdParamSchema = z.object({
    params: z.object({
        visitorId: z.string().trim().min(1, "visitorId is required"),
    }),
});

export const websiteAnalyticsDecryptIpQuerySchema = z.object({
    query: z.object({
        ipHistoryId: z.string().trim().min(1, "ipHistoryId query parameter is required"),
    }),
});
