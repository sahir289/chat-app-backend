import type { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { assertTenantPropertyAndAgentAccess } from "../middlewares/propertyScopeMiddleware";
import { AppError } from "../utils/appError";
import { analyticsService } from "../services/analyticsService";
import { propertyRepository } from "../repositories/propertyRepository";
import { visitorRepository } from "../repositories/visitorRepository";
import { successResponse } from "../utils/apiResponse";
import { getAgentPropertyFilter } from "../utils/agentPropertyFilter";

export async function getAnalyticsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = req.user?.companyId;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const propertyId = req.query.propertyId as string | undefined;
  const userId = req.user?.id;
  const propertyFilter = userId ? await getAgentPropertyFilter(userId) : null;
  if (propertyFilter?.isFiltered && propertyFilter.propertyIds !== null) {
    if (propertyFilter.propertyIds.length === 0) {
      throw new AppError(403, "Access denied");
    }
    if (!propertyId) {
      throw new AppError(400, "propertyId is required for agents");
    }
    await assertTenantPropertyAndAgentAccess(companyId, userId, propertyId);
  } else if (propertyId) {
    await assertTenantPropertyAndAgentAccess(companyId, userId, propertyId);
  }

  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

  const data = await analyticsService.getAnalytics(companyId, propertyId, startDate, endDate);
  return successResponse(res, { data, statusCode: 200 });
}

export async function getAnalyticsOverviewHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = req.user?.companyId;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const propertyId = req.query.propertyId as string | undefined;
  const userId = req.user?.id;
  const propertyFilter = userId ? await getAgentPropertyFilter(userId) : null;
  if (propertyFilter?.isFiltered && propertyFilter.propertyIds !== null) {
    if (propertyFilter.propertyIds.length === 0) {
      throw new AppError(403, "Access denied");
    }
    if (!propertyId) {
      throw new AppError(400, "propertyId is required for agents");
    }
    await assertTenantPropertyAndAgentAccess(companyId, userId, propertyId);
  } else if (propertyId) {
    await assertTenantPropertyAndAgentAccess(companyId, userId, propertyId);
  }

  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

  const data = await analyticsService.getOverview(companyId, propertyId, startDate, endDate);
  return successResponse(res, { data, statusCode: 200 });
}


export async function getPropertiesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = req.user?.companyId;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  let properties = await propertyRepository.listAll(companyId);
  const userId = req.user?.id;
  if (userId) {
    const pf = await getAgentPropertyFilter(userId);
    if (pf.isFiltered && pf.propertyIds !== null) {
      if (pf.propertyIds.length === 0) {
        return successResponse(res, { data: [], statusCode: 200 });
      }
      const allowed = new Set(pf.propertyIds);
      properties = properties.filter((p) => allowed.has(p.id));
    }
  }

  // Get analytics for each property
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
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const limit = parseInt(req.query.limit as string) || 20;
  const propertyFilter = userId ? await getAgentPropertyFilter(userId) : null;

  if (propertyFilter?.isFiltered && propertyFilter.propertyIds !== null && propertyFilter.propertyIds.length === 0) {
    return successResponse(res, { data: [], statusCode: 200 });
  }

  const visitors = await visitorRepository.findRecentByCompany(
    companyId,
    limit,
    propertyFilter?.isFiltered ? propertyFilter.propertyIds ?? undefined : undefined
  );

  return successResponse(res, { data: visitors, statusCode: 200 });
}

// Legacy handlers (for backward compatibility)
export const getConversionRateHandler = getAnalyticsOverviewHandler;

