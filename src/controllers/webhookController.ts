import type { Response } from "express";
import { webhookService } from "../services/webhookService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { AppError } from "../utils/appError";
import { successResponse } from "../utils/apiResponse";

export async function createWebhookHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const companyId = getCompanyIdOrThrow(req);

    const { url, events, isActive } = req.body;

    if (!url || typeof url !== "string" || url.trim().length === 0) {
      throw new AppError(400, "url is required and must be a non-empty string");
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      throw new AppError(400, "events array is required and must contain at least one event");
    }

    // Validate event names - only allow alphanumeric, underscore, hyphen, and dot
    const validEventPattern = /^[a-zA-Z0-9_\-.]+$/;
    const invalidEvents = events.filter(
      (event) => typeof event !== "string" || !validEventPattern.test(event)
    );
    if (invalidEvents.length > 0) {
      throw new AppError(
        400,
        "Invalid event format. Events must contain only alphanumeric characters, underscores, hyphens, or dots"
      );
    }

    const webhook = await webhookService.createWebhook({
      companyId,
      url,
      events,
      isActive,
    });

    return successResponse(res, { data: webhook, statusCode: 201 });
  }

export async function listWebhooksHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const companyId = getCompanyIdOrThrow(req);

    const webhooks = await webhookService.listWebhooks(companyId);
    return successResponse(res, { data: webhooks, statusCode: 200 });
  }

export async function getWebhookByIdHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params;
    const companyId = getCompanyIdOrThrow(req);

    const webhook = await webhookService.getWebhookById(id, companyId);
    return successResponse(res, { data: webhook, statusCode: 200 });
  }

export async function updateWebhookHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params;
    const companyId = getCompanyIdOrThrow(req);

    const { url, events, isActive } = req.body;

    // Validate URL if provided
    if (url !== undefined) {
      if (typeof url !== "string" || url.trim().length === 0) {
        throw new AppError(400, "url must be a non-empty string");
      }
    }

    // Validate events if provided
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new AppError(400, "events must be a non-empty array");
      }

      // Validate event names
      const validEventPattern = /^[a-zA-Z0-9_\-.]+$/;
      const invalidEvents = events.filter(
        (event) => typeof event !== "string" || !validEventPattern.test(event)
      );
      if (invalidEvents.length > 0) {
        throw new AppError(
          400,
          "Invalid event format. Events must contain only alphanumeric characters, underscores, hyphens, or dots"
        );
      }
    }

    const webhook = await webhookService.updateWebhook(id, companyId, {
      url,
      events,
      isActive,
    });

    return successResponse(res, { data: webhook, statusCode: 200 });
  }

export async function deleteWebhookHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params;
    const companyId = getCompanyIdOrThrow(req);

    await webhookService.deleteWebhook(id, companyId);
    return successResponse(res, { statusCode: 200 });
  }

export async function getDeliveriesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { webhookId } = req.params;
    const companyId = getCompanyIdOrThrow(req);

    // Validate and sanitize limit parameter
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50;
    const deliveries = await webhookService.getDeliveries(webhookId, companyId, limit);
    return successResponse(res, { data: deliveries, statusCode: 200 });
  }

export async function getDeliveryByIdHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params;
    const companyId = getCompanyIdOrThrow(req);

    const delivery = await webhookService.getDeliveryById(id, companyId);
    return successResponse(res, { data: delivery, statusCode: 200 });
  }

export async function testWebhookHandler(
  req: AuthenticatedRequest,
  res: Response
) {
    const { id } = req.params;
    const { event, payload } = req.body;
    const companyId = getCompanyIdOrThrow(req);

    if (!event || typeof event !== "string") {
      throw new AppError(400, "event is required and must be a string");
    }

    // Verify webhook belongs to the company
    const webhook = await webhookService.getWebhookById(id, companyId);
    if (!webhook) {
      throw new AppError(404, "Webhook not found");
    }

    const result = await webhookService.triggerWebhook(
      id,
      event,
      payload || { test: true, timestamp: new Date().toISOString() }
    );

    return successResponse(res, { data: result, statusCode: 200 });
  }

