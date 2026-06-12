import type { Request } from "express";

import { getLocationFromIP, type IPLocation } from "../../utils/ipLocation";
import type { VisitorGeo } from "./track-page-view";

function trimGeoValue(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export function resolveVisitorGeo(request: Request): VisitorGeo | undefined {
    const country =
        trimGeoValue(request.headers["x-vercel-ip-country"] as string | undefined) ??
        trimGeoValue(request.headers["cf-ipcountry"] as string | undefined);
    const region =
        trimGeoValue(request.headers["x-vercel-ip-country-region"] as string | undefined) ??
        trimGeoValue(request.headers["cf-region"] as string | undefined);
    const city =
        trimGeoValue(request.headers["x-vercel-ip-city"] as string | undefined) ??
        trimGeoValue(request.headers["cf-ipcity"] as string | undefined);
    const timezone =
        trimGeoValue(request.headers["x-vercel-ip-timezone"] as string | undefined) ??
        trimGeoValue(request.headers["cf-timezone"] as string | undefined);

    if (!country && !region && !city && !timezone) {
        return undefined;
    }

    return { country, region, city, timezone };
}

function locationToVisitorGeo(location: IPLocation): VisitorGeo | undefined {
    const country = location.country ?? location.countryCode ?? undefined;
    const region = location.region ?? undefined;
    const city = location.city ?? undefined;

    if (!country && !region && !city) {
        return undefined;
    }

    return { country, region, city };
}

function mergeVisitorGeo(
    fromHeaders: VisitorGeo | undefined,
    fromIp: VisitorGeo | undefined
): VisitorGeo | undefined {
    if (!fromHeaders) {
        return fromIp;
    }
    if (!fromIp) {
        return fromHeaders;
    }

    return {
        country: fromHeaders.country ?? fromIp.country,
        region: fromHeaders.region ?? fromIp.region,
        city: fromHeaders.city ?? fromIp.city,
        timezone: fromHeaders.timezone ?? fromIp.timezone,
    };
}

/**
 * Resolves geo from CDN edge headers when present, otherwise looks up the client IP
 * (same path as chat/widget visitor enrichment).
 */
export async function resolveVisitorGeoAsync(
    request: Request,
    ip: string | null
): Promise<VisitorGeo | undefined> {
    const fromHeaders = resolveVisitorGeo(request);
    const needsIpLookup =
        Boolean(ip) && (!fromHeaders?.country || !fromHeaders?.region || !fromHeaders?.city);

    if (!needsIpLookup) {
        return fromHeaders;
    }

    const location = await getLocationFromIP(ip);
    return mergeVisitorGeo(fromHeaders, locationToVisitorGeo(location));
}
