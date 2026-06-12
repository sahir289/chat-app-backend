import type { Request, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { chatService } from "../services/chatService";
import { messageRepository } from "../repositories/messageRepository";
import { chatRepository } from "../repositories/chatRepository";
import { attachmentRepository } from "../repositories/attachmentRepository";
import { userRepository } from "../repositories/userRepository";
import { Role, SenderType } from "@prisma/client";
import { successResponse, errorResponse } from "../utils/apiResponse";
import { getIO, broadcastMessage, SOCKET_EVENTS, isVisitorOnline } from "../socket/index";
import { getChatRoom, getPropertyRoom } from "../socket/helpers";
import { assertAgentCanAccessChatOrThrow } from "../utils/agentPropertyFilter";
import { validateMessageLength } from "../utils/messageValidation";
import { getPresignedUrl } from "../services/s3Service";
import { DEFAULT_MESSAGES_LIMIT } from "../constants/messagePagination";

export async function getMessagesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const chatId = (req.params.chatId || req.params.id) as string;
  const companyId = req.user?.companyId;
  const userId = req.user?.id;

  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  const chat = await chatRepository.findById(chatId, companyId);

  if (!chat) {
    return errorResponse(res, { message: "Chat not found", statusCode: 404 });
  }

  if (userId) {
    await assertAgentCanAccessChatOrThrow(userId, chat);
  }

  const limit = req.query.limit as string | undefined;
  const cursor = req.query.cursor as string | undefined;

  let result;
  try {
    result = await chatService.getMessagesCursor(chatId, companyId, { limit, cursor });
  } catch {
    result = {
      messages: [],
      nextCursor: null,
      hasMore: false,
      limit: DEFAULT_MESSAGES_LIMIT,
    };
  }

  if (!result) {
    result = {
      messages: [],
      nextCursor: null,
      hasMore: false,
      limit: DEFAULT_MESSAGES_LIMIT,
    };
  }

  return successResponse(res, { statusCode: 200, data: result });
}

export async function createMessageHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { chatId, senderType, text, agentId, botName, attachments, metadata } = req.body ?? {};

  const normalizedSenderType = typeof senderType === "string" ? senderType.toUpperCase() : "";
  const companyId = req.user?.companyId;
  const currentUser = req.user;
  
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }
  if (!currentUser) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
  }

  if (!chatId || !text || !normalizedSenderType) {
    return errorResponse(res, {
      message: "chatId, text, and senderType are required",
      statusCode: 400,
    });
  }

  if (normalizedSenderType === SenderType.VISITOR) {
    return errorResponse(res, {
      message: 'senderType "VISITOR" is not supported on this endpoint. Use widget chat APIs for visitor messages.',
      statusCode: 400,
    });
  }

  if (normalizedSenderType !== SenderType.AGENT && normalizedSenderType !== SenderType.BOT) {
    return errorResponse(res, {
      message: "senderType must be AGENT or BOT",
      statusCode: 400,
    });
  }

  // Authenticated dashboard messages use non-visitor limits.
  const validation = validateMessageLength(text, false);
  if (!validation.isValid) {
    return errorResponse(res, {
      message: validation.error || "Message too long",
      statusCode: 400,
    });
  }

  // Verify chat belongs to company
  const chat = await chatRepository.findById(chatId, companyId);
  if (!chat) {
    return errorResponse(res, { message: "Chat not found", statusCode: 404 });
  }

  await assertAgentCanAccessChatOrThrow(currentUser.id, chat);

  // If agent is assigned, only agent can send messages
  if (chat.agentId && normalizedSenderType !== SenderType.AGENT) {
    return errorResponse(res, {
      message: "Only agent can send messages when chat is assigned to an agent",
      statusCode: 403,
    });
  }

  // Check if visitor is online before allowing agent/admin messages
  if (normalizedSenderType === SenderType.AGENT || normalizedSenderType === SenderType.BOT) {
    const visitorOnline = await isVisitorOnline(chatId);
    if (!visitorOnline) {
      return errorResponse(res, {
        message: "Visitor is offline. Messages cannot be sent to offline visitors.",
        statusCode: 403,
      });
    }
  }

  // Determine sender IDs based on senderType
  let finalAgentId: string | null = null;
  let finalBotName: string | null = null;

  if (normalizedSenderType === SenderType.AGENT) {
    // Verify agent is the assigned agent
    // Normalize to use consistent ID field - prefer userId, fallback to id
    const agentUserId = agentId || currentUser.id;
    if (chat.agentId && chat.agentId !== agentUserId) {
      return errorResponse(res, {
        message: "Only the assigned agent can send messages in this chat",
        statusCode: 403,
      });
    }
    finalAgentId = agentUserId || null;
  } else if (normalizedSenderType === SenderType.BOT) {
    // BOT messages are not allowed when agent is assigned
    if (chat.agentId) {
      return errorResponse(res, {
        message: "AI cannot send messages when chat is assigned to an agent",
        statusCode: 403,
      });
    }
    finalBotName = botName || "AI Assistant";
  }

  const message = await messageRepository.create({
    chatId,
    senderType: normalizedSenderType as SenderType,
    text,
    visitorId: null,
    agentId: finalAgentId,
    botName: finalBotName,
    attachments: attachments || null,
    metadata: metadata || null,
  });

  // Fetch attachments and generate presigned URLs for socket broadcast
  let messageAttachments: any[] | undefined = undefined;
  try {
    const attachments = await attachmentRepository.findByMessageId(message.id);
    if (attachments.length > 0) {
      messageAttachments = await Promise.all(
        attachments.map(async (att) => {
          let fileUrl: string | null = null;
          let thumbnailUrl: string | null = null;

          if (att.fileUrl && companyId) {
            try {
              fileUrl = await getPresignedUrl(att.fileUrl, companyId, 3600);
            } catch (error) {
            }
          }

          if (att.thumbnailUrl && companyId) {
            try {
              thumbnailUrl = await getPresignedUrl(att.thumbnailUrl, companyId, 3600);
            } catch (error) {
            }
          }

          return {
            id: att.id,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            fileUrl,
            thumbnailUrl,
          };
        })
      );
    }
  } catch (error) {
    // Continue without attachments if fetch fails
  }

  // Broadcast via socket using shared utility
  const io = getIO();
  const senderUser =
    normalizedSenderType === SenderType.AGENT
      ? await userRepository.findById(finalAgentId || currentUser.id)
      : null;

  broadcastMessage(
    io,
    {
      id: message.id,
      chatId: message.chatId,
      senderType: message.senderType,
      text: message.text || "",
      createdAt: message.createdAt,
      senderName:
        normalizedSenderType === SenderType.AGENT
          ? senderUser?.name || senderUser?.email || null
          : null,
      attachments: messageAttachments,
    },
    {
      id: chat.id,
      propertyId: chat.propertyId,
      sessionId: chat.sessionId,
      agentId: chat.agentId,
    },
    {
      includePropertyRoom: true,
      includeLegacyEvents: true,
    }
  );

  return successResponse(res, { statusCode: 201, data: message });
}

/**
 * Validates if a message can be edited
 * - Checks ownership (agent can only edit their own messages, visitor can only edit their own messages)
 * - ADMIN and SUPER_ADMIN can edit any agent message in their company
 * - Checks time window (only within 1 minute after creation)
 */
function validateMessageEdit(
  message: { agentId: string | null; visitorId: string | null; senderType: string; createdAt: Date },
  currentUserId: string | null,
  currentUserRole: string,
  isVisitor: boolean
): { valid: boolean; error?: string } {
  // Check time window (1 minute = 60 seconds)
  const now = new Date();
  const messageAge = (now.getTime() - message.createdAt.getTime()) / 1000; // age in seconds
  const ONE_MINUTE = 60;

  if (messageAge > ONE_MINUTE) {
    return {
      valid: false,
      error: "Message can only be edited within 1 minute after sending",
    };
  }

  // Check ownership
  if (isVisitor) {
    // Visitor can only edit their own messages
    if (message.senderType !== SenderType.VISITOR) {
      return {
        valid: false,
        error: "Visitors can only edit their own messages",
      };
    }
    if (message.visitorId !== currentUserId) {
      return {
        valid: false,
        error: "You can only edit your own messages",
      };
    }
  } else {
    // For agent messages
    if (message.senderType !== SenderType.AGENT) {
      return {
        valid: false,
        error: "Agents can only edit agent messages",
      };
    }

    // ADMIN and SUPER_ADMIN can edit any agent message in their company
    // (company access is already verified by checking chat belongs to company)
    const isAdmin = currentUserRole === Role.ADMIN || currentUserRole === Role.SUPER_ADMIN;

    if (isAdmin) {
      // Admins can edit any agent message - company access already verified
      return { valid: true };
    }

    // Regular agents can only edit their own messages
    // Normalize IDs to strings for comparison (handle null/undefined cases)
    const messageAgentId = message.agentId ? String(message.agentId) : null;
    const normalizedCurrentUserId = currentUserId ? String(currentUserId) : null;

    if (messageAgentId !== normalizedCurrentUserId) {
      return {
        valid: false,
        error: "You can only edit your own messages",
      };
    }
  }

  return { valid: true };
}

export async function editMessageHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { messageId } = req.params;
  const { text } = req.body ?? {};
  const companyId = req.user?.companyId;
  const currentUser = req.user;
  // Authenticated dashboard edits use non-visitor limits.
  const isVisitor = false;

  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  if (!currentUser) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
  }

  if (!messageId || !text) {
    return errorResponse(res, {
      message: "messageId and text are required",
      statusCode: 400,
    });
  }

  // Validate message length
  const validation = validateMessageLength(text, isVisitor);
  if (!validation.isValid) {
    return errorResponse(res, {
      message: validation.error || "Message too long",
      statusCode: 400,
    });
  }

  // Get message
  const message = await messageRepository.findById(messageId);
  if (!message) {
    return errorResponse(res, { message: "Message not found", statusCode: 404 });
  }

  // Get chat to verify company access
  const chat = await chatRepository.findById(message.chatId, companyId);
  if (!chat) {
    return errorResponse(res, { message: "Chat not found", statusCode: 404 });
  }

  // Normalize user ID - use the same logic as when creating messages
  const currentUserId = currentUser.id;

  await assertAgentCanAccessChatOrThrow(currentUserId, chat);

  // Validate ownership and time window

  // Debug logging to help identify ID mismatch issues

  const validationResult = validateMessageEdit(
    message,
    currentUserId,
    currentUser.role,
    isVisitor
  );

  if (!validationResult.valid) {
    return errorResponse(res, {
      message: validationResult.error || "Unauthorized",
      statusCode: 403,
    });
  }

  // Update message
  const updatedMessage = await messageRepository.edit(messageId, text);

  // Broadcast MESSAGE_EDITED event via socket
  const io = getIO();
  if (io) {
    const chatRoom = getChatRoom(chat.id);
    const propertyRoom = getPropertyRoom(chat.propertyId);

    const payload = {
      id: updatedMessage.id,
      chatId: updatedMessage.chatId,
      text: updatedMessage.text,
      editedAt: updatedMessage.editedAt?.toISOString(),
    };

    io.to(chatRoom).emit(SOCKET_EVENTS.MESSAGE_EDITED, payload);

    // Also emit to property room for real-time updates
    io.to(propertyRoom).emit(SOCKET_EVENTS.MESSAGE_EDITED, payload);
  }

  return successResponse(res, { statusCode: 200, data: updatedMessage });
}

// Widget message edit handler (no auth required, validates via sessionId)
export async function editWidgetMessageHandler(
  req: Request,
  res: Response
) {
  const { messageId } = req.params as { messageId: string };
  const { text, sessionId } = req.body as { text?: string; sessionId?: string };

  if (!messageId || !text) {
    return errorResponse(res, {
      message: "messageId and text are required",
      statusCode: 400,
    });
  }

  if (!sessionId) {
    return errorResponse(res, {
      message: "sessionId is required",
      statusCode: 400,
    });
  }

  // Validate message length (visitor limit)
  const validation = validateMessageLength(text, true);
  if (!validation.isValid) {
    return errorResponse(res, {
      message: validation.error || "Message too long",
      statusCode: 400,
    });
  }

  // Get message
  const message = await messageRepository.findById(messageId);
  if (!message) {
    return errorResponse(res, { message: "Message not found", statusCode: 404 });
  }

  // Get chat to verify sessionId matches
  const chat = await chatRepository.findById(message.chatId);
  if (!chat) {
    return errorResponse(res, { message: "Chat not found", statusCode: 404 });
  }

  // Validate sessionId matches chat's sessionId
  if (chat.sessionId !== sessionId) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 403 });
  }

  // Validate message is from visitor
  if (message.senderType !== "VISITOR") {
    return errorResponse(res, { message: "Only visitor messages can be edited", statusCode: 403 });
  }

  // Validate ownership - visitor can only edit their own messages
  if (message.visitorId !== chat.visitorId) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 403 });
  }

  // Validate time window (1 minute)
  const now = new Date();
  const messageAge = (now.getTime() - message.createdAt.getTime()) / 1000;
  const ONE_MINUTE = 60;

  if (messageAge > ONE_MINUTE) {
    return errorResponse(res, {
      message: "Message can only be edited within 1 minute after sending",
      statusCode: 403,
    });
  }

  // Update message
  const updatedMessage = await messageRepository.edit(messageId, text);

  // Broadcast MESSAGE_EDITED event via socket
  const io = getIO();
  if (io) {
    const chatRoom = getChatRoom(chat.id);
    const propertyRoom = getPropertyRoom(chat.propertyId);

    const payload = {
      id: updatedMessage.id,
      chatId: updatedMessage.chatId,
      text: updatedMessage.text,
      editedAt: updatedMessage.editedAt?.toISOString(),
    };

    io.to(chatRoom).emit(SOCKET_EVENTS.MESSAGE_EDITED, payload);

    // Also emit to property room for real-time updates
    io.to(propertyRoom).emit(SOCKET_EVENTS.MESSAGE_EDITED, payload);
  }

  return successResponse(res, { statusCode: 200, data: updatedMessage });
}
