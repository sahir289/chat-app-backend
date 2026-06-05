import type { Response } from "express";
import { moduleAccessService, type ModuleName } from "../services/moduleAccessService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { errorResponse, successResponse } from "../utils/apiResponse";

export async function getModuleAccessHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const userId = req.user?.id;
    if (!userId) {
      return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
    }

    const details = await moduleAccessService.getModuleAccessDetails(userId);
    return successResponse(res, { data: details, statusCode: 200 });
  }

export async function checkModuleHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { module } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
    }

    const access = await moduleAccessService.checkModuleAccess(userId, module as ModuleName);
    return successResponse(res, { data: access, statusCode: 200 });
  }
