import crypto from "node:crypto";
import {
  CrmIntegrationStatus,
  CrmLeadSource,
  CrmProvider,
  CrmSyncAction,
  CrmSyncStatus,
  CrmSyncTrigger,
  LeadSource,
  SenderType,
  type Prisma,
} from "@prisma/client";
import prisma from "../../lib/prisma";
import { readLeadUserId } from "../../repositories/leadRepository";
import { crmRepository } from "../../repositories/crmRepository";
import { AppError } from "../../utils/appError";
import { getModuleLogger } from "../../utils/logger";
// import { encrypt, decrypt } from "../../utils/encryption";
import { assertPublicHttpUrl } from "../../utils/safeFetch";
import { config } from "../../config";
import { CRM_SYNC_MAX_ATTEMPTS, crmSyncQueue } from "./crm-sync.queue";
import type { CrmConnectProvider, CrmProviderClient, NormalizedCrmLead } from "./crm.types";
import { WebhookCrmProvider } from "./providers/webhook.provider";
import { HubSpotApiError, HubSpotCrmProvider } from "./providers/hubspot.provider";
import { clearHubSpotContactPropertyNamesCache } from "./hubspot-contact-properties-cache";
import { resolveWebhookSecretForConnect } from "./crm-webhook-secret";
import { buildCrmSyncRequestLogMetadata } from "./crm-sync-log-metadata";
import { classifyCrmError } from "./crm-error-classification";
import {
  CRM_CHATBOT_FIELDS,
  CRM_PROVIDER_FIELDS,
  getCrmDefaultMappings,
} from "../../constants/crmConstants";

const LEAD_SYNC_PROVIDER_SET = new Set<CrmProvider>([CrmProvider.HUBSPOT, CrmProvider.WEBHOOK]);

function isPrimaryLeadSyncProviderValue(value: unknown): value is CrmProvider {
  return value === CrmProvider.HUBSPOT || value === CrmProvider.WEBHOOK;
}

const crmLog = getModuleLogger("crm-service");

function connectedLeadSyncProviders(rows: { status: string; provider: CrmProvider }[]): CrmProvider[] {
  return rows
    .filter((i) => i.status === CrmIntegrationStatus.CONNECTED && LEAD_SYNC_PROVIDER_SET.has(i.provider))
    .map((i) => i.provider);
}

function pickPrimaryFromConnected(connected: CrmProvider[]): CrmProvider | null {
  if (connected.includes(CrmProvider.HUBSPOT)) return CrmProvider.HUBSPOT;
  if (connected.includes(CrmProvider.WEBHOOK)) return CrmProvider.WEBHOOK;
  return null;
}

async function readCompanyLeadSyncPreferencesRaw(companyId: string): Promise<Record<string, unknown>> {
  const row = await prisma.company.findUnique({
    where: { id: companyId },
    select: { crmLeadSyncPreferences: true } as Prisma.CompanySelect,
  });
  const raw = (row as { crmLeadSyncPreferences?: Prisma.JsonValue | null } | null)?.crmLeadSyncPreferences;
  return isRecord(raw) ? raw : {};
}

async function mergeCompanyLeadSyncPrefs(companyId: string, patch: Record<string, unknown>): Promise<void> {
  const base = await readCompanyLeadSyncPreferencesRaw(companyId);
  await prisma.company.update({
    where: { id: companyId },
    data: {
      crmLeadSyncPreferences: { ...base, ...patch } as Prisma.InputJsonValue,
    } as Prisma.CompanyUpdateInput,
  });
}

async function buildLeadSyncMeta(
  companyId: string,
  integrationRows: { status: string; provider: CrmProvider }[]
): Promise<{
  primaryProvider: CrmProvider | null;
  effectiveProvider: CrmProvider | null;
  connectedProviders: CrmProvider[];
  requiresPrimaryChoice: boolean;
}> {
  const connected = connectedLeadSyncProviders(integrationRows);
  const raw = await readCompanyLeadSyncPreferencesRaw(companyId);
  const rawPrimary = raw.primaryLeadSyncProvider;
  const primary =
    isPrimaryLeadSyncProviderValue(rawPrimary) && connected.includes(rawPrimary) ? rawPrimary : null;
  const effective = primary ?? pickPrimaryFromConnected(connected);
  return {
    primaryProvider: primary,
    effectiveProvider: effective,
    connectedProviders: connected,
    requiresPrimaryChoice: connected.length > 1 && primary === null,
  };
}

async function ensurePrimaryAfterConnect(companyId: string, rows: { status: string; provider: CrmProvider }[]) {
  const connected = connectedLeadSyncProviders(rows);
  if (connected.length === 1) {
    await mergeCompanyLeadSyncPrefs(companyId, { primaryLeadSyncProvider: connected[0] });
    return;
  }
  const raw = await readCompanyLeadSyncPreferencesRaw(companyId);
  const p = raw.primaryLeadSyncProvider;
  if (isPrimaryLeadSyncProviderValue(p) && connected.includes(p)) return;
}

async function reconcilePrimaryAfterDisconnect(
  companyId: string,
  disconnectedProvider: CrmProvider,
  rows: { status: string; provider: CrmProvider }[]
) {
  const connected = connectedLeadSyncProviders(rows);
  const raw = await readCompanyLeadSyncPreferencesRaw(companyId);
  const prev = raw.primaryLeadSyncProvider;
  if (prev === disconnectedProvider || (isPrimaryLeadSyncProviderValue(prev) && !connected.includes(prev))) {
    await mergeCompanyLeadSyncPrefs(companyId, {
      primaryLeadSyncProvider: connected.length ? pickPrimaryFromConnected(connected) : null,
    });
  }
}

export const crmService = {
  async connectIntegration(params: {
    companyId: string;
    userId: string;
    provider: CrmConnectProvider;
    webhookUrl?: string;
    webhookSecret?: string;
    generateWebhookSecret?: boolean;
    serviceKeyToken?: string;
    portalId?: string;
  }): Promise<{ integration: ReturnType<typeof sanitizeIntegration>; webhookSecretRevealOnce?: string }> {
    let integration;
    let webhookSecretRevealOnce: string | undefined;

    if (params.provider === CrmProvider.WEBHOOK) {
      await assertPublicHttpUrl(params.webhookUrl!, {
        allowPrivateHosts: !config.server.isProduction,
      });

      const secretResolution = resolveWebhookSecretForConnect({
        webhookSecret: params.webhookSecret,
        generateWebhookSecret: params.generateWebhookSecret,
      });
      const webhookSecretPlain =
        secretResolution.kind === "provided"
          ? secretResolution.plaintext
          : crypto.randomBytes(32).toString("hex");
      if (secretResolution.kind === "generate") {
        webhookSecretRevealOnce = webhookSecretPlain;
      }
      integration = await crmRepository.upsertIntegration({
        companyId: params.companyId,
        provider: params.provider,
        status: CrmIntegrationStatus.CONNECTED,
        // encryptedWebhookUrl: encrypt(params.webhookUrl!.trim()),
        // encryptedWebhookSecret: encrypt(webhookSecretPlain),
        settings: { syncTriggers: [CrmSyncTrigger.LEAD_CREATED, CrmSyncTrigger.CHAT_CLOSED] },
        createdById: params.userId,
      });
    } else {
      integration = await crmRepository.upsertIntegration({
        companyId: params.companyId,
        provider: params.provider,
        status: CrmIntegrationStatus.CONNECTED,
        // encryptedAccessToken: encrypt(params.serviceKeyToken!.trim()),
        settings: {
          portalId: params.portalId?.trim() || null,
          authType: "SERVICE_KEY",
          syncTriggers: [CrmSyncTrigger.LEAD_CREATED, CrmSyncTrigger.CHAT_CLOSED],
        },
        createdById: params.userId,
      });
    }

    await this.ensureDefaultMappings(params.companyId, params.provider);
    await this.audit(params.companyId, params.userId, "CREATE", integration.id, {
      provider: params.provider,
      status: CrmIntegrationStatus.CONNECTED,
    });

    const integrationRows = await crmRepository.listIntegrations(params.companyId);
    await ensurePrimaryAfterConnect(params.companyId, integrationRows);

    return {
      integration: sanitizeIntegration(integration),
      ...(webhookSecretRevealOnce ? { webhookSecretRevealOnce } : {}),
    };
  },

  async listIntegrations(companyId: string) {
    const integrations = await crmRepository.listIntegrations(companyId);
    const leadSync = await buildLeadSyncMeta(companyId, integrations);
    return {
      integrations: integrations.map(sanitizeIntegration),
      leadSync,
    };
  },

  async getLeadSyncRouting(companyId: string) {
    const integrations = await crmRepository.listIntegrations(companyId);
    return buildLeadSyncMeta(companyId, integrations);
  },

  async setPrimaryLeadSyncProvider(params: {
    companyId: string;
    userId: string;
    provider: CrmConnectProvider;
  }) {
    const integrations = await crmRepository.listIntegrations(params.companyId);
    const connected = connectedLeadSyncProviders(integrations);
    if (!connected.includes(params.provider)) {
      throw new AppError(400, "Selected CRM is not connected");
    }
    await mergeCompanyLeadSyncPrefs(params.companyId, { primaryLeadSyncProvider: params.provider });
    await this.audit(params.companyId, params.userId, "UPDATE", "crm-lead-sync-primary", {
      action: "PRIMARY_LEAD_SYNC_PROVIDER_SET",
      provider: params.provider,
    });
    return buildLeadSyncMeta(params.companyId, integrations);
  },

  async disconnectIntegration(companyId: string, userId: string, id: string) {
    const deleted = await crmRepository.deleteIntegration(companyId, id);
    if (deleted.provider === CrmProvider.HUBSPOT) {
      clearHubSpotContactPropertyNamesCache(deleted.id);
    }
    const rows = await crmRepository.listIntegrations(companyId);
    await reconcilePrimaryAfterDisconnect(companyId, deleted.provider, rows);
    await this.audit(companyId, userId, "DELETE", id, {
      provider: deleted.provider,
    });
  },

  async testConnection(companyId: string, userId: string, provider: CrmProvider) {
    const integration = await this.getConnectedIntegration(companyId, provider);
    const client = this.createProvider(integration);

    const syncLog = await crmRepository.createSyncLog({
      companyId,
      integrationId: integration.id,
      provider,
      action: CrmSyncAction.TEST_CONNECTION,
      trigger: CrmSyncTrigger.TEST,
      status: CrmSyncStatus.PENDING,
      requestPayload: { event: "crm.test", provider, action: CrmSyncAction.TEST_CONNECTION },
    });

    try {
      const result = await client.testConnection();
      await crmRepository.updateSyncLog(syncLog.id, {
        status: CrmSyncStatus.SUCCESS,
        responsePayload: toJson(result.responsePayload),
      });
      await crmRepository.markIntegrationSyncResult({ id: integration.id, companyId, success: true });
      await this.audit(companyId, userId, "UPDATE", integration.id, { action: CrmSyncAction.TEST_CONNECTION });
      crmLog.info("crm.connection_test.succeeded", {
        companyId,
        provider,
        event: "crm.test",
        trigger: CrmSyncTrigger.TEST,
        status: CrmSyncStatus.SUCCESS,
      });
      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const classification = classifyCrmError(error, provider, 1);
      await crmRepository.updateSyncLog(syncLog.id, {
        status: CrmSyncStatus.FAILED,
        errorMessage,
      });
      if (classification.disconnectIntegration) {
        await crmRepository.markIntegrationSyncResult({
          id: integration.id,
          companyId,
          success: false,
          errorMessage,
          statusOnFailure: CrmIntegrationStatus.DISCONNECTED,
        });
      }
      crmLog.warn("crm.connection_test.failed", {
        companyId,
        provider,
        event: "crm.test",
        trigger: CrmSyncTrigger.TEST,
        status: CrmSyncStatus.FAILED,
        error: errorMessage,
        retryCount: 0,
        disconnectIntegration: classification.disconnectIntegration,
        hubSpotStatusCode:
          provider === CrmProvider.HUBSPOT && error instanceof HubSpotApiError ? error.statusCode ?? null : null,
      });
      throw error;
    }
  },

  async getFieldMappings(companyId: string, provider?: CrmProvider) {
    return crmRepository.listFieldMappings(companyId, provider);
  },

  async saveFieldMapping(params: {
    companyId: string;
    userId: string;
    provider: CrmProvider;
    source: CrmLeadSource;
    mappings: Record<string, string>;
  }) {
    const mapping = await crmRepository.upsertFieldMapping({
      companyId: params.companyId,
      provider: params.provider,
      source: params.source,
      mappings: params.mappings,
    });

    await this.audit(params.companyId, params.userId, "UPDATE", mapping.id, {
      provider: params.provider,
      source: params.source,
      action: "FIELD_MAPPING_CHANGED",
    });

    return mapping;
  },

  getFields(provider: CrmProvider) {
    return {
      chatbotFields: CRM_CHATBOT_FIELDS,
      crmFields: CRM_PROVIDER_FIELDS[provider] ?? [],
      defaultMappings: getCrmDefaultMappings(provider),
    };
  },

  enqueueLeadSync(params: {
    companyId: string;
    leadId: string;
    provider?: CrmProvider;
    trigger: CrmSyncTrigger;
    logId?: string;
  }) {
    crmSyncQueue.enqueue(params);
  },

  async syncLeadNow(params: {
    companyId: string;
    leadId: string;
    provider?: CrmProvider;
    trigger: CrmSyncTrigger;
    attempt?: number;
    logId?: string;
  }) {
    const provider = params.provider ?? await this.getDefaultProvider(params.companyId);
    const integration = await this.getConnectedIntegration(params.companyId, provider);
    const normalizedLead = await this.normalizeLead(params.companyId, params.leadId);
    const mapping = await this.getMapping(params.companyId, provider, normalizedLead.source);
    const { mappings: effectiveMapping } = sanitizeMappingsForProvider(provider, mapping);
    const mappedFields = applyMappings(normalizedLead, effectiveMapping);
    const existingLink = await crmRepository.findLeadLink(params.companyId, params.leadId, provider);
    const action: CrmSyncAction = existingLink?.crmContactId
      ? CrmSyncAction.UPDATE_CONTACT
      : CrmSyncAction.CREATE_CONTACT;
    const event =
      params.trigger === CrmSyncTrigger.CHAT_CLOSED
        ? "chat.closed"
        : params.trigger === CrmSyncTrigger.MANUAL
          ? "lead.sync.manual"
          : "lead.created";
    const requestPayload = buildCrmSyncRequestLogMetadata({
      event,
      provider,
      action,
      leadId: params.leadId,
      chatId: normalizedLead.chatId,
      trigger: params.trigger,
      mappingSourceFieldCount: Object.keys(effectiveMapping).length,
      mappedCrmFieldKeys: [...new Set(Object.values(effectiveMapping))],
      transcriptCharCount: (normalizedLead.transcript ?? "").length,
      hasChatSummary: Boolean(normalizedLead.chatSummary?.trim()),
      hasLeadMessage: Boolean(normalizedLead.message?.trim()),
    });

    const syncLog = params.logId
      ? await crmRepository.updateSyncLog(params.logId, {
        status: CrmSyncStatus.PENDING,
        responsePayload: null,
        errorMessage: null,
        retryCount: Math.max((params.attempt ?? 1) - 1, 0),
      })
      : await crmRepository.createSyncLog({
        companyId: params.companyId,
        integrationId: integration.id,
        leadId: params.leadId,
        chatId: normalizedLead.chatId,
        provider,
        action,
        trigger: params.trigger,
        status: CrmSyncStatus.PENDING,
        requestPayload,
        retryCount: Math.max((params.attempt ?? 1) - 1, 0),
      });

    try {
      const client = this.createProvider(integration);
      const result = await client.syncLead({
        provider,
        action,
        trigger: params.trigger,
        event,
        lead: normalizedLead,
        mappedFields,
        existingCrmContactId: existingLink?.crmContactId,
      });

      await crmRepository.updateSyncLog(syncLog.id, {
        status: CrmSyncStatus.SUCCESS,
        responsePayload: toJson(result.responsePayload ?? result),
        retryCount: Math.max((params.attempt ?? 1) - 1, 0),
      });

      await crmRepository.upsertLeadLink({
        companyId: params.companyId,
        leadId: params.leadId,
        provider,
        crmContactId: result.crmContactId ?? existingLink?.crmContactId ?? null,
        crmDealId: result.crmDealId ?? existingLink?.crmDealId ?? null,
      });

      await prisma.lead.update({
        where: { id: params.leadId, companyId: params.companyId },
        data: {
          syncedAt: new Date(),
        },
      });

      await crmRepository.markIntegrationSyncResult({ id: integration.id, companyId: params.companyId, success: true });
      crmLog.info("crm.lead_sync.succeeded", {
        companyId: params.companyId,
        leadId: params.leadId,
        provider,
        event,
        trigger: params.trigger,
        action,
        attempt: params.attempt ?? 1,
        maxAttempts: CRM_SYNC_MAX_ATTEMPTS,
        retryCount: Math.max((params.attempt ?? 1) - 1, 0),
        status: CrmSyncStatus.SUCCESS,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const classification = classifyCrmError(error, provider, params.attempt);
      const attempt = params.attempt ?? 1;
      const nextRetryCount = Math.max(attempt - 1, 0);
      const retrying = classification.retryable && attempt < CRM_SYNC_MAX_ATTEMPTS;
      logSyncFailure({
        error,
        provider,
        companyId: params.companyId,
        leadId: params.leadId,
        event,
        trigger: params.trigger,
        action,
        attempt,
        maxAttempts: CRM_SYNC_MAX_ATTEMPTS,
        retryCount: nextRetryCount,
        willRetry: retrying,
        status: retrying ? CrmSyncStatus.PENDING : CrmSyncStatus.FAILED,
        disconnectIntegration: classification.disconnectIntegration,
      });

      await crmRepository.updateSyncLog(syncLog.id, {
        status: retrying ? CrmSyncStatus.PENDING : CrmSyncStatus.FAILED,
        errorMessage,
        responsePayload: retrying
          ? toJson({
              retrying: true,
              nextAttempt: attempt + 1,
            })
          : undefined,
        retryCount: nextRetryCount,
      });

      if (classification.disconnectIntegration) {
        await crmRepository.markIntegrationSyncResult({
          id: integration.id,
          companyId: params.companyId,
          success: false,
          errorMessage,
          statusOnFailure: CrmIntegrationStatus.DISCONNECTED,
        });
      }
      throw error;
    }
  },

  async syncLeadManual(companyId: string, leadId: string, provider?: CrmProvider) {
    const providerName = provider ?? await this.getDefaultProvider(companyId);
    const integration = await this.getConnectedIntegration(companyId, providerName);
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId, property: { deletedAt: null } },
      select: { id: true, chatId: true },
    });
    if (!lead) {
      throw new AppError(404, "Lead not found");
    }

    const log = await crmRepository.createSyncLog({
      companyId,
      leadId,
      chatId: lead.chatId,
      provider: providerName,
      integrationId: integration.id,
      action: CrmSyncAction.SYNC_LEAD,
      trigger: CrmSyncTrigger.MANUAL,
      status: CrmSyncStatus.PENDING,
      requestPayload: { event: "lead.sync.manual", leadId },
    });

    this.enqueueLeadSync({
      companyId,
      leadId,
      provider: providerName,
      trigger: CrmSyncTrigger.MANUAL,
      logId: log.id,
    });

    return { queued: true, skippedAlreadySynced: 0, failed: 0 };
  },

  async syncLeadsBulk(companyId: string, leadIds: string[], provider?: CrmProvider) {
    const providerName = provider ?? await this.getDefaultProvider(companyId);
    const integration = await this.getConnectedIntegration(companyId, providerName);
    const uniqueLeadIds = [...new Set(leadIds.map((id) => id.trim()))];

    const leads = await prisma.lead.findMany({
      where: {
        companyId,
        id: { in: uniqueLeadIds },
        property: { deletedAt: null },
      },
      select: {
        id: true,
        chatId: true,
      },
    });

    const syncedLeadIds = await crmRepository.findSyncedLeadIds(companyId, leads.map((lead) => lead.id), providerName);
    let queued = 0;
    let failed = 0;
    let skippedAlreadySynced = 0;

    for (const lead of leads) {
      if (syncedLeadIds.has(lead.id)) {
        skippedAlreadySynced += 1;
        continue;
      }

      try {
        const log = await crmRepository.createSyncLog({
          companyId,
          integrationId: integration.id,
          leadId: lead.id,
          chatId: lead.chatId,
          provider: providerName,
          action: CrmSyncAction.SYNC_LEAD,
          trigger: CrmSyncTrigger.MANUAL,
          status: CrmSyncStatus.PENDING,
          requestPayload: { event: "lead.sync.manual", leadId: lead.id },
        });
        this.enqueueLeadSync({
          companyId,
          leadId: lead.id,
          provider: providerName,
          trigger: CrmSyncTrigger.MANUAL,
          logId: log.id,
        });
        queued += 1;
      } catch {
        failed += 1;
      }
    }

    failed += uniqueLeadIds.length - leads.length;

    return { queued, skippedAlreadySynced, failed };
  },

  async backfillUnsyncedLeads(companyId: string, params: {
    source?: string;
    propertyId?: string;
    limit?: number;
    provider?: CrmProvider;
  }) {
    const provider = params.provider ?? await this.getDefaultProvider(companyId);
    const integration = await this.getConnectedIntegration(companyId, provider);
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const sourceFilter = mapBackfillSource(params.source);

    const leads = await prisma.lead.findMany({
      where: {
        companyId,
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
        ...(sourceFilter ? { source: sourceFilter } : {}),
        property: { deletedAt: null },
        crmLinks: {
          none: {
            provider,
            OR: [
              { crmContactId: { not: null } },
              { lastSyncedAt: { not: null } },
            ],
          },
        },
      },
      select: {
        id: true,
        chatId: true,
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    let queued = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        const log = await crmRepository.createSyncLog({
          companyId,
          integrationId: integration.id,
          leadId: lead.id,
          chatId: lead.chatId,
          provider,
          action: CrmSyncAction.SYNC_LEAD,
          trigger: CrmSyncTrigger.MANUAL,
          status: CrmSyncStatus.PENDING,
          requestPayload: { event: "lead.sync.manual", leadId: lead.id },
        });
        this.enqueueLeadSync({
          companyId,
          leadId: lead.id,
          provider,
          trigger: CrmSyncTrigger.MANUAL,
          logId: log.id,
        });
        queued += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      queued,
      skippedAlreadySynced: 0,
      failed,
    };
  },

  async syncChatClosed(companyId: string, chatId: string) {
    const lead = await prisma.lead.findFirst({
      where: { companyId, chatId },
      select: { id: true },
    });

    if (!lead) {
      return;
    }

    this.enqueueLeadSync({
      companyId,
      leadId: lead.id,
      trigger: CrmSyncTrigger.CHAT_CLOSED,
    });
  },

  async listSyncLogs(companyId: string, params: {
    status?: CrmSyncStatus;
    provider?: CrmProvider;
    leadId?: string;
    limit?: number;
  }) {
    return crmRepository.listSyncLogs(companyId, {
      ...params,
      limit: Math.min(Math.max(params.limit ?? 50, 1), 100),
    });
  },

  async ensureDefaultMappings(companyId: string, provider: CrmProvider) {
    const sources: CrmLeadSource[] = [
      CrmLeadSource.WEBSITE,
      CrmLeadSource.WHATSAPP,
      CrmLeadSource.INSTAGRAM,
      CrmLeadSource.FACEBOOK,
      CrmLeadSource.MANUAL,
      CrmLeadSource.API,
    ];
    await Promise.all(
      sources.map((source) =>
        crmRepository.upsertFieldMapping({
          companyId,
          provider,
          source,
          mappings: getCrmDefaultMappings(provider),
        })
      )
    );
  },

  async getMapping(companyId: string, provider: CrmProvider, source: CrmLeadSource): Promise<Record<string, string>> {
    const mapping = await crmRepository.findFieldMapping(companyId, provider, source);
    if (!mapping || !isRecord(mapping.mappings)) {
      return getCrmDefaultMappings(provider);
    }
    return mapping.mappings as Record<string, string>;
  },

  async normalizeLead(companyId: string, leadId: string): Promise<NormalizedCrmLead> {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId, property: { deletedAt: null } },
      include: {
        chat: {
          include: {
            visitor: true,
            agent: {
              select: { id: true, name: true, email: true },
            },
            messages: {
              where: {
                deletedAt: null,
                isDeleted: false,
              },
              orderBy: { createdAt: "asc" },
              take: 50,
            },
          },
        },
        property: true,
      },
    });

    if (!lead) {
      throw new AppError(404, "Lead not found");
    }

    const messages = lead.chat?.messages ?? [];
    const transcript = messages
      .map((message) => `${message.senderType}: ${message.text ?? ""}`.trim())
      .filter(Boolean)
      .join("\n");

    const latestVisitorMessage = [...messages]
      .reverse()
      .find((message) => message.senderType === SenderType.VISITOR && message.text?.trim());

    return {
      workspaceId: lead.companyId,
      leadId: lead.id,
      source: mapCrmLeadSource(lead.source, (lead as { channel?: string }).channel ?? "web_widget"),
      channel: mapLeadChannel((lead as { channel?: string }).channel ?? "web_widget"),
      status: lead.status,
      name: lead.fullName,
      email: lead.email,
      userId: readLeadUserId(lead) ?? lead.chat?.visitor?.externalId ?? null,
      phone: lead.phone,
      companyName: lead.companyName,
      message: latestVisitorMessage?.text ?? lead.notes,
      pageUrl: null,
      browser: lead.chat?.visitor?.browser ?? null,
      device: lead.chat?.visitor?.device ?? null,
      country: lead.chat?.visitor?.country ?? null,
      city: lead.chat?.visitor?.city ?? null,
      chatSessionId: lead.chat?.sessionId ?? null,
      chatId: lead.chatId,
      assignedAgentId: lead.chat?.agentId ?? null,
      assignedAgentName: lead.chat?.agent?.name ?? lead.chat?.agent?.email ?? null,
      tags: [],
      customFields: {
        propertyId: lead.propertyId,
        propertyName: lead.property.name,
        propertyDomain: lead.property.domain,
      },
      chatSummary: summarizeTranscript(transcript),
      transcript: transcript || null,
    };
  },

  createProvider(integration: {
    id: string;
    provider: CrmProvider;
    encryptedWebhookUrl: string | null;
    encryptedWebhookSecret: string | null;
    encryptedAccessToken: string | null;
    settings: unknown;
  }): CrmProviderClient {
    if (integration.provider === CrmProvider.WEBHOOK) {
      if (!integration.encryptedWebhookUrl || !integration.encryptedWebhookSecret) {
        throw new AppError(400, "Webhook CRM credentials are incomplete");
      }

      // return new WebhookCrmProvider(
        // decrypt(integration.encryptedWebhookUrl),
        // decrypt(integration.encryptedWebhookSecret)
      // );
    }

    if (integration.provider === CrmProvider.HUBSPOT) {
      if (!integration.encryptedAccessToken) {
        throw new AppError(400, "HubSpot credentials are incomplete");
      }
      const settings = isRecord(integration.settings) ? integration.settings : {};
      return new HubSpotCrmProvider(
        // decrypt(integration.encryptedAccessToken),
        // typeof settings.portalId === "string" ? settings.portalId : null,
        integration.id
      );
    }

    throw new AppError(400, `${integration.provider} provider is not implemented yet`);
  },

  async getConnectedIntegration(companyId: string, provider: CrmProvider) {
    const integration = await crmRepository.findIntegration(companyId, provider);
    if (!integration || integration.status === CrmIntegrationStatus.DISCONNECTED) {
      throw new AppError(404, "CRM integration is not connected");
    }
    return integration;
  },

  async getDefaultProvider(companyId: string): Promise<CrmProvider> {
    const integrations = await crmRepository.listIntegrations(companyId);
    const meta = await buildLeadSyncMeta(companyId, integrations);
    if (!meta.effectiveProvider) {
      throw new AppError(404, "CRM integration is not connected");
    }
    return meta.effectiveProvider;
  },

  async audit(companyId: string, userId: string, action: "CREATE" | "UPDATE" | "DELETE", resourceId: string, metadata: Prisma.InputJsonValue) {
    await prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action,
        resourceType: "INTEGRATION",
        resourceId,
        metadata,
      },
    });
  },
};

crmSyncQueue.setProcessor(async (job) => {
  await crmService.syncLeadNow(job);
});

function sanitizeIntegration(integration: {
  id: string;
  companyId: string;
  provider: CrmProvider;
  status: string;
  tokenExpiresAt: Date | null;
  settings: unknown;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: integration.id,
    companyId: integration.companyId,
    provider: integration.provider,
    status: integration.status,
    tokenExpiresAt: integration.tokenExpiresAt,
    settings: integration.settings,
    lastSyncAt: integration.lastSyncAt,
    lastError: integration.lastError,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

function sanitizeMappingsForProvider(provider: CrmProvider, mappings: Record<string, string>) {
  return { mappings, unsupportedFields: [] as string[] };
}

function applyMappings(lead: NormalizedCrmLead, mappings: Record<string, string>) {
  const mappedFields: Record<string, unknown> = {};

  for (const [sourcePath, crmField] of Object.entries(mappings)) {
    const value = readLeadPath(lead, sourcePath);
    if (value !== undefined && value !== null && value !== "") {
      mappedFields[crmField] = value;
    }
  }

  return mappedFields;
}

function readLeadPath(lead: NormalizedCrmLead, path: string): unknown {
  const sourceLookup: Record<string, unknown> = {
    "visitor.name": lead.name,
    "visitor.email": lead.email,
    "visitor.userId": lead.userId,
    "visitor.phone": lead.phone,
    "lead.source": lead.source.toLowerCase(),
    "lead.channel": lead.channel,
    "lead.status": mapLeadStatusValue(lead.status),
    "lead.id": lead.leadId,
    "lead.companyName": lead.companyName,
    "lead.message": lead.message,
    "workspace.id": lead.workspaceId,
    "chat.id": lead.chatId,
    "chat.summary": lead.chatSummary,
    "chat.transcript": lead.transcript,
    "chat.assignedAgentName": lead.assignedAgentName,
    "chat.sessionId": lead.chatSessionId,
    "tracking.pageUrl": lead.pageUrl,
    "tracking.browser": lead.browser,
    "tracking.device": lead.device,
    "tracking.country": lead.country,
    "tracking.city": lead.city,
    "custom.propertyName": lead.customFields.propertyName,
    "custom.propertyDomain": lead.customFields.propertyDomain,
  };

  return sourceLookup[path];
}

/** Maps DB lead source + channel to CRM field-mapping source (CrmLeadSource). */
function mapCrmLeadSource(leadSource: LeadSource, channelRaw: string): CrmLeadSource {
  const channel = String(channelRaw ?? "").trim().toLowerCase();

  if (channel.includes("whatsapp") || channel === "wa") {
    return CrmLeadSource.WHATSAPP;
  }
  if (channel.includes("instagram") || channel === "ig") {
    return CrmLeadSource.INSTAGRAM;
  }
  if (channel.includes("facebook") || channel.includes("messenger") || channel.includes("fb")) {
    return CrmLeadSource.FACEBOOK;
  }

  switch (leadSource) {
    case LeadSource.MANUAL:
      return CrmLeadSource.MANUAL;
    case LeadSource.API:
      return CrmLeadSource.API;
    case LeadSource.FACEBOOK_ADS:
      return CrmLeadSource.FACEBOOK;
    case LeadSource.WEBSITE:
    case LeadSource.CHAT:
    case LeadSource.OFFLINE_FORM:
    case LeadSource.GOOGLE_ADS:
    case LeadSource.REFERRAL:
    default:
      return CrmLeadSource.WEBSITE;
  }
}

function mapLeadChannel(channel: string): string {
  const normalized = channel.trim().toLowerCase();
  if (normalized === "manual") return "manual";
  if (normalized === "web_widget") return "web_widget";
  if (channel === "MANUAL") return "manual";
  if (channel === "WEB_WIDGET") return "web_widget";
  return normalized || "unknown";
}

function mapLeadStatusValue(status: string): string {
  return status;
}

function mapBackfillSource(source?: string) {
  const normalized = source?.trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === CrmLeadSource.WEBSITE) {
    const sources: LeadSource[] = [LeadSource.CHAT, LeadSource.WEBSITE];
    return { in: sources };
  }

  if (normalized === CrmLeadSource.MANUAL) {
    return LeadSource.MANUAL;
  }

  if (normalized === CrmLeadSource.WHATSAPP) {
    return LeadSource.API;
  }

  throw new AppError(400, "Unsupported backfill source");
}

function summarizeTranscript(transcript: string): string | null {
  if (!transcript.trim()) {
    return null;
  }

  return transcript.length > 500 ? `${transcript.slice(0, 497)}...` : transcript;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof HubSpotApiError) {
    const status = error.statusCode ? `HTTP ${error.statusCode}` : "HubSpot error";
    const category = error.category ? ` [${error.category}]` : "";
    return `${status}${category}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function logSyncFailure(params: {
  error: unknown;
  provider: CrmProvider;
  companyId: string;
  leadId: string;
  event: string;
  trigger: CrmSyncTrigger;
  action: CrmSyncAction;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
  willRetry: boolean;
  status: Exclude<CrmSyncStatus, typeof CrmSyncStatus.SUCCESS>;
  disconnectIntegration: boolean;
}) {
  const base = {
    companyId: params.companyId,
    leadId: params.leadId,
    provider: params.provider,
    event: params.event,
    trigger: params.trigger,
    action: params.action,
    status: params.status,
    attempt: params.attempt,
    maxAttempts: params.maxAttempts,
    retryCount: params.retryCount,
    willRetry: params.willRetry,
    disconnectIntegration: params.disconnectIntegration,
    error: getErrorMessage(params.error),
  };

  if (params.provider === CrmProvider.HUBSPOT && params.error instanceof HubSpotApiError) {
    crmLog.warn("crm.lead_sync.failed", {
      ...base,
      hubSpotStatusCode: params.error.statusCode ?? null,
      hubSpotCategory: params.error.category ?? null,
      hubSpotAuthError: params.error.isAuthError,
      hubSpotRateLimited: params.error.isRateLimit,
    });
    return;
  }

  crmLog.warn("crm.lead_sync.failed", base);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null));
}
