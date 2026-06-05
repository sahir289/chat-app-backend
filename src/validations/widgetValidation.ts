import { z } from "zod";

/**
 * Widget event types that can be tracked
 */
export const WIDGET_EVENT_TYPES = [
  "PAGE_VIEW",
  "WIDGET_OPEN",
  "WIDGET_CLOSE",
  "MESSAGE",
] as const;

export type WidgetEventType = (typeof WIDGET_EVENT_TYPES)[number];

// Type assertion for Zod enum (needs mutable tuple)
const WIDGET_EVENT_TYPES_TUPLE: [string, ...string[]] = [
  "PAGE_VIEW",
  "WIDGET_OPEN",
  "WIDGET_CLOSE",
  "MESSAGE",
];

/**
 * Validates widgetKey query parameter
 */
export const widgetKeyQuerySchema = z.object({
  query: z.object({
    widgetKey: z.string().min(1, "widgetKey is required").max(255),
  }),
});

/**
 * Validates widget event POST request
 */
export const widgetEventSchema = z.object({
  body: z.object({
    widgetKey: z.string().min(1, "widgetKey is required").max(255),
    sessionId: z
      .string()
      .min(1, "sessionId is required")
      .max(255)
      .regex(/^[a-zA-Z0-9_-]+$/, "sessionId must contain only alphanumeric characters, hyphens, and underscores"),
    eventType: z.enum(WIDGET_EVENT_TYPES_TUPLE, {
      message: `eventType must be one of: ${WIDGET_EVENT_TYPES.join(", ")}`,
    }),
    url: z.string().url().max(2048).optional().nullable(),
    referrer: z.string().url().max(2048).optional().nullable(),
    userAgent: z.string().max(500).optional().nullable(),
    device: z.string().max(100).optional().nullable(),
    browser: z.string().max(100).optional().nullable(),
    country: z.string().max(200).optional().nullable(),
  }),
});

/**
 * Validates widget start POST request
 */
export const widgetStartSchema = z.object({
  body: z.object({
    widgetKey: z.string().min(1, "widgetKey is required").max(255),
    sessionId: z
      .string()
      .min(1, "sessionId is required")
      .max(255)
      .regex(/^[a-zA-Z0-9_-]+$/, "sessionId must contain only alphanumeric characters, hyphens, and underscores"),
    url: z.string().url().max(2048).optional().nullable(),
    referrer: z.string().url().max(2048).optional().nullable(),
    userAgent: z.string().max(500).optional().nullable(),
    device: z.string().max(100).optional().nullable(),
    browser: z.string().max(100).optional().nullable(),
    country: z.string().max(200).optional().nullable(),
  }),
});

/**
 * Validates widget message POST request
 * Supports two modes:
 * 1. chatId mode (backward compatible): chatId must be provided
 * 2. lazy creation mode: widgetKey + sessionId must be provided
 */
export const widgetMessageSchema = z.object({
  body: z
    .object({
      chatId: z.string().min(1).max(255).optional(),
      widgetKey: z.string().min(1).max(255).optional(),
      sessionId: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[a-zA-Z0-9_-]+$/, "sessionId must contain only alphanumeric characters, hyphens, and underscores")
        .optional(),
      text: z
        .string()
        .min(1, "text is required")
        .max(250, "Message text must not exceed 250 characters")
        .trim(),
      section: z.string().max(255).optional().nullable(),
      // Optional visitor info for lazy chat creation
      url: z.string().url().max(2048).optional().nullable(),
      referrer: z.string().url().max(2048).optional().nullable(),
      userAgent: z.string().max(500).optional().nullable(),
      device: z.string().max(100).optional().nullable(),
      browser: z.string().max(100).optional().nullable(),
      country: z.string().max(200).optional().nullable(),
    })
    .refine(
      (data) => {
        // Existing chats also require sessionId so a visitor proves session ownership.
        return (
          (data.chatId !== undefined && data.sessionId !== undefined) ||
          (data.widgetKey !== undefined && data.sessionId !== undefined)
        );
      },
      {
        message: "Either (chatId + sessionId) or (widgetKey + sessionId) must be provided",
      }
    ),
});

/**
 * Validates widget close intent POST request
 */
export const widgetCloseIntentSchema = z.object({
  params: z.object({
    chatId: z.string().min(1, "chatId is required").max(255),
  }),
  body: z.object({
    sessionId: z
      .string()
      .min(1, "sessionId is required")
      .max(255)
      .regex(/^[a-zA-Z0-9_-]+$/, "sessionId must contain only alphanumeric characters, hyphens, and underscores"),
    intent: z.enum(["resolved", "end_conversation", "inactivity"], {
      message: "intent must be one of: resolved, end_conversation, inactivity",
    }),
  }),
});

const sessionIdQuery = z
  .string()
  .min(1, "sessionId is required")
  .max(255)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "sessionId must contain only alphanumeric characters, hyphens, and underscores"
  );

/** GET /widget/chats?widgetKey&sessionId */
export const widgetChatsSessionQuerySchema = z.object({
  query: z.object({
    widgetKey: z.string().min(1, "widgetKey is required").max(255),
    sessionId: sessionIdQuery,
  }),
});

/** GET /widget/chats/:chatId/messages?widgetKey&sessionId */
export const widgetChatMessagesQuerySchema = z.object({
  params: z.object({
    chatId: z.string().min(1, "chatId is required").max(255),
  }),
  query: z.object({
    widgetKey: z.string().min(1, "widgetKey is required").max(255),
    sessionId: sessionIdQuery,
  }),
});

