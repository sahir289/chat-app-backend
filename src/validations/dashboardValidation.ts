import { z } from "zod";

const dateYYYYMMDD = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)");

const optionalDateYYYYMMDD = z
  .preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    return val;
  }, dateYYYYMMDD.optional())
  .optional();

export const dashboardChatsQuerySchema = z.object({
  query: z.object({
    propertyId: z.string().trim().min(1, "propertyId is required"),
  }),
});

export const dashboardOverviewQuerySchema = z
  .object({
    query: z.object({
      propertyId: z.string().trim().min(1, "propertyId is required"),
      startDate: optionalDateYYYYMMDD,
      endDate: optionalDateYYYYMMDD,
    }),
  })
  .superRefine((input, ctx) => {
    const startDateStr = input.query.startDate;
    const endDateStr = input.query.endDate;
    if (!startDateStr && !endDateStr) return;

    const toLocalStartOfDay = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    };

    const start = startDateStr ? toLocalStartOfDay(startDateStr) : undefined;
    const endExclusive = endDateStr
      ? (() => {
          const [y, m, d] = endDateStr.split("-").map(Number);
          return new Date(y, m - 1, d + 1, 0, 0, 0, 0);
        })()
      : undefined;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (start && start >= tomorrow) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query", "startDate"],
        message: "Start date cannot be in the future",
      });
    }

    if (endExclusive && endExclusive >= tomorrow) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query", "endDate"],
        message: "End date cannot be in the future",
      });
    }

    if (start && endExclusive && endExclusive < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query", "endDate"],
        message: "End date cannot be before start date",
      });
    }
  });
