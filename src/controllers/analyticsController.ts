import type { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { analyticsService } from "../services/analyticsService";
import { propertyRepository } from "../repositories/propertyRepository";
import { visitorRepository } from "../repositories/visitorRepository";
import { successResponse } from "../utils/apiResponse";
import { getAgentPropertyScope } from "../utils/agentPropertyFilter";

export async function getAnalyticsHandler(
  req: AuthenticatedRequest,
  res: Response

) {

  const companyId = getCompanyIdOrThrow(req);
  const propertyId = req.query.propertyId as string;

  const { startDate, endDate } = (res.locals.analyticsDateRange ?? {}) as {
    startDate?: Date;
    endDate?: Date;

  };

  const data = await analyticsService.getAnalytics(companyId, propertyId, startDate, endDate);
  return successResponse(res, { data, statusCode: 200 });
}

export async function getAnalyticsOverviewHandler(
  req: AuthenticatedRequest,
  res: Response
) {

  const companyId = getCompanyIdOrThrow(req);
  const propertyId = req.query.propertyId as string;

  const { startDate, endDate } = (res.locals.analyticsDateRange ?? {}) as {
    startDate?: Date;
    endDate?: Date;
  };

  const data = await analyticsService.getOverview(companyId, propertyId, startDate, endDate);
  return successResponse(res, { data, statusCode: 200 });

}

export async function getPropertiesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);
  const propertyScope = await getAgentPropertyScope(req.user?.id);

  if (propertyScope.filtered && propertyScope.propertyIds.length === 0) {
    return successResponse(res, { data: [], statusCode: 200 });
  }
  let properties = await propertyRepository.listAll(companyId);
  if (propertyScope.filtered) {
    const allowed = new Set(propertyScope.propertyIds);
    properties = properties.filter((p) => allowed.has(p.id));
  }

  const propertiesWithStats = await Promise.all(
    properties.map(async (property) => {
      const stats = await analyticsService.getOverview(companyId, property.id);
      return {
        id: property.id,
        name: property.name,
        domain: property.domain,
        widgetKey: property.widgetKey,
        stats,
      };
    })
  );
  return successResponse(res, { data: propertiesWithStats, statusCode: 200 });
}

export async function getRecentVisitorsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);
  const propertyScope = await getAgentPropertyScope(req.user?.id);
  if (propertyScope.filtered && propertyScope.propertyIds.length === 0) {
    return successResponse(res, { data: [], statusCode: 200 });
  }
  const limit =
    typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) || 20 : 20;

  const visitors = await visitorRepository.findRecentByCompany(
    companyId,
    limit,
    propertyScope.filtered ? propertyScope.propertyIds : undefined
  );
  return successResponse(res, { data: visitors, statusCode: 200 });
}



