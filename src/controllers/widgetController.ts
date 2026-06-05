import type { Request, Response } from "express";
import { propertyRepository } from "../repositories/propertyRepository";
import { chatService } from "../services/chatService";
import { visitorEventRepository } from "../repositories/visitorEventRepository";
import { visitorRepository } from "../repositories/visitorRepository";
import { chatRepository } from "../repositories/chatRepository";
import { attachmentRepository } from "../repositories/attachmentRepository";
import { hasOnlineAgents, getIO, getPropertyRoom, isChatActivelyViewedByAgent, broadcastMessage } from "../socket/index";
import { AppError } from "../utils/appError";
import { getPresignedUrl } from "../services/s3Service";
import prisma from "../lib/prisma";
import {
  resolveWidgetVisitorContext,
  buildChatVisitorInfo,
} from "../helpers/widget/widgetVisitorInfo";
import { successResponse } from "../utils/apiResponse";
import { emitUnreadUpdate } from "../socket/unreadEvents";

/**
 * GET /widget/init
 * Returns widget configuration for a given widgetKey
 * Only returns public-facing properties, no internal data
 */
export async function getWidgetInitHandler(
  req: Request,
  res: Response
) {
  // Validation is handled by middleware, but we still need to extract the value
  const { widgetKey } = req.query as { widgetKey: string };

  const property = await propertyRepository.findByWidgetKey(widgetKey);
  if (!property) {
    throw new AppError(404, "Property not found");
  }

  const company = await prisma.company.findUnique({
    where: { id: property.companyId },
    select: { isPro: true },
  });
  const isPro = company?.isPro ?? false;

  let chatbotLogo: string | null = null;
  if (property.chatbotLogo && property.companyId) {
    try {
      chatbotLogo = await getPresignedUrl(property.chatbotLogo, property.companyId, 3600);
    } catch (error) {
    }
  }

  return successResponse(res, {
    data: {
      widgetKey: property.widgetKey,
      chatbotName: property.chatbotName,
      chatbotLogo,
      launcherButtonColor: property.launcherButtonColor,
      primaryColor: property.primaryColor,
      backgroundColor: property.backgroundColor,
      textColor: property.textColor,
      welcomeMessage: property.welcomeMessage,
      position: property.position,
      isPro,
      removeBranding: property.removeBranding ?? false,
    },
    statusCode: 200,
  });
}

/**
 * POST /widget/event
 * Tracks widget events (PAGE_VIEW, WIDGET_OPEN, WIDGET_CLOSE, MESSAGE)
 */
export async function postWidgetEventHandler(
  req: Request,
  res: Response
) {
  // Validation is handled by middleware
  const {
    widgetKey,
    sessionId,
    eventType,
    url,
    referrer,
    userAgent: bodyUserAgent,
    device: bodyDevice,
    browser: bodyBrowser,
    country: bodyCountry,
  } = req.body;

  const property = await propertyRepository.findByWidgetKey(widgetKey);
  if (!property) {
    throw new AppError(404, "Property not found");
  }

  const visitorContext = await resolveWidgetVisitorContext(req, {
    bodyCountry,
    bodyUserAgent,
    bodyDevice,
    bodyBrowser,
  });

  // Create or update visitor
  const visitor = await visitorRepository.createOrUpdate({
    companyId: property.companyId,
    sessionId,
    ipAddress: visitorContext.requestMeta.ipAddress,
    userAgent: visitorContext.userAgent,
    device: visitorContext.device,
    browser: visitorContext.browser,
    country: visitorContext.requestMeta.country,
  });

  // Find existing chat for this session
  let chat = await chatRepository.findLatestByPropertyAndSession({
    propertyId: property.id,
    sessionId,
  });

  // Create visitor event
  await visitorEventRepository.create({
    companyId: property.companyId,
    propertyId: property.id,
    chatId: chat?.id,
    visitorId: visitor.id,
    sessionId,
    eventType,
    url: url || null,
    referrer: referrer || null,
    userAgent: visitorContext.userAgent,
    device: visitorContext.device,
    browser: visitorContext.browser,
    country: visitorContext.requestMeta.country,
    ipAddress: visitorContext.requestMeta.ipAddress,
  });

  return successResponse(res, { statusCode: 201 });
}

/**
 * POST /widget/start
 * Starts a new chat session
 */
export async function postWidgetStartHandler(
  req: Request,
  res: Response
) {
  // Validation is handled by middleware
  const {
    widgetKey,
    sessionId,
    url,
    referrer,
    userAgent: bodyUserAgent,
    device: bodyDevice,
    browser: bodyBrowser,
    country: bodyCountry,
  } = req.body;

  const visitorContext = await resolveWidgetVisitorContext(req, {
    bodyCountry,
    bodyUserAgent,
    bodyDevice,
    bodyBrowser,
  });

  const result = await chatService.startChat({
    widgetKey,
    sessionId,
    visitorInfo: buildChatVisitorInfo({
      url,
      referrer,
      context: visitorContext,
    }),
  });

  return successResponse(res, { data: result, statusCode: 201 });
}

/**
 * POST /widget/message
 * Sends a message in a chat.
 * If chatId is provided, uses existing chat.
 * If widgetKey + sessionId is provided, creates chat lazily on first message.
 */
export async function postWidgetMessageHandler(
  req: Request,
  res: Response
) {
  // Validation is handled by middleware
  const {
    chatId,
    widgetKey,
    sessionId,
    text,
    section,
    url,
    referrer,
    userAgent: bodyUserAgent,
    device: bodyDevice,
    browser: bodyBrowser,
    country: bodyCountry,
  } = req.body;

  // Extract request metadata for lazy chat creation
  let visitorInfo: {
    url?: string;
    referrer?: string;
    userAgent?: string;
    device?: string;
    browser?: string;
    country?: string;
    ipAddress?: string;
  } | undefined;

  if (widgetKey && sessionId) {
    const visitorContext = await resolveWidgetVisitorContext(req, {
      bodyCountry,
      bodyUserAgent,
      bodyDevice,
      bodyBrowser,
    });

    visitorInfo = buildChatVisitorInfo({
      url,
      referrer,
      context: visitorContext,
    });
  }

  const io = getIO();
  const suppressUnreadIncrement =
    typeof chatId === "string" ? await isChatActivelyViewedByAgent(chatId, io) : false;

  const result = await chatService.addMessage({
    chatId: chatId || undefined,
    widgetKey: widgetKey || undefined,
    sessionId: sessionId || undefined,
    text: text.trim(),
    senderType: "VISITOR",
    section: section || undefined,
    suppressUnreadIncrement,
    visitorInfo,
  });

  // Use result.chatId instead of chatId (which may be undefined in lazy creation mode)
  const effectiveChatId = result.chatId || chatId;
  if (!effectiveChatId) {
    // This should not happen, but handle gracefully
    return successResponse(res, { data: result, statusCode: 201 });
  }

  const chat = await chatRepository.findById(effectiveChatId);
  if (chat) {
    // Fetch attachments and generate presigned URLs for user message
    let userMessageAttachments: any[] | undefined = undefined;
    try {
      const attachments = await attachmentRepository.findByMessageId(result.userMessage.id);
      if (attachments.length > 0) {
        userMessageAttachments = await Promise.all(
          attachments.map(async (att) => {
            let fileUrl: string | null = null;
            let thumbnailUrl: string | null = null;

            if (att.fileUrl && chat.companyId) {
              try {
                fileUrl = await getPresignedUrl(att.fileUrl, chat.companyId, 3600);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
              }
            }

            if (att.thumbnailUrl && chat.companyId) {
              try {
                thumbnailUrl = await getPresignedUrl(att.thumbnailUrl, chat.companyId, 3600);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Continue without attachments if fetch fails
    }

    // Broadcast user message
    broadcastMessage(
      io,
      {
        id: result.userMessage.id,
        chatId: result.userMessage.chatId,
        senderType: result.userMessage.senderType,
        text: result.userMessage.text,
        createdAt: result.userMessage.createdAt,
        attachments: userMessageAttachments,
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

    // Emit unread update for visitor messages
    if (result.userMessage.senderType === "VISITOR") {
      await emitUnreadUpdate(io, chat.id, chat.companyId, {
        id: result.userMessage.id,
        text: result.userMessage.text,
        senderType: result.userMessage.senderType,
        createdAt: result.userMessage.createdAt,
      });
    }

    // Broadcast bot message if exists
    if (result.botMessage) {
      // Fetch attachments and generate presigned URLs for bot message
      let botMessageAttachments: any[] | undefined = undefined;
      try {
        const attachments = await attachmentRepository.findByMessageId(result.botMessage.id);
        if (attachments.length > 0) {
          botMessageAttachments = await Promise.all(
            attachments.map(async (att) => {
              let fileUrl: string | null = null;
              let thumbnailUrl: string | null = null;

              if (att.fileUrl && chat.companyId) {
                try {
                  fileUrl = await getPresignedUrl(att.fileUrl, chat.companyId, 3600);
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                }
              }

              if (att.thumbnailUrl && chat.companyId) {
                try {
                  thumbnailUrl = await getPresignedUrl(att.thumbnailUrl, chat.companyId, 3600);
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Continue without attachments if fetch fails
      }

      broadcastMessage(
        io,
        {
          id: result.botMessage.id,
          chatId: result.botMessage.chatId,
          senderType: result.botMessage.senderType,
          text: result.botMessage.text,
          createdAt: result.botMessage.createdAt,
          attachments: botMessageAttachments,
          quickReplies: result.botMessage.quickReplies,
        },
        {
          id: chat.id,
          propertyId: chat.propertyId,
          sessionId: chat.sessionId,
          agentId: chat.agentId,
        },
        {
          includePropertyRoom: false,
          includeLegacyEvents: true,
        }
      );
    }
  }

  return successResponse(res, { data: result, statusCode: 201 });
}

/**
 * GET /widget/agent-availability
 * Checks if any agents are online for a given widget
 */
export async function getAgentAvailabilityHandler(
  req: Request,
  res: Response
) {
  // Validation is handled by middleware
  const { widgetKey } = req.query as { widgetKey: string };

  const property = await propertyRepository.findByWidgetKey(widgetKey);
  if (!property) {
    throw new AppError(404, "Property not found");
  }

  // Check if any agents/admins are online for this property
  const available = await hasOnlineAgents(property.id);

  return successResponse(res, {
    data: {
      available,
      propertyId: property.id,
    },
    statusCode: 200,
  });
}

/**
 * POST /widget/chats/:chatId/close-intent
 * Handles visitor close intent signals (resolved, end_conversation, inactivity)
 */
export async function postWidgetCloseIntentHandler(
  req: Request,
  res: Response
) {
  const { chatId } = req.params;
  const { sessionId, intent } = req.body;

  const result = await chatService.handleVisitorCloseIntent({
    chatId,
    sessionId,
    intent,
  });

  if (result.awaitingFeedback) {
    const io = getIO();
    const chat = await chatRepository.findById(chatId);
    if (chat) {
      io.to(getPropertyRoom(chat.propertyId)).emit("chat:updated", { chatId });
    }
  }

  return successResponse(res, { data: result, statusCode: 200 });
}

type TranscriptMessageRow = Awaited<
  ReturnType<typeof chatRepository.listMessagesForTranscript>
>[number];

async function mapTranscriptMessageForWidget(
  msg: TranscriptMessageRow,
  companyId: string
) {
  const attachments = await Promise.all(
    (msg.attachments || []).map(async (att) => {
      let fileUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      if (att.fileUrl && companyId) {
        try {
          fileUrl = await getPresignedUrl(att.fileUrl, companyId, 3600);
        } catch {
          /* ignore presign failure */
        }
      }
      if (att.thumbnailUrl && companyId) {
        try {
          thumbnailUrl = await getPresignedUrl(att.thumbnailUrl, companyId, 3600);
        } catch {
          /* ignore */
        }
      }
      return {
        id: att.id,
        fileName: att.fileName,
        fileType: att.fileType,
        fileSize: att.fileSize,
        fileUrl: fileUrl || "",
        thumbnailUrl,
      };
    })
  );

  const role =
    msg.senderType === "VISITOR"
      ? "visitor"
      : msg.senderType === "AGENT"
        ? "agent"
        : "bot";

  const quickReplies =
    msg.messageQuickReplies?.length && msg.senderType === "BOT"
      ? msg.messageQuickReplies.map((qr) => ({
          id: qr.id,
          label: qr.label,
          message: qr.payload || qr.label,
        }))
      : undefined;

  return {
    id: msg.id,
    role,
    message: msg.text ?? "",
    createdAt: msg.createdAt.toISOString(),
    editedAt: msg.editedAt?.toISOString(),
    attachments: attachments.length ? attachments : undefined,
    quickReplies,
  };
}

/**
 * GET /widget/chats?widgetKey&sessionId
 * Lists past chats for this browser session on the widget property.
 */
export async function getWidgetChatsHandler(req: Request, res: Response) {
  const { widgetKey, sessionId } = req.query as {
    widgetKey: string;
    sessionId: string;
  };

  const property = await propertyRepository.findByWidgetKey(widgetKey);
  if (!property) {
    throw new AppError(404, "Property not found");
  }

  const chats = await chatRepository.listByPropertyAndSession({
    propertyId: property.id,
    sessionId,
  });

  const data = chats.map((c) => ({
    id: c.id,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
  }));

  return successResponse(res, { data, statusCode: 200 });
}

/**
 * GET /widget/chats/:chatId/messages?widgetKey&sessionId
 * Full transcript for a chat (visitor must own the session).
 */
export async function getWidgetChatMessagesHandler(req: Request, res: Response) {
  const { chatId } = req.params;
  const { widgetKey, sessionId } = req.query as {
    widgetKey: string;
    sessionId: string;
  };

  const property = await propertyRepository.findByWidgetKey(widgetKey);
  if (!property) {
    throw new AppError(404, "Property not found");
  }

  const chat = await chatRepository.findById(chatId, property.companyId);
  if (!chat || chat.propertyId !== property.id) {
    throw new AppError(404, "Chat not found");
  }
  if (chat.sessionId !== sessionId) {
    throw new AppError(403, "Forbidden");
  }

  const rows = await chatRepository.listMessagesForTranscript(
    chatId,
    property.companyId
  );
  const messages = await Promise.all(
    rows.map((m) => mapTranscriptMessageForWidget(m, property.companyId))
  );

  return successResponse(res, { data: { messages }, statusCode: 200 });
}
