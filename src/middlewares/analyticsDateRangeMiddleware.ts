import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";

/**
 * Parses optional ISO/date query strings into Date objects for analytics handlers.
 * Assumes query validation has already run.
 */
export function parseAnalyticsDateRange(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const startDateStr = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDateStr = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

  res.locals.analyticsDateRange = {
    startDate: startDateStr ? new Date(startDateStr) : undefined,
    endDate: endDateStr ? new Date(endDateStr) : undefined,
  };
  return next();
}
