import { WebsiteAnalyticsDeviceType } from "@prisma/client";

export type ParsedUserAgent = {
    deviceType: WebsiteAnalyticsDeviceType;
    browser: string;
    os: string;
};

const TABLET_PATTERN = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i;
const MOBILE_PATTERN =
    /mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i;

function detectBrowser(userAgent: string): string {
    if (/edg\//i.test(userAgent) || /edge\//i.test(userAgent)) {
        return "Edge";
    }

    if (/firefox\//i.test(userAgent)) {
        return "Firefox";
    }

    if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) {
        return "Chrome";
    }

    if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) {
        return "Safari";
    }

    return "Unknown";
}

function detectOs(userAgent: string): string {
    if (/windows nt/i.test(userAgent)) {
        return "Windows";
    }

    if (/mac os x/i.test(userAgent) && !/iphone|ipad|ipod/i.test(userAgent)) {
        return "macOS";
    }

    if (/android/i.test(userAgent)) {
        return "Android";
    }

    if (/iphone|ipad|ipod/i.test(userAgent)) {
        return "iOS";
    }

    if (/linux/i.test(userAgent)) {
        return "Linux";
    }

    return "Unknown";
}

function detectDeviceType(userAgent: string): WebsiteAnalyticsDeviceType {
    if (TABLET_PATTERN.test(userAgent)) {
        return WebsiteAnalyticsDeviceType.TABLET;
    }

    if (MOBILE_PATTERN.test(userAgent)) {
        return WebsiteAnalyticsDeviceType.MOBILE;
    }

    if (userAgent.length > 0) {
        return WebsiteAnalyticsDeviceType.DESKTOP;
    }

    return WebsiteAnalyticsDeviceType.UNKNOWN;
}

export function parseUserAgent(
    userAgent: string | null | undefined,
    isBot: boolean
): ParsedUserAgent {
    if (isBot) {
        return {
            deviceType: WebsiteAnalyticsDeviceType.BOT,
            browser: "Unknown",
            os: "Unknown",
        };
    }

    if (!userAgent) {
        return {
            deviceType: WebsiteAnalyticsDeviceType.UNKNOWN,
            browser: "Unknown",
            os: "Unknown",
        };
    }

    return {
        deviceType: detectDeviceType(userAgent),
        browser: detectBrowser(userAgent),
        os: detectOs(userAgent),
    };
}
