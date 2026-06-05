import type { Response } from "express";
import { CrmProvider, type CrmSyncStatus } from "@prisma/client";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { successResponse } from "../utils/apiResponse";
import { crmService } from "../services/crm/crm.service";
import type { CrmConnectProvider } from "../services/crm/crm.types";

export async function connectCrmIntegrationHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user!.id;

  const body = req.body as {
    provider: CrmConnectProvider;
    webhookUrl?: string;
    webhookSecret?: string;
    generateWebhookSecret?: boolean;
    serviceKeyToken?: string;
    portalId?: string;
  };

  const payload = await crmService.connectIntegration({
    companyId,
    userId,
    provider: body.provider,
    webhookUrl: body.webhookUrl,
    webhookSecret: body.webhookSecret,
    generateWebhookSecret: body.generateWebhookSecret,
    serviceKeyToken: body.serviceKeyToken,
    portalId: body.portalId,
  });

  return successResponse(res, {
    data: {
      ...payload.integration,
      ...(payload.webhookSecretRevealOnce ? { webhookSecretRevealOnce: payload.webhookSecretRevealOnce } : {}),
    },
    statusCode: 201,
  });
}

export async function listCrmIntegrationsHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const payload = await crmService.listIntegrations(companyId);
  return successResponse(res, { data: payload, statusCode: 200 });
}

export async function setPrimaryLeadSyncProviderHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user!.id;

  const leadSync = await crmService.setPrimaryLeadSyncProvider({
    companyId,
    userId,
    provider: req.body.provider,
  });
  return successResponse(res, { data: leadSync, statusCode: 200 });
}

export async function disconnectCrmIntegrationHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user!.id;

  await crmService.disconnectIntegration(companyId, userId, req.params.id);
  return successResponse(res, { message: "CRM integration disconnected", statusCode: 200 });
}

export async function testCrmWebhookHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user!.id;

  const provider = req.body.provider ?? CrmProvider.WEBHOOK;
  const result = await crmService.testConnection(companyId, userId, provider);
  return successResponse(res, { data: result, statusCode: 200 });
}

export async function syncLeadToCrmHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const result = await crmService.syncLeadManual(companyId, req.params.leadId, req.body.provider);
  return successResponse(res, { data: result, statusCode: 200 });
}

export async function syncLeadsBulkToCrmHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const result = await crmService.syncLeadsBulk(companyId, req.body.leadIds, req.body.provider);
  return successResponse(res, { data: result, statusCode: 200 });
}

export async function backfillUnsyncedLeadsToCrmHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const result = await crmService.backfillUnsyncedLeads(companyId, {
    provider: req.body.provider,
    source: req.body.source,
    propertyId: req.body.propertyId,
    limit: req.body.limit,
  });
  return successResponse(res, { data: result, statusCode: 200 });
}

export async function listCrmSyncLogsHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const q = req.query as {
    provider?: CrmProvider;
    status?: CrmSyncStatus;
    leadId?: string;
    limit?: number;
  };
  const logs = await crmService.listSyncLogs(companyId, {
    provider: q.provider,
    status: q.status,
    leadId: q.leadId,
    limit: q.limit,
  });
  return successResponse(res, { data: logs, statusCode: 200 });
}

export async function getCrmFieldsHandler(req: AuthenticatedRequest, res: Response) {
  const provider = req.params.provider as CrmProvider;
  return successResponse(res, { data: crmService.getFields(provider), statusCode: 200 });
}

export async function saveCrmFieldMappingHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user!.id;

  const mapping = await crmService.saveFieldMapping({
    companyId,
    userId,
    provider: req.body.provider,
    source: req.body.source,
    mappings: req.body.mappings,
  });

  return successResponse(res, { data: mapping, statusCode: 200 });
}

export async function listCrmFieldMappingsHandler(req: AuthenticatedRequest, res: Response) {
  const companyId = getCompanyIdOrThrow(req);
  const provider = (req.query as { provider?: CrmProvider }).provider;
  const mappings = await crmService.getFieldMappings(companyId, provider);
  return successResponse(res, { data: mappings, statusCode: 200 });
}
