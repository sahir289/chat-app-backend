import type { Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { propertyRepository } from "../repositories/propertyRepository";
import { checkAgentPropertyAccess } from "../utils/agentPropertyFilter";
import type { AuthenticatedRequest } from "./authMiddleware";

/**
 * Ensures a property exists under the tenant and the current user (if an agent)
 * is allowed to act on it. Admins/owners pass through via checkAgentPropertyAccess.
 */
export async function assertTenantPropertyAndAgentAccess(
  companyId: string,
  userId: string | undefined,
  propertyId: string
): Promise<void> {
  const property = await propertyRepository.findById(propertyId, companyId);
  if (!property) {
    throw new AppError(403, "Property not found or access denied");
  }
  if (userId) {
    const allowed = await checkAgentPropertyAccess(userId, propertyId);
    if (!allowed) {
      throw new AppError(403, "Access denied to this property");
    }
  }
}

/**
 * Factory: Express middleware that reads `propertyId` from `req.params[paramName]`
 * (default `propertyId`) and runs tenant + agent checks. Requires auth + tenantMiddleware before.
 */
export function requirePropertyScope(paramName: string = "propertyId") {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return next(new AppError(403, "Forbidden: Company context required"));
      }
      const raw = req.params[paramName];
      const propertyId = typeof raw === "string" ? raw.trim() : "";
      if (!propertyId) {
        return next(new AppError(400, "propertyId is required"));
      }
      await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/**
 * Factory: Express middleware that reads `propertyId` from `req.query[queryKey]`
 * (default `propertyId`) and runs tenant + agent checks. Requires auth + tenantMiddleware before.
 */
export function requirePropertyScopeQuery(queryKey: string = "propertyId") {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return next(new AppError(403, "Forbidden: Company context required"));
      }
      const raw = req.query?.[queryKey];
      const propertyId = typeof raw === "string" ? raw.trim() : "";
      if (!propertyId) {
        return next(new AppError(400, "propertyId is required"));
      }
      await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);
      return next();
    } catch (e) {
      return next(e);
    }
  };
}
