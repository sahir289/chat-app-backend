import type { Response } from "express";
import { Role } from "@prisma/client";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { AppError } from "../utils/appError";
import { chatService } from "../services/chatService";
import { chatRepository } from "../repositories/chatRepository";
import { isVisitorOnline, getIO } from "../socket/index";
import { successResponse, errorResponse } from "../utils/apiResponse";
import {
  assertAgentCanAccessChatOrThrow,
  assertAgentCanAccessPropertyOrThrow,
  getAgentPropertyFilter,
  shouldRestrictAgentToAssignedChats,
} from "../utils/agentPropertyFilter";
import { visitorEventRepository } from "../repositories/visitorEventRepository";
import { visitorRepository } from "../repositories/visitorRepository";
import { chatRatingRepository } from "../repositories/chatRatingRepository";
import prisma from "../lib/prisma";
import { getPropertyDefaultAgents } from "../helpers/propertyDefaultAgent";
import { leadRepository, type LeadSessionSummary } from "../repositories/leadRepository";
import { getLeadVisitorName, getVisitorFirstName } from "../utils/leadVisitorName";

const EMPTY_MESSAGES_RESULT = {
  messages: [],
  nextCursor: null,
  hasMore: false,
  limit: 50,
};

function resolveVisitorFullName(input: {
  lead?: { fullName?: string | null } | null;
  visitor?: { name?: string | null } | null;
}): string | null {
  return input.lead?.fullName?.trim() || input.visitor?.name?.trim() || null;
}

function resolveVisitorFirstName(input: {
  lead?: { fullName?: string | null } | null;
  visitor?: { name?: string | null } | null;
}): string | null {
  return getLeadVisitorName(input.lead) ?? getVisitorFirstName(input.visitor?.name);
}

function leadSessionKey(propertyId: string, sessionId: string): string {
  return `${propertyId}:${sessionId}`;
}

function buildLatestLeadBySession(leads: LeadSessionSummary[]): Map<string, LeadSessionSummary> {
  const map = new Map<string, LeadSessionSummary>();
  for (const lead of leads) {
    if (!lead.chat) continue;
    const key = leadSessionKey(lead.chat.propertyId, lead.chat.sessionId);
    if (!map.has(key)) {
      map.set(key, lead);
    }
  }
  return map;
}

export async function listChatsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user?.id;

  const {
    status,
    agentId,
    propertyId,
    unassigned,
    page = "1",
    limit = "50",
  } = req.query;

  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 50;
  const skip = (pageNum - 1) * limitNum;

  const propertyFilter = userId ? await getAgentPropertyFilter(userId) : { propertyIds: null, isFiltered: false };
  const assignedOnly = userId ? await shouldRestrictAgentToAssignedChats(userId) : false;

  const where: any = {
    companyId,
    deletedAt: null,
  };

  if (status) {
    where.status = status;
  }

  if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null) {
    if (propertyFilter.propertyIds.length === 0) {
      return successResponse(res, {
        statusCode: 200,
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
        },
      });
    }

    if (propertyId) {
      if (!propertyFilter.propertyIds.includes(propertyId as string)) {
        return errorResponse(res, { message: "Access denied to this property", statusCode: 403 });
      }
      where.propertyId = propertyId;
    } else {
      where.propertyId = { in: propertyFilter.propertyIds };
    }
  } else if (propertyId) {
    where.propertyId = propertyId;
  }

  if (assignedOnly && userId) {
    if (unassigned === "true") {
      return successResponse(res, {
        statusCode: 200,
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
        },
      });
    }

    where.agentId = userId;
  } else if (agentId) {
    where.agentId = agentId;
  } else if (unassigned === "true") {
    where.agentId = null;
  }

  const [chats, total] = await Promise.all([
    chatRepository.findManyWithFilters(where, skip, limitNum),
    chatRepository.countWithFilters(where),
  ]);
  const [defaultAgentsByProperty, latestLeadBySession] = await Promise.all([
    getPropertyDefaultAgents(
      companyId,
      chats.map((chat) => chat.propertyId)
    ),
    leadRepository.findLatestByChatSessions({
      companyId,
      propertyIds: chats.map((chat) => chat.propertyId),
      sessionIds: chats.map((chat) => chat.sessionId),
    }).then(buildLatestLeadBySession),
  ]);

  return successResponse(res, {
    statusCode: 200,
    data: chats.map((chat) => {
      const defaultAgent = defaultAgentsByProperty.get(chat.propertyId) ?? null;
      const effectiveAgent =
        chat.agent ??
        (defaultAgent
          ? {
              id: defaultAgent.id,
              name: defaultAgent.name,
              email: defaultAgent.email,
            }
          : null);

      const lead = chat.leads?.[0] ?? latestLeadBySession.get(leadSessionKey(chat.propertyId, chat.sessionId)) ?? null;

      return {
        id: chat.id,
        sessionId: chat.sessionId,
        visitorName: resolveVisitorFirstName({ lead, visitor: chat.visitor }),
        visitorFullName: resolveVisitorFullName({ lead, visitor: chat.visitor }),
        lead: chat.leads?.[0] ?? null,
        status: chat.status,
        propertyId: chat.propertyId,
        visitorId: chat.visitorId,
        agentId: chat.agentId,
        effectiveAgentId: chat.agentId ?? defaultAgent?.id ?? null,
        assignmentSource: chat.agentId ? "chat" : defaultAgent ? "property" : "none",
        visitor: chat.visitor,
        agent: chat.agent,
        effectiveAgent,
        defaultAgent,
        lastMessage: chat.messages[0] || null,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      };
    }),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
}

export async function getInboxHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);
  const currentUserId = req.user?.id;
  const { propertyId } = req.query;

  const propertyFilter = currentUserId ? await getAgentPropertyFilter(currentUserId) : { propertyIds: null, isFiltered: false };
  const assignedOnly = currentUserId
    ? await shouldRestrictAgentToAssignedChats(currentUserId)
    : false;

  let finalPropertyId: string | undefined = typeof propertyId === "string" ? propertyId : undefined;

  if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null) {
    if (propertyFilter.propertyIds.length === 0) {
      return successResponse(res, { statusCode: 200, data: [] });
    }

    if (finalPropertyId) {
      if (!propertyFilter.propertyIds.includes(finalPropertyId)) {
        throw new AppError(403, "Access denied to this property");
      }
    } else {
      finalPropertyId = undefined;
    }
  }

  const items = await chatService.getInbox(companyId, finalPropertyId, currentUserId);

  let filteredItems = items;
  if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null && propertyFilter.propertyIds.length > 0 && !finalPropertyId) {
    filteredItems = items.filter(item => propertyFilter.propertyIds!.includes(item.propertyId));
  }
  if (assignedOnly && currentUserId) {
    filteredItems = filteredItems.filter((item) => item.agentId === currentUserId);
  }

  const defaultAgentsByProperty = await getPropertyDefaultAgents(
    companyId,
    filteredItems.map((item) => item.propertyId)
  );

  return successResponse(res, {
    statusCode: 200,
    data: filteredItems.map((item) => {
      const defaultAgent = defaultAgentsByProperty.get(item.propertyId) ?? null;
      const effectiveAgent =
        item.agent ??
        (defaultAgent
          ? {
              id: defaultAgent.id,
              name: defaultAgent.name,
              email: defaultAgent.email,
            }
          : null);

      return {
        ...item,
        effectiveAgentId: item.agentId ?? defaultAgent?.id ?? null,
        assignmentSource: item.agentId ? "chat" : defaultAgent ? "property" : "none",
        effectiveAgent,
        defaultAgent,
      };
    }),
  });
}

export async function getChatHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user?.id;

  const chat = await chatRepository.findById(id, companyId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }

  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  const [visitorInfo, visitorRecord, messagesResult, chatRating, chatLead] = await Promise.all([
    visitorEventRepository.getVisitorInfoByChatId(id, companyId).catch(() => null),
    chat.visitorId
      ? visitorRepository.findById(chat.visitorId).catch(() => null)
      : visitorRepository.findBySessionId(chat.sessionId, companyId).catch(() => null),
    chatService.getMessagesCursor(id, companyId).catch(() => EMPTY_MESSAGES_RESULT),
    chatRatingRepository.findByChatId(id).catch(() => null),
    leadRepository.findByChatId(id, companyId).catch(() => null),
  ]);
  const lead =
    chatLead ??
    (await leadRepository
      .findLatestByChatSession({
        companyId,
        propertyId: chat.propertyId,
        sessionId: chat.sessionId,
      })
      .catch(() => null));

  const io = getIO();
  const isOnline = await isVisitorOnline(id, io);

  const rating = chatRating
    ? {
        rating: chatRating.rating,
        comment: chatRating.comment,
        createdAt: chatRating.createdAt,
      }
    : null;

  const defaultAgentsByProperty = await getPropertyDefaultAgents(companyId, [chat.propertyId]);
  const defaultAgent = defaultAgentsByProperty.get(chat.propertyId) ?? null;
  const explicitAgent = chat.agentId
    ? await prisma.user.findFirst({
        where: {
          id: chat.agentId,
          companyId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      })
    : null;
  const effectiveAgent = explicitAgent ?? defaultAgent;
  const visitorFullName = resolveVisitorFullName({ lead, visitor: visitorRecord });

  const responseData = {
    chat: {
      id: chat.id,
      sessionId: chat.sessionId,
      visitorName: getLeadVisitorName(lead) ?? getVisitorFirstName(visitorRecord?.name),
      visitorFullName,
      lead: lead
        ? {
            id: lead.id,
            fullName: lead.fullName,
          }
        : null,
      status: chat.status,
      propertyId: chat.propertyId,
      visitorId: chat.visitorId,
      agentId: chat.agentId,
      effectiveAgentId: chat.agentId ?? defaultAgent?.id ?? null,
      assignmentSource: chat.agentId ? "chat" : defaultAgent ? "property" : "none",
      defaultAgent,
      effectiveAgent,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      isOnline,
    },
    visitor: visitorInfo || visitorRecord ? {
      sessionId: chat.sessionId,
      device: visitorInfo?.device ?? visitorRecord?.device ?? null,
      browser: visitorInfo?.browser ?? visitorRecord?.browser ?? null,
      country: visitorInfo?.country ?? visitorRecord?.country ?? null,
      url: visitorInfo?.url ?? null,
      referrer: visitorInfo?.referrer ?? null,
      userAgent: visitorInfo?.userAgent ?? visitorRecord?.userAgent ?? null,
      ipAddress: visitorInfo?.ipAddress ?? visitorRecord?.ipAddress ?? null,
    } : null,
    messages: messagesResult.messages,
    messagesPagination: {
      nextCursor: messagesResult.nextCursor,
      hasMore: messagesResult.hasMore,
      limit: messagesResult.limit,
    },
    rating,
  };

  return successResponse(res, {
    statusCode: 200,
    data: responseData,
  });
}

export async function assignChatHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { chatId, agentId } = req.body ?? {};
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user?.id;

  const chat = await chatRepository.findById(chatId, companyId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }
  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  const result = await chatService.assignAgent(chatId, companyId, agentId || null);
  const io = getIO();
  const assignedAgent = agentId
    ? await prisma.user.findUnique({
        where: { id: agentId },
        select: { name: true, email: true },
      })
    : null;
  const agentName = assignedAgent?.name || assignedAgent?.email || null;
  const assignmentPayload = { chatId, agentId, agentName };

  io.to(`chat:${chatId}`).emit("chat_assigned", assignmentPayload);
  io.to(`chat:${chatId}`).emit("chat:assigned", assignmentPayload);
  io.to(`property:${chat.propertyId}`).emit("chat:updated", { chatId });

  return successResponse(res, { statusCode: 200, data: result });
}

export async function listAssignableAgentsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user?.id;
  const propertyId = req.query.propertyId as string;

  if (userId) {
    await assertAgentCanAccessPropertyOrThrow(userId, propertyId);
  }

  const agents = await prisma.user.findMany({
    where: {
      companyId,
      role: Role.AGENT,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      lastSeen: true,
      agentPropertyAccess: {
        where: { propertyId },
        select: { propertyId: true },
      },
      agentAvailability: {
        select: {
          status: true,
          currentChats: true,
          maxChats: true,
        },
      },
    },
    orderBy: [
      {
        name: "asc",
      },
      {
        email: "asc",
      },
    ],
  });

  const data = agents
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      lastSeen: agent.lastSeen,
      availabilityStatus: agent.agentAvailability?.status ?? "OFFLINE",
      currentChats: agent.agentAvailability?.currentChats ?? 0,
      maxChats: agent.agentAvailability?.maxChats ?? 0,
      hasCapacity:
        agent.agentAvailability?.maxChats != null
          ? (agent.agentAvailability?.currentChats ?? 0) < agent.agentAvailability.maxChats
          : true,
      hasPropertyAccess:
        agent.role === Role.ADMIN
          ? true
          : (agent as any).agentPropertyAccess?.length > 0,
    }))
    .sort((a, b) => {
      const aOnline = a.availabilityStatus === "ONLINE" ? 1 : 0;
      const bOnline = b.availabilityStatus === "ONLINE" ? 1 : 0;
      if (aOnline !== bOnline) {
        return bOnline - aOnline;
      }
      if (a.currentChats !== b.currentChats) {
        return a.currentChats - b.currentChats;
      }
      return (a.name || a.email).localeCompare(b.name || b.email);
    });

  const defaultAgentsByProperty = await getPropertyDefaultAgents(companyId, [propertyId]);
  const defaultAgent = defaultAgentsByProperty.get(propertyId) ?? null;

  return successResponse(res, {
    statusCode: 200,
    data: {
      agents: data,
      defaultAgentId: defaultAgent?.id ?? null,
      defaultAgent,
      allowUnassign: !defaultAgent,
    },
  });
}

export async function closeChatHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { chatId } = req.body ?? {};
  const companyId = getCompanyIdOrThrow(req);
  const userId = req.user?.id;

  const chat = await chatRepository.findById(chatId, companyId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }
  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  const result = await chatService.closeChat(chatId, companyId);
  const io = getIO();
  io.to(`chat:${chatId}`).emit("chat:closed", { chatId });
  io.to(`property:${chat.propertyId}`).emit("chat:updated", { chatId });

  return successResponse(res, { statusCode: 200, data: result });
}

export async function deleteChatHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const companyId = getCompanyIdOrThrow(req);

  const chat = await chatRepository.findById(id, companyId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }

  const userId = req.user?.id;
  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  await chatRepository.softDeleteById(id);

  return successResponse(res, { statusCode: 200, data: { success: true } });
}
