import { z } from "zod";
import { DEFAULT_MESSAGES_LIMIT, MAX_MESSAGES_LIMIT } from "../constants/messagePagination";

const optionalQueryString = z
  .preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    return val;
  }, z.string().trim().min(1).optional())
  .optional();

const pageSchema = z
  .preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return 1;
      const n = typeof val === "string" ? Number(val) : val;
      return Number.isFinite(n) ? n : val;
    },
    z
      .number({ invalid_type_error: "page must be a number" })
      .int("page must be an integer")
      .min(1, "page must be at least 1")
  )
  .optional();

const limitSchema = z
  .preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return 50;
      const n = typeof val === "string" ? Number(val) : val;
      return Number.isFinite(n) ? n : val;
    },
    z
      .number({ invalid_type_error: "limit must be a number" })
      .int("limit must be an integer")
      .min(1, "limit must be at least 1")
      .max(500, "limit cannot exceed 500")
  )
  .optional();

const chatStatusSchema = z.enum(["ACTIVE", "CLOSED", "ARCHIVED", "WAITING"]);

export const listChatsSchema = z.object({
  query: z.object({
    status: chatStatusSchema.optional(),
    agentId: optionalQueryString,
    propertyId: optionalQueryString,
    unassigned: z.enum(["true", "false"]).optional(),
    page: pageSchema,
    limit: limitSchema,
  }),
});

export const getInboxSchema = z.object({
  query: z.object({
    propertyId: optionalQueryString,
  }),
});

export const getChatSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "id is required"),
  }),
});

const messagesLimitSchema = z
  .preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return DEFAULT_MESSAGES_LIMIT;
      const n = typeof val === "string" ? Number(val) : val;
      return Number.isFinite(n) ? n : val;
    },
    z
      .number({ invalid_type_error: "limit must be a number" })
      .int("limit must be an integer")
      .min(1, "limit must be at least 1")
      .max(MAX_MESSAGES_LIMIT, `limit cannot exceed ${MAX_MESSAGES_LIMIT}`)
  )
  .optional();

export const getChatMessagesSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "id is required"),
  }),
  query: z.object({
    limit: messagesLimitSchema,
    cursor: optionalQueryString,
  }),
});

export const assignChatSchema = z.object({
  body: z.object({
    chatId: z.string().trim().min(1, "chatId is required"),
    agentId: optionalQueryString.nullable(),
  }),
});

export const listAssignableAgentsSchema = z.object({
  query: z.object({
    propertyId: z.string().trim().min(1, "propertyId is required"),
  }),
});

export const closeChatSchema = z.object({
  body: z.object({
    chatId: z.string().trim().min(1, "chatId is required"),
  }),
});

export const deleteChatSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "id is required"),
  }),
});
