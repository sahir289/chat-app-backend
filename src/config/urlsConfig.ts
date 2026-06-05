/** Public web app origin (no trailing slash). Any one of these env vars is enough (aliases for local/simple setups). */
function getAppUrl(): string {
    const url =
        process.env.APP_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        process.env.FRONTEND_URL ||
        "";
    return url.replace(/\/+$/, "");
}

/** Widget embed page URL (where the chat iframe is served). Defaults to APP_URL/embed unless WIDGET_EMBED_URL is set. */
function getWidgetEmbedUrl(): string {
    const env = process.env.WIDGET_EMBED_URL;
    if (env) return env.replace(/\/+$/, "");
    const app = getAppUrl();
    return app ? `${app}/embed` : "";
}

export const urlsConfig = {
    appUrl: getAppUrl(),
    inviteBaseUrl: (process.env.INVITE_BASE_URL || "").replace(/\/+$/, "") || getAppUrl(),
    frontendUrl: getAppUrl(),
    widgetEmbedUrl: getWidgetEmbedUrl(),
    backendPublicUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "",
    widgetBackendUrl: process.env.WIDGET_BACKEND_URL || "",
} as const;
