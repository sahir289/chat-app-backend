import type { Socket, Server as IOServer } from "socket.io";
import { chatService } from "../services/chatService";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("socket");
import { chatRepository } from "../repositories/chatRepository";
import { propertyRepository } from "../repositories/propertyRepository";
import { visitorEventRepository } from "../repositories/visitorEventRepository";
import prisma from "../lib/prisma";
import { moduleAccessService } from "../services/moduleAccessService";
import { getPresignedUrl } from "../services/s3Service";
import {
    assertAgentCanAccessChatOrThrow,
    assertAgentCanAccessPropertyOrThrow,
} from "../utils/agentPropertyFilter";
import {
    getChatRoom,
    getPropertyRoom,
    getSessionRoom,
    emitError,
    createError,
    broadcastMessage,
    normalizeIpAddress,
    resolveVisitorLocation,
} from "./helpers";
import {
    joinChatRoom,
    joinPropertyRoom,
    addOnlineVisitor,
    addOnlineAgent,
    broadcastAgentAvailability,
    broadcastVisitorStatus,
    getSocketRoom,
    addTypingState,
    removeTypingState,
    isVisitorOnline,
    hasOnlineAgents,
    isChatActivelyViewedByAgent,
    leaveChatRoom,
} from "./roomManager";
import type { JoinPayload, MessagePayload, MessageHandlerOptions } from "./types";
import { SOCKET_EVENTS } from "./events";
import { validateMessageLength, isVisitorSenderType } from "../utils/messageValidation";
import { messageRepository } from "../repositories/messageRepository";
import { emitUnreadSync, emitUnreadUpdate } from "./unreadEvents";
import { AppError } from "../utils/appError";
import {
    consumeSocketChatMessageBudget,
    consumeSocketMessageEditBudget,
    consumeSocketTypingBudget,
} from "./socketEventRateLimit";
import { writeSecurityAuditLog } from "../services/securityAuditService";
import { AuditAction, ResourceType } from "@prisma/client";

type TranscriptMessageRow = Awaited<
    ReturnType<typeof chatRepository.listMessagesForTranscript>
>[number];

type ChatAccessRow = NonNullable<Awaited<ReturnType<typeof chatRepository.findById>>>;

function isAgentLikeRole(role: string | undefined): boolean {
    return role === "agent" || role === "dashboard";
}

function createAuthError(message = "Unauthorized") {
    return createError(message, "UNAUTHORIZED");
}

async function assertSocketCanAccessChat(
    socket: Socket,
    chat: ChatAccessRow,
    roomInfo: Awaited<ReturnType<typeof getSocketRoom>>,
    action: "message" | "close" | "edit"
): Promise<void> {
    if (roomInfo?.role === "visitor") {
        if (roomInfo.sessionId !== chat.sessionId) {
            throw new AppError(403, "Unauthorized");
        }
        if (roomInfo.propertyId && roomInfo.propertyId !== chat.propertyId) {
            throw new AppError(403, "Unauthorized");
        }
        if (roomInfo.companyId && roomInfo.companyId !== chat.companyId) {
            throw new AppError(403, "Unauthorized");
        }
        if (roomInfo.chatId && roomInfo.chatId !== chat.id) {
            throw new AppError(403, "Unauthorized");
        }
        return;
    }

    const authUser = socket.data.authUser;
    const actingUserId = roomInfo?.agentId ?? authUser?.id ?? null;
    const actingCompanyId = roomInfo?.companyId ?? authUser?.companyId ?? null;

    if (!actingUserId || !actingCompanyId || actingCompanyId !== chat.companyId) {
        throw new AppError(403, "Unauthorized");
    }

    if (roomInfo && !isAgentLikeRole(roomInfo.role)) {
        throw new AppError(403, "Unauthorized");
    }

    if (roomInfo?.chatId && roomInfo.chatId !== chat.id) {
        throw new AppError(403, "Unauthorized");
    }

    if (roomInfo?.propertyId && roomInfo.propertyId !== chat.propertyId) {
        throw new AppError(403, "Unauthorized");
    }

    const moduleAccess = await moduleAccessService.checkModuleAccess(actingUserId, "chats");
    if (!moduleAccess.allowed) {
        throw new AppError(403, moduleAccess.reason || "Module access denied");
    }

    await assertAgentCanAccessChatOrThrow(actingUserId, {
        propertyId: chat.propertyId,
        agentId: chat.agentId,
    });

    if (action === "edit" && !isAgentLikeRole(roomInfo?.role) && !authUser?.id) {
        throw new AppError(403, "Unauthorized");
    }
}

async function mapTranscriptMessageForWidgetSocket(
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
                    /* ignore */
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
        clientMessageId: msg.clientMessageId ?? undefined,
        replyToClientMessageId: msg.replyToClientMessageId ?? undefined,
        attachments: attachments.length ? attachments : undefined,
        quickReplies,
    };
}

async function buildVisitorJoinPayload(
    propertyId: string,
    companyId: string,
    sessionId: string,
    chatId?: string
) {
    const available = await hasOnlineAgents(propertyId);
    if (!chatId) {
        return {
            propertyId,
            sessionId,
            available,
            verified: true,
        };
    }

    const chat = await chatRepository.findById(chatId, companyId);
    if (!chat) {
        return {
            propertyId,
            sessionId,
            available,
            verified: true,
        };
    }

    const rows = await chatRepository.listMessagesForTranscript(chat.id, companyId);
    const messages = await Promise.all(
        rows.map((row) => mapTranscriptMessageForWidgetSocket(row, companyId))
    );

    return {
        propertyId,
        sessionId,
        chatId: chat.id,
        status: chat.status,
        agentId: chat.agentId ?? null,
        available,
        verified: true,
        messages,
    };
}

export async function handleDashboardJoin(
    socket: Socket,
    propertyId: string,
    io: IOServer | null
): Promise<void> {
    const authUser = socket.data.authUser;
    if (!authUser?.id || !authUser.companyId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    // Use Prisma directly since we don't have companyId yet
    const property = await prisma.property.findFirst({
        where: {
            id: propertyId,
            deletedAt: null,
        },
    });
    if (!property) {
        emitError(socket, createError("Property not found", "PROPERTY_NOT_FOUND"));
        return;
    }
    if (property.companyId !== authUser.companyId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    const moduleAccess = await moduleAccessService.checkModuleAccess(authUser.id, "chats");
    if (!moduleAccess.allowed) {
        emitError(socket, createError(moduleAccess.reason || "Module access denied", "FORBIDDEN"));
        return;
    }

    try {
        await assertAgentCanAccessPropertyOrThrow(authUser.id, propertyId);
    } catch (err) {
        emitError(socket, createError("Access denied", "FORBIDDEN", err instanceof Error ? err.message : err));
        return;
    }

    await joinPropertyRoom(socket, propertyId, "dashboard", property.companyId, undefined, authUser.id);
    await addOnlineAgent(propertyId, socket.id);
    broadcastAgentAvailability(io, propertyId, true);

    // Send initial unread counts for all chats in this property.
    await emitUnreadSync(socket, propertyId, property.companyId);

    socket.emit(SOCKET_EVENTS.CHAT_JOINED, { propertyId });
    log.info(`[socket] Dashboard joined property room: property:${propertyId}`);
}

export async function handleVisitorJoinExistingChat(
    socket: Socket,
    payload: JoinPayload & { chatId: string; widgetKey: string; sessionId: string },
    io: IOServer | null
): Promise<void> {
    const { chatId, widgetKey, sessionId } = payload;
    const chat = await chatRepository.findById(chatId);
    if (!chat) {
        emitError(socket, createError("Chat not found", "CHAT_NOT_FOUND"));
        return;
    }

    const property = await propertyRepository.findByWidgetKey(widgetKey);
    if (!property || property.id !== chat.propertyId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    if (chat.sessionId !== sessionId || chat.visitorToken !== sessionId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    await joinChatRoom(socket, chatId, chat.propertyId, "visitor", chat.sessionId, chat.companyId);
    await addOnlineVisitor(chatId, socket.id);

    socket.emit(
        SOCKET_EVENTS.CHAT_JOINED,
        await buildVisitorJoinPayload(chat.propertyId, chat.companyId, chat.sessionId, chatId)
    );

    if (io) {
        broadcastVisitorStatus(io, chat.propertyId, chatId, "online");
    }

    log.info(`[socket] Visitor joined existing chat ${chatId}`);
}

export async function handleVisitorJoinNewChat(
    socket: Socket,
    payload: JoinPayload & { widgetKey: string; sessionId: string },
    io: IOServer | null
): Promise<void> {
    const { widgetKey, sessionId, url, referrer, userAgent, device, browser } = payload;

    const finalIpAddress = normalizeIpAddress(
        undefined,
        socket.handshake.address,
        socket.handshake.headers
    );
    const finalCountry = await resolveVisitorLocation(finalIpAddress, undefined);

    const { property } = await chatService.startChat({
        widgetKey,
        sessionId,
        visitorInfo: {
            url: url || undefined,
            referrer: referrer || undefined,
            userAgent: userAgent || undefined,
            device: device || undefined,
            browser: browser || undefined,
            country: finalCountry || undefined,
            ipAddress: finalIpAddress || undefined,
        },
    });

    const chat = await chatRepository.findReusableByPropertyAndSession({
        propertyId: property.id,
        sessionId,
    });

    if (chat) {
        await joinChatRoom(socket, chat.id, property.id, "visitor", sessionId, property.companyId);
        await addOnlineVisitor(chat.id, socket.id);
        socket.emit(
            SOCKET_EVENTS.CHAT_JOINED,
            await buildVisitorJoinPayload(property.id, property.companyId, sessionId, chat.id)
        );

        if (io) {
            broadcastVisitorStatus(io, property.id, chat.id, "online");
        }
        log.info(`[socket] Visitor joined existing chat ${chat.id}`);
    } else {
        // CRITICAL FIX: Visitors should NEVER join propertyRoom
        // Instead, create a private session-based room for pre-chat isolation
        const sessionRoom = getSessionRoom(sessionId, property.id);
        await socket.join(sessionRoom);

        // Store room info without joining propertyRoom
        // Visitor hasn't created a chat yet, so chatId is undefined
        await joinChatRoom(socket, undefined, property.id, "visitor", sessionId, property.companyId);

        socket.emit(
            SOCKET_EVENTS.CHAT_JOINED,
            await buildVisitorJoinPayload(property.id, property.companyId, sessionId)
        );
        log.info(`[socket] Visitor joined session room (session: ${sessionId}), waiting for first message - NOT in property room`);
    }
}

export async function handleAgentJoinChat(
    socket: Socket,
    chatId: string,
    role: "agent" | "dashboard",
    io: IOServer | null
): Promise<void> {
    const authUser = socket.data.authUser;
    if (!authUser?.id || !authUser.companyId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    // Check if chatId is actually a propertyId (for dashboard role)
    // Use Prisma directly since we don't have companyId yet
    const propertyAsProperty = await prisma.property.findFirst({
        where: {
            id: chatId,
            deletedAt: null,
        },
    });
    if (propertyAsProperty && role === "dashboard") {
        await handleDashboardJoin(socket, chatId, io);
        return;
    }

    const chat = await chatRepository.findById(chatId);
    if (!chat) {
        emitError(socket, createError("Chat not found", "CHAT_NOT_FOUND"));
        return;
    }
    if (chat.companyId !== authUser.companyId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    // Mirror HTTP access rules: property filter + ONLY_ASSIGNED_CHATS (chat.agentId check).
    try {
        await assertAgentCanAccessChatOrThrow(authUser.id, {
            propertyId: chat.propertyId,
            agentId: chat.agentId,
        });
    } catch (err) {
        emitError(socket, createError("Access denied", "FORBIDDEN", err instanceof Error ? err.message : err));
        return;
    }

    // Reset unread count when agent/dashboard opens a chat
    if (chat.unreadCount > 0) {
        await chatRepository.resetUnreadCount(chatId, chat.companyId);

        // Emit unread count update using shared unread contract.
        await emitUnreadUpdate(io, chatId, chat.companyId);
    }

    await joinChatRoom(socket, chatId, chat.propertyId, role, chat.sessionId, chat.companyId, authUser.id);
    await addOnlineAgent(chat.propertyId, socket.id);
    broadcastAgentAvailability(io, chat.propertyId, true);

    socket.emit(SOCKET_EVENTS.CHAT_JOINED, { chatId, room: getChatRoom(chatId) });
    log.info(`[socket] ${role} joined chat ${chatId}`);
}

export async function handleAgentJoinProperty(
    socket: Socket,
    widgetKey: string,
    role: "agent" | "dashboard",
    io: IOServer | null
): Promise<void> {
    const authUser = socket.data.authUser;
    if (!authUser?.id || !authUser.companyId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    const property = await propertyRepository.findByWidgetKey(widgetKey);
    if (!property) {
        emitError(socket, createError("Property not found", "PROPERTY_NOT_FOUND"));
        return;
    }
    if (property.companyId !== authUser.companyId) {
        emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
        return;
    }

    const moduleAccess = await moduleAccessService.checkModuleAccess(authUser.id, "chats");
    if (!moduleAccess.allowed) {
        emitError(socket, createError(moduleAccess.reason || "Module access denied", "FORBIDDEN"));
        return;
    }

    try {
        await assertAgentCanAccessPropertyOrThrow(authUser.id, property.id);
    } catch (err) {
        emitError(socket, createError("Access denied", "FORBIDDEN", err instanceof Error ? err.message : err));
        return;
    }

    await joinPropertyRoom(socket, property.id, role, property.companyId, undefined, authUser.id);
    await addOnlineAgent(property.id, socket.id);
    broadcastAgentAvailability(io, property.id, true);

    socket.emit(SOCKET_EVENTS.CHAT_JOINED, { propertyId: property.id });
    log.info(`[socket] ${role} joined property ${property.id}`);
}

export async function handleChatJoin(
    socket: Socket,
    payload: JoinPayload,
    io: IOServer | null
): Promise<void> {
    const { chatId, propertyId, widgetKey, sessionId, role = "visitor" } = payload;

    try {
        if (role === "dashboard" && propertyId) {
            await handleDashboardJoin(socket, propertyId, io);
            return;
        }

        if (role === "visitor" && widgetKey && sessionId) {
            if (chatId) {
                await handleVisitorJoinExistingChat(socket, { ...payload, chatId, widgetKey, sessionId }, io);
            } else {
                await handleVisitorJoinNewChat(socket, { ...payload, widgetKey, sessionId }, io);
            }
            return;
        }

        if (role === "agent" || role === "dashboard") {
            if (chatId) {
                await handleAgentJoinChat(socket, chatId, role, io);
            } else if (widgetKey) {
                await handleAgentJoinProperty(socket, widgetKey, role, io);
            } else {
                emitError(
                    socket,
                    createError("chatId or widgetKey required for agent/dashboard", "MISSING_PARAMS")
                );
            }
            return;
        }

        emitError(socket, createError("Invalid join parameters", "INVALID_PARAMS"));
    } catch (err) {
        log.error("[socket] chat:join error:", err);
        emitError(socket, createError("Failed to join chat", "JOIN_FAILED", err));
    }
}

export async function handleMessage(
    socket: Socket,
    payload: MessagePayload,
    io: IOServer | null,
    options?: MessageHandlerOptions
): Promise<
    | {
          ok: true;
          data: Awaited<ReturnType<typeof chatService.addMessage>>;
      }
    | {
          ok: false;
          error: string;
          code?: string;
      }
> {
    try {
        const {
            text,
            chatId: providedChatId,
            senderType,
            section,
            url,
            referrer,
            userAgent,
            device,
            browser,
            metadata,
            deferAiReply,
            clientMessageId,
        } = payload;
        if (typeof text !== "string" || text.length === 0) {
            const error = createError("text is required", "MISSING_TEXT");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }
        const normalizedText = text.trim().length > 0 ? text.trim() : text;

        const roomInfo = await getSocketRoom(socket.id);
        if (!roomInfo) {
            const error = createError("Join the chat before sending messages", "NOT_IN_ROOM");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        const messageBudgetOk = await consumeSocketChatMessageBudget(socket.id);
        if (!messageBudgetOk) {
            const error = createError("Too many messages. Please slow down.", "RATE_LIMITED");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        const chatId = providedChatId || roomInfo?.chatId;
        if (!chatId && !roomInfo?.propertyId) {
            const error = createError("chatId or propertyId required", "MISSING_CHAT_ID");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        if (providedChatId && roomInfo.chatId && providedChatId !== roomInfo.chatId) {
            const error = createAuthError();
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        if (options?.requiredRole && roomInfo?.role !== options.requiredRole) {
            const error = createError("Unauthorized", "UNAUTHORIZED");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        const inferredSenderType =
            roomInfo.role === "visitor"
                ? "VISITOR"
                : isAgentLikeRole(roomInfo.role)
                  ? "AGENT"
                  : options?.defaultSenderType || senderType;

        let messageVisitorInfo:
            | {
                  url?: string;
                  referrer?: string;
                  userAgent?: string;
                  device?: string;
                  browser?: string;
                  country?: string;
                  ipAddress?: string;
              }
            | undefined;
        if (inferredSenderType === "VISITOR") {
            const finalIpAddress =
                normalizeIpAddress(undefined, socket.handshake.address, socket.handshake.headers) ??
                undefined;
            const finalCountry =
                (await resolveVisitorLocation(finalIpAddress ?? null, undefined)) ?? undefined;
            messageVisitorInfo = {
                url: url || undefined,
                referrer: referrer || undefined,
                userAgent: userAgent || undefined,
                device: device || undefined,
                browser: browser || undefined,
                country: finalCountry,
                ipAddress: finalIpAddress,
            };
        }

        const isVisitor = isVisitorSenderType(inferredSenderType);
        const validation = validateMessageLength(normalizedText, isVisitor);
        if (!validation.isValid) {
            const error = createError(validation.error || "Message too long", "MESSAGE_TOO_LONG");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        if (!inferredSenderType) {
            const error = createError("Could not determine sender type", "INVALID_SENDER_TYPE");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        let chat = chatId ? await chatRepository.findById(chatId) : null;
        let initialAddMessageResult: Awaited<ReturnType<typeof chatService.addMessage>> | null = null;
        if (!chat && roomInfo?.propertyId && roomInfo?.sessionId && roomInfo?.companyId) {
            if (roomInfo.role !== "visitor") {
                const error = createAuthError();
                emitError(socket, error);
                return { ok: false, error: error.message, code: error.code };
            }

            const property = await propertyRepository.findById(roomInfo.propertyId, roomInfo.companyId);
            if (property) {
                const result = await chatService.addMessage({
                    widgetKey: property.widgetKey,
                    sessionId: roomInfo.sessionId,
                    text: normalizedText,
                    senderType: inferredSenderType,
                    section,
                    visitorInfo: messageVisitorInfo,
                    metadata,
                    deferAiReply,
                    clientMessageId,
                    beforeAutoReply: async (createdChat) => {
                        roomInfo.chatId = createdChat.id;
                        await joinChatRoom(
                            socket,
                            createdChat.id,
                            createdChat.propertyId,
                            roomInfo.role,
                            roomInfo.sessionId,
                            roomInfo.companyId
                        );
                        await addOnlineVisitor(createdChat.id, socket.id);
                    },
                });
                initialAddMessageResult = result;

                chat = await chatRepository.findById(result.chatId);
                if (chat) {
                    roomInfo.chatId = result.chatId;
                    await joinChatRoom(socket, chat.id, chat.propertyId, roomInfo.role, roomInfo.sessionId, roomInfo.companyId);
                    await addOnlineVisitor(chat.id, socket.id);

                    if (io) {
                        // CRITICAL FIX: CHAT_NEW should only go to agents/dashboard in propertyRoom
                        // Visitors should NOT receive this event - they're not in propertyRoom anymore
                        io.to(getPropertyRoom(property.id)).emit(SOCKET_EVENTS.CHAT_NEW, { chatId: chat.id });
                        broadcastVisitorStatus(io, property.id, chat.id, "online");
                    }
                }
            }
        }

        if (!chat) {
            const error = createError("Chat not found", "CHAT_NOT_FOUND");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        await assertSocketCanAccessChat(socket, chat, roomInfo, "message");

        if (chat.agentId && inferredSenderType !== "AGENT" && inferredSenderType !== "VISITOR") {
            const error = createError(
                "Only agent or visitor can send messages when chat is assigned to an agent",
                "UNAUTHORIZED"
            );
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        // Check if visitor is online before allowing agent/bot messages
        if (inferredSenderType === "AGENT" || inferredSenderType === "BOT") {
            const visitorOnline = await isVisitorOnline(chat.id);
            if (!visitorOnline) {
                const error = createError(
                    "Visitor is offline. Messages cannot be sent to offline visitors.",
                    "VISITOR_OFFLINE"
                );
                emitError(socket, error);
                return { ok: false, error: error.message, code: error.code };
            }
        }

        let sessionIdForAdd: string | undefined;
        let widgetKeyForAdd: string | undefined;
        if (inferredSenderType === "VISITOR" && roomInfo?.sessionId) {
            sessionIdForAdd = roomInfo.sessionId;
            const propForWidget = await propertyRepository.findById(chat.propertyId, chat.companyId);
            widgetKeyForAdd = propForWidget?.widgetKey ?? undefined;
        }

        const addResult =
            initialAddMessageResult ??
            (await chatService.addMessage({
                chatId: chat.id,
                text: normalizedText,
                senderType: inferredSenderType,
                section,
                suppressUnreadIncrement:
                    inferredSenderType === "VISITOR"
                        ? await isChatActivelyViewedByAgent(chat.id, io)
                        : false,
                sessionId: sessionIdForAdd,
                widgetKey: widgetKeyForAdd,
                visitorInfo: messageVisitorInfo,
                metadata,
                deferAiReply,
                clientMessageId,
            }));

        if (addResult.chatId !== chat.id) {
            const updatedChat = await chatRepository.findById(addResult.chatId);
            if (updatedChat && roomInfo) {
                chat = updatedChat;
                roomInfo.chatId = chat.id;
                await joinChatRoom(
                    socket,
                    chat.id,
                    chat.propertyId,
                    roomInfo.role,
                    roomInfo.sessionId ?? "",
                    roomInfo.companyId
                );
                if (inferredSenderType === "VISITOR") {
                    await addOnlineVisitor(chat.id, socket.id);
                }
            }
        }

        const { userMessage, botMessage } = addResult;

        if (!addResult.duplicate) {
            // Keep visitor messages isolated to chat room only.
            // For agent messages, allow property-room metadata updates (chat:updated) without leaking content.
            broadcastMessage(io, userMessage, chat, {
                includePropertyRoom: inferredSenderType === "AGENT",
                includeLegacyEvents: true,
            });
        }

        if (botMessage && io && !addResult.duplicate) {
            broadcastMessage(io, botMessage, chat, {
                includePropertyRoom: false,
                includeLegacyEvents: true,
            });
        }

        // Notify property room that a chat was updated (for dashboard/agent notifications only)
        // CRITICAL: This event only goes to agents/dashboard in propertyRoom
        // Visitors are NOT in propertyRoom, so they won't receive this
        // This is metadata only (chatId), not message content
        if (inferredSenderType === "VISITOR" && io && !addResult.duplicate) {
            io.to(getPropertyRoom(chat.propertyId)).emit(SOCKET_EVENTS.CHAT_UPDATED, { chatId: chat.id });
            await emitUnreadUpdate(io, chat.id, chat.companyId, {
                id: userMessage.id,
                text: userMessage.text,
                senderType: userMessage.senderType,
                createdAt: userMessage.createdAt,
            });
        }

        if (roomInfo?.companyId && roomInfo.propertyId && roomInfo.sessionId) {
            await visitorEventRepository.create({
                companyId: roomInfo.companyId,
                propertyId: roomInfo.propertyId,
                chatId: chat.id,
                visitorId: chat.visitorId ?? null,
                sessionId: roomInfo.sessionId,
                eventType: "chat_message",
            });
        }
        return { ok: true, data: addResult };
    } catch (err) {
        log.error("[socket] message error:", err);
        const error = createError("Failed to send message", "MESSAGE_FAILED", err);
        emitError(socket, error);
        return { ok: false, error: error.message, code: error.code };
    }
}

export async function handleTyping(
    socket: Socket,
    payload: { chatId?: string; isTyping: boolean },
    io: IOServer | null
): Promise<void> {
    try {
        const { chatId, isTyping } = payload;
        const roomInfo = await getSocketRoom(socket.id);
        if (!roomInfo) {
            return;
        }

        const targetChatId = chatId || roomInfo.chatId;
        if (!targetChatId) return;

        const typingBudgetOk = await consumeSocketTypingBudget(socket.id);
        if (!typingBudgetOk) {
            return;
        }

        const chat = await chatRepository.findById(targetChatId);
        if (!chat) {
            return;
        }

        await assertSocketCanAccessChat(socket, chat, roomInfo, "message");

        if (isTyping) {
            await addTypingState(targetChatId, socket.id);
        } else {
            await removeTypingState(targetChatId, socket.id);
        }

        if (io) {
            const senderType: "AGENT" | "VISITOR" =
                roomInfo.role === "agent" || roomInfo.role === "dashboard" ? "AGENT" : "VISITOR";

            const typingPayload = {
                chatId: targetChatId,
                isTyping,
                socketId: socket.id,
                senderType,
            };

            io.to(getChatRoom(targetChatId)).emit(SOCKET_EVENTS.CHAT_TYPING, typingPayload);
        }
    } catch (err) {
        if (err instanceof AppError && err.statusCode === 403) {
            return;
        }
        log.warn("[socket] typing skipped:", err);
    }
}

export async function handleChatClose(
    socket: Socket,
    payload: { chatId?: string },
    io: IOServer | null
): Promise<void> {
    try {
        const { chatId } = payload;
        const roomInfo = await getSocketRoom(socket.id);

        if (!roomInfo) {
            emitError(socket, createAuthError());
            return;
        }

        if (!chatId && !roomInfo.chatId) {
            emitError(socket, createError("chatId required", "MISSING_CHAT_ID"));
            return;
        }

        const targetChatId = chatId || roomInfo?.chatId;
        if (!targetChatId) return;

        const chat = await chatRepository.findById(targetChatId);
        if (!chat) {
            emitError(socket, createError("Chat not found", "CHAT_NOT_FOUND"));
            return;
        }

        if (chatId && roomInfo.chatId && chatId !== roomInfo.chatId) {
            emitError(socket, createAuthError());
            return;
        }

        await assertSocketCanAccessChat(socket, chat, roomInfo, "close");

        if (chat.status === "CLOSED") {
            log.info(`[socket] Chat ${targetChatId} already closed`);
            return;
        }

        await chatService.closeChat(targetChatId, chat.companyId);

        const closerUserId = socket.data.authUser?.id ?? roomInfo.agentId ?? null;
        void writeSecurityAuditLog({
            companyId: chat.companyId,
            userId: closerUserId,
            action: AuditAction.CLOSE,
            resourceType: ResourceType.CHAT,
            resourceId: targetChatId,
            metadata: {
                via: "socket",
                closedByRole: roomInfo.role,
            },
            ipAddress:
                typeof socket.handshake.headers["x-forwarded-for"] === "string"
                    ? socket.handshake.headers["x-forwarded-for"].split(",")[0]?.trim()
                    : socket.handshake.address || null,
            userAgent: typeof socket.handshake.headers["user-agent"] === "string" ? socket.handshake.headers["user-agent"] : null,
        });

        if (io) {
            io.to(getChatRoom(targetChatId)).emit(SOCKET_EVENTS.CHAT_CLOSED, { chatId: targetChatId });
        }

        if (roomInfo?.companyId && roomInfo.propertyId && roomInfo.sessionId) {
            await visitorEventRepository.create({
                companyId: roomInfo.companyId,
                propertyId: roomInfo.propertyId,
                chatId: targetChatId,
                visitorId: chat.visitorId ?? null,
                sessionId: roomInfo.sessionId,
                eventType: "chat_end",
            });
        }

        log.info(`[socket] Chat ${targetChatId} closed`);
    } catch (err) {
        log.error("[socket] chat:close error:", err);
        emitError(socket, createError("Failed to close chat", "CLOSE_FAILED", err));
    }
}

export async function handleAgentAssign(
    socket: Socket,
    payload: { chatId: string; agentId: string | null },
    io: IOServer | null,
    ack?: (resp: { ok: true } | { ok: false; error: string; code?: string }) => void
): Promise<void> {
    try {
        const { chatId, agentId } = payload;
        const roomInfo = await getSocketRoom(socket.id);
        const authUser = socket.data.authUser;

        // Auth parity with HTTP: must be authenticated, have chats module access,
        // and must be allowed to access the target chat (property filter + ONLY_ASSIGNED_CHATS).
        const actingUserId = roomInfo?.agentId ?? authUser?.id ?? null;
        const actingCompanyId = roomInfo?.companyId ?? authUser?.companyId ?? null;
        const canAssignFromSocketRole =
            roomInfo?.role === "agent" || roomInfo?.role === "dashboard" || !roomInfo;
        if (!canAssignFromSocketRole || !actingCompanyId || !actingUserId) {
            emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
            ack?.({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" });
            return;
        }

        const moduleAccess = await moduleAccessService.checkModuleAccess(actingUserId, "chats");
        if (!moduleAccess.allowed) {
            emitError(socket, createError(moduleAccess.reason || "Module access denied", "FORBIDDEN"));
            ack?.({
                ok: false,
                error: moduleAccess.reason || "Module access denied",
                code: "FORBIDDEN",
            });
            return;
        }

        const chat = await chatRepository.findById(chatId);
        if (!chat) {
            emitError(socket, createError("Chat not found", "CHAT_NOT_FOUND"));
            ack?.({ ok: false, error: "Chat not found", code: "CHAT_NOT_FOUND" });
            return;
        }
        if (chat.companyId !== actingCompanyId) {
            emitError(socket, createError("Unauthorized", "UNAUTHORIZED"));
            ack?.({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" });
            return;
        }

        await assertAgentCanAccessChatOrThrow(actingUserId, {
            propertyId: chat.propertyId,
            agentId: chat.agentId,
        });

        await chatService.assignAgent(chatId, actingCompanyId, agentId ?? null);

        void writeSecurityAuditLog({
            companyId: chat.companyId,
            userId: actingUserId,
            action: AuditAction.ASSIGN,
            resourceType: ResourceType.CHAT,
            resourceId: chatId,
            metadata: {
                via: "socket",
                assignedAgentId: agentId ?? null,
            },
            ipAddress:
                typeof socket.handshake.headers["x-forwarded-for"] === "string"
                    ? socket.handshake.headers["x-forwarded-for"].split(",")[0]?.trim()
                    : socket.handshake.address || null,
            userAgent: typeof socket.handshake.headers["user-agent"] === "string" ? socket.handshake.headers["user-agent"] : null,
        });

        const propertyRoom = chat ? getPropertyRoom(chat.propertyId) : null;

        if (io) {
            io.to(getChatRoom(chatId)).emit(SOCKET_EVENTS.CHAT_ASSIGNED, { chatId, agentId });
            io.to(getChatRoom(chatId)).emit(SOCKET_EVENTS.CHAT_ASSIGNED_LEGACY, { chatId, agentId });

            if (propertyRoom) {
                io.to(propertyRoom).emit(SOCKET_EVENTS.CHAT_UPDATED, { chatId });
            }
        }
        ack?.({ ok: true });
    } catch (err) {
        log.error("[socket] agent:assign_chat error:", err);
        const errorMessage =
            err instanceof Error && err.message ? err.message : "Failed to assign chat";
        const errorCode =
            typeof (err as { statusCode?: unknown })?.statusCode === "number"
                ? "ASSIGN_VALIDATION_FAILED"
                : "ASSIGN_FAILED";
        const details = createError(errorMessage, errorCode, err);
        emitError(socket, details);
        ack?.({ ok: false, error: errorMessage, code: details.code });
    }
}

/**
 * Validates if a message can be edited
 * - Checks ownership (agent can only edit their own messages, visitor can only edit their own messages)
 * - Checks time window (only within 1 minute after creation)
 */
function validateMessageEditSocket(
    message: { agentId: string | null; visitorId: string | null; senderType: string; createdAt: Date },
    currentUserId: string | null,
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
        if (message.senderType !== "VISITOR") {
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
        // Agent can only edit their own messages
        if (message.senderType !== "AGENT") {
            return {
                valid: false,
                error: "Agents can only edit their own messages",
            };
        }
        // Normalize IDs to strings for comparison (handle null/undefined cases)
        const messageAgentId = message.agentId ? String(message.agentId) : null;
        const normalizedCurrentUserId = currentUserId ? String(currentUserId) : null;

        if (messageAgentId !== normalizedCurrentUserId) {
            log.info("[validateMessageEditSocket] Agent ID mismatch:", {
                messageAgentId,
                normalizedCurrentUserId,
                messageAgentIdType: typeof message.agentId,
                currentUserIdType: typeof currentUserId,
            });
            return {
                valid: false,
                error: "You can only edit your own messages",
            };
        }
    }

    return { valid: true };
}

export async function handleChatLeave(
    socket: Socket,
    payload: { chatId?: string },
    io: IOServer | null
): Promise<void> {
    try {
        const { chatId } = payload;
        const roomInfo = await getSocketRoom(socket.id);

        if (!chatId && !roomInfo?.chatId) {
            log.info("[socket] chat:leave - no chatId provided and socket not in a chat room");
            return;
        }

        const targetChatId = chatId || roomInfo?.chatId;
        if (!targetChatId) {
            log.info("[socket] chat:leave - no target chatId found");
            return;
        }

        // Only leave if the socket is actually in this chat room
        if (roomInfo?.chatId === targetChatId) {
            await leaveChatRoom(socket, targetChatId);
            log.info(`[socket] Socket ${socket.id} left chat room ${targetChatId}`);
        } else {
            log.info(`[socket] chat:leave - socket ${socket.id} not in chat ${targetChatId}, current room: ${roomInfo?.chatId || 'none'}`);
        }
    } catch (err) {
        log.error("[socket] chat:leave error:", err);
        // Don't emit error for leave - it's a cleanup operation
    }
}

export async function handleMessageEdit(
    socket: Socket,
    payload: { messageId: string; text: string },
    io: IOServer | null
): Promise<
    | {
          ok: true;
          data: { id: string; chatId: string; text: string; editedAt?: string };
      }
    | {
          ok: false;
          error: string;
          code?: string;
      }
> {
    try {
        const { messageId, text } = payload;
        const roomInfo = await getSocketRoom(socket.id);

        if (!roomInfo) {
            const error = createAuthError();
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        const editBudgetOk = await consumeSocketMessageEditBudget(socket.id);
        if (!editBudgetOk) {
            const error = createError("Too many edit requests. Please slow down.", "RATE_LIMITED");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        if (!messageId || !text) {
            const error = createError("messageId and text are required", "MISSING_PARAMS");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        // Validate message length
        const isVisitor = roomInfo?.role === "visitor";
        const validation = validateMessageLength(text, isVisitor);
        if (!validation.isValid) {
            const error = createError(validation.error || "Message too long", "MESSAGE_TOO_LONG");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        // Get message
        const message = await messageRepository.findById(messageId);
        if (!message) {
            const error = createError("Message not found", "MESSAGE_NOT_FOUND");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        // Get chat
        const chat = await chatRepository.findById(message.chatId);
        if (!chat) {
            const error = createError("Chat not found", "CHAT_NOT_FOUND");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        await assertSocketCanAccessChat(socket, chat, roomInfo, "edit");

        // Determine current user ID based on role
        let currentUserId: string | null = null;
        if (isVisitor) {
            // For visitors, verify sessionId matches chat's sessionId
            if (roomInfo?.sessionId !== chat.sessionId) {
                const error = createError("Unauthorized", "UNAUTHORIZED");
                emitError(socket, error);
                return { ok: false, error: error.message, code: error.code };
            }
            currentUserId = chat.visitorId;
        } else {
            // Agents must edit as their authenticated user, not as the chat assignee.
            const agentId = roomInfo.agentId || socket.data.authUser?.id || null;
            currentUserId = agentId ? String(agentId) : null;
        }

        // Debug logging for socket handler
        log.info("[handleMessageEdit] Socket User ID check:", {
            normalizedCurrentUserId: currentUserId,
            messageAgentId: message.agentId,
            messageSenderType: message.senderType,
            isVisitor,
            roomInfoAgentId: roomInfo?.agentId,
            chatAgentId: chat.agentId,
        });

        // Validate ownership and time window
        const validationResult = validateMessageEditSocket(
            message,
            currentUserId,
            isVisitor
        );

        if (!validationResult.valid) {
            const error = createError(validationResult.error || "Unauthorized", "UNAUTHORIZED");
            emitError(socket, error);
            return { ok: false, error: error.message, code: error.code };
        }

        // Update message
        const updatedMessage = await messageRepository.edit(messageId, text);

        const editorUserId = isVisitor ? null : socket.data.authUser?.id ?? roomInfo.agentId ?? null;
        void writeSecurityAuditLog({
            companyId: chat.companyId,
            userId: editorUserId,
            action: AuditAction.UPDATE,
            resourceType: ResourceType.MESSAGE,
            resourceId: messageId,
            metadata: {
                via: "socket",
                chatId: chat.id,
                editorRole: roomInfo.role,
            },
            ipAddress:
                typeof socket.handshake.headers["x-forwarded-for"] === "string"
                    ? socket.handshake.headers["x-forwarded-for"].split(",")[0]?.trim()
                    : socket.handshake.address || null,
            userAgent: typeof socket.handshake.headers["user-agent"] === "string" ? socket.handshake.headers["user-agent"] : null,
        });

        // Broadcast via socket
        if (io) {
            const chatRoom = getChatRoom(chat.id);
            const propertyRoom = getPropertyRoom(chat.propertyId);

            io.to(chatRoom).emit(SOCKET_EVENTS.MESSAGE_EDITED, {
                id: updatedMessage.id,
                chatId: updatedMessage.chatId,
                text: updatedMessage.text,
                editedAt: updatedMessage.editedAt?.toISOString(),
            });

            // Also emit to property room for real-time updates
            io.to(propertyRoom).emit(SOCKET_EVENTS.MESSAGE_EDITED, {
                id: updatedMessage.id,
                chatId: updatedMessage.chatId,
                text: updatedMessage.text,
                editedAt: updatedMessage.editedAt?.toISOString(),
            });
        }
        return {
            ok: true,
            data: {
                id: updatedMessage.id,
                chatId: updatedMessage.chatId,
                text: updatedMessage.text || "",
                editedAt: updatedMessage.editedAt?.toISOString(),
            },
        };
    } catch (err) {
        log.error("[socket] message:edit error:", err);
        const error = createError("Failed to edit message", "EDIT_FAILED", err);
        emitError(socket, error);
        return { ok: false, error: error.message, code: error.code };
    }
}


