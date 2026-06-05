import type {
  CrmIntegrationStatus,
  CrmLeadSource,
  CrmProvider,
  CrmSyncAction,
  CrmSyncStatus,
  CrmSyncTrigger,
  Prisma,
} from "@prisma/client";
import prisma from "../lib/prisma";

export const crmRepository = {
  async upsertIntegration(data: {
    companyId: string;
    provider: CrmProvider;
    status: CrmIntegrationStatus;
    encryptedAccessToken?: string | null;
    encryptedRefreshToken?: string | null;
    tokenExpiresAt?: Date | null;
    encryptedWebhookUrl?: string | null;
    encryptedWebhookSecret?: string | null;
    settings?: Prisma.InputJsonValue;
    createdById?: string | null;
  }) {
    return prisma.crmIntegration.upsert({
      where: {
        companyId_provider: {
          companyId: data.companyId,
          provider: data.provider,
        },
      },
      create: {
        companyId: data.companyId,
        provider: data.provider,
        status: data.status,
        encryptedAccessToken: data.encryptedAccessToken,
        encryptedRefreshToken: data.encryptedRefreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        encryptedWebhookUrl: data.encryptedWebhookUrl,
        encryptedWebhookSecret: data.encryptedWebhookSecret,
        settings: data.settings,
        createdById: data.createdById,
      },
      update: {
        status: data.status,
        encryptedAccessToken: data.encryptedAccessToken,
        encryptedRefreshToken: data.encryptedRefreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        encryptedWebhookUrl: data.encryptedWebhookUrl,
        encryptedWebhookSecret: data.encryptedWebhookSecret,
        settings: data.settings,
        lastError: null,
      },
    });
  },

  async listIntegrations(companyId: string) {
    return prisma.crmIntegration.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findIntegration(companyId: string, provider: CrmProvider) {
    return prisma.crmIntegration.findUnique({
      where: {
        companyId_provider: {
          companyId,
          provider,
        },
      },
    });
  },

  async deleteIntegration(companyId: string, id: string) {
    return prisma.crmIntegration.delete({
      where: { id, companyId },
    });
  },

  async markIntegrationSyncResult(params: {
    id: string;
    companyId: string;
    success: boolean;
    errorMessage?: string | null;
    statusOnFailure?: CrmIntegrationStatus;
  }) {
    return prisma.crmIntegration.update({
      where: { id: params.id, companyId: params.companyId },
      data: {
        status: params.success ? "CONNECTED" : (params.statusOnFailure ?? "ERROR"),
        lastSyncAt: params.success ? new Date() : undefined,
        lastError: params.success ? null : params.errorMessage ?? "CRM sync failed",
      },
    });
  },

  async upsertFieldMapping(data: {
    companyId: string;
    provider: CrmProvider;
    source: CrmLeadSource;
    mappings: Prisma.InputJsonValue;
  }) {
    return prisma.crmFieldMapping.upsert({
      where: {
        companyId_provider_source: {
          companyId: data.companyId,
          provider: data.provider,
          source: data.source,
        },
      },
      create: data,
      update: {
        mappings: data.mappings,
      },
    });
  },

  async findFieldMapping(companyId: string, provider: CrmProvider, source: CrmLeadSource) {
    return prisma.crmFieldMapping.findUnique({
      where: {
        companyId_provider_source: {
          companyId,
          provider,
          source,
        },
      },
    });
  },

  async listFieldMappings(companyId: string, provider?: CrmProvider) {
    return prisma.crmFieldMapping.findMany({
      where: {
        companyId,
        ...(provider ? { provider } : {}),
      },
      orderBy: [{ provider: "asc" }, { source: "asc" }],
    });
  },

  async createSyncLog(data: {
    companyId: string;
    integrationId?: string | null;
    leadId?: string | null;
    chatId?: string | null;
    provider: CrmProvider;
    action: CrmSyncAction;
    trigger: CrmSyncTrigger;
    status: CrmSyncStatus;
    requestPayload?: Prisma.InputJsonValue | null;
    responsePayload?: Prisma.InputJsonValue | null;
    errorMessage?: string | null;
    retryCount?: number;
  }) {
    return prisma.crmSyncLog.create({
      data: {
        companyId: data.companyId,
        integrationId: data.integrationId ?? null,
        leadId: data.leadId ?? null,
        chatId: data.chatId ?? null,
        provider: data.provider,
        action: data.action,
        trigger: data.trigger,
        status: data.status,
        requestPayload: data.requestPayload ?? undefined,
        responsePayload: data.responsePayload ?? undefined,
        errorMessage: data.errorMessage ?? null,
        retryCount: data.retryCount ?? 0,
      },
    });
  },

  async updateSyncLog(id: string, data: {
    status: CrmSyncStatus;
    responsePayload?: Prisma.InputJsonValue | null;
    errorMessage?: string | null;
    retryCount?: number;
  }) {
    return prisma.crmSyncLog.update({
      where: { id },
      data: {
        status: data.status,
        responsePayload: data.responsePayload ?? undefined,
        errorMessage: data.errorMessage ?? null,
        retryCount: data.retryCount,
      },
    });
  },

  async listSyncLogs(companyId: string, params: {
    status?: CrmSyncStatus;
    provider?: CrmProvider;
    leadId?: string;
    limit: number;
  }) {
    return prisma.crmSyncLog.findMany({
      where: {
        companyId,
        ...(params.status ? { status: params.status } : {}),
        ...(params.provider ? { provider: params.provider } : {}),
        ...(params.leadId ? { leadId: params.leadId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params.limit,
    });
  },

  async findLatestSyncLogsForLeads(companyId: string, leadIds: string[], provider: CrmProvider = "WEBHOOK") {
    if (leadIds.length === 0) {
      return [];
    }

    return prisma.crmSyncLog.findMany({
      where: {
        companyId,
        provider,
        leadId: { in: leadIds },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findLeadLink(companyId: string, leadId: string, provider: CrmProvider) {
    return prisma.leadCrmLink.findUnique({
      where: {
        companyId_leadId_provider: {
          companyId,
          leadId,
          provider,
        },
      },
    });
  },

  async findLeadLinksForLeads(companyId: string, leadIds: string[], provider: CrmProvider = "WEBHOOK") {
    if (leadIds.length === 0) {
      return [];
    }

    return prisma.leadCrmLink.findMany({
      where: {
        companyId,
        provider,
        leadId: { in: leadIds },
      },
      orderBy: { lastSyncedAt: "desc" },
    });
  },

  async findSyncedLeadIds(companyId: string, leadIds: string[], provider: CrmProvider = "WEBHOOK") {
    if (leadIds.length === 0) {
      return new Set<string>();
    }

    const links = await prisma.leadCrmLink.findMany({
      where: {
        companyId,
        provider,
        leadId: { in: leadIds },
        OR: [
          { crmContactId: { not: null } },
          { lastSyncedAt: { not: null } },
        ],
      },
      select: { leadId: true },
    });

    return new Set(links.map((link) => link.leadId));
  },

  async upsertLeadLink(data: {
    companyId: string;
    leadId: string;
    provider: CrmProvider;
    crmContactId?: string | null;
    crmDealId?: string | null;
  }) {
    return prisma.leadCrmLink.upsert({
      where: {
        companyId_leadId_provider: {
          companyId: data.companyId,
          leadId: data.leadId,
          provider: data.provider,
        },
      },
      create: {
        companyId: data.companyId,
        leadId: data.leadId,
        provider: data.provider,
        crmContactId: data.crmContactId ?? null,
        crmDealId: data.crmDealId ?? null,
        lastSyncedAt: new Date(),
      },
      update: {
        crmContactId: data.crmContactId ?? undefined,
        crmDealId: data.crmDealId ?? undefined,
        lastSyncedAt: new Date(),
      },
    });
  },
};
