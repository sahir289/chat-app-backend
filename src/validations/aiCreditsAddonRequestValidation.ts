import { z } from "zod";

export const createAiCreditsAddonRequestSchema = z.object({
    body: z.object({
        message: z.string().max(2000).optional().nullable(),
        requestedCredits: z
            .number()
            .int()
            .min(1)
            .max(10_000_000)
            .optional()
            .nullable(),
    }),
});

export const updateAiCreditsAddonRequestStatusSchema = z.object({
    body: z.object({
        status: z.enum(["FULFILLED", "REJECTED"]),
        notes: z.string().max(2000).optional().nullable(),
    }),
});
