import { z } from "zod";

const fullNameSchema = z
    .string()
    .trim()
    .min(2, "Full name is required")
    .max(100, "Full name is too long")
    // must contain at least 2 letters (supports all languages)
    .refine((val) => /[\p{L}]{2,}/u.test(val), "Please enter a valid full name")
    // allow letters, spaces, apostrophe, dot
    .refine(
        (val) => /^[\p{L}\p{M}. ']+$/u.test(val),
        "Name can contain letters, spaces, apostrophe ('), and dot (.) only"
    );

const emailSchema = z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(100, "Email is too long")
    .email("Invalid email format")
    .refine(
        (email) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email),
        "Invalid email address"
    )
    .transform((val) => val.toLowerCase());

const phoneSchema = z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .max(50, "Phone number is too long");

export const registerSchema = z.object({
    body: z.object({
        fullName: fullNameSchema,
        email: emailSchema,
        phone: phoneSchema,
        password: z.string().min(8, "Password must be at least 8 characters").max(100, "Password must be at most 100 characters"),
        companyName: z.string().trim().max(100, "Company name is too long").optional().or(z.literal("")),
        acceptedTerms: z.literal(true, {
            errorMap: () => ({ message: "You must accept the terms and conditions" }),
        }),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email: z.string().trim().email("Invalid email address").transform(v => v.toLowerCase()),
        password: z.string().min(1, "Password is required"),
    }),
});

// Refresh token can come from cookies or headers, so we validate it manually in the handler
export const refreshTokenSchema = z.object({
    body: z.object({}).optional(),
});

export const changePasswordSchema = z.object({
    body: z.object({
        oldPassword: z.string().min(1, "Old password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters").max(100, "Password must be at most 100 characters"),
    }).refine(
        (data) => data.newPassword !== data.oldPassword,
        {
            message: "New password cannot be the same as the current password",
            path: ["newPassword"],
        }
    ),
});

export const updateProfileSchema = z.object({
    body: z.object({
        name: fullNameSchema.optional().nullable(),
        avatarUrl: z
            .preprocess(
                (val) => {
                    if (val === null || val === undefined) return val;
                    if (typeof val === "string") {
                        const trimmed = val.trim();
                        return trimmed === "" ? null : trimmed;
                    }
                    return val;
                },
                z.union([z.string().url("Invalid URL"), z.null()]).optional().nullable()
            ),
    }),
});

export const validateInviteTokenSchema = z.object({
    query: z.object({
        token: z.string().min(1, "Token is required"),
    }),
});

export const completeInviteSchema = z.object({
    body: z.object({
        token: z.string().min(1, "Token is required"),
        newPassword: z.string().min(8, "Password must be at least 8 characters").max(100, "Password must be at most 100 characters"),
    }),
});

export const acceptInviteSchema = z.object({
    body: z.object({
        token: z.string().min(1, "Token is required"),
        password: z.string().min(8, "Password must be at least 8 characters").max(100, "Password must be at most 100 characters"),
    }),
});

export const inviteSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address"),
        name: z.string().min(1).max(100).optional(),
        role: z.enum(["AGENT"]).optional(),
    }),
});

export const verifyEmailSchema = z.object({
    query: z.object({
        token: z.string().min(1, "Token is required"),
    }),
});

export const resendVerificationEmailSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address"),
    }),
});

export const forgotPasswordSchema = z.object({
    body: z.object({
        email: emailSchema,
    }),
});

export const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1, "Token is required"),
        newPassword: z.string().min(8, "Password must be at least 8 characters").max(100, "Password must be at most 100 characters"),
    }),
});

// 2FA validation schemas
export const verifySetup2FASchema = z.object({
    body: z.object({
        token: z.string().min(6, "Token must be at least 6 characters").max(8, "Token must be at most 8 characters"),
    }),
});

export const verify2FASchema = z.object({
    body: z.object({
        challengeToken: z.string().min(1, "2FA challenge token is required"),
        token: z.string().min(6, "Token must be at least 6 characters").max(8, "Token must be at most 8 characters"),
    }),
});

export const disable2FASchema = z.object({
    body: z.object({
        password: z.string().min(1, "Password is required"),
    }),
});

export const generateBackupCodesSchema = z.object({
    body: z.object({
        password: z.string().min(1, "Password is required"),
    }),
});

export const updateSettingsSchema = z.object({
    body: z.object({
        notificationsEnabled: z.boolean().optional(),
        chatSound: z
            .union([z.enum(["PING", "CHIME", "POP"]), z.enum(["ping", "chime", "pop"])])
            .transform((val) => val.toUpperCase())
            .optional(),
        theme: z
            .union([z.enum(["LIGHT", "DARK", "SYSTEM"]), z.enum(["light", "dark", "system"])])
            .transform((val) => val.toUpperCase())
            .optional(),
        browserAlerts: z.boolean().optional(),
    }),
});

