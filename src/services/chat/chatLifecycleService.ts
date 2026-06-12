import type { Chat, Message, SenderType } from "@prisma/client";
import { Prisma, Role } from "@prisma/client";
import { propertyRepository } from "../../repositories/propertyRepository";
import { chatRepository } from "../../repositories/chatRepository";
import { messageRepository } from "../../repositories/messageRepository";
import { visitorRepository } from "../../repositories/visitorRepository";
import { visitorEventRepository } from "../../repositories/visitorEventRepository";
import { leadRepository } from "../../repositories/leadRepository";
import { userRepository } from "../../repositories/userRepository";
import { aiService } from "../aiService";
import { aiCreditsService } from "../aiCreditsService";
import { AppError } from "../../utils/appError";
import type { MessageDTO, ChatDTO } from "../../types/chat";
import { parseUserAgent } from "../../utils/userAgentParser";
import prisma from "../../lib/prisma";
import { validateMessageLength, isVisitorSenderType } from "../../utils/messageValidation";
import { detectClosingIntent } from "../../utils/closingIntentDetection";
import {
    appendClosingMessageIfNeeded,
    shouldCloseChatFromIntent,
} from "../../helpers/chat/chatLifecycleHelpers";
import {
    FILE_UPLOAD_ACK_DELAY_MS,
    QUICK_REPLY_TYPING_DELAY_MS,
} from "../../constants/chatConstant";
import { chatAutoReplyService } from "./chatAutoReplyService";
import { chatSchedulerService } from "./chatSchedulerService";
import { chatSocketService } from "./chatSocketService";
import {
    AI_ERROR_FALLBACK_MESSAGE,
    VISITOR_FILE_UPLOAD_ACK_MESSAGE,
} from "../../constants/knowledge";
import { agentAccessService } from "../agentAccessService";
import { crmService } from "../crm/crm.service";
import { conversationRoutingService } from "../conversationRoutingService";

function getMessageClientMessageId(message: Message): string | null {
    if (message.clientMessageId) {
        return message.clientMessageId;
    }
    const metadata = message.metadata as Record<string, unknown> | null;
    const value = metadata?.clientMessageId;
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toMessageDto(message: Message): MessageDTO {
    return {
        id: message.id,
        chatId: message.chatId,
        senderType: message.senderType,
        text: message.text || "",
        createdAt: message.createdAt,
        clientMessageId: message.clientMessageId,
        replyToClientMessageId: message.replyToClientMessageId,
    };
}

/**
 * Visitor auto-reply path shared by addMessage and post-attachment completion.
 */
async function executeVisitorBotReply(
    chat: Chat,
    userMessage: Message,
    text: string,
    section?: string
): Promise<MessageDTO | null> {
    const replyToClientMessageId = getMessageClientMessageId(userMessage);
    if (replyToClientMessageId) {
        const existingReply = await messageRepository.findBotReplyByClientMessageId({
            chatId: chat.id,
            clientMessageId: replyToClientMessageId,
        });
        if (existingReply) {
            return toMessageDto(existingReply);
        }
    }

    const hasClosingIntent = detectClosingIntent(text);

    const routingDecision = await conversationRoutingService.decideHandler({
        propertyId: chat.propertyId,
        companyId: chat.companyId,
        chatId: chat.id,
    });
    const isAiEnabled = routingDecision.handler === "ai";
    const matchedQuickReply = await chatAutoReplyService.findQuickReplyMatch(chat.propertyId, text);
    const hasAvailableAiCredits = routingDecision.hasAiCredits;

    const chatContext = {
        id: chat.id,
        propertyId: chat.propertyId,
        sessionId: chat.sessionId,
        agentId: chat.agentId,
    };
    const chatStatus = chat.status;

    const toBotMessageDto = async (bot: Message): Promise<MessageDTO> => {
        const quickReplies =
            !chatContext.agentId && chatStatus === "ACTIVE"
                ? await chatAutoReplyService.fetchQuickRepliesForProperty(chatContext.propertyId)
                : undefined;

        return {
            id: bot.id,
            chatId: bot.chatId,
            senderType: bot.senderType,
            text: bot.text || "",
            createdAt: bot.createdAt,
            clientMessageId: bot.clientMessageId,
            replyToClientMessageId: bot.replyToClientMessageId,
            quickReplies: quickReplies && quickReplies.length > 0 ? quickReplies : undefined,
        };
    };

    const createBotMessage = async (replyText: string, botName: string): Promise<MessageDTO> => {
        const bot = await messageRepository.create({
            chatId: chatContext.id,
            senderType: "BOT",
            text: replyText,
            botName,
            replyToClientMessageId,
            metadata: replyToClientMessageId
                ? JSON.stringify({ replyToClientMessageId })
                : undefined,
        });

        return toBotMessageDto(bot);
    };

    const executeNonAiFallback = async (): Promise<MessageDTO | null> => {
        if (matchedQuickReply?.message?.trim()) {
            await chatSchedulerService.cancelScheduledBotMessage(chat.id);
            await chatSocketService.emitAiTypingIndicator(
                chat.id,
                true,
                "[chatLifecycleService.executeVisitorBotReply]"
            );

            try {
                await new Promise((resolve) => setTimeout(resolve, QUICK_REPLY_TYPING_DELAY_MS));
                return await chatAutoReplyService.sendAutoMessage(
                    chat.id,
                chat.propertyId,
                chat.companyId,
                text,
                section,
                replyToClientMessageId
            );
            } finally {
                await chatSocketService.emitAiTypingIndicator(
                    chat.id,
                    false,
                    "[chatLifecycleService.executeVisitorBotReply]"
                );
            }
        }

        if (routingDecision.handler === "agent") {
            return null;
        }

        return await chatAutoReplyService.sendAutoMessage(
            chat.id,
            chat.propertyId,
            chat.companyId,
            text,
            section,
            replyToClientMessageId
        );
    };

    if (isAiEnabled && hasAvailableAiCredits) {
        await chatSocketService.emitAiTypingIndicator(
            chat.id,
            true,
            "[chatLifecycleService.executeVisitorBotReply]"
        );

        try {
            const aiReply = await aiService.generateChatReply({
                message: text,
                chatId: chat.id,
                section,
            });

            await chatSocketService.emitAiTypingIndicator(
                chat.id,
                false,
                "[chatLifecycleService.executeVisitorBotReply]"
            );

            const finalReplyText = appendClosingMessageIfNeeded(aiReply.text || "", hasClosingIntent);
            if (finalReplyText) {
                const bot =
                    aiReply.generatedByAi
                        ? await aiCreditsService.createTrackedAiBotMessage({
                            companyId: chat.companyId,
                            chatId: chat.id,
                            text: finalReplyText,
                            botName: "AI Assistant",
                            usage: aiReply.usage,
                            replyToClientMessageId,
                            metadata: replyToClientMessageId
                                ? { replyToClientMessageId }
                                : undefined,
                        })
                        : await messageRepository.create({
                            chatId: chatContext.id,
                            senderType: "BOT",
                            text: finalReplyText,
                            botName: "AI Assistant",
                            replyToClientMessageId,
                            metadata: replyToClientMessageId
                                ? JSON.stringify({ replyToClientMessageId })
                                : undefined,
                        });

                if (!bot) {
                    return await executeNonAiFallback();
                }

                const botMessage = await toBotMessageDto(bot);

                if (shouldCloseChatFromIntent(hasClosingIntent, chat.status)) {
                    await chatRepository.update(chat.id, chat.companyId, {
                        status: "CLOSED",
                        closedAt: new Date(),
                    });
                    await syncAgentCurrentChats(chat.agentId);

                    await visitorEventRepository.create({
                        companyId: chat.companyId,
                        propertyId: chat.propertyId,
                        chatId: chat.id,
                        visitorId: chat.visitorId ?? null,
                        sessionId: chat.sessionId,
                        eventType: "chat_close_ai_detected",
                    });

                    await chatSocketService.emitChatClosed(
                        chat.id,
                        "[chatLifecycleService.executeVisitorBotReply]"
                    );
                }

                return botMessage;
            } else {
                return await createBotMessage(AI_ERROR_FALLBACK_MESSAGE, "AI Assistant");
            }
        } catch {
            await chatSocketService.emitAiTypingIndicator(
                chat.id,
                false,
                "[chatLifecycleService.executeVisitorBotReply]"
            );

            try {
                return await createBotMessage(AI_ERROR_FALLBACK_MESSAGE, "AI Assistant");
            } catch {
                return null;
            }
        }
    }

    return await executeNonAiFallback();
}

type WidgetVisitorInfo = {
    url?: string;
    referrer?: string;
    userAgent?: string;
    device?: string;
    browser?: string;
    country?: string;
    ipAddress?: string;
};

/**
 * Ensures a reusable widget chat exists for this session. Reuses ACTIVE/WAITING chats
 * and only creates a new row once the previous conversation is fully CLOSED.
 */
async function createActiveChatForWidgetSession(params: {
    property: { id: string; companyId: string };
    sessionId: string;
    visitorInfo?: WidgetVisitorInfo;
}): Promise<Chat> {
    const { property, sessionId, visitorInfo } = params;

    const result = await prisma.$transaction(
        async (tx) => {
            await tx.$executeRaw`
                SELECT pg_advisory_xact_lock(hashtext(${`${property.id}:${sessionId}`}))
            `;

            const existingActive = await tx.chat.findFirst({
                where: {
                    propertyId: property.id,
                    sessionId,
                    deletedAt: null,
                    status: {
                        in: ["ACTIVE", "WAITING"],
                    },
                },
                orderBy: { createdAt: "desc" },
            });
            if (existingActive) {
                return { chat: existingActive, created: false };
            }

            let finalDevice: string | null | undefined = visitorInfo?.device;
            let finalBrowser: string | null | undefined = visitorInfo?.browser;
            if ((!finalDevice || !finalBrowser) && visitorInfo?.userAgent) {
                const parsed = parseUserAgent(visitorInfo.userAgent);
                finalDevice = finalDevice ?? parsed.device ?? null;
                finalBrowser = finalBrowser ?? parsed.browser ?? null;
            }

            let visitor = await tx.visitor.findFirst({
                where: {
                    companyId: property.companyId,
                    sessionId,
                    deletedAt: null,
                },
            });

            if (visitor) {
                visitor = await tx.visitor.update({
                    where: { id: visitor.id },
                    data: {
                        lastSeen: new Date(),
                        ipAddress: visitorInfo?.ipAddress ?? visitor.ipAddress,
                        userAgent: visitorInfo?.userAgent ?? visitor.userAgent,
                        device: finalDevice ?? visitor.device,
                        browser: finalBrowser ?? visitor.browser,
                        country: visitorInfo?.country ?? visitor.country,
                    },
                });
            } else {
                visitor = await tx.visitor.create({
                    data: {
                        companyId: property.companyId,
                        sessionId,
                        visitorToken: sessionId,
                        ipAddress: visitorInfo?.ipAddress ?? null,
                        userAgent: visitorInfo?.userAgent ?? null,
                        device: finalDevice ?? null,
                        browser: finalBrowser ?? null,
                        country: visitorInfo?.country ?? null,
                        firstSeen: new Date(),
                        lastSeen: new Date(),
                    },
                });
            }

            const newChat = await tx.chat.create({
                data: {
                    companyId: property.companyId,
                    propertyId: property.id,
                    sessionId,
                    visitorToken: sessionId,
                    visitorId: visitor.id,
                    status: "ACTIVE",
                    firstMessageAt: new Date(),
                },
            });

            try {
                await tx.visitorEvent.create({
                    data: {
                        companyId: property.companyId,
                        propertyId: property.id,
                        chatId: newChat.id,
                        visitorId: visitor.id,
                        sessionId,
                        visitorToken: sessionId,
                        eventType: "chat_start",
                        url: visitorInfo?.url ?? null,
                        referrer: visitorInfo?.referrer ?? null,
                        userAgent: visitorInfo?.userAgent ?? null,
                        device: visitorInfo?.device ?? null,
                        browser: visitorInfo?.browser ?? null,
                        country: visitorInfo?.country ?? null,
                        ipAddress: visitorInfo?.ipAddress ?? null,
                    },
                });
            } catch {
                // non-fatal
            }

            return { chat: newChat, created: true };
        },
        {
            maxWait: 5000,
            timeout: 10000,
        }
    );

    if (result.created) {
        await chatSocketService.emitChatNew(
            result.chat.id,
            property.id,
            "[createActiveChatForWidgetSession]"
        );
    }

    return result.chat;
}

async function syncAgentCurrentChats(agentId: string | null | undefined): Promise<void> {
    if (!agentId) {
        return;
    }

    const activeChats = await prisma.chat.count({
        where: {
            agentId,
            status: "ACTIVE",
            deletedAt: null,
        },
    });

    await prisma.agentAvailability.upsert({
        where: { userId: agentId },
        create: {
            userId: agentId,
            currentChats: activeChats,
        },
        update: {
            currentChats: activeChats,
        },
    });
}

export const chatLifecycleService = {
    /**
     * Ensures an ACTIVE/WAITING widget chat exists for lead capture or messaging.
     */
    async ensureWidgetChat(params: {
        widgetKey: string;
        sessionId: string;
        visitorInfo?: WidgetVisitorInfo;
    }): Promise<Chat> {
        const property = await propertyRepository.findByWidgetKey(params.widgetKey);
        if (!property) {
            throw new AppError(404, "Property not found");
        }

        const existing = await chatRepository.findReusableByPropertyAndSession({
            propertyId: property.id,
            sessionId: params.sessionId,
        });
        if (existing) {
            return existing;
        }

        try {
            return await createActiveChatForWidgetSession({
                property: { id: property.id, companyId: property.companyId },
                sessionId: params.sessionId,
                visitorInfo: params.visitorInfo,
            });
        } catch (error: unknown) {
            const retry = await chatRepository.findReusableByPropertyAndSession({
                propertyId: property.id,
                sessionId: params.sessionId,
            });
            if (retry) {
                return retry;
            }
            const message = error instanceof Error ? error.message : "Unknown error";
            throw new AppError(500, `Failed to create chat: ${message}`);
        }
    },

    /**
     * Initializes a widget session without creating a chat.
     * Chat will be created lazily when the first message is sent.
     * This prevents empty chats from appearing in the dashboard.
     */
    async startChat(params: {
        widgetKey: string;
        sessionId: string;
        visitorInfo?: {
            url?: string;
            referrer?: string;
            userAgent?: string;
            device?: string;
            browser?: string;
            country?: string;
            ipAddress?: string;
        };
    }): Promise<{ property: { id: string; name: string; domain: string | null; companyId: string } }> {
        const { widgetKey, sessionId, visitorInfo } = params;

        const property = await propertyRepository.findByWidgetKey(widgetKey);
        if (!property) {
            throw new AppError(404, "Property not found");
        }

        let finalDevice: string | null | undefined = visitorInfo?.device;
        let finalBrowser: string | null | undefined = visitorInfo?.browser;
        if ((!finalDevice || !finalBrowser) && visitorInfo?.userAgent) {
            const parsed = parseUserAgent(visitorInfo.userAgent);
            finalDevice = finalDevice ?? parsed.device ?? null;
            finalBrowser = finalBrowser ?? parsed.browser ?? null;
        }

        await visitorRepository.createOrUpdate({
            companyId: property.companyId,
            sessionId,
            ipAddress: visitorInfo?.ipAddress,
            userAgent: visitorInfo?.userAgent,
            device: finalDevice,
            browser: finalBrowser,
            country: visitorInfo?.country,
        });

        return {
            property: {
                id: property.id,
                name: property.name,
                domain: property.domain,
                companyId: property.companyId,
            },
        };
    },

    async addMessage(params: {
        chatId?: string;
        widgetKey?: string;
        sessionId?: string;
        text: string;
        senderType?: string;
        section?: string;
        suppressUnreadIncrement?: boolean;
        visitorInfo?: {
            url?: string;
            referrer?: string;
            userAgent?: string;
            device?: string;
            browser?: string;
            country?: string;
            ipAddress?: string;
        };
        metadata?: any;
        /** When true (visitor + attachments flow), skip auto bot reply until attachments are uploaded. */
        deferAiReply?: boolean;
        clientMessageId?: string;
        beforeAutoReply?: (chat: Chat) => Promise<void>;
    }): Promise<{ chatId: string; userMessage: MessageDTO | null; botMessage: MessageDTO | null; needsLeadInfo?: boolean; hasClosingIntent?: boolean; duplicate?: boolean }> {
        const { chatId, widgetKey, sessionId, text, senderType, section, suppressUnreadIncrement, visitorInfo, metadata, deferAiReply, clientMessageId, beforeAutoReply } = params;

        const isVisitor = isVisitorSenderType(senderType);
        const validation = validateMessageLength(text, isVisitor);
        if (!validation.isValid) {
            throw new AppError(400, validation.error || "Message too long");
        }

        if (isVisitor && widgetKey && sessionId) {
            const property = await propertyRepository.findByWidgetKey(widgetKey);
            if (!property) {
                throw new AppError(404, "Property not found");
            }

            const existingLead = await leadRepository.findLatestByChatSession({
                companyId: property.companyId,
                propertyId: property.id,
                sessionId,
            });

            if (!existingLead) {
                return {
                    chatId: chatId ?? "",
                    userMessage: null,
                    botMessage: null,
                    needsLeadInfo: true,
                };
            }
        }

        let chat = chatId ? await chatRepository.findById(chatId) : null;

        if (!chat && widgetKey && sessionId) {
            const property = await propertyRepository.findByWidgetKey(widgetKey);
            if (!property) {
                throw new AppError(404, "Property not found");
            }

            chat = await chatRepository.findReusableByPropertyAndSession({
                propertyId: property.id,
                sessionId,
            });

            if (!chat) {
                try {
                    chat = await createActiveChatForWidgetSession({
                        property: { id: property.id, companyId: property.companyId },
                        sessionId,
                        visitorInfo,
                    });
                } catch (error: any) {
                    chat = await chatRepository.findReusableByPropertyAndSession({
                        propertyId: property.id,
                        sessionId,
                    });

                    if (!chat) {
                        throw new AppError(500, `Failed to create chat: ${error?.message || "Unknown error"}`);
                    }
                }
            }
        }

        if (!chat) {
            throw new AppError(400, "Either chatId or (widgetKey + sessionId) must be provided");
        }

        const upperSender = typeof senderType === "string" ? senderType.toUpperCase() : "";
        const visitorType: SenderType =
            upperSender === "BOT" || upperSender === "AGENT" ? (upperSender as SenderType) : "VISITOR";

        if (visitorType === "VISITOR" && chatId) {
            if (!sessionId) {
                throw new AppError(400, "sessionId is required for visitor messages");
            }
            if (!widgetKey) {
                throw new AppError(400, "widgetKey is required for visitor messages");
            }
            if (chat.sessionId !== sessionId) {
                throw new AppError(403, "Session does not match this chat");
            }
            const property = await propertyRepository.findByWidgetKey(widgetKey);
            if (!property || property.id !== chat.propertyId) {
                throw new AppError(403, "Widget does not match this chat");
            }
        }

        if (visitorType === "VISITOR" && chat.status === "CLOSED") {
            if (!sessionId) {
                throw new AppError(400, "sessionId is required to start a new conversation after this chat ended");
            }
            if (chat.sessionId !== sessionId) {
                throw new AppError(403, "Session does not match this chat");
            }
            const property = await propertyRepository.findById(chat.propertyId, chat.companyId);
            if (!property) {
                throw new AppError(404, "Property not found");
            }
            chat = await createActiveChatForWidgetSession({
                property: { id: property.id, companyId: property.companyId },
                sessionId,
                visitorInfo,
            });
        } else if (visitorType === "VISITOR" && chat.status === "WAITING") {
            if (sessionId && chat.sessionId !== sessionId) {
                throw new AppError(403, "Session does not match this chat");
            }

            chat = await chatRepository.update(chat.id, chat.companyId, {
                status: "ACTIVE",
                closedAt: null,
            });
            await chatSocketService.emitChatReopened(
                chat.id,
                chat.propertyId,
                "[chatLifecycleService.addMessage]"
            );
        }

        const normalizedClientMessageId =
            typeof clientMessageId === "string" && clientMessageId.trim()
                ? clientMessageId.trim()
                : null;
        const activeChat = chat;

        const buildDuplicateResult = async (existingUserMessage: Message) => {
            const existingBotMessage = normalizedClientMessageId
                ? await messageRepository.findBotReplyByClientMessageId({
                    chatId: activeChat.id,
                    clientMessageId: normalizedClientMessageId,
                })
                : await messageRepository.findFirstBotAfterMessage({
                    chatId: activeChat.id,
                    after: existingUserMessage.createdAt,
                });

            return {
                chatId: activeChat.id,
                userMessage: toMessageDto(existingUserMessage),
                botMessage: existingBotMessage ? toMessageDto(existingBotMessage) : null,
                needsLeadInfo: false,
                hasClosingIntent: detectClosingIntent(existingUserMessage.text || ""),
                duplicate: true,
            };
        };

        if (visitorType === "VISITOR" && normalizedClientMessageId) {
            const existingUserMessage = await messageRepository.findByClientMessageId({
                chatId: chat.id,
                senderType: "VISITOR",
                clientMessageId: normalizedClientMessageId,
            });

            if (existingUserMessage) {
                return buildDuplicateResult(existingUserMessage);
            }
        }

        let visitorId: string | null = null;
        let agentId: string | null = null;
        let botName: string | null = null;

        if (visitorType === "VISITOR") {
            // Always resolve Visitor by (companyId, sessionId) so Message.visitorId never points at a
            // missing row (orphan chat.visitorId, empty string, or first message without visitor link).
            const resolvedVisitor = await visitorRepository.createOrUpdate({
                companyId: chat.companyId,
                sessionId: chat.sessionId,
                ipAddress: visitorInfo?.ipAddress ?? null,
                userAgent: visitorInfo?.userAgent ?? null,
                device: visitorInfo?.device ?? null,
                browser: visitorInfo?.browser ?? null,
                country: visitorInfo?.country ?? null,
            });
            visitorId = resolvedVisitor.id;
            if (chat.visitorId !== resolvedVisitor.id) {
                await chatRepository.update(chat.id, chat.companyId, {
                    visitorId: resolvedVisitor.id,
                });
                chat = { ...chat, visitorId: resolvedVisitor.id };
            }
        } else if (visitorType === "AGENT") {
            if (chat.agentId) {
                const agentUser = await userRepository.findById(chat.agentId);
                if (agentUser) {
                    agentId = chat.agentId;
                } else {
                    await chatRepository.update(chat.id, chat.companyId, {
                        agentId: null,
                    });
                    chat = { ...chat, agentId: null };
                }
            }
        } else if (visitorType === "BOT") {
            botName = "AI Assistant";
        }

        // Store metadata (e.g., quick reply label) and optional deferred bot-reply flag
        let messageMetadata: string | null = null;
        const shouldDeferBotMetadata =
            Boolean(deferAiReply) && visitorType === "VISITOR" && !chat.agentId;
        if (metadata != null || shouldDeferBotMetadata || normalizedClientMessageId) {
            const metaObj: Record<string, unknown> =
                metadata && typeof metadata === "object" && !Array.isArray(metadata)
                    ? { ...(metadata as Record<string, unknown>) }
                    : {};
            if (shouldDeferBotMetadata) {
                metaObj.deferredBotReply = true;
            }
            if (normalizedClientMessageId) {
                metaObj.clientMessageId = normalizedClientMessageId;
            }
            messageMetadata = Object.keys(metaObj).length > 0 ? JSON.stringify(metaObj) : null;
        }

        let userMessage: Message;
        try {
            userMessage = await messageRepository.create({
                chatId: chat.id,
                senderType: visitorType,
                text,
                visitorId,
                agentId,
                botName,
                metadata: messageMetadata,
                clientMessageId: visitorType === "VISITOR" ? normalizedClientMessageId : null,
            });
        } catch (error) {
            if (visitorType === "VISITOR" && normalizedClientMessageId && isUniqueConstraintError(error)) {
                const existingUserMessage = await messageRepository.findByClientMessageId({
                    chatId: chat.id,
                    senderType: "VISITOR",
                    clientMessageId: normalizedClientMessageId,
                });
                if (existingUserMessage) {
                    return buildDuplicateResult(existingUserMessage);
                }
            }
            throw error;
        }

        // Increment unread count for visitor messages unless caller marks the chat as actively viewed.
        if (visitorType === "VISITOR" && !suppressUnreadIncrement) {
            await chatRepository.incrementUnreadCount(chat.id);
        }

        let botMessage: MessageDTO | null = null;
        let hasClosingIntent = false;
        if (visitorType === "VISITOR") {
            hasClosingIntent = detectClosingIntent(text);
        }

        if (visitorType === "AGENT") {
            await chatSchedulerService.cancelScheduledBotMessage(chat.id);
        }

        if (chat.agentId) {
            await chatSchedulerService.cancelScheduledBotMessage(chat.id);
        } else if (visitorType === "VISITOR") {
            if (!deferAiReply) {
                await beforeAutoReply?.(chat);
                botMessage = await executeVisitorBotReply(chat, userMessage, text, section);
            }
        }

        await chatRepository.update(chat.id, chat.companyId, {
            lastMessageAt: new Date(),
        });

        return {
            chatId: chat.id,
            userMessage: {
                id: userMessage.id,
                chatId: userMessage.chatId,
                senderType: userMessage.senderType,
                text: userMessage.text || "",
                createdAt: userMessage.createdAt,
                clientMessageId: userMessage.clientMessageId,
            },
            botMessage,
            hasClosingIntent,
        };
    },

    /**
     * After visitor attachment upload completes, run the same auto-reply logic that was skipped
     * when the visitor message was created with deferAiReply.
     */
    async completeVisitorBotReplyAfterAttachmentsUpload(params: {
        messageId: string;
        companyId: string;
    }): Promise<MessageDTO | null> {
        const { messageId, companyId } = params;

        const userMessage = await messageRepository.findById(messageId);
        if (!userMessage || userMessage.senderType !== "VISITOR") {
            return null;
        }

        const chat = await chatRepository.findById(userMessage.chatId, companyId);
        if (!chat) {
            throw new AppError(403, "Access denied");
        }

        if (chat.agentId) {
            await messageRepository.mergeMetadata(messageId, {
                deferredBotReply: false,
            });
            return null;
        }

        const meta = (userMessage.metadata as Record<string, unknown> | null) ?? {};
        if (!meta.deferredBotReply) {
            return null;
        }
        if (meta.deferredBotReplyCompleted === true) {
            return null;
        }

        const text = userMessage.text || "";
        const routingDecision = await conversationRoutingService.decideHandler({
            propertyId: chat.propertyId,
            companyId: chat.companyId,
            chatId: chat.id,
        });
        const isAiEnabled = routingDecision.handler === "ai";

        let botMessage: MessageDTO | null = null;
        try {
            if (!text.trim() && isAiEnabled) {
                await chatSocketService.emitAiTypingIndicator(
                    chat.id,
                    true,
                    "[chatLifecycleService.completeVisitorBotReplyAfterAttachmentsUpload]"
                );
                try {
                    await new Promise((resolve) =>
                        setTimeout(resolve, FILE_UPLOAD_ACK_DELAY_MS)
                    );
                } finally {
                    await chatSocketService.emitAiTypingIndicator(
                        chat.id,
                        false,
                        "[chatLifecycleService.completeVisitorBotReplyAfterAttachmentsUpload]"
                    );
                }

                const attachmentReplyToClientMessageId = getMessageClientMessageId(userMessage);
                const bot = await messageRepository.create({
                    chatId: chat.id,
                    senderType: "BOT",
                    text: VISITOR_FILE_UPLOAD_ACK_MESSAGE,
                    botName: "AI Assistant",
                    replyToClientMessageId: attachmentReplyToClientMessageId,
                    metadata: attachmentReplyToClientMessageId
                        ? JSON.stringify({ replyToClientMessageId: attachmentReplyToClientMessageId })
                        : undefined,
                });
                const quickReplies =
                    !chat.agentId && chat.status === "ACTIVE"
                        ? await chatAutoReplyService.fetchQuickRepliesForProperty(chat.propertyId)
                        : undefined;
                botMessage = {
                    id: bot.id,
                    chatId: bot.chatId,
                    senderType: bot.senderType,
                    text: bot.text || "",
                    createdAt: bot.createdAt,
                    clientMessageId: bot.clientMessageId,
                    replyToClientMessageId: bot.replyToClientMessageId,
                    quickReplies: quickReplies && quickReplies.length > 0 ? quickReplies : undefined,
                };
            } else {
                botMessage = await executeVisitorBotReply(chat, userMessage, text, undefined);
            }
        } finally {
            await messageRepository.mergeMetadata(messageId, {
                deferredBotReply: false,
                deferredBotReplyCompleted: true,
            });
        }

        await chatRepository.update(chat.id, chat.companyId, {
            lastMessageAt: new Date(),
        });

        return botMessage;
    },

    async assignAgent(chatId: string, companyId: string, agentId: string | null): Promise<ChatDTO> {
        const chat = await chatRepository.findById(chatId, companyId);
        if (!chat) {
            throw new AppError(404, "Chat not found");
        }

        if (chat.status !== "ACTIVE") {
            throw new AppError(400, "Only active chats can be assigned");
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { isPro: true },
        });
        const isPro = company?.isPro ?? false;

        if (agentId) {
            const agent = await userRepository.findById(agentId);
            if (
                !agent ||
                agent.companyId !== companyId ||
                (agent.role !== Role.AGENT && agent.role !== Role.ADMIN) ||
                !agent.isActive ||
                agent.deletedAt
            ) {
                throw new AppError(403, "Assignee not found or belongs to different company");
            }

            if (agent.role === Role.AGENT) {
                const hasPropertyAccess = await agentAccessService.checkAgentPropertyAccess(
                    agentId,
                    chat.propertyId
                );
                if (!hasPropertyAccess) {
                    throw new AppError(403, "Agent does not have access to this property");
                }
            }

        }

        const property = await propertyRepository.findById(chat.propertyId, companyId);
        const previousAgentId = chat.agentId;
        const updateData: { agentId: string | null; aiEnabled?: boolean; assignedAt?: Date | null } = {
            agentId,
        };

        if (agentId) {
            if (chat.aiEnabled) {
                updateData.aiEnabled = false;
            }
            if (previousAgentId !== agentId) {
                updateData.assignedAt = new Date();
            }
        } else {
            updateData.assignedAt = null;
            if (isPro) {
                updateData.aiEnabled = property?.aiEnabled === true;
            }
        }

        const updated = await chatRepository.update(chatId, companyId, updateData);

        if (agentId) {
            await chatSchedulerService.cancelScheduledBotMessage(chatId);
        }

        if (previousAgentId !== agentId) {
            await Promise.all([
                syncAgentCurrentChats(previousAgentId),
                syncAgentCurrentChats(agentId),
            ]);
        }

        return {
            id: updated.id,
            propertyId: updated.propertyId,
            sessionId: updated.sessionId,
            status: updated.status,
            createdAt: updated.createdAt,
        };
    },

    async closeChat(chatId: string, companyId: string): Promise<ChatDTO> {
        const chat = await chatRepository.findById(chatId, companyId);
        if (!chat) {
            throw new AppError(404, "Chat not found");
        }

        if (chat.status === "CLOSED") {
            return {
                id: chat.id,
                propertyId: chat.propertyId,
                sessionId: chat.sessionId,
                status: chat.status,
                createdAt: chat.createdAt,
            };
        }

        const updated = await chatRepository.update(chatId, companyId, {
            status: "CLOSED",
            closedAt: new Date(),
        });
        await syncAgentCurrentChats(chat.agentId);
        void crmService.syncChatClosed(companyId, chatId);

        return {
            id: updated.id,
            propertyId: updated.propertyId,
            sessionId: updated.sessionId,
            status: updated.status,
            createdAt: updated.createdAt,
        };
    },

    async handleVisitorCloseIntent(params: {
        chatId: string;
        sessionId: string;
        intent: "resolved" | "end_conversation" | "inactivity";
    }): Promise<{ closed: boolean; awaitingFeedback: boolean; chatId: string; status: "WAITING" | "CLOSED" }> {
        const { chatId, sessionId, intent } = params;

        const chat = await chatRepository.findById(chatId);
        if (!chat) {
            throw new AppError(404, "Chat not found");
        }

        if (chat.sessionId !== sessionId) {
            throw new AppError(403, "Session ID mismatch");
        }

        if (chat.status === "CLOSED") {
            return { closed: false, awaitingFeedback: false, chatId, status: "CLOSED" };
        }

        if (chat.status === "WAITING") {
            return { closed: false, awaitingFeedback: true, chatId, status: "WAITING" };
        }

        await chatRepository.update(chatId, chat.companyId, {
            status: "WAITING",
            closedAt: null,
        });
        await syncAgentCurrentChats(chat.agentId);

        await visitorEventRepository.create({
            companyId: chat.companyId,
            propertyId: chat.propertyId,
            chatId: chat.id,
            visitorId: chat.visitorId ?? null,
            sessionId: chat.sessionId,
            eventType: `chat_feedback_pending_${intent}`,
        });

        return { closed: false, awaitingFeedback: true, chatId, status: "WAITING" };
    },
};
