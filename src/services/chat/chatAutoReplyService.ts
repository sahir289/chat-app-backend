import { chatbotFlowService } from "../chatbotFlowService";
import { faqService } from "../faqService";
import { aiService } from "../aiService";
import { aiCreditsService } from "../aiCreditsService";
import { quickReplyService } from "../quickReplyService";
import { chatRepository } from "../../repositories/chatRepository";
import { messageRepository } from "../../repositories/messageRepository";
import type { MessageDTO, QuickReplySummary } from "../../types/chat";
import { chatSocketService } from "./chatSocketService";
import { NON_AI_FALLBACK_MESSAGE } from "../../constants/knowledge";
import { conversationRoutingService } from "../conversationRoutingService";

/** Persists bot message; caller broadcasts (HTTP/socket) or scheduler after sendAutoMessage. */
async function createBotMessageRecord(params: {
    chat: {
        id: string;
        propertyId: string;
        sessionId: string;
        status: string;
        agentId: string | null;
    };
    text: string;
    botName: string;
    replyToClientMessageId?: string | null;
}): Promise<MessageDTO> {
    const { chat, text, botName, replyToClientMessageId } = params;

    const bot = await messageRepository.create({
        chatId: chat.id,
        senderType: "BOT",
        text,
        botName,
        replyToClientMessageId,
        metadata: replyToClientMessageId
            ? JSON.stringify({ replyToClientMessageId })
            : undefined,
    });

    const quickReplies =
        chat.status === "ACTIVE"
            ? await chatAutoReplyService.fetchQuickRepliesForProperty(chat.propertyId)
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
}

export const chatAutoReplyService = {
    async findQuickReplyMatch(propertyId: string, userMessage: string): Promise<QuickReplySummary | null> {
        if (!userMessage?.trim()) {
            return null;
        }

        const normalizedUserMessage = userMessage.trim().toLowerCase();

        try {
            const quickReplies = await quickReplyService.getPublicQuickRepliesByProperty(propertyId);
            const matchedQuickReply = quickReplies.find((qr) => {
                const normalizedLabel = qr.label?.trim().toLowerCase();
                const normalizedMessage = qr.message?.trim().toLowerCase();
                return normalizedUserMessage === normalizedLabel || normalizedUserMessage === normalizedMessage;
            });

            return matchedQuickReply || null;
        } catch (err) {
            return null;
        }
    },

    async fetchQuickRepliesForProperty(propertyId: string): Promise<QuickReplySummary[] | undefined> {
        try {
            const activeQuickReplies = await quickReplyService.getPublicQuickRepliesByProperty(propertyId);
            return activeQuickReplies.map((qr) => ({
                id: qr.id,
                label: qr.label,
                message: qr.message,
            }));
        } catch (err) {
            return undefined;
        }
    },

    async getNonAiResponse(propertyId: string, userMessage: string): Promise<string | null> {
        if (!userMessage?.trim()) {
            return null;
        }

        const trimmedUserMessage = userMessage.trim();

        // Exact-match quick-reply labels/messages first so button clicks return configured answers.
        try {
            const matchedQuickReply = await chatAutoReplyService.findQuickReplyMatch(propertyId, trimmedUserMessage);

            if (matchedQuickReply?.message?.trim()) {
                return matchedQuickReply.message.trim();
            }
        } catch (err) {
        }

        try {
            const flowResult = await chatbotFlowService.executeFlow(propertyId, trimmedUserMessage);
            if (flowResult.matched && flowResult.response) {
                return flowResult.response;
            }
        } catch (err) {
        }

        try {
            const faqs = await faqService.searchFAQs(propertyId, trimmedUserMessage, 1);
            if (faqs.length > 0 && faqs[0]) {
                return faqs[0].answer;
            }
        } catch (err) {
        }

        return NON_AI_FALLBACK_MESSAGE;
    },

    async sendAutoMessage(
        chatId: string,
        propertyId: string,
        companyId: string,
        userMessageText: string,
        section?: string,
        replyToClientMessageId?: string | null
    ): Promise<MessageDTO | null> {
        const chat = await chatRepository.findById(chatId);
        if (!chat || chat.agentId) {
            return null;
        }

        const routingDecision = await conversationRoutingService.decideHandler({
            propertyId,
            companyId,
            chatId,
        });

        if (routingDecision.handler === "agent") {
            return null;
        }

        const isAiEnabled = routingDecision.handler === "ai";
        const hasAvailableAiCredits = routingDecision.hasAiCredits;

        if (isAiEnabled && hasAvailableAiCredits) {
            await chatSocketService.emitAiTypingIndicator(
                chatId,
                true,
                "[chatAutoReplyService.sendAutoMessage]"
            );

            try {
                const aiReply = await aiService.generateChatReply({
                    message: userMessageText,
                    chatId,
                    section,
                });

                await chatSocketService.emitAiTypingIndicator(
                    chatId,
                    false,
                    "[chatAutoReplyService.sendAutoMessage]"
                );

                if (!aiReply.text?.trim()) {
                    return null;
                }

                const replyText = aiReply.text.trim();
                const trackedBot =
                    aiReply.generatedByAi
                        ? await aiCreditsService.createTrackedAiBotMessage({
                            companyId,
                            chatId,
                            text: replyText,
                            botName: "AI Assistant",
                            usage: aiReply.usage,
                            replyToClientMessageId,
                            metadata: replyToClientMessageId
                                ? { replyToClientMessageId }
                                : undefined,
                        })
                        : await messageRepository.create({
                            chatId,
                            senderType: "BOT",
                            text: replyText,
                            botName: "AI Assistant",
                            replyToClientMessageId,
                            metadata: replyToClientMessageId
                                ? JSON.stringify({ replyToClientMessageId })
                                : undefined,
                        });

                if (!trackedBot) {
                    // Credits may have been consumed concurrently after the pre-check.
                    // Fall through to the existing non-AI path instead of dropping the reply.
                } else {
                    const quickReplies =
                        chat.status === "ACTIVE"
                            ? await chatAutoReplyService.fetchQuickRepliesForProperty(chat.propertyId)
                            : undefined;

                    return {
                        id: trackedBot.id,
                        chatId: trackedBot.chatId,
                        senderType: trackedBot.senderType,
                        text: trackedBot.text || "",
                        createdAt: trackedBot.createdAt,
                        clientMessageId: trackedBot.clientMessageId,
                        replyToClientMessageId: trackedBot.replyToClientMessageId,
                        quickReplies: quickReplies && quickReplies.length > 0 ? quickReplies : undefined,
                    };
                }
            } catch (err) {

                await chatSocketService.emitAiTypingIndicator(
                    chatId,
                    false,
                    "[chatAutoReplyService.sendAutoMessage]"
                );

                return null;
            }
        }

        try {
            const nonAiResponse = await chatAutoReplyService.getNonAiResponse(propertyId, userMessageText);

            if (!nonAiResponse) {
                return null;
            }

            return await createBotMessageRecord({
                chat: {
                    id: chat.id,
                    propertyId: chat.propertyId,
                    sessionId: chat.sessionId,
                    status: chat.status,
                    agentId: chat.agentId,
                },
                text: nonAiResponse,
                botName: "Assistant",
                replyToClientMessageId,
            });
        } catch (err) {
            return null;
        }
    },
};
