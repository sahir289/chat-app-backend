import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./authMiddleware";
import { moduleAccessService, ModuleName } from "../services/moduleAccessService";
import { AppError } from "../utils/appError";
import { errorResponse } from "../utils/apiResponse";

export function requireModule(module: ModuleName) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new AppError(401, "Unauthorized"));
      }

      const access = await moduleAccessService.checkModuleAccess(userId, module);

      if (!access.allowed) {
        return errorResponse(res, {
          statusCode: 403,
          message: access.reason || "Module access denied",
          errors: {
            module,
            disabledByAdmin: access.disabledByAdmin || false,
          },
        });
      }

      next();
    } catch (err) {
      return next(err);
    }
  };
}

