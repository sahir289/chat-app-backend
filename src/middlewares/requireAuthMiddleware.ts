import { NextFunction, Response } from "express";
import { AuthenticatedRequest, authMiddleware, tenantMiddleware } from "./authMiddleware";
import { companySuspensionMiddleware } from "./companySuspensionMiddleware";

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  authMiddleware(req, res, (err) => {
    if (err) return next(err);
    tenantMiddleware(req, res, (err) => {
      if (err) return next(err);
      companySuspensionMiddleware(req, res, next);
    });
  });
}

