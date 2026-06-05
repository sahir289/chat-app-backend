import type { Request } from "express";
import { getLocationFromIP, type IPLocation } from "./ipLocation";
import { getModuleLogger } from "./logger";
import { config } from "../config";

const log = getModuleLogger("requestMeta");

export interface RequestMetadata {
    ipAddress: string | null;
    country: string | null;
    location: IPLocation;
}

/**
 * Extracts the client IP address from request headers and socket.
 * Handles x-forwarded-for, x-real-ip, cf-connecting-ip, x-client-ip, and socket.remoteAddress.
 * Normalizes IPv6-mapped IPv4 addresses (::ffff:).
 */
export function extractClientIp(req: Request): string | null {
    const socketIp = req.socket.remoteAddress ? normalizeIP(req.socket.remoteAddress) : null;
    const shouldTrustForwardedHeaders =
        config.server.trustProxy || isLoopbackOrPrivateIp(socketIp);

    if (shouldTrustForwardedHeaders) {
        const headerIp =
            getHeaderIp(req.headers["cf-connecting-ip"]) ??
            getHeaderIp(req.headers["x-real-ip"]) ??
            getHeaderIp(req.headers["x-client-ip"]) ??
            getHeaderIp(req.headers["x-forwarded-for"]);

        if (headerIp) {
            return headerIp;
        }
    }

    if (req.ip) {
        return normalizeIP(req.ip);
    }

    if (req.socket.remoteAddress) {
        return normalizeIP(req.socket.remoteAddress);
    }

    return null;
}

/** @alias extractClientIp — kept for existing imports (rate limiting, etc.). */
export function extractIPAddress(req: Request): string | null {
    return extractClientIp(req);
}

/**
 * Normalizes IP address by removing IPv6-mapped IPv4 prefix.
 */
function normalizeIP(ip: string): string {
    let normalized = ip.trim();
    if (normalized.startsWith("::ffff:")) {
        normalized = normalized.replace("::ffff:", "");
    }

    // Handle IPv4 with port in some proxy formats.
    if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(normalized)) {
        normalized = normalized.split(":")[0];
    }

    return normalized;
}

function getHeaderIp(value: string | string[] | undefined): string | null {
    if (!value) {
        return null;
    }

    const raw = Array.isArray(value) ? value[0] : value;
    const ips = raw
        .split(",")
        .map((part) => normalizeIP(part))
        .filter(Boolean);

    if (ips.length === 0) {
        return null;
    }

    const firstPublicIp = ips.find((ip) => !isLoopbackOrPrivateIp(ip));
    return firstPublicIp ?? ips[0];
}

function isLoopbackOrPrivateIp(ip: string | null): boolean {
    if (!ip) {
        return false;
    }

    return (
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("172.16.") ||
        ip.startsWith("172.17.") ||
        ip.startsWith("172.18.") ||
        ip.startsWith("172.19.") ||
        ip.startsWith("172.20.") ||
        ip.startsWith("172.21.") ||
        ip.startsWith("172.22.") ||
        ip.startsWith("172.23.") ||
        ip.startsWith("172.24.") ||
        ip.startsWith("172.25.") ||
        ip.startsWith("172.26.") ||
        ip.startsWith("172.27.") ||
        ip.startsWith("172.28.") ||
        ip.startsWith("172.29.") ||
        ip.startsWith("172.30.") ||
        ip.startsWith("172.31.")
    );
}

/**
 * Formats location data into a human-readable country string.
 * Format: "City, Region, Country" or "Country" if city/region unavailable.
 */
export function formatLocationString(location: IPLocation): string | null {
    if (!location.country) {
        return null;
    }

    const parts: string[] = [];
    if (location.city) {
        parts.push(location.city);
    }
    if (location.region && location.region !== location.city) {
        parts.push(location.region);
    }
    parts.push(location.country);

    return parts.join(", ");
}

/**
 * Extracts and enriches request metadata including IP address and geo-location.
 * This function handles IP detection and geo-location lookup with error handling.
 * 
 * @param req - Express request object
 * @param providedCountry - Optional country string from request body (takes precedence)
 * @returns Promise resolving to RequestMetadata
 */
export async function getRequestMetadata(
    req: Request,
    providedCountry?: string | null
): Promise<RequestMetadata> {
    const ipAddress = extractClientIp(req);

    // Otherwise, lookup from IP
    if (!ipAddress) {
        return {
            ipAddress: null,
            country: null,
            location: {
                country: null,
                countryCode: null,
                city: null,
                region: null,
            },
        };
    }

    try {
        const location = await getLocationFromIP(ipAddress);
        const country = formatLocationString(location);

        // Fall back to provided value only if IP resolution did not produce a location.
        const finalCountry = country || providedCountry || null;

        return {
            ipAddress,
            country: finalCountry,
            location,
        };
    } catch (error) {
        // Log error but don't fail the request
        log.error("Failed to get location from IP", { error });
        return {
            ipAddress,
            country: null,
            location: {
                country: null,
                countryCode: null,
                city: null,
                region: null,
            },
        };
    }
}

