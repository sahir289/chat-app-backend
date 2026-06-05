import { Response } from "express";
import { authConfig, config } from "../../config";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "../../constants/authConstants";

function getHeaderValue(header: string | string[] | undefined): string | null {
    if (typeof header === "string") {
        return header.split(",")[0]?.trim() || null;
    }

    if (Array.isArray(header)) {
        return header[0]?.split(",")[0]?.trim() || null;
    }

    return null;
}

function getRequestOrigin(res: Response): string | null {
    const proto =
        (config.server.trustProxy ? getHeaderValue(res.req?.headers["x-forwarded-proto"]) : null) ||
        (res.req?.secure ? "https" : "http");
    const host =
        (config.server.trustProxy ? getHeaderValue(res.req?.headers["x-forwarded-host"]) : null) ||
        getHeaderValue(res.req?.headers.host);

    if (!host) {
        return null;
    }

    return `${proto}://${host}`;
}

function isCrossOriginRequest(res: Response): boolean {
    const origin = getHeaderValue(res.req?.headers.origin);
    const requestOrigin = getRequestOrigin(res);

    if (!origin || !requestOrigin) {
        return false;
    }

    try {
        return new URL(origin).origin !== requestOrigin;
    } catch {
        return false;
    }
}

function getSameSite(res: Response): "lax" | "none" {
    return config.server.isCrossSite || isCrossOriginRequest(res) ? "none" : "lax";
}

function requestUsesHttps(res: Response): boolean {
    const forwardedProto = config.server.trustProxy
        ? res.req?.headers["x-forwarded-proto"]
        : undefined;

    if (typeof forwardedProto === "string") {
        return forwardedProto.split(",")[0]?.trim() === "https";
    }

    if (Array.isArray(forwardedProto)) {
        return forwardedProto[0]?.split(",")[0]?.trim() === "https";
    }

    return Boolean(res.req?.secure);
}

function shouldUseSecureCookie(res: Response, sameSite: "lax" | "none"): boolean {
    if (sameSite === "none") {
        return true;
    }

    return config.server.isProduction || requestUsesHttps(res);
}

// Helper to set access token cookie (15 minutes)
export function setAccessTokenCookie(res: Response, accessToken: string) {
    const sameSite = getSameSite(res);
    const secure = shouldUseSecureCookie(res, sameSite);

    res.cookie(ACCESS_COOKIE_NAME, accessToken, {
        httpOnly: true,
        sameSite,
        secure,
        maxAge: authConfig.accessTokenMaxAgeMs,
        path: "/", // Available for all API routes
    });
}

export function setRefreshTokenCookie(res: Response, refreshToken: string) {
    const sameSite = getSameSite(res);
    const secure = shouldUseSecureCookie(res, sameSite);

    const pathsToClear = ["/", "/api/auth/refresh", "/api"];
    pathsToClear.forEach((path) => {
        res.clearCookie(REFRESH_COOKIE_NAME, {
            httpOnly: true,
            sameSite,
            secure,
            path,
        });
    });

    // Set new cookie with root path
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: config.auth.refreshCookieMaxAgeMs,
        path: "/",
    });
}

// Helper to clear access token cookie
export function clearAccessTokenCookie(res: Response) {
    const sameSite = getSameSite(res);
    const secure = shouldUseSecureCookie(res, sameSite);

    res.clearCookie(ACCESS_COOKIE_NAME, {
        httpOnly: true,
        sameSite,
        secure,
        path: "/",
    });
}

// Helper to clear refresh token cookie from all possible paths (old and new)
// This is necessary because cookies are path-specific, and the refresh token
// was previously set with different paths ("/api/auth/refresh", "/api")
export function clearRefreshTokenCookie(res: Response) {
    const sameSite = getSameSite(res);
    const secure = shouldUseSecureCookie(res, sameSite);

    // Clear from all possible paths to ensure complete cleanup
    const paths = ["/", "/api/auth/refresh", "/api"];

    paths.forEach((path) => {
        res.clearCookie(REFRESH_COOKIE_NAME, {
            httpOnly: true,
            sameSite,
            secure,
            path,
        });
    });
}

// Helper to clear all auth cookies (access and refresh tokens)
export function clearAllAuthCookies(res: Response) {
    clearAccessTokenCookie(res);
    clearRefreshTokenCookie(res);
}

