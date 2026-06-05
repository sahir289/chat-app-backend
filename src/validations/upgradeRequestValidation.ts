import { z } from "zod";

export const createUpgradeRequestSchema = z.object({
    body: z.object({
        name: z
            .string({
                required_error: "Name is required",
                invalid_type_error: "Name must be a string",
            })
            .trim()
            .min(2, "Name must be at least 2 characters")
            .max(100, "Name must not exceed 100 characters")
            // must contain at least 2 letters (supports all languages)
            .refine((val) => /[\p{L}]{2,}/u.test(val), "Please enter a valid name with at least 2 letters")
            // allow letters, numbers, spaces, apostrophe, dot
            .refine(
                (val) => /^[\p{L}\p{M}\p{N}. ']+$/u.test(val),
                "Name can contain letters, numbers, spaces, apostrophe ('), and dot (.) only."
            ),
        companyName: z
            .string({
                required_error: "Company name is required",
                invalid_type_error: "Company name must be a string",
            })
            .trim()
            .min(1, "Company name is required")
            .max(100, "Company name must not exceed 100 characters")
            .refine(
                (val) => !/^\d+$/.test(val),
                "Company name cannot contain only numbers. Please enter a valid company name."
            ),
        email: z
            .string({
                required_error: "Email is required",
                invalid_type_error: "Email must be a string",
            })
            .trim()
            .min(1, "Email is required")
            .max(100, "Email must not exceed 100 characters")
            .email("Please enter a valid email address")
            .transform((val) => val.toLowerCase()),
        phone: z
            .string()
            .trim()
            .optional()
            .nullable()
            .refine((val) => {
                if (!val) return true;

                const digits = val.replace(/\D/g, "");

                if (!/^\d+$/.test(digits)) return false;

                return digits.length >= 7 && digits.length <= 15;
            }, {
                message: "Please enter a valid phone number.",
            }),
        message: z
            .string()
            .trim()
            .max(250, "Message must not exceed 250 characters")
            .optional()
            .nullable(),
    }),
});

