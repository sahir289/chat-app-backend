import { AuditAction, ResourceType } from "@prisma/client";
import type { Request, Response } from "express";
import { leadService } from "../services/leadService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { leadRepository } from "../repositories/leadRepository";
import { crmRepository } from "../repositories/crmRepository";
import { crmService } from "../services/crm/crm.service";
import { successResponse, errorResponse } from "../utils/apiResponse";
import { companyService } from "../services/companyService";
import {
  assertAgentCanAccessPropertyOrThrow,
  getAgentPropertyFilter,
} from "../utils/agentPropertyFilter";
import { resolveLeadCrmUiStatus } from "../services/crm/lead-crm-ui-status";
import { extractIPAddress } from "../utils/requestMeta";
import { writeSecurityAuditLog } from "../services/securityAuditService";

function serializeLead(lead: any) {
  return {
    ...lead,
    source: typeof lead.source === "string" ? lead.source.toLowerCase() : lead.source,
    channel: typeof lead.channel === "string" ? lead.channel : (lead.source === "MANUAL" ? "manual" : "web_widget"),
    status: lead.status ?? "NEW",
  };
}

export async function createLeadHandler(
  req: Request,
  res: Response
) {
  const { chatId, widgetKey, sessionId, fullName, email, phone } = req.body;

  const normalizedPhone = String(phone).trim();

  const data = await leadService.createLead({
    chatId,
    widgetKey,
    sessionId,
    fullName,
    email,
    phone: normalizedPhone,
  });

  void writeSecurityAuditLog({
    companyId: data.companyId,
    userId: null,
    action: AuditAction.CREATE,
    resourceType: ResourceType.LEAD,
    resourceId: data.id,
    metadata: { source: "web_widget_public", chatId },
    ipAddress: extractIPAddress(req),
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
  });

  const { companyId: _companyId, ...publicLead } = data;
  return successResponse(res, { data: publicLead, statusCode: 201 });
}

export async function createManualLeadHandler(
  req: Request,
  res: Response
) {
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  const userId = (req as AuthenticatedRequest).user?.id;
  if (!companyId || !userId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  const { propertyId, fullName, email, phone } = req.body as {
    propertyId: string;
    fullName: string;
    email: string;
    phone?: string;
  };

  await assertAgentCanAccessPropertyOrThrow(userId, propertyId);

  const data = await leadService.createManualLead({
    companyId,
    propertyId,
    fullName,
    email,
    phone,
  });

  return successResponse(res, { data, statusCode: 201 });
}

export async function importLeadsCsvHandler(
  req: Request,
  res: Response
) {
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  const userId = (req as AuthenticatedRequest).user?.id;
  if (!companyId || !userId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  const propertyId = typeof req.body?.propertyId === "string" ? req.body.propertyId.trim() : "";
  if (!propertyId) {
    return errorResponse(res, { message: "propertyId is required", statusCode: 400 });
  }

  await assertAgentCanAccessPropertyOrThrow(userId, propertyId);

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    return errorResponse(res, { message: "CSV file is required", statusCode: 400 });
  }

  const result = await leadService.importManualLeadsFromCsv({
    companyId,
    propertyId,
    csvText: file.buffer.toString("utf8"),
  });

  return successResponse(res, { data: result, statusCode: 201 });
}

export async function listLeadsHandler(
  req: Request,
  res: Response
) {
  const userId = (req as AuthenticatedRequest).user?.id;
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }
  if (!userId) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
  }

  const {
    propertyId,
    chatId,
    page = "1",
    limit = "50",
    search,
    startDate,
    endDate
  } = req.query;
  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 50;

  // Get company to check isPro status
  const company = await companyService.getById(companyId);
  const isPro = company.isPro || false;

  // Get agent property filter
  const propertyFilter = await getAgentPropertyFilter(userId);

  // Build where clause with filters
  const where: any = { companyId };

  if (propertyId) where.propertyId = propertyId as string;
  if (chatId) where.chatId = chatId as string;

  // Search filter - search in fullName, email, and phone only
  if (search && typeof search === "string" && search.trim()) {
    const searchTerm = search.trim();
    where.OR = [
      { fullName: { contains: searchTerm, mode: "insensitive" } },
      { email: { contains: searchTerm, mode: "insensitive" } },
      { phone: { contains: searchTerm, mode: "insensitive" } },
    ];
  }

  // Date range filter
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      where.createdAt.gte = start;
    }
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  // Helper function to apply masking for FREE users
  const applyMasking = (leads: any[], skip: number) => {
    return leads.map((lead, index) => {
      const globalIndex = skip + index;

      if (!isPro && globalIndex >= 10) {
        // Mask sensitive fields for leads > 10
        return {
          ...lead,
          email: "***@***.***",
          phone: lead.phone ? "***-***-****" : null,
          isBlurred: true,
        };
      }

      return {
        ...lead,
        isBlurred: false,
      };
    });
  };

  const withCrmStatus = async (leads: any[]) => {
    const leadIds = leads.map((lead) => lead.id).filter(Boolean);
    const routing = await crmService.getLeadSyncRouting(companyId);
    const activeProvider = routing.effectiveProvider;
    if (!activeProvider) {
      return leads.map((lead) => ({
        ...serializeLead(lead),
        crmStatus: "Not synced",
        crmProvider: null,
        crmLastSyncedAt: lead.syncedAt ?? null,
        crmLastError: null,
        crmContactId: null,
      }));
    }
    const [links, logs] = await Promise.all([
      crmRepository.findLeadLinksForLeads(companyId, leadIds, activeProvider),
      crmRepository.findLatestSyncLogsForLeads(companyId, leadIds, activeProvider),
    ]);

    const linkByLeadId = new Map<string, any>();
    for (const link of links) {
      if (!linkByLeadId.has(link.leadId)) {
        linkByLeadId.set(link.leadId, link);
      }
    }

    const latestLogByLeadId = new Map<string, any>();
    for (const log of logs) {
      if (log.leadId && !latestLogByLeadId.has(log.leadId)) {
        latestLogByLeadId.set(log.leadId, log);
      }
    }

    return leads.map((lead) => {
      const link = linkByLeadId.get(lead.id);
      const log = latestLogByLeadId.get(lead.id);
      const crmStatus = resolveLeadCrmUiStatus(link, log);

      return {
        ...serializeLead(lead),
        crmStatus,
        crmProvider: activeProvider,
        crmLastSyncedAt: link?.lastSyncedAt ?? lead.syncedAt ?? null,
        crmLastError: log?.status === "FAILED" ? log.errorMessage : null,
        crmContactId: link?.crmContactId ?? null,
      };
    });
  };

  // Build additional where conditions (excluding propertyId which is handled separately)
  const additionalWhere: any = {};
  if (chatId) additionalWhere.chatId = chatId as string;

  // Apply property filter for agents
  if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null) {
    if (propertyFilter.propertyIds.length === 0) {
      // Agent has no properties assigned, return empty
      return successResponse(res, {
        data: [],
        statusCode: 200,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
        },
      });
    }

    // If specific property requested, check if agent has access
    if (propertyId) {
      if (!propertyFilter.propertyIds.includes(propertyId as string)) {
        return errorResponse(res, { message: "Access denied to this property", statusCode: 403 });
      }
      // Agent has access to this property, use optimized query with single property
      const finalWhere = { ...where, ...additionalWhere };
      // Remove propertyId from where since it's handled by property filter
      delete finalWhere.propertyId;

      const skip = (pageNum - 1) * limitNum;
      const [paginatedLeads, total] = await Promise.all([
        leadRepository.findByCompanyIdWithPropertyFilter(
          companyId,
          [propertyId as string],
          skip,
          limitNum,
          finalWhere
        ),
        leadRepository.countByCompanyIdWithPropertyFilter(
          companyId,
          [propertyId as string],
          finalWhere
        ),
      ]);

      const processedLeads = applyMasking(await withCrmStatus(paginatedLeads), skip);

      return successResponse(res, {
        data: processedLeads,
        statusCode: 200,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } else {
      // Filter to only assigned properties using database query
      const finalWhere = { ...where, ...additionalWhere };
      // Remove propertyId from where since it's handled by property filter
      delete finalWhere.propertyId;

      const skip = (pageNum - 1) * limitNum;
      const [paginatedLeads, total] = await Promise.all([
        leadRepository.findByCompanyIdWithPropertyFilter(
          companyId,
          propertyFilter.propertyIds!,
          skip,
          limitNum,
          finalWhere
        ),
        leadRepository.countByCompanyIdWithPropertyFilter(
          companyId,
          propertyFilter.propertyIds!,
          finalWhere
        ),
      ]);

      const processedLeads = applyMasking(await withCrmStatus(paginatedLeads), skip);

      return successResponse(res, {
        data: processedLeads,
        statusCode: 200,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    }
  }

  // For non-agents or agents without property filters, use standard queries with filters
  const finalWhere = { ...where, ...additionalWhere };
  const skip = (pageNum - 1) * limitNum;

  const [paginatedLeads, total] = await Promise.all([
    leadRepository.findManyWithFilters(finalWhere, skip, limitNum),
    leadRepository.countWithFilters(finalWhere),
  ]);

  const processedLeads = applyMasking(await withCrmStatus(paginatedLeads), skip);

  return successResponse(res, {
    data: processedLeads,
    statusCode: 200,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
}

export async function getLeadHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  if (!id) {
    return errorResponse(res, { message: "id is required", statusCode: 400 });
  }

  const lead = await leadRepository.findById(id, companyId || "");
  if (!lead) {
    return errorResponse(res, { message: "Lead not found", statusCode: 404 });
  }

  const userId = (req as AuthenticatedRequest).user?.id;
  if (userId) {
    await assertAgentCanAccessPropertyOrThrow(userId, lead.propertyId);
  }

  return successResponse(res, { data: serializeLead(lead), statusCode: 200 });
}

