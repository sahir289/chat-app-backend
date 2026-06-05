import { NextFunction, Response } from "express";
import { AppError } from "../utils/appError";
import { AuthenticatedRequest } from "./authMiddleware";

export function getCompanyIdOrThrow(req: AuthenticatedRequest): string {
  const companyId = req.user?.companyId;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }
  return companyId;
}

export function requireCompany(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return next(new AppError(403, "Forbidden: Company context required"));
  }
  return next();
}
