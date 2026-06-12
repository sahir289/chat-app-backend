import { z } from "zod";

const optionalQueryString = z
  .preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    return val;
  }, z.string().trim().min(1).optional())
  .optional();

export const analyticsOverviewQuerySchema = z.object({
  query: z.object({
    propertyId: z.string().trim().min(1, "propertyId is required"),
    startDate: optionalQueryString,
    endDate: optionalQueryString,
  }),
});

export const analyticsRecentVisitorsQuerySchema = z.object({
  query: z.object({
    limit: z
      .preprocess(
        (val) => {
          if (val === undefined || val === null || val === "") return undefined;
          const n = typeof val === "string" ? Number(val) : val;
          return Number.isFinite(n) ? n : val;
        },
        z
          .number({ invalid_type_error: "limit must be a number" })
          .int("limit must be an integer")
          .min(1, "limit must be at least 1")
          .max(500, "limit cannot exceed 500")
          .optional()
      )
      .optional(),
  }),
});
