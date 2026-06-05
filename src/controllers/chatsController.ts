import type { Response } from "express";
import { Role } from "@prisma/client";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";
import { chatService } from "../services/chatService";
import { chatRepository } from "../repositories/chatRepository";
import { isVisitorOnline, getIO } from "../socket/index";
import { successResponse, errorResponse } from "../utils/apiResponse";
import {
  assertAgentCanAccessChatOrThrow,
  assertAgentCanAccessPropertyOrThrow,
  getAgentPropertyFilter,
  checkAgentPropertyAccess,
  shouldRestrictAgentToAssignedChats,
} from "../utils/agentPropertyFilter";
import { visitorEventRepository } from "../repositories/visitorEventRepository";
import { visitorRepository } from "../repositories/visitorRepository";
import { chatRatingRepository } from "../repositories/chatRatingRepository";
import prisma from "../lib/prisma";
import { getPropertyDefaultAgents } from "../helpers/propertyDefaultAgent";


export async function listChatsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

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

  // Get agent property filter
  const propertyFilter = userId ? await getAgentPropertyFilter(userId) : { propertyIds: null, isFiltered: false };
  const assignedOnly = userId ? await shouldRestrictAgentToAssignedChats(userId) : false;

  // Build where clause
  const where: any = {
    companyId,
    deletedAt: null,
  };

  if (status) {
    where.status = status;
  }

  // Apply property filter for agents
  if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null) {
    if (propertyFilter.propertyIds.length === 0) {
      // Agent has no properties assigned, return empty
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
      // If specific property requested, check if agent has access
      if (!propertyFilter.propertyIds.includes(propertyId as string)) {
        return errorResponse(res, { message: "Access denied to this property", statusCode: 403 });
      }
      where.propertyId = propertyId;
    } else {
      // Filter to only assigned properties
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
  const defaultAgentsByProperty = await getPropertyDefaultAgents(
    companyId,
    chats.map((chat) => chat.propertyId)
  );

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

      return {
        id: chat.id,
        sessionId: chat.sessionId,
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
  const companyId = req.user?.companyId;
  const currentUserId = req.user?.id;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const { propertyId } = req.query;

  // Get agent property filter
  const propertyFilter = currentUserId ? await getAgentPropertyFilter(currentUserId) : { propertyIds: null, isFiltered: false };
  const assignedOnly = currentUserId
    ? await shouldRestrictAgentToAssignedChats(currentUserId)
    : false;

  // Apply property filter for agents
  let finalPropertyId: string | undefined = typeof propertyId === "string" ? propertyId : undefined;

  if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null) {
    if (propertyFilter.propertyIds.length === 0) {
      // Agent has no properties assigned, return empty
      return successResponse(res, { statusCode: 200, data: [] });
    }

    if (finalPropertyId) {
      // If specific property requested, check if agent has access
      if (!propertyFilter.propertyIds.includes(finalPropertyId)) {
        throw new AppError(403, "Access denied to this property");
      }
    } else {
      // If no specific property requested, filter to first assigned property (or all if multiple)
      // For inbox, we'll filter the results after fetching
      finalPropertyId = undefined; // Let service fetch all, then filter
    }
  }

  const items = await chatService.getInbox(companyId, finalPropertyId, currentUserId);

  // Filter results by agent property access if needed
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
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  const chat = await chatRepository.findById(id, companyId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }

  // Check agent property access
  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  // Get visitor info - handle errors gracefully
  let visitorInfo = null;
  try {
    visitorInfo = await visitorEventRepository.getVisitorInfoByChatId(id, companyId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Continue without visitor info rather than failing the entire request
  }

  let visitorRecord = null;
  try {
    visitorRecord = chat.visitorId
      ? await visitorRepository.findById(chat.visitorId)
      : await visitorRepository.findBySessionId(chat.sessionId, companyId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Continue without visitor fallback rather than failing the entire request
  }

  // Get messages - handle errors gracefully
  // Load more messages initially (500) to reduce pagination needs for most chats
  let messagesResult;
  try {
    messagesResult = await chatService.getMessages(id, companyId, 1, 500);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Return empty messages array if there's an error
    messagesResult = {
      messages: [],
      total: 0,
      page: 1,
      limit: 500,
    };
  }

  // Check if visitor is currently online - verify sockets are actually connected
  const io = getIO();
  const isOnline = await isVisitorOnline(id, io);

  // Get rating if available
  let rating = null;
  try {
    const chatRating = await chatRatingRepository.findByChatId(id);
    if (chatRating) {
      rating = {
        rating: chatRating.rating,
        comment: chatRating.comment,
        createdAt: chatRating.createdAt,
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Continue without rating rather than failing the entire request
  }

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

  const responseData = {
    chat: {
      id: chat.id,
      sessionId: chat.sessionId,
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
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  if (!chatId) {
    throw new AppError(400, "chatId is required");
  }

  const chat = await chatRepository.findById(chatId, companyId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }
  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  const result = await chatService.assignAgent(chatId, companyId, agentId || null);
  const io = getIO();
  if (chat) {
    // Emit standardized chat_assigned event
    io.to(`chat:${chatId}`).emit("chat_assigned", { chatId, agentId });
    // Also emit for backward compatibility
    io.to(`chat:${chatId}`).emit("chat:assigned", { chatId, agentId });
    io.to(`property:${chat.propertyId}`).emit("chat:updated", { chatId });
  }

  return successResponse(res, { statusCode: 200, data: result });
}

export async function listAssignableAgentsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  const propertyId =
    typeof req.query.propertyId === "string" ? req.query.propertyId : undefined;

  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  if (!propertyId) {
    throw new AppError(400, "propertyId is required");
  }

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
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

  if (!chatId) {
    throw new AppError(400, "chatId is required");
  }

  const chat = await chatRepository.findById(chatId, companyId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }
  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  const result = await chatService.closeChat(chatId, companyId);
  const io = getIO();
  if (chat) {
    io.to(`chat:${chatId}`).emit("chat:closed", { chatId });
    io.to(`property:${chat.propertyId}`).emit("chat:updated", { chatId });
  }

  return successResponse(res, { statusCode: 200, data: result });
}

export async function deleteChatHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const companyId = req.user?.companyId;
  if (!companyId) {
    throw new AppError(403, "Forbidden: Company context required");
  }

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
