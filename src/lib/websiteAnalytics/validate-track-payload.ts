import { z } from "zod";

import {
    isLocalWebsiteAnalyticsSite,
    parseWebsiteAnalyticsSite,
    WEBSITE_ANALYTICS_SITES,
} from "../../constants/websiteAnalyticsSites";
import { normalizeAnalyticsPath } from "./normalize-path";

const uuidKeySchema = z.string().uuid({
    message: "Must be a valid UUID",
});

const siteIdSchema = z
    .string()
    .trim()
    .optional()
    .transform((value) => parseWebsiteAnalyticsSite(value ?? WEBSITE_ANALYTICS_SITES.mitraVarta.id))
    .refine((siteId) => isLocalWebsiteAnalyticsSite(siteId), {
        message: "This endpoint only accepts traffic for the local analytics site",
    });

const optionalBoundedString = (max: number) =>
    z
        .string()
        .max(max)
        .nullish()
        .transform((value) => value ?? undefined);

export const trackPayloadSchema = z.object({
    siteId: siteIdSchema,
    visitorKey: uuidKeySchema,
    sessionKey: uuidKeySchema,
    path: z
        .string()
        .min(1)
        .max(500)
        .transform((value) => normalizeAnalyticsPath(value)),
    title: optionalBoundedString(300),
    referrer: optionalBoundedString(1000),
    utmSource: optionalBoundedString(200),
    utmMedium: optionalBoundedString(200),
    utmCampaign: optionalBoundedString(200),
    utmTerm: optionalBoundedString(200),
    utmContent: optionalBoundedString(200),
});

export type TrackPayload = z.infer<typeof trackPayloadSchema>;

export function parseTrackPayload(body: unknown) {
    return trackPayloadSchema.safeParse(body);
}
