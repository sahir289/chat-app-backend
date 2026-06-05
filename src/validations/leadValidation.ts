import { z } from "zod";

const FULL_NAME_ERROR = "Enter a valid full name (2-50 characters).";
const EMAIL_ERROR = "Enter a valid email address.";
const PHONE_ERROR = "Please enter a valid phone number with country code.";

const widgetSessionIdSchema = z
  .string()
  .trim()
  .min(1, "sessionId is required")
  .max(255)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "sessionId must contain only alphanumeric characters, hyphens, and underscores"
  );

export const leadPayloadSchema = z.object({
  chatId: z.string().trim().min(1, "Chat id is required").max(255),
  widgetKey: z.string().trim().min(1, "widgetKey is required").max(255),
  sessionId: widgetSessionIdSchema,
  fullName: z
    .string()
    .trim()
    .min(2, FULL_NAME_ERROR)
    .max(50, FULL_NAME_ERROR)
    .regex(/^[A-Za-z. ]+$/, FULL_NAME_ERROR),
  email: z.string().trim().min(1, EMAIL_ERROR).max(100, EMAIL_ERROR).email(EMAIL_ERROR),
  phone: z
    .string()
    .trim()
    .min(1, PHONE_ERROR)
    .regex(/^\+[1-9]\d{9,14}$/, PHONE_ERROR),
});

export const createLeadSchema = z.object({
  body: leadPayloadSchema,
});

const manualLeadPayloadSchema = z.object({
  propertyId: z.string().trim().min(1, "Property is required").max(255),
  fullName: leadPayloadSchema.shape.fullName,
  email: leadPayloadSchema.shape.email,
  phone: z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      const s = String(val).trim();
      return s === "" ? undefined : s;
    },
    z.string().regex(/^\+[1-9]\d{9,14}$/, PHONE_ERROR).optional()
  ),
});

export const createManualLeadSchema = z.object({
  body: manualLeadPayloadSchema,
});
