export const WEBSITE_ANALYTICS_SITES = {
    serviots: {
        id: "serviots",
        label: "Serviots Website",
        description: "Serviots marketing site traffic and engagement",
    },
    mitraVarta: {
        id: "mitra-varta",
        label: "Mitra Varta Website",
        description: "Mitra Varta marketing site traffic and engagement",
    },
} as const;

export type WebsiteAnalyticsSiteId =
    (typeof WEBSITE_ANALYTICS_SITES)[keyof typeof WEBSITE_ANALYTICS_SITES]["id"];

export const WEBSITE_ANALYTICS_SITE_IDS: WebsiteAnalyticsSiteId[] = [
    WEBSITE_ANALYTICS_SITES.serviots.id,
    WEBSITE_ANALYTICS_SITES.mitraVarta.id,
];

export const WEBSITE_ANALYTICS_DEFAULT_SITE: WebsiteAnalyticsSiteId =
    WEBSITE_ANALYTICS_SITES.serviots.id;

export function parseWebsiteAnalyticsSite(value: unknown): WebsiteAnalyticsSiteId {
    if (value === WEBSITE_ANALYTICS_SITES.mitraVarta.id) {
        return WEBSITE_ANALYTICS_SITES.mitraVarta.id;
    }
    return WEBSITE_ANALYTICS_DEFAULT_SITE;
}

export function isLocalWebsiteAnalyticsSite(site: WebsiteAnalyticsSiteId): boolean {
    return site === WEBSITE_ANALYTICS_SITES.mitraVarta.id;
}
