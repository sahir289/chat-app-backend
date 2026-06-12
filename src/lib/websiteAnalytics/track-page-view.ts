import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";

import type { WebsiteAnalyticsSiteId } from "../../constants/websiteAnalyticsSites";
import prisma from "../prisma";
import { encryptIp } from "./encrypt-ip";
import { hashIp } from "./hash-ip";
import { maskIp } from "./mask-ip";
import { isBotUserAgent } from "./is-bot";
import { mergeBotFlag } from "./merge-bot-flag";
import { parseUserAgent } from "./parse-user-agent";

const DUPLICATE_PAGE_VIEW_WINDOW_MS = 5000;
const MAX_USER_AGENT_LENGTH = 512;

export type VisitorGeo = {
    country?: string | null;
    region?: string | null;
    city?: string | null;
    timezone?: string | null;
};

export type TrackPageViewInput = {
    siteId: WebsiteAnalyticsSiteId;
    visitorKey: string;
    sessionKey: string;
    path: string;
    title?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    userAgent?: string;
    ip?: string | null;
    geo?: VisitorGeo;
};

export type TrackPageViewResult = {
    visitorId: string;
    sessionId: string;
    pageViewId: string | null;
    isNewVisitor: boolean;
    duplicated: boolean;
};

export class SessionVisitorMismatchError extends Error {
    constructor() {
        super("Session key belongs to a different visitor");
        this.name = "SessionVisitorMismatchError";
    }
}

function normalizeUserAgent(userAgent?: string): string | null {
    if (!userAgent) {
        return null;
    }

    return userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}

type IpDerivedData = {
    ipHash: string;
    encryptedIp: string;
    maskedIp: string | null;
};

function resolveIpData(ip?: string | null): IpDerivedData | null {
    if (!ip) {
        return null;
    }

    return {
        ipHash: hashIp(ip),
        encryptedIp: encryptIp(ip),
        maskedIp: maskIp(ip),
    };
}

function geoUpdateData(geo?: VisitorGeo): Prisma.WebsiteAnalyticsVisitorUpdateInput {
    if (!geo) {
        return {};
    }

    return {
        ...(geo.country ? { country: geo.country } : {}),
        ...(geo.region ? { region: geo.region } : {}),
        ...(geo.city ? { city: geo.city } : {}),
        ...(geo.timezone ? { timezone: geo.timezone } : {}),
    };
}

function firstTouchAttributionUpdate(
    visitor: {
        referrer: string | null;
        utmSource: string | null;
        utmMedium: string | null;
        utmCampaign: string | null;
        utmTerm: string | null;
        utmContent: string | null;
        firstPage: string | null;
        landingPage: string | null;
    },
    input: TrackPageViewInput
): Prisma.WebsiteAnalyticsVisitorUpdateInput {
    const update: Prisma.WebsiteAnalyticsVisitorUpdateInput = {};

    if (input.referrer && !visitor.referrer) {
        update.referrer = input.referrer;
    }
    if (input.utmSource && !visitor.utmSource) {
        update.utmSource = input.utmSource;
    }
    if (input.utmMedium && !visitor.utmMedium) {
        update.utmMedium = input.utmMedium;
    }
    if (input.utmCampaign && !visitor.utmCampaign) {
        update.utmCampaign = input.utmCampaign;
    }
    if (input.utmTerm && !visitor.utmTerm) {
        update.utmTerm = input.utmTerm;
    }
    if (input.utmContent && !visitor.utmContent) {
        update.utmContent = input.utmContent;
    }
    if (input.path && !visitor.firstPage) {
        update.firstPage = input.path;
    }
    if (input.path && !visitor.landingPage) {
        update.landingPage = input.path;
    }

    return update;
}

async function upsertVisitorIpHistory(
    tx: Prisma.TransactionClient,
    visitorId: string,
    ipData: IpDerivedData,
    userAgent: string | null,
    geo: VisitorGeo | undefined,
    now: Date
) {
    await tx.websiteAnalyticsVisitorIpHistory.upsert({
        where: {
            visitorId_ipHash: {
                visitorId,
                ipHash: ipData.ipHash,
            },
        },
        create: {
            visitorId,
            ipHash: ipData.ipHash,
            encryptedIp: ipData.encryptedIp,
            maskedIp: ipData.maskedIp,
            userAgent,
            country: geo?.country ?? null,
            city: geo?.city ?? null,
            seenCount: 1,
            firstSeenAt: now,
            lastSeenAt: now,
        },
        update: {
            lastSeenAt: now,
            seenCount: { increment: 1 },
            encryptedIp: ipData.encryptedIp,
            maskedIp: ipData.maskedIp,
            ...(userAgent ? { userAgent } : {}),
            ...(geo?.country ? { country: geo.country } : {}),
            ...(geo?.city ? { city: geo.city } : {}),
        },
    });
}

async function runTrackTransaction(input: TrackPageViewInput): Promise<TrackPageViewResult> {
    const now = new Date();
    const ipData = resolveIpData(input.ip);
    const detectedBot = isBotUserAgent(input.userAgent);
    const userAgent = normalizeUserAgent(input.userAgent);
    const parsedUa = parseUserAgent(input.userAgent, detectedBot);
    const geo = input.geo;
    const duplicateCutoff = new Date(now.getTime() - DUPLICATE_PAGE_VIEW_WINDOW_MS);

    return prisma.$transaction(async (tx) => {
        const existingBeforeUpsert = await tx.websiteAnalyticsVisitor.findFirst({
            where: {
                visitorKey: input.visitorKey,
            },
        });
        const isNewVisitor = !existingBeforeUpsert;

        const visitor = existingBeforeUpsert
            ? await tx.websiteAnalyticsVisitor.update({
                  where: { id: existingBeforeUpsert.id },
                  data: {
                      lastSeenAt: now,
                      userAgent,
                      isBot: mergeBotFlag(existingBeforeUpsert.isBot, detectedBot),
                      deviceType: parsedUa.deviceType,
                      browser: parsedUa.browser,
                      os: parsedUa.os,
                      ...geoUpdateData(geo),
                      ...firstTouchAttributionUpdate(existingBeforeUpsert, input),
                  },
              })
            : await tx.websiteAnalyticsVisitor.create({
                  data: {
                      visitorKey: input.visitorKey,
                      firstPage: input.path,
                      landingPage: input.path,
                      referrer: input.referrer ?? null,
                      utmSource: input.utmSource ?? null,
                      utmMedium: input.utmMedium ?? null,
                      utmCampaign: input.utmCampaign ?? null,
                      utmTerm: input.utmTerm ?? null,
                      utmContent: input.utmContent ?? null,
                      userAgent,
                      isBot: detectedBot,
                      deviceType: parsedUa.deviceType,
                      browser: parsedUa.browser,
                      os: parsedUa.os,
                      country: geo?.country ?? null,
                      region: geo?.region ?? null,
                      city: geo?.city ?? null,
                      timezone: geo?.timezone ?? null,
                      visitCount: 0,
                      pageViewCount: 0,
                      firstSeenAt: now,
                      lastSeenAt: now,
                  },
              });

        const existingSession = await tx.websiteAnalyticsSession.findUnique({
            where: { sessionKey: input.sessionKey },
        });

        if (existingSession && existingSession.visitorId !== visitor.id) {
            throw new SessionVisitorMismatchError();
        }

        if (ipData) {
            await upsertVisitorIpHistory(tx, visitor.id, ipData, userAgent, geo, now);
        }

        const sessionIsBot = mergeBotFlag(existingSession?.isBot ?? false, detectedBot);

        const session = existingSession
            ? await tx.websiteAnalyticsSession.update({
                  where: { id: existingSession.id },
                  data: {
                      lastSeenAt: now,
                      isBot: sessionIsBot,
                      deviceType: parsedUa.deviceType,
                      userAgent,
                  },
              })
            : await (async () => {
                  await tx.websiteAnalyticsVisitor.update({
                      where: { id: visitor.id },
                      data: { visitCount: { increment: 1 } },
                  });

                  return tx.websiteAnalyticsSession.create({
                      data: {
                          sessionKey: input.sessionKey,
                          visitorId: visitor.id,
                          startedAt: now,
                          lastSeenAt: now,
                          isBot: detectedBot,
                          deviceType: parsedUa.deviceType,
                          userAgent,
                      },
                  });
              })();

        const recentDuplicate = await tx.websiteAnalyticsPageView.findFirst({
            where: {
                visitorId: visitor.id,
                sessionId: session.id,
                path: input.path,
                viewedAt: { gte: duplicateCutoff },
            },
            orderBy: { viewedAt: "desc" },
        });

        if (recentDuplicate) {
            return {
                visitorId: visitor.id,
                sessionId: session.id,
                pageViewId: recentDuplicate.id,
                isNewVisitor,
                duplicated: true,
            };
        }

        const pageView = await tx.websiteAnalyticsPageView.create({
            data: {
                visitorId: visitor.id,
                sessionId: session.id,
                path: input.path,
                title: input.title ?? null,
                referrer: input.referrer ?? null,
                userAgent,
                viewedAt: now,
            },
        });

        await tx.websiteAnalyticsVisitor.update({
            where: { id: visitor.id },
            data: { pageViewCount: { increment: 1 } },
        });

        return {
            visitorId: visitor.id,
            sessionId: session.id,
            pageViewId: pageView.id,
            isNewVisitor,
            duplicated: false,
        };
    });
}

export async function trackPageView(input: TrackPageViewInput): Promise<TrackPageViewResult> {
    try {
        return await runTrackTransaction(input);
    } catch (error) {
        if (
            error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return runTrackTransaction(input);
        }
        throw error;
    }
}
