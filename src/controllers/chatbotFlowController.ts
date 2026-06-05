import type { Response } from "express";
import { chatbotFlowService } from "../services/chatbotFlowService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { successResponse } from "../utils/apiResponse";

export async function createChatbotFlowHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists

    const { propertyId, name, description, flow, isActive } = req.body;

    // Business logic in service (validation handled by middleware)
    const chatbotFlow = await chatbotFlowService.createChatbotFlow({
        userId,
        companyId,
        propertyId,
        name,
        description,
        flow,
        isActive,
    });

    successResponse(res, { data: chatbotFlow, statusCode: 201 });
}

export async function getChatbotFlowsHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists

    const { propertyId } = req.params;
    const includeInactive = req.query.includeInactive === "true";

    // Business logic in service (validation handled by middleware)
    const flows = await chatbotFlowService.getChatbotFlowsByProperty(
        userId,
        companyId,
        propertyId,
        includeInactive
    );

    successResponse(res, { data: flows, statusCode: 200 });
  }

export async function updateChatbotFlowHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists

    const { id } = req.params;
    const { name, description, flow, isActive } = req.body;

    // Business logic in service (validation handled by middleware)
    const chatbotFlow = await chatbotFlowService.updateChatbotFlow({
        userId,
        companyId,
        flowId: id,
        name,
        description,
        flow,
        isActive,
    });

    successResponse(res, { data: chatbotFlow, statusCode: 200 });
  }

export async function deleteChatbotFlowHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    const userId = req.user!.id; // authMiddleware ensures req.user exists

    const { id } = req.params;

    // Business logic in service (validation handled by middleware)
    await chatbotFlowService.deleteChatbotFlow(userId, companyId, id);

    successResponse(res, { statusCode: 200 });
  }

