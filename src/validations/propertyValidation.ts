import { z } from "zod";

const WEBSITE_NAME_REGEX = /^[A-Za-z0-9 .,_&()\-]+$/;
const DOMAIN_REGEX =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const WEBSITE_NAME_REQUIRED_MESSAGE = "Website name is required";
const WEBSITE_NAME_MIN_MESSAGE = "Website name must be at least 2 characters";
const WEBSITE_NAME_MAX_MESSAGE = "Website name must not exceed 60 characters";
const WEBSITE_NAME_INVALID_MESSAGE = "Website name contains invalid characters";
const DOMAIN_INVALID_MESSAGE = "Enter a valid domain (example.com)";
const DOMAIN_MAX_MESSAGE = "Domain must not exceed 253 characters";

function validateWebsiteName(value: string): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return WEBSITE_NAME_REQUIRED_MESSAGE;
  }

  if (trimmedValue.length < 2) {
    return WEBSITE_NAME_MIN_MESSAGE;
  }

  if (trimmedValue.length > 60) {
    return WEBSITE_NAME_MAX_MESSAGE;
  }

  if (!WEBSITE_NAME_REGEX.test(trimmedValue)) {
    return WEBSITE_NAME_INVALID_MESSAGE;
  }

  return null;
}

function validateDomain(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value.length > 253) {
    return DOMAIN_MAX_MESSAGE;
  }

  if (/\s/.test(value) || !value.includes(".") || value.includes("..")) {
    return DOMAIN_INVALID_MESSAGE;
  }

  if (!DOMAIN_REGEX.test(value)) {
    return DOMAIN_INVALID_MESSAGE;
  }

  return null;
}

const websiteNameSchema = z
  .string({
    required_error: WEBSITE_NAME_REQUIRED_MESSAGE,
    invalid_type_error: WEBSITE_NAME_REQUIRED_MESSAGE,
  })
  .superRefine((value, ctx) => {
    const errorMessage = validateWebsiteName(value);
    if (errorMessage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage,
      });
    }
  });

const domainSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .superRefine((value, ctx) => {
    const errorMessage = validateDomain(value);
    if (errorMessage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage,
      });
    }
  });

export const createPropertySchema = z.object({
  body: z.object({
    name: websiteNameSchema,
    domain: domainSchema.optional(),
  }),
});

export const updatePropertySchema = z.object({
  params: z.object({
    id: z.string().min(1, "id is required"),
  }),
  body: z
    .object({
      name: websiteNameSchema.optional(),
      domain: domainSchema.optional(),
    })
    .refine((data) => data.name !== undefined || data.domain !== undefined, {
      message: "At least one field is required",
    }),
});

export const propertyIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "id is required"),
  }),
});

export const widgetKeyParamSchema = z.object({
  params: z.object({
    widgetKey: z.string().min(1, "widgetKey is required"),
  }),
});

const timeSchema = z
  .union([z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm"), z.null()])
  .optional();

export const updateBusinessHoursSchema = z.object({
  params: z.object({
    id: z.string().min(1, "id is required"),
  }),
  body: z.object({
    enabled: z.boolean(),
    timezone: z.string().min(1, "Timezone is required").max(80, "Timezone is too long"),
    mondayEnabled: z.boolean(),
    mondayStart: timeSchema,
    mondayEnd: timeSchema,
    tuesdayEnabled: z.boolean(),
    tuesdayStart: timeSchema,
    tuesdayEnd: timeSchema,
    wednesdayEnabled: z.boolean(),
    wednesdayStart: timeSchema,
    wednesdayEnd: timeSchema,
    thursdayEnabled: z.boolean(),
    thursdayStart: timeSchema,
    thursdayEnd: timeSchema,
    fridayEnabled: z.boolean(),
    fridayStart: timeSchema,
    fridayEnd: timeSchema,
    saturdayEnabled: z.boolean(),
    saturdayStart: timeSchema,
    saturdayEnd: timeSchema,
    sundayEnabled: z.boolean(),
    sundayStart: timeSchema,
    sundayEnd: timeSchema,
    holidays: z.unknown().optional(),
  }),
});
