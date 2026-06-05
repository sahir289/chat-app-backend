import { z } from "zod";

export const uploadAttachmentSchema = z.object({
  body: z.object({
    messageId: z
      .string({
        required_error: "messageId is required",
        invalid_type_error: "messageId must be a string",
      })
      .trim()
      .min(1, "messageId is required"),
  }),
});

export const uploadAttachmentVisitorSchema = z.object({
  body: z.object({
    messageId: z
      .string({
        required_error: "messageId is required",
        invalid_type_error: "messageId must be a string",
      })
      .trim()
      .min(1, "messageId is required"),
    chatId: z
      .string({
        required_error: "chatId is required",
        invalid_type_error: "chatId must be a string",
      })
      .trim()
      .min(1, "chatId is required"),
    sessionId: z
      .string()
      .trim()
      .min(1, "sessionId is required"),
  }),
});

export const getAttachmentByIdSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "Attachment id is required",
        invalid_type_error: "Attachment id must be a string",
      })
      .trim()
      .min(1, "Attachment id is required"),
  }),
});

export const getAttachmentSignedUrlSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "Attachment id is required",
        invalid_type_error: "Attachment id must be a string",
      })
      .trim()
      .min(1, "Attachment id is required"),
  }),
  query: z.object({
    expiresIn: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? undefined : parsed;
      })
      .pipe(
        z
          .number()
          .int("expiresIn must be an integer")
          .min(60, "expiresIn must be at least 60 seconds")
          .max(86400, "expiresIn must not exceed 86400 seconds (24 hours)")
          .optional()
      ),
  }),
});

export const getAttachmentsByMessageSchema = z.object({
  params: z.object({
    messageId: z
      .string({
        required_error: "messageId is required",
        invalid_type_error: "messageId must be a string",
      })
      .trim()
      .min(1, "messageId is required"),
  }),
});

export const getAttachmentsByChatSchema = z.object({
  params: z.object({
    chatId: z
      .string({
        required_error: "chatId is required",
        invalid_type_error: "chatId must be a string",
      })
      .trim()
      .min(1, "chatId is required"),
  }),
});

export const deleteAttachmentSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "Attachment id is required",
        invalid_type_error: "Attachment id must be a string",
      })
      .trim()
      .min(1, "Attachment id is required"),
  }),
});

