/**
 * Normalizes analytics paths to pathname-only (no query/hash) for consistent aggregation.
 */
export function normalizeAnalyticsPath(rawPath: string): string {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        return "/";
    }

    try {
        const url = trimmed.startsWith("/")
            ? new URL(trimmed, "https://analytics.local")
            : new URL(trimmed);
        const pathname = url.pathname || "/";
        return pathname.length > 500 ? pathname.slice(0, 500) : pathname;
    } catch {
        const withoutQuery = trimmed.split(/[?#]/)[0] || "/";
        const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
        return withLeadingSlash.length > 500 ? withLeadingSlash.slice(0, 500) : withLeadingSlash;
    }
}
