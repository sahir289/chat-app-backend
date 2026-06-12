function parseTimeoutMs(value: string | undefined): number {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const analyticsConfig = {
    baseUrl: (process.env.SERVIOTS_ANALYTICS_BASE_URL || "").replace(/\/+$/, ""),
    adminApiKey: process.env.ANALYTICS_ADMIN_API_KEY || "",
    timeoutMs: parseTimeoutMs(process.env.SERVIOTS_ANALYTICS_TIMEOUT_MS),
    trackRateLimit: {
        windowMs: parsePositiveInt(process.env.WEBSITE_ANALYTICS_TRACK_RATE_WINDOW_MS, 60_000),
        maxPerIp: parsePositiveInt(process.env.WEBSITE_ANALYTICS_TRACK_RATE_MAX_PER_IP, 600),
        maxPerVisitorKey: parsePositiveInt(
            process.env.WEBSITE_ANALYTICS_TRACK_RATE_MAX_PER_VISITOR,
            120
        ),
    },
    retentionDays: parsePositiveInt(process.env.WEBSITE_ANALYTICS_RETENTION_DAYS, 0),
} as const;
