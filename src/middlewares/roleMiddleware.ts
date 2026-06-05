import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./authMiddleware";
import { AppError } from "../utils/appError";
import { Role } from "@prisma/client";

export function requireRole(...roles: Role[]) {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
        const user = req.user;
        if (!user) {
            return next(new AppError(401, "Unauthorized"));
        }

        if (user.role === Role.SUPER_ADMIN || user.isSuperAdmin) {
            return next();
        }

        if (!roles.includes(user.role)) {
            return next(new AppError(403, "Forbidden: Insufficient permissions"));
        }
        return next();
    };
}

export const adminOnly = requireRole(Role.ADMIN);

export const agentOrAdmin = requireRole(Role.ADMIN, Role.AGENT);

export const superAdminOnly = requireRole(Role.SUPER_ADMIN);

export const companyRecoveryPermission = superAdminOnly;

