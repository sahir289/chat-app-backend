import { z } from "zod";

// Title validation: 1-200 characters, required
const titleSchema = z
    .string({
        required_error: "Title is required",
        invalid_type_error: "Title must be a string",
    })
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must not exceed 200 characters");

// Content validation: 1-50000 characters (50KB), required for text sources
const contentSchema = z
    .string({
        required_error: "Content is required",
        invalid_type_error: "Content must be a string",
    })
    .trim()
    .min(1, "Content is required")
    .max(50000, "Content must not exceed 50,000 characters");

// URL validation: valid URL format, http/https only, max 500 characters
const urlSchema = z
    .string({
        required_error: "URL is required",
        invalid_type_error: "URL must be a string",
    })
    .trim()
    .min(1, "URL is required")
    .max(500, "URL must not exceed 500 characters")
    .url("Please enter a valid URL")
    .refine(
        (url) => {
            try {
                const parsed = new URL(url);
                return ["http:", "https:"].includes(parsed.protocol);
            } catch {
                return false;
            }
        },
        {
            message: "URL must use http or https protocol",
        }
    );

// Property ID validation
const propertyIdSchema = z
    .string({
        required_error: "Property ID is required",
        invalid_type_error: "Property ID must be a string",
    })
    .trim()
    .min(1, "Property ID is required")
    .max(255, "Property ID must not exceed 255 characters");

// Source type validation
const sourceTypeSchema = z.enum(["TEXT", "URL", "FILE"], {
    errorMap: () => ({ message: "Source type must be TEXT, URL, or FILE" }),
});

// Schema for creating text source
export const createTextSourceSchema = z.object({
    body: z.object({
        propertyId: propertyIdSchema,
        sourceType: z.literal("TEXT"),
        title: titleSchema,
        content: contentSchema,
    }),
});

// Schema for creating URL source
export const createUrlSourceSchema = z.object({
    body: z.object({
        propertyId: propertyIdSchema,
        sourceType: z.literal("URL"),
        title: titleSchema.optional(), // Title is optional for URL, will be auto-generated
        url: urlSchema,
    }),
});

// Schema for creating source (generic - handles both TEXT and URL)
export const createSourceSchema = z.object({
    body: z
        .object({
            propertyId: propertyIdSchema,
            sourceType: sourceTypeSchema,
            title: titleSchema.optional(),
            content: contentSchema.optional(),
            url: urlSchema.optional(),
        })
        .refine(
            (data) => {
                if (data.sourceType === "TEXT") {
                    return data.content !== undefined && data.content.trim().length > 0;
                }
                return true;
            },
            {
                message: "Content is required for TEXT source type",
                path: ["content"],
            }
        )
        .refine(
            (data) => {
                if (data.sourceType === "URL") {
                    return data.url !== undefined && data.url.trim().length > 0;
                }
                return true;
            },
            {
                message: "URL is required for URL source type",
                path: ["url"],
            }
        )
        .refine(
            (data) => {
                if (data.sourceType === "TEXT") {
                    return data.title !== undefined && data.title.trim().length > 0;
                }
                return true;
            },
            {
                message: "Title is required for TEXT source type",
                path: ["title"],
            }
        ),
});

// Note: PDF file validation is handled by multer middleware in uploadMiddleware
// Additional validation can be added in the handler if needed

