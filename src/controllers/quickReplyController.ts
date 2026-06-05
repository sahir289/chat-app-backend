import type { Request, Response } from "express";
import { quickReplyService } from "../services/quickReplyService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { successResponse } from "../utils/apiResponse";

export async function createQuickReplyHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    const userRole = req.user!.role;

    const { propertyId, label, message, order, isActive } = req.body;

    // Business logic in service (validation is handled by route middleware)
    const quickReply = await quickReplyService.createQuickReply({
        userId,
        companyId,
        propertyId,
        label,
        message,
        order,
        isActive,
        userRole,
    });

    successResponse(res, { data: quickReply, statusCode: 201 });
}

export async function getQuickRepliesHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    const userRole = req.user!.role;

    const { propertyId } = req.params;
    const includeInactive = req.query.includeInactive === "true";

    // Business logic in service (validation is handled by route middleware)
    const quickReplies = await quickReplyService.getQuickRepliesByProperty(
        userId,
        companyId,
        propertyId,
        includeInactive,
        userRole
    );

    successResponse(res, { data: quickReplies, statusCode: 200 });
}

export async function updateQuickReplyHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    const userRole = req.user!.role;

    const { id } = req.params;
    const { label, message, order, isActive } = req.body;

    // Business logic in service (validation is handled by route middleware)
    const quickReply = await quickReplyService.updateQuickReply({
        userId,
        companyId,
        quickReplyId: id,
        label,
        message,
        order,
        isActive,
        userRole,
    });

    successResponse(res, { data: quickReply, statusCode: 200 });
}

export async function deleteQuickReplyHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    const userRole = req.user!.role;

    const { id } = req.params;

    // Business logic in service (validation is handled by route middleware)
    await quickReplyService.deleteQuickReply(userId, companyId, id, userRole);

    successResponse(res, { statusCode: 200 });
}

// Public endpoint for widget (no auth required)
export async function getPublicQuickRepliesHandler(
    req: Request,
    res: Response
): Promise<void> {
    const { propertyId } = req.query;

    // Get only active quick replies, ordered by order ASC
    // Validation is handled by route middleware (propertyId is validated by Zod)
    const quickReplies = await quickReplyService.getPublicQuickRepliesByProperty(propertyId as string);

    // Return simplified format: id, label, message
    successResponse(res, {
        data: quickReplies.map((qr) => ({
            id: qr.id,
            label: qr.label,
            message: qr.message,
        })),
        statusCode: 200,
    });
}

