import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";

function parseLocalYYYYMMDDStartOfDay(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function parseLocalYYYYMMDDNextDayStart(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year, month - 1, day + 1, 0, 0, 0, 0);
}

/**
 * Assumes query validation has already run (format/range checks).
 * Parses YYYY-MM-DD dates into local Date objects and stores them in `res.locals.dashboardDateRange`.
 *
 * - `startDate`: inclusive (start of day)
 * - `endDate`: exclusive (start of next day)
 */
export function parseDashboardDateRange(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const startDateStr = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDateStr = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

  const startDate = startDateStr ? parseLocalYYYYMMDDStartOfDay(startDateStr) : undefined;
  const endDate = endDateStr ? parseLocalYYYYMMDDNextDayStart(endDateStr) : undefined;

  res.locals.dashboardDateRange = { startDate, endDate };
  return next();
}

