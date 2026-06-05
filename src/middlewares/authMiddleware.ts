import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { verifyAccessToken } from "../utils/token";
import { AppError } from "../utils/appError";
import { userRepository } from "../repositories/userRepository";
import { companyRepository } from "../repositories/companyRepository";
import { TokenPayload } from "../types/authTypes";

export type AuthUser = {
    id: string;
    companyId: string | null | undefined;
    role: Role;
    isOwner: boolean;
    isSuperAdmin?: boolean;
};

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
    companyId?: string | null;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    // Try cookie first (secure), fallback to header for backward compatibility
    let token: string | undefined;

    // Check cookie first (preferred method)
    token = req.cookies?.accessToken;

    // Fallback to Authorization header (for backward compatibility during migration)
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        return next(new AppError(401, "Authorization token missing"));
    }

    try {
        const payload = verifyAccessToken<TokenPayload>(token);
        const userId = payload.userId;
        if (!userId) {
            return next(new AppError(401, "Invalid or expired token"));
        }
        const dbUser = await userRepository.findById(userId);

        if (!dbUser || !dbUser.isActive || dbUser.deletedAt !== null) {
            return next(new AppError(401, "Invalid or expired token"));
        }

        // Check if email verification token has expired for unverified users
        if (!dbUser.emailVerified) {
            if (dbUser.emailVerificationExpires && dbUser.emailVerificationExpires < new Date()) {
                return next(new AppError(401, "Your email verification session has expired. Please verify your email or request a new verification link.", {
                    code: "EMAIL_VERIFICATION_EXPIRED",
                }));
            }
        }

        const isSuperAdmin = dbUser.role === Role.SUPER_ADMIN || dbUser.isSuperAdmin === true;
        const tokenCompanyId = payload.companyId ?? null;
        const userCompanyId = dbUser.companyId ?? null;

        // Reject stale/mismatched claims to prevent cross-tenant data access.
        if (!isSuperAdmin && tokenCompanyId !== userCompanyId) {
            return next(new AppError(401, "Session invalid. Please log in again."));
        }

        if (isSuperAdmin && tokenCompanyId !== null) {
            return next(new AppError(401, "Session invalid. Please log in again."));
        }

        if (payload.role && payload.role !== dbUser.role) {
            return next(new AppError(401, "Session invalid. Please log in again."));
        }

        if (typeof payload.isOwner === "boolean" && payload.isOwner !== Boolean(dbUser.isOwner)) {
            return next(new AppError(401, "Session invalid. Please log in again."));
        }

        if (!isSuperAdmin && !dbUser.companyId) {
            return next(new AppError(403, "Forbidden: Company ID missing"));
        }

        if (!isSuperAdmin && dbUser.companyId) {
            const company = await companyRepository.findById(dbUser.companyId);
            if (!company || company.deletedAt || !company.isActive || company.isSuspended) {
                return next(new AppError(401, "Session invalid. Please log in again."));
            }
        }

        req.user = {
            id: dbUser.id,
            companyId: dbUser.companyId ?? null,
            role: dbUser.role,
            isOwner: Boolean(dbUser.isOwner),
            isSuperAdmin,
        };

        // Prevent cross-user cache bleed for authenticated API responses.
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Vary", "Authorization, Cookie");

        return next();
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(401, "Invalid or expired token"));
    }
}

export function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    authMiddleware(req, res, () => next());
}

export function tenantMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const user = req.user;

    if (user?.role === Role.SUPER_ADMIN) {
        req.companyId = null;
        return next();
    }

    if (!user?.companyId) {
        return next(new AppError(403, "Forbidden: Company ID missing from token"));
    }

    req.companyId = user.companyId;
    return next();
}
