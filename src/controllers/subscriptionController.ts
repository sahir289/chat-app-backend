import type { Response } from "express";
import { subscriptionService } from "../services/subscriptionService";
import { subscriptionRepository } from "../repositories/subscriptionRepository";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { errorResponse, successResponse } from "../utils/apiResponse";

export async function getSubscriptionHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
    }

    const subscription = await subscriptionService.getSubscriptionByCompanyId(companyId);
    return successResponse(res, { data: subscription, statusCode: 200 });
  }

export async function getSubscriptionByIdHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
    }

    const subscription = await subscriptionService.getSubscriptionById(id, companyId);
    return successResponse(res, { data: subscription, statusCode: 200 });
  }

export async function getInvoicesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
    }

    const { subscriptionId } = req.query;

    if (!subscriptionId || typeof subscriptionId !== "string") {
      return errorResponse(res, { message: "subscriptionId is required", statusCode: 400 });
    }

    // Verify subscription belongs to user's company
    const subscription = await subscriptionRepository.findById(subscriptionId, companyId);
    if (!subscription) {
      return errorResponse(res, { message: "Subscription not found", statusCode: 404 });
    }

    const invoices = await subscriptionRepository.listInvoices(subscriptionId, companyId);
    return successResponse(res, { data: invoices, statusCode: 200 });
  }

export async function getUsageRecordsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
    }

    const { id: subscriptionId } = req.params;

    if (!subscriptionId) {
      return errorResponse(res, { message: "Subscription ID is required", statusCode: 400 });
    }

    // Verify subscription belongs to user's company
    const subscription = await subscriptionRepository.findById(subscriptionId, companyId);
    if (!subscription) {
      return errorResponse(res, { message: "Subscription not found", statusCode: 404 });
    }

    const usageRecords = await subscriptionRepository.listUsageRecords(subscriptionId);
    return successResponse(res, { data: usageRecords, statusCode: 200 });
  }
