import type { Request } from "express";
import type { AttachmentDTO } from "../../types/chat";
import { attachmentRepository } from "../../repositories/attachmentRepository";
import { getPresignedUrl } from "../../services/s3Service";
import { getLocationFromIP } from "../../utils/ipLocation";
import { getModuleLogger } from "../../utils/logger";
import { formatLocationString, extractClientIp } from "../../utils/requestMeta";
import { parseUserAgent } from "../../utils/userAgentParser";

const log = getModuleLogger("chatRequestHelpers");

export type BuiltVisitorInfo = {
    url?: string;
    referrer?: string;
    userAgent?: string;
    device?: string;
    browser?: string;
    country?: string;
    ipAddress?: string;
};

/**
 * Builds visitor info from request + body (widget chat flows).
 * Enrichment failures are swallowed; never throws.
 */
export async function buildVisitorInfo(
    req: Request,
    body: Record<string, unknown> | undefined
): Promise<BuiltVisitorInfo> {
    const {
        url,
        referrer,
        userAgent: bodyUserAgent,
        device,
        browser,
        country,
    } = body ?? {};

    const userAgent =
        (bodyUserAgent as string | undefined) ||
        (req.headers["user-agent"] as string | undefined);

    let ipAddress: string | null = extractClientIp(req);
    if (ipAddress) {
        ipAddress = ipAddress.trim();
    }

    let finalCountry: string | undefined = (country as string | undefined) || undefined;
    if (!finalCountry && ipAddress) {
        try {
            const location = await getLocationFromIP(ipAddress);
            const formatted = formatLocationString(location);
            if (formatted) {
                finalCountry = formatted;
            }
        } catch (error) {
            log.warn("Failed to get location from IP for visitor info", {
                error,
            });
        }
    }

    let finalDevice = (device as string | undefined) || undefined;
    let finalBrowser = (browser as string | undefined) || undefined;
    if ((!finalDevice || !finalBrowser) && userAgent) {
        const parsed = parseUserAgent(userAgent);
        finalDevice = finalDevice || parsed.device || undefined;
        finalBrowser = finalBrowser || parsed.browser || undefined;
    }

    return {
        url: (url as string | undefined) || undefined,
        referrer: (referrer as string | undefined) || undefined,
        userAgent: userAgent || undefined,
        device: finalDevice,
        browser: finalBrowser,
        country: finalCountry,
        ipAddress: ipAddress || undefined,
    };
}

export async function getMessageAttachmentsWithUrls(
    messageId: string,
    companyId: string | null | undefined
): Promise<AttachmentDTO[] | undefined> {
    let attachments: Awaited<
        ReturnType<typeof attachmentRepository.findByMessageId>
    >;
    try {
        attachments = await attachmentRepository.findByMessageId(messageId);
    } catch (error) {
        log.warn("Failed to fetch attachments for message", {
            messageId,
            error,
        });
        return undefined;
    }

    if (attachments.length === 0) {
        return undefined;
    }

    return Promise.all(
        attachments.map(async (att) => {
            let fileUrl: string | null = null;
            let thumbnailUrl: string | null = null;

            if (att.fileUrl && companyId) {
                try {
                    fileUrl = await getPresignedUrl(
                        att.fileUrl,
                        companyId,
                        3600
                    );
                } catch (error) {
                    log.warn("Presign failed for attachment fileUrl", {
                        attachmentId: att.id,
                        error,
                    });
                }
            }

            if (att.thumbnailUrl && companyId) {
                try {
                    thumbnailUrl = await getPresignedUrl(
                        att.thumbnailUrl,
                        companyId,
                        3600
                    );
                } catch (error) {
                    log.warn("Presign failed for attachment thumbnailUrl", {
                        attachmentId: att.id,
                        error,
                    });
                }
            }

            return {
                id: att.id,
                fileName: att.fileName,
                fileType: att.fileType,
                fileSize: att.fileSize,
                fileUrl,
                thumbnailUrl,
                createdAt: att.createdAt,
            } as AttachmentDTO;
        })
    );
}
