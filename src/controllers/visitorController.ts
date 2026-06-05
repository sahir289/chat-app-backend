import type { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";
import { visitorService } from "../services/visitorService";
import { successResponse } from "../utils/apiResponse";

export async function getVisitorBySessionHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sessionId } = req.params;
  const companyId = req.user?.companyId;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const visitorDetails = await visitorService.getVisitorBySession(
    sessionId,
    companyId,
    req.user?.id
  );

  return successResponse(res, {
    data: visitorDetails,
    statusCode: 200,
  });
}

export async function updateVisitorHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sessionId } = req.params;
  const companyId = req.user?.companyId;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const { device, browser, country, userAgent } = req.body ?? {};
  const updated = await visitorService.updateVisitor(
    sessionId,
    companyId,
    req.user?.id,
    {
      device,
      browser,
      country,
      userAgent,
    }
  );

  return successResponse(res, { data: updated, statusCode: 200 });
}

/**
 * List visitors with pagination and filtering
 * Supports filtering by propertyId through chats relationship
 */
export async function listVisitorsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const {
    propertyId,
    page = "1",
    limit = "50",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));

  const result = await visitorService.listVisitors({
    companyId,
    userId: userId || null,
    propertyId: (propertyId as string) || null,
    page: pageNum,
    limit: limitNum,
  });

  return successResponse(res, {
    statusCode: 200,
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
}
