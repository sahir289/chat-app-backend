import type { Response } from "express";
import { chatService } from "../services/chatService";
import { dashboardService } from "../services/dashboardService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { successResponse } from "../utils/apiResponse";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";

export async function getDashboardOverviewHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);
  const propertyId = req.query.propertyId as string;
  
  const { startDate, endDate } = (res.locals.dashboardDateRange ?? {}) as {
    startDate?: Date;
    endDate?: Date;
  };

  const data = await dashboardService.getOverview(companyId, propertyId, startDate, endDate);
  return successResponse(res, { data, statusCode: 200 });
}

export async function getDashboardChatsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);
  const propertyId = req.query.propertyId as string;
  const data = await chatService.getDashboardChats(companyId, propertyId);
  return successResponse(res, { data, statusCode: 200 });
}
