import type { Request } from "express";
import { getRequestMetadata, type RequestMetadata } from "../../utils/requestMeta";
import { parseUserAgent } from "../../utils/userAgentParser";

export interface WidgetVisitorContextInput {
    bodyUserAgent?: string | null;
    bodyDevice?: string | null;
    bodyBrowser?: string | null;
    bodyCountry?: string | null;
}

export interface WidgetVisitorContext {
    requestMeta: RequestMetadata;
    userAgent: string | null;
    device: string | null;
    browser: string | null;
}

export interface ChatVisitorInfoInput {
    url?: string | null;
    referrer?: string | null;
    context: WidgetVisitorContext;
}

export interface ChatVisitorInfoPayload {
    url?: string;
    referrer?: string;
    userAgent?: string;
    device?: string;
    browser?: string;
    country?: string;
    ipAddress?: string;
}

export function resolveWidgetUserAgent(req: Request, bodyUserAgent?: string | null): string | null {
    return bodyUserAgent || (req.headers["user-agent"] as string | undefined) || null;
}

export function resolveWidgetDeviceAndBrowser(
    userAgent: string | null,
    bodyDevice?: string | null,
    bodyBrowser?: string | null
): { device: string | null; browser: string | null } {
    let device = bodyDevice || null;
    let browser = bodyBrowser || null;

    if ((!device || !browser) && userAgent) {
        const parsed = parseUserAgent(userAgent);
        device = device || parsed.device || null;
        browser = browser || parsed.browser || null;
    }

    return { device, browser };
}

export async function resolveWidgetVisitorContext(
    req: Request,
    input: WidgetVisitorContextInput
): Promise<WidgetVisitorContext> {
    const requestMeta = await getRequestMetadata(req, input.bodyCountry);
    const userAgent = resolveWidgetUserAgent(req, input.bodyUserAgent);
    const { device, browser } = resolveWidgetDeviceAndBrowser(
        userAgent,
        input.bodyDevice,
        input.bodyBrowser
    );

    return {
        requestMeta,
        userAgent,
        device,
        browser,
    };
}

export function buildChatVisitorInfo(input: ChatVisitorInfoInput): ChatVisitorInfoPayload {
    const { url, referrer, context } = input;

    return {
        url: url || undefined,
        referrer: referrer || undefined,
        userAgent: context.userAgent || undefined,
        device: context.device || undefined,
        browser: context.browser || undefined,
        country: context.requestMeta.country || undefined,
        ipAddress: context.requestMeta.ipAddress || undefined,
    };
}
