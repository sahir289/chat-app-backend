import type { Response } from "express";
import { featureAccessService, type FeatureName } from "../services/featureAccessService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { errorResponse, successResponse } from "../utils/apiResponse";

export async function getFeatureAccessHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const userId = req.user?.id;
    if (!userId) {
      return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
    }

    const access = await featureAccessService.getUserFeatureAccess(userId);
    const status = await featureAccessService.getSubscriptionStatus(userId);

    return successResponse(res, {
      data: {
        features: access,
        subscription: status,
      },
      statusCode: 200,
    });
  }

export async function checkFeatureHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { feature } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
    }

    const access = await featureAccessService.checkFeatureAccess(
      userId,
      feature as FeatureName
    );

    return successResponse(res, { data: access, statusCode: 200 });
  }
