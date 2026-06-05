import prisma from "../lib/prisma";
import { agentAccessService } from "../services/agentAccessService";
import { AppError } from "./appError";
import { AgentChatAccessScope, Role } from "@prisma/client";

/**
 * Get property filter for agent queries
 * Returns property IDs that the agent has access to, or null if no filter needed (admin/owner)
 */
export async function getAgentPropertyFilter(userId: string): Promise<{
    propertyIds: string[] | null;
    isFiltered: boolean;
}> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
    });

    if (!user) {
        return { propertyIds: null, isFiltered: false };
    }

    // Only apply property filtering for AGENT role
    if (user.role !== Role.AGENT) {
        return { propertyIds: null, isFiltered: false };
    }

    // Get agent's assigned properties
    const propertyIds = await agentAccessService.getAgentPropertyIds(userId);

    // Agents are always property-filtered; empty assignment means no access.
    return {
        propertyIds,
        isFiltered: true,
    };
}

/**
 * Check if agent has access to a specific property
 */
export async function checkAgentPropertyAccess(
    userId: string,
    propertyId: string
): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
    });

    if (!user) {
        return false;
    }

    // Only apply property filtering for AGENT role
    if (user.role !== Role.AGENT) {
        return true; // Admins/owners have access to all properties
    }

    return agentAccessService.checkAgentPropertyAccess(userId, propertyId);
}

/**
 * Enforces agent property assignment after tenant checks (e.g. chat.companyId === user.companyId).
 * Admins/owners pass through. Throws AppError 403 when an agent is not assigned to the property.
 */
export async function assertAgentCanAccessPropertyOrThrow(
    userId: string,
    propertyId: string
): Promise<void> {
    const allowed = await checkAgentPropertyAccess(userId, propertyId);
    if (!allowed) {
        throw new AppError(403, "Access denied to this property");
    }
}

export async function shouldRestrictAgentToAssignedChats(
    userId: string
): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });

    if (!user || user.role !== Role.AGENT) {
        return false;
    }

    const scope = await agentAccessService.getAgentChatAccessScope(userId);
    return scope === AgentChatAccessScope.ONLY_ASSIGNED_CHATS;
}

export async function assertAgentCanAccessChatOrThrow(
    userId: string,
    chat: {
        propertyId: string;
        agentId: string | null;
    }
): Promise<void> {
    await assertAgentCanAccessPropertyOrThrow(userId, chat.propertyId);

    const assignedOnly = await shouldRestrictAgentToAssignedChats(userId);
    if (assignedOnly && chat.agentId !== userId) {
        throw new AppError(403, "Access denied to this chat");
    }
}

