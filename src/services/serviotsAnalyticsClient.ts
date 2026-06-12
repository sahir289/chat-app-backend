import { analyticsConfig } from "../config/analyticsConfig";
import type {
    ServiotsAnalyticsFetchResult,
    ServiotsAnalyticsRawBody,
} from "../types/websiteAnalytics";
import { AppError } from "../utils/appError";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("serviotsAnalytics");

function assertServerSideConfig(): void {
    if (!analyticsConfig.baseUrl) {
        throw new AppError(
            503,
            "Serviots analytics is not configured (SERVIOTS_ANALYTICS_BASE_URL)"
        );
    }
    if (!analyticsConfig.adminApiKey) {
        throw new AppError(
            503,
            "Serviots analytics is not configured (ANALYTICS_ADMIN_API_KEY)"
        );
    }
}

function buildAnalyticsUrl(path: string, query?: URLSearchParams): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${analyticsConfig.baseUrl}${normalizedPath}`);
    if (query) {
        for (const [key, value] of query.entries()) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}

async function parseAnalyticsResponse<T>(
    response: Response,
    context: string
): Promise<ServiotsAnalyticsFetchResult<T>> {
    const rawText = await response.text();
    let body: ServiotsAnalyticsRawBody | null = null;

    if (rawText) {
        try {
            body = JSON.parse(rawText) as ServiotsAnalyticsRawBody;
        } catch {
            log.warn("Non-JSON analytics response", { context, status: response.status });
        }
    }

    const upstreamMessage =
        typeof body?.message === "string" ? body.message : undefined;

    if (!response.ok) {
        const status = response.status >= 400 && response.status < 600 ? response.status : 502;
        throw new AppError(
            status,
            upstreamMessage || `Serviots analytics request failed (${context})`
        );
    }

    if (body && body.success === false) {
        throw new AppError(
            502,
            upstreamMessage || `Serviots analytics returned an error (${context})`
        );
    }

    return { data: (body ?? {}) as T, status: response.status };
}

/**
 * Server-only client for Serviots website analytics admin APIs.
 * Never import this module from frontend code.
 */
export async function fetchServiotsAnalytics<T>(
    path: string,
    query?: URLSearchParams
): Promise<ServiotsAnalyticsFetchResult<T>> {
    assertServerSideConfig();

    const url = buildAnalyticsUrl(path, query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), analyticsConfig.timeoutMs);

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${analyticsConfig.adminApiKey}`,
            },
            signal: controller.signal,
        });

        return await parseAnalyticsResponse<T>(response, path);
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
            throw new AppError(504, "Serviots analytics request timed out");
        }

        log.error("Serviots analytics fetch failed", {
            path,
            error: error instanceof Error ? error.message : String(error),
        });
        throw new AppError(502, "Failed to reach Serviots analytics service");
    } finally {
        clearTimeout(timeout);
    }
}

export function pickQueryParams(
    source: Record<string, unknown>,
    allowedKeys: readonly string[]
): URLSearchParams {
    const params = new URLSearchParams();
    for (const key of allowedKeys) {
        const value = source[key];
        if (typeof value === "string" && value.trim() !== "") {
            params.set(key, value);
        }
    }
    return params;
}
