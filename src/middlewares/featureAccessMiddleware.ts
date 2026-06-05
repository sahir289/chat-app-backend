import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./authMiddleware";
import { featureAccessService, FeatureName } from "../services/featureAccessService";
import { AppError } from "../utils/appError";
import { errorResponse } from "../utils/apiResponse";

export function requireFeature(feature: FeatureName) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new AppError(401, "Unauthorized"));
      }

      const access = await featureAccessService.checkFeatureAccess(userId, feature);

      if (!access.allowed) {
        return errorResponse(res, {
          statusCode: 403,
          message: access.reason || "Feature access denied",
          errors: {
            feature,
          },
        });
      }

      next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireActiveSubscription() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new AppError(401, "Unauthorized"));
      }

      const status = await featureAccessService.getSubscriptionStatus(userId);

      if (!status.canAccessPaidFeatures && !req.user?.isSuperAdmin) {
        return errorResponse(res, {
          statusCode: 403,
          message: `Subscription is ${status.status || "not found"}. Active subscription required.`,
          errors: {
            subscriptionStatus: status.status,
          },
        });
      }

      next();
    } catch (err) {
      return next(err);
    }
  };
}

