import type { Prisma } from "@prisma/client";

export const visitorSafeSelect = {
    id: true,
    visitorKey: true,
    country: true,
    region: true,
    city: true,
    timezone: true,
    deviceType: true,
    browser: true,
    os: true,
    userAgent: true,
    firstPage: true,
    landingPage: true,
    referrer: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
    utmTerm: true,
    utmContent: true,
    visitCount: true,
    pageViewCount: true,
    isBot: true,
    firstSeenAt: true,
    lastSeenAt: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.WebsiteAnalyticsVisitorSelect;

export const sessionSafeSelect = {
    id: true,
    sessionKey: true,
    visitorId: true,
    startedAt: true,
    lastSeenAt: true,
    isBot: true,
    deviceType: true,
    userAgent: true,
} satisfies Prisma.WebsiteAnalyticsSessionSelect;

export const pageViewSafeSelect = {
    id: true,
    visitorId: true,
    sessionId: true,
    path: true,
    title: true,
    referrer: true,
    userAgent: true,
    viewedAt: true,
} satisfies Prisma.WebsiteAnalyticsPageViewSelect;

export const visitorIpHistorySafeSelect = {
    id: true,
    visitorId: true,
    maskedIp: true,
    encryptedIp: true,
    userAgent: true,
    country: true,
    city: true,
    seenCount: true,
    firstSeenAt: true,
    lastSeenAt: true,
} satisfies Prisma.WebsiteAnalyticsVisitorIpHistorySelect;

export type SafeVisitor = Prisma.WebsiteAnalyticsVisitorGetPayload<{
    select: typeof visitorSafeSelect;
}>;

export type SafeSession = Prisma.WebsiteAnalyticsSessionGetPayload<{
    select: typeof sessionSafeSelect;
}>;

export type SafePageView = Prisma.WebsiteAnalyticsPageViewGetPayload<{
    select: typeof pageViewSafeSelect;
}>;

export type SafeVisitorIpHistoryRaw = Prisma.WebsiteAnalyticsVisitorIpHistoryGetPayload<{
    select: typeof visitorIpHistorySafeSelect;
}>;

export type SafeVisitorIpHistory = Omit<SafeVisitorIpHistoryRaw, "encryptedIp"> & {
    hasEncryptedIp: boolean;
};

export function sanitizeIpHistoryRow(row: SafeVisitorIpHistoryRaw): SafeVisitorIpHistory {
    const { encryptedIp, ...rest } = row;

    return {
        ...rest,
        hasEncryptedIp: Boolean(encryptedIp),
    };
}
