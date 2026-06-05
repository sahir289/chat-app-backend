import prisma from "../lib/prisma";
import { AppError } from "../utils/appError";
import { AgentChatAccessScope, Role } from "@prisma/client";

export type AgentModuleName =
  | "leads"
  | "analytics"
  | "properties"
  | "knowledge_base"
  | "visitors"
  | "company"
  | "billing"
  | "settings";

export interface AgentModuleAccessInput {
  leadsAccess?: boolean;
  analyticsAccess?: boolean;
  propertiesAccess?: boolean;
  knowledgeBaseAccess?: boolean;
  visitorsAccess?: boolean;
  companyAccess?: boolean;
  billingAccess?: boolean;
  settingsAccess?: boolean;
}

export type AgentChatAccessScopeInput =
  | AgentChatAccessScope
  | "ALL_CHATS"
  | "ONLY_ASSIGNED_CHATS";

const DEFAULT_CHAT_ACCESS_SCOPE = AgentChatAccessScope.ALL_CHATS;

function normalizeChatAccessScope(
  scope?: AgentChatAccessScopeInput | null
): AgentChatAccessScope {
  if (!scope || scope === AgentChatAccessScope.ALL_CHATS) {
    return AgentChatAccessScope.ALL_CHATS;
  }

  if (scope === AgentChatAccessScope.ONLY_ASSIGNED_CHATS) {
    return AgentChatAccessScope.ONLY_ASSIGNED_CHATS;
  }

  throw new AppError(400, "Invalid chat access scope");
}

async function assertAgentAccessUser(
  userId: string,
  companyId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, companyId: true },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (user.role !== Role.AGENT) {
    throw new AppError(400, "Only agents can have access configured");
  }

  if (user.companyId !== companyId) {
    throw new AppError(403, "User belongs to a different company");
  }
}

export const agentAccessService = {
  /**
   * Get agent module access
   */
  async getAgentModuleAccess(userId: string): Promise<AgentModuleAccessInput | null> {
    const access = await prisma.agentModuleAccess.findUnique({
      where: { userId },
    });

    if (!access) {
      return null;
    }

    return {
      leadsAccess: access.leadsAccess,
      analyticsAccess: access.analyticsAccess,
      propertiesAccess: access.propertiesAccess,
      knowledgeBaseAccess: access.knowledgeBaseAccess,
      visitorsAccess: access.visitorsAccess,
      companyAccess: access.companyAccess,
      billingAccess: access.billingAccess,
      settingsAccess: access.settingsAccess,
    };
  },

  /**
   * Set agent module access
   */
  async setAgentModuleAccess(
    userId: string,
    companyId: string,
    access: AgentModuleAccessInput
  ): Promise<void> {
    await assertAgentAccessUser(userId, companyId);

    // Allow agent access control for all companies (PRO and FREE)
    // Admin can grant access to agents regardless of subscription tier

    // Upsert module access
    await prisma.agentModuleAccess.upsert({
      where: { userId },
      create: {
        userId,
        leadsAccess: access.leadsAccess ?? false,
        analyticsAccess: access.analyticsAccess ?? false,
        propertiesAccess: access.propertiesAccess ?? false,
        knowledgeBaseAccess: access.knowledgeBaseAccess ?? false,
        visitorsAccess: access.visitorsAccess ?? false,
        companyAccess: access.companyAccess ?? false,
        billingAccess: access.billingAccess ?? false,
        settingsAccess: access.settingsAccess ?? false,
      },
      update: {
        leadsAccess: access.leadsAccess,
        analyticsAccess: access.analyticsAccess,
        propertiesAccess: access.propertiesAccess,
        knowledgeBaseAccess: access.knowledgeBaseAccess,
        visitorsAccess: access.visitorsAccess,
        companyAccess: access.companyAccess,
        billingAccess: access.billingAccess,
        settingsAccess: access.settingsAccess,
      },
    });
  },

  async getAgentChatAccessScope(userId: string): Promise<AgentChatAccessScope> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        agentModuleAccess: {
          select: {
            chatAccessScope: true,
          },
        },
      },
    });

    if (!user || user.role !== Role.AGENT) {
      return DEFAULT_CHAT_ACCESS_SCOPE;
    }

    return user.agentModuleAccess?.chatAccessScope ?? DEFAULT_CHAT_ACCESS_SCOPE;
  },

  async setAgentChatAccessScope(
    userId: string,
    companyId: string,
    scope: AgentChatAccessScopeInput
  ): Promise<void> {
    await assertAgentAccessUser(userId, companyId);

    const chatAccessScope = normalizeChatAccessScope(scope);

    await prisma.agentModuleAccess.upsert({
      where: { userId },
      create: {
        userId,
        chatAccessScope,
        leadsAccess: false,
        analyticsAccess: false,
        propertiesAccess: false,
        knowledgeBaseAccess: false,
        visitorsAccess: false,
        companyAccess: false,
        billingAccess: false,
        settingsAccess: false,
      },
      update: {
        chatAccessScope,
      },
    });
  },

  /**
   * Check if agent has access to a specific module
   */
  async checkAgentModuleAccess(userId: string, module: AgentModuleName): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        agentModuleAccess: true,
      },
    });

    if (!user || user.role !== Role.AGENT) {
      return false;
    }

    // Check agent module access for all companies (PRO and FREE)
    // Admin can grant access to agents regardless of subscription tier

    // If no module access record exists, default to true for analytics (dashboard) and chats/messages which are always allowed
    if (!user.agentModuleAccess) {
      // Analytics (dashboard) is allowed by default for agents
      if (module === "analytics") {
        return true;
      }
      return false;
    }

    switch (module) {
      case "leads":
        return user.agentModuleAccess.leadsAccess;
      case "analytics":
        return user.agentModuleAccess.analyticsAccess;
      case "properties":
        return user.agentModuleAccess.propertiesAccess;
      case "knowledge_base":
        return user.agentModuleAccess.knowledgeBaseAccess;
      case "visitors":
        return user.agentModuleAccess.visitorsAccess;
      case "company":
        return user.agentModuleAccess.companyAccess;
      case "billing":
        return user.agentModuleAccess.billingAccess;
      case "settings":
        return user.agentModuleAccess.settingsAccess;
      default:
        return false;
    }
  },

  /**
   * Get agent's assigned property IDs
   */
  async getAgentPropertyIds(userId: string): Promise<string[]> {
    const access = await prisma.agentPropertyAccess.findMany({
      where: { userId },
      select: { propertyId: true },
    });

    return access.map((a) => a.propertyId);
  },

  /**
   * Set agent property access
   */
  async setAgentPropertyAccess(
    userId: string,
    companyId: string,
    propertyIds: string[]
  ): Promise<void> {
    // Verify user exists and is an agent
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, companyId: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (user.role !== Role.AGENT) {
      throw new AppError(400, "Only agents can have property access configured");
    }

    if (user.companyId !== companyId) {
      throw new AppError(403, "User belongs to a different company");
    }

    // Remove duplicates from propertyIds array to prevent validation issues
    const uniquePropertyIds = Array.from(new Set(propertyIds));

    // Filter and validate properties - silently skip deleted properties
    let validPropertyIds: string[] = [];

    if (uniquePropertyIds.length > 0) {
      // Get all properties that match the IDs (regardless of company or deleted status)
      const allProperties = await prisma.property.findMany({
        where: {
          id: { in: uniquePropertyIds },
        },
        select: {
          id: true,
          companyId: true,
          deletedAt: true,
        },
      });

      const foundPropertyIds = new Set(allProperties.map(p => p.id));
      const notFoundIds = uniquePropertyIds.filter(id => !foundPropertyIds.has(id));
      const wrongCompanyIds = allProperties
        .filter(p => p.companyId !== companyId)
        .map(p => p.id);

      // Filter out deleted properties silently - they won't be assigned but won't cause an error
      // Only keep properties that exist, belong to the company, and are not deleted
      validPropertyIds = allProperties
        .filter(p => p.companyId === companyId && p.deletedAt === null)
        .map(p => p.id);

      // Only throw errors for properties that don't exist or belong to different company
      // Deleted properties are silently filtered out
      if (notFoundIds.length > 0 || wrongCompanyIds.length > 0) {
        let errorMessage = "One or more properties not found or belong to different company";
        if (notFoundIds.length > 0) {
          errorMessage += `. Properties not found: ${notFoundIds.join(", ")}`;
        }
        if (wrongCompanyIds.length > 0) {
          errorMessage += `. Properties belong to different company: ${wrongCompanyIds.join(", ")}`;
        }

        throw new AppError(400, errorMessage);
      }
    }

    // Delete existing access
    await prisma.agentPropertyAccess.deleteMany({
      where: { userId },
    });

    // Create new access records (only for valid, non-deleted properties)
    if (validPropertyIds.length > 0) {
      await prisma.agentPropertyAccess.createMany({
        data: validPropertyIds.map((propertyId) => ({
          userId,
          propertyId,
        })),
      });
    }
  },

  /**
   * Check if agent has access to a property
   */
  async checkAgentPropertyAccess(userId: string, propertyId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user || user.role !== Role.AGENT) {
      return false;
    }

    // Agents can only access explicitly assigned properties.

    // Get all property access records for this agent
    const propertyAccessCount = await prisma.agentPropertyAccess.count({
      where: { userId },
    });

    // If no property access is configured, deny access.
    if (propertyAccessCount === 0) {
      return false;
    }

    // If property access is configured, check if this property is assigned
    const access = await prisma.agentPropertyAccess.findUnique({
      where: {
        userId_propertyId: {
          userId,
          propertyId,
        },
      },
    });

    return !!access;
  },

  /**
   * Get agent access summary (for admin view)
   */
  async getAgentAccessSummary(userId: string): Promise<{
    moduleAccess: AgentModuleAccessInput | null;
    chatAccessScope: AgentChatAccessScope;
    propertyIds: string[];
    properties: Array<{ id: string; name: string; domain: string | null }>;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        agentModuleAccess: true,
        agentPropertyAccess: {
          include: {
            property: {
              select: {
                id: true,
                name: true,
                domain: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    const moduleAccess = user.agentModuleAccess
      ? {
          leadsAccess: user.agentModuleAccess.leadsAccess,
          analyticsAccess: user.agentModuleAccess.analyticsAccess,
          propertiesAccess: user.agentModuleAccess.propertiesAccess,
          knowledgeBaseAccess: user.agentModuleAccess.knowledgeBaseAccess,
          visitorsAccess: user.agentModuleAccess.visitorsAccess,
          companyAccess: user.agentModuleAccess.companyAccess,
          billingAccess: user.agentModuleAccess.billingAccess,
          settingsAccess: user.agentModuleAccess.settingsAccess,
        }
      : null;

    const propertyIds = user.agentPropertyAccess.map((a) => a.propertyId);
    const properties = user.agentPropertyAccess.map((a) => ({
      id: a.property.id,
      name: a.property.name,
      domain: a.property.domain,
    }));

    return {
      moduleAccess,
      chatAccessScope:
        user.agentModuleAccess?.chatAccessScope ?? DEFAULT_CHAT_ACCESS_SCOPE,
      propertyIds,
      properties,
    };
  },
};

