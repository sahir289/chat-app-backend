import { NextFunction, Response } from "express";
import { Role } from "@prisma/client";
import { AuthenticatedRequest } from "./authMiddleware";
import { AppError } from "../utils/appError";
import prisma from "../lib/prisma";

export async function companySuspensionMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;

    if (user?.role === Role.SUPER_ADMIN) {
      return next();
    }

    if (!user?.companyId) {
      return next();
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { isSuspended: true, suspensionReason: true },
    });

    if (!company) {
      return next(new AppError(404, "Company not found"));
    }

    if (company.isSuspended) {
      return next(
        new AppError(
          403,
          "Company account is suspended",
          {
            reason: company.suspensionReason || "Account suspended by administrator",
          }
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}

