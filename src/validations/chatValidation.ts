import { z } from "zod";
import { MESSAGE_LIMITS } from "../utils/messageValidation";

const sessionIdSchema = z
    .string()
    .min(1, "sessionId is required")
    .max(255)
    .regex(
        /^[a-zA-Z0-9_-]+$/,
        "sessionId must contain only alphanumeric characters, hyphens, and underscores"
    );

/**
 * POST /chat/start
 */
export const startChatSchema = z.object({
    body: z.object({
        widgetKey: z.string().min(1, "widgetKey is required").max(255),
        sessionId: sessionIdSchema,
        url: z.string().url().max(2048).optional().nullable(),
        referrer: z.string().url().max(2048).optional().nullable(),
        userAgent: z.string().max(500).optional().nullable(),
        device: z.string().max(100).optional().nullable(),
        browser: z.string().max(100).optional().nullable(),
        country: z.string().max(200).optional().nullable(),
    }),
});

/**
 * POST /chat/message — chatId mode or lazy creation (widgetKey + sessionId)
 */
export const postChatMessageSchema = z.object({
    body: z
        .object({
            chatId: z.string().min(1).max(255).optional(),
            widgetKey: z.string().min(1, "widgetKey is required").max(255),
            sessionId: sessionIdSchema,
            // No .trim(): widget uses a single space for attachment-only sends; trim() would fail min(1).
            // Length matches validateMessageLength in chatLifecycleService (raw character count).
            text: z
                .string()
                .min(1, "text is required")
                .max(
                    MESSAGE_LIMITS.VISITOR_MAX_LENGTH,
                    `Message text must not exceed ${MESSAGE_LIMITS.VISITOR_MAX_LENGTH} characters`
                ),
            section: z.string().max(255).optional().nullable(),
            /** When true with visitor + files, bot reply runs after attachment upload. */
            deferAiReply: z.boolean().optional(),
            clientMessageId: z.string().min(1).max(255).optional(),
            metadata: z.unknown().optional(),
            url: z.string().url().max(2048).optional().nullable(),
            referrer: z.string().url().max(2048).optional().nullable(),
            userAgent: z.string().max(500).optional().nullable(),
            device: z.string().max(100).optional().nullable(),
            browser: z.string().max(100).optional().nullable(),
            country: z.string().max(200).optional().nullable(),
        }),
});
