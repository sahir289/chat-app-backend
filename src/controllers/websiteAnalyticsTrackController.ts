import type { Request, Response } from "express";

import { IpEncryptionConfigError } from "../lib/websiteAnalytics/encrypt-ip";
import { getClientIp } from "../lib/websiteAnalytics/get-client-ip";
import { IpHashConfigError } from "../lib/websiteAnalytics/hash-ip";
import { resolveVisitorGeoAsync } from "../lib/websiteAnalytics/resolve-visitor-geo";
import {
    SessionVisitorMismatchError,
    trackPageView,
} from "../lib/websiteAnalytics/track-page-view";
import { parseTrackPayload } from "../lib/websiteAnalytics/validate-track-payload";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("websiteAnalyticsTrack");

export async function postWebsiteAnalyticsTrackHandler(req: Request, res: Response) {
    try {
        const parsed = parseTrackPayload(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid payload",
                errors: parsed.error.flatten().fieldErrors,
            });
        }

        if (!process.env.IP_HASH_SALT) {
            log.error("IP_HASH_SALT is not configured");
            return res.status(500).json({
                success: false,
                message: "Analytics configuration error",
            });
        }

        if (!process.env.IP_ENCRYPTION_KEY) {
            log.error("IP_ENCRYPTION_KEY is not configured");
            return res.status(500).json({
                success: false,
                error: "IP_ENCRYPTION_CONFIG_ERROR",
                message: "IP encryption is not configured",
            });
        }

        const ip = getClientIp(req);
        const geo = await resolveVisitorGeoAsync(req, ip);
        const userAgent = req.headers["user-agent"] ?? undefined;

        const {
            siteId,
            visitorKey,
            sessionKey,
            path,
            title,
            referrer,
            utmSource,
            utmMedium,
            utmCampaign,
            utmTerm,
            utmContent,
        } = parsed.data;

        log.debug("Incoming track request", {
            siteId,
            visitorKey,
            sessionKey,
            path,
        });

        const result = await trackPageView({
            siteId,
            visitorKey,
            sessionKey,
            path,
            title,
            referrer,
            utmSource,
            utmMedium,
            utmCampaign,
            utmTerm,
            utmContent,
            userAgent,
            ip,
            geo,
        });

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        if (error instanceof SessionVisitorMismatchError) {
            return res.status(409).json({
                success: false,
                error: "SESSION_VISITOR_MISMATCH",
                message: "Session key belongs to a different visitor",
            });
        }

        if (error instanceof IpHashConfigError || error instanceof IpEncryptionConfigError) {
            log.error(error.message);
            return res.status(500).json({
                success: false,
                message: "Analytics configuration error",
            });
        }

        log.error("Failed to track page view", {
            error: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
            success: false,
            message: "Failed to track page view",
        });
    }
}
