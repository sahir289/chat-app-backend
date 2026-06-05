import { z } from "zod";

const ratingValues = ["POOR", "FAIR", "GOOD", "VERY_GOOD", "EXCELLENT"] as const;

const ratingSchema = z.enum(ratingValues, {
  errorMap: () => ({
    message: "Invalid rating value. Must be one of: POOR, FAIR, GOOD, VERY_GOOD, EXCELLENT",
  }),
});

const commentSchema = z
  .preprocess(
    (val) => {
      if (val === undefined || val === null) return val;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return val;
    },
    z.string().max(1000, "Comment cannot exceed 1000 characters").nullable().optional()
  )
  .optional();

export const createRatingSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, "chatId is required"),
  }),
  body: z.object({
    rating: ratingSchema,
    comment: commentSchema,
  }),
});

export const getRatingSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, "chatId is required"),
  }),
});

export const deleteRatingSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, "chatId is required"),
  }),
});

export const listRatingsSchema = z.object({
  query: z.object({
    propertyId: z.string().trim().min(1, "propertyId is required").optional(),
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

export const averageRatingSchema = z.object({
  query: z.object({
    propertyId: z.string().trim().min(1, "propertyId is required").optional(),
  }),
});

export const createVisitorRatingSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, "chatId is required"),
  }),
  body: z.object({
    sessionId: z.string().trim().min(1, "sessionId is required"),
    rating: ratingSchema,
    comment: commentSchema,
  }),
});

export const getVisitorRatingSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, "chatId is required"),
  }),
  query: z.object({
    sessionId: z.string().trim().min(1, "sessionId is required"),
  }),
});
