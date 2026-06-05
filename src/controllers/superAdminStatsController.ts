import type { Request, Response } from "express";
import { superAdminStatsService } from "../services/superAdminStatsService";
import { errorResponse, successResponse } from "../utils/apiResponse";

function parseLocalYYYYMMDDStartOfDay(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function parseLocalYYYYMMDDNextDayStart(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year, month - 1, day + 1, 0, 0, 0, 0);
}

export async function getPlatformStatsHandler(
  req: Request,
  res: Response
) {
  const startDateRaw = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDateRaw = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (startDateRaw && !dateRegex.test(startDateRaw)) {
    return errorResponse(res, { message: "Invalid startDate. Use YYYY-MM-DD", statusCode: 400 });
  }
  if (endDateRaw && !dateRegex.test(endDateRaw)) {
    return errorResponse(res, { message: "Invalid endDate. Use YYYY-MM-DD", statusCode: 400 });
  }

  const startDate = startDateRaw ? parseLocalYYYYMMDDStartOfDay(startDateRaw) : undefined;
  const endDate = endDateRaw ? parseLocalYYYYMMDDNextDayStart(endDateRaw) : undefined;

  if (startDate && Number.isNaN(startDate.getTime())) {
    return errorResponse(res, { message: "Invalid startDate", statusCode: 400 });
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    return errorResponse(res, { message: "Invalid endDate", statusCode: 400 });
  }
  if (startDate && endDate && startDate >= endDate) {
    return errorResponse(res, { message: "startDate cannot be after endDate", statusCode: 400 });
  }

  const stats = await superAdminStatsService.getPlatformStats({
    startDate,
    endDate,
  });
  return successResponse(res, { data: stats, statusCode: 200 });
}

