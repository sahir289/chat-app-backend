import type { Response } from "express";
import { moduleControlService } from "../services/moduleControlService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";
import type { ModuleName } from "../services/moduleAccessService";
import { successResponse } from "../utils/apiResponse";

export async function enableModuleHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { companyId, module } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const flag = await moduleControlService.enableModule(
      companyId,
      module as ModuleName,
      userId,
      reason
    );

    return successResponse(res, { data: flag, statusCode: 200 });
  }

export async function disableModuleHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { companyId, module } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const flag = await moduleControlService.disableModule(
      companyId,
      module as ModuleName,
      userId,
      reason
    );

    return successResponse(res, { data: flag, statusCode: 200 });
  }

export async function getCompanyModulesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { companyId } = req.params;
    const modules = await moduleControlService.getCompanyModules(companyId);
    return successResponse(res, { data: modules, statusCode: 200 });
  }

export async function setMultipleModulesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { companyId } = req.params;
    const { modules, reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    if (!Array.isArray(modules)) {
      throw new AppError(400, "modules must be an array");
    }

    const results = await moduleControlService.setMultipleModules(
      companyId,
      modules,
      userId,
      reason
    );

    return successResponse(res, { data: results, statusCode: 200 });
  }

export async function enableAllModulesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { companyId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const results = await moduleControlService.enableAllModules(
      companyId,
      userId,
      reason
    );

    return successResponse(res, { data: results, statusCode: 200 });
  }

export async function disableAllModulesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { companyId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const results = await moduleControlService.disableAllModules(
      companyId,
      userId,
      reason
    );

    return successResponse(res, { data: results, statusCode: 200 });
  }

