import { z } from "zod";
import { validateBusinessEmail } from "../utils/businessEmailValidation";

const businessEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address")
  .superRefine((val, ctx) => {
    if (!val) return;

    const validation = validateBusinessEmail(val);

    if (!validation.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error || "Please enter a valid email address",
      });
    }
  });

export const updateCompanySchema = z.object({
    body: z.object({
        name: z.string().min(1, "Company name must be at least 1 character").max(255).optional(),
        email: businessEmailSchema.optional().nullable(),
        phone: z.string().max(50).optional().nullable(),
    }).refine(
        (data) =>
          data.name !== undefined ||
          data.email !== undefined ||
          data.phone !== undefined,
        {
          message: "At least one field (name, email, or phone) must be provided",
        }
      ),
});

export const createCompanySchema = z.object({
    body: z.object({
        name: z.string().min(1, "Company name is required").max(255),
        email: businessEmailSchema.optional().nullable(),
        phone: z.string().max(50).optional().nullable(),
        slug: z.string().min(1).max(100).optional().nullable(),
    }),
});

export const suspendCompanySchema = z.object({
    body: z.object({
        suspensionReason: z.string().min(1, "Suspension reason is required").max(500).optional(),
    }),
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
});

export const activateCompanySchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
});

export const getCompanyByIdSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
});

export const getCompanyLeadsSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
    query: z.object({
        limit: z
            .preprocess((val) => {
                if (val === undefined || val === null || val === "") return undefined;
                const n = typeof val === "string" ? Number(val) : val;
                return Number.isFinite(n) ? n : val;
            }, z.number().int().min(1).max(200).optional())
            .optional(),
    }).optional(),
});

export const toggleProStatusSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
    body: z.object({
        isPro: z.boolean({ required_error: "isPro is required" }),
        billingCycle: z.enum(["TRIAL", "TEST_1_MIN", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]).optional(),
    }),
});

export const updateCompanyOpenAiChatModelsSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
    body: z.object({
        modelIds: z.array(z.string().min(1).max(128)).max(64),
    }),
});

export const getCompanyAiCreditsSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
});

export const updateCompanyAiCreditsSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
    body: z.object({
        monthlyCredits: z.number().int().positive("Monthly credits must be greater than 0").optional(),
        tokensPerCredit: z.number().int().positive("Tokens per credit must be greater than 0").optional(),
        resetTopup: z.boolean().optional(),
    }).refine(
        (data) =>
            data.monthlyCredits !== undefined ||
            data.tokensPerCredit !== undefined ||
            data.resetTopup !== undefined,
        {
            message: "At least one AI credit field must be provided",
        }
    ),
});

export const createCompanyAiTopupSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Company ID is required"),
    }),
    body: z.object({
        creditsAdded: z.number().int().positive("Credits added must be greater than 0"),
        amount: z.number().min(0, "Amount must be 0 or greater"),
    }),
});

export const listCompaniesSchema = z.object({
    query: z.object({
        page: z
            .preprocess((val) => {
                if (val === undefined || val === null || val === "") return undefined;
                const n = typeof val === "string" ? Number(val) : val;
                return Number.isFinite(n) ? n : val;
            }, z.number().int().min(1).max(5000).optional())
            .optional(),
        limit: z
            .preprocess((val) => {
                if (val === undefined || val === null || val === "") return undefined;
                const n = typeof val === "string" ? Number(val) : val;
                return Number.isFinite(n) ? n : val;
            }, z.number().int().min(1).max(100).optional())
            .optional(),
        search: z.string().trim().max(200).optional(),
        status: z.enum(["all", "active", "suspended", "inactive", "archived"]).optional(),
        plan: z.enum(["all", "pro", "free"]).optional(),
    }),
});
