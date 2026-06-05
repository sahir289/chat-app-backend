import { Response } from "express";
import { Role } from "@prisma/client";
import { teamService } from "../services/teamService";
import { AppError } from "../utils/appError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { agentAccessService } from "../services/agentAccessService";
import prisma from "../lib/prisma";
import { successResponse } from "../utils/apiResponse";
export async function inviteAgentHandler(req: AuthenticatedRequest, res: Response) {
    const { name, email, role, moduleAccess, propertyIds, chatAccessScope } = req.body;
    if (!email) {
      throw new AppError(400, "email is required");
    }

    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError(403, "Forbidden: Company context required");
    }

    // Only AGENT role allowed for invites
    if (role && role !== Role.AGENT) {
      throw new AppError(400, "Only AGENT role can be invited");
    }

    const result = await teamService.inviteAgent(
      companyId,
      email,
      name,
      role,
      moduleAccess,
      propertyIds,
      chatAccessScope
    );

    return successResponse(res, {
      data: {
        email: result.email,
        inviteExpires: result.inviteExpires,
        shouldShowUpgrade: result.shouldShowUpgrade || false,
      },
      statusCode: 201,
    });
  }

export async function deactivateAgentHandler(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, "agent id is required");
    }

    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError(403, "Forbidden: Company context required");
    }

    await teamService.deactivateAgent(companyId, id);

    return successResponse(res, { statusCode: 200 });
  }

export async function getAgentAccessHandler(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, "agent id is required");
    }

    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError(403, "Forbidden: Company context required");
    }

    // Verify user exists and belongs to company
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, companyId: true },
    });

    if (!user || user.companyId !== companyId) {
      throw new AppError(404, "Agent not found");
    }

    if (user.role !== Role.AGENT) {
      throw new AppError(400, "User is not an agent");
    }

    const access = await agentAccessService.getAgentAccessSummary(id);

    return successResponse(res, { data: access, statusCode: 200 });
  }

export async function updateAgentAccessHandler(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { moduleAccess, propertyIds, chatAccessScope } = req.body;

    if (!id) {
      throw new AppError(400, "agent id is required");
    }

    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError(403, "Forbidden: Company context required");
    }

    // Verify user exists and belongs to company
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, companyId: true },
    });

    if (user?.companyId !== companyId) {
      throw new AppError(404, "Agent not found");
    }

    if (user.role !== Role.AGENT) {
      throw new AppError(400, "User is not an agent");
    }

    // Update module access if provided
    if (moduleAccess !== undefined) {
      await agentAccessService.setAgentModuleAccess(id, companyId, moduleAccess);
    }

    // Update property access if provided
    if (propertyIds !== undefined) {
      await agentAccessService.setAgentPropertyAccess(id, companyId, propertyIds);
    }

    if (chatAccessScope !== undefined) {
      await agentAccessService.setAgentChatAccessScope(id, companyId, chatAccessScope);
    }

    // Return updated access
    const access = await agentAccessService.getAgentAccessSummary(id);

    return successResponse(res, { data: access, statusCode: 200 });
  }

/**
 * Get current agent's own access information
 * Allows agents to view what access has been approved for them
 */
export async function getMyAccessHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;

    if (!userId) {
      throw new AppError(401, "Unauthorized: User ID missing");
    }

    if (!companyId) {
      throw new AppError(403, "Forbidden: Company context required");
    }

    // Verify user exists and is an agent
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, companyId: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (user.role !== Role.AGENT) {
      throw new AppError(403, "This endpoint is only available for agents");
    }

    if (user.companyId !== companyId) {
      throw new AppError(403, "User belongs to a different company");
    }

    const access = await agentAccessService.getAgentAccessSummary(userId);

    return successResponse(res, { data: access, statusCode: 200 });
  }
