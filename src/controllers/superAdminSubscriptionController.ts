import type { Request, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";
import { superAdminSubscriptionService } from "../services/superAdminSubscriptionService";
import type { PlanTier, SubscriptionStatus } from "@prisma/client";
import { successResponse } from "../utils/apiResponse";

/**
 * Get all companies with their Pro status
 */
export async function getAllSubscriptionsHandler(
  req: Request,
  res: Response
) {
    const companies = await superAdminSubscriptionService.getAllSubscriptions();
    return successResponse(res, { data: companies, statusCode: 200 });
  }

/**
 * Get company subscription details (company profile, not the subscription row)
 */
export async function getSubscriptionDetailsHandler(
  req: Request,
  res: Response
) {
    const { id } = req.params; // companyId
    const company = await superAdminSubscriptionService.getSubscriptionDetails(id);
    return successResponse(res, { data: company, statusCode: 200 });
  }

/**
 * Subscription row for a company (FREE | PRO only)
 */
export async function getSubscriptionByCompanyHandler(
  req: Request,
  res: Response
) {
    const { companyId } = req.params;
    const data = await superAdminSubscriptionService.getSubscriptionForCompany(companyId);
    return successResponse(res, { data, statusCode: 200 });
  }

/**
 * Enable Pro access for a company
 */
export async function enableProAccessHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params; // companyId
    const userId = req.user?.id;
    const { reason } = req.body;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const company = await superAdminSubscriptionService.enableProAccess(id, userId, reason);
    return successResponse(res, { data: company, statusCode: 200 });
  }

/**
 * Disable Pro access for a company
 */
export async function disableProAccessHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params; // companyId
    const userId = req.user?.id;
    const { reason } = req.body;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const company = await superAdminSubscriptionService.disableProAccess(id, userId, reason);
    return successResponse(res, { data: company, statusCode: 200 });
  }

/**
 * Change subscription plan tier
 */
export async function changePlanHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params; // subscriptionId
    const userId = req.user?.id;
    const { planTier, reason } = req.body;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    if (!planTier || !["FREE", "PRO"].includes(planTier)) {
      throw new AppError(400, "Invalid planTier. Must be FREE or PRO");
    }

    const updated = await superAdminSubscriptionService.changePlan(
      id,
      planTier as PlanTier,
      userId,
      reason
    );

    return successResponse(res, { data: updated, statusCode: 200 });
  }

/**
 * Change subscription status
 */
export async function changeStatusHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params; // subscriptionId
    const userId = req.user?.id;
    const { status, reason } = req.body;

    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    if (!status || !["ACTIVE", "SUSPENDED", "CANCELED", "PAST_DUE", "TRIALING", "EXPIRED"].includes(status)) {
      throw new AppError(400, "Invalid status");
    }

    const updated = await superAdminSubscriptionService.changeStatus(
      id,
      status as SubscriptionStatus,
      userId,
      reason
    );

    return successResponse(res, { data: updated, statusCode: 200 });
  }
