import { generateReply } from "../openai";
import { messageRepository } from "../repositories/messageRepository";
import { chatRepository } from "../repositories/chatRepository";
import { knowledgeService } from "./knowledgeService";
import prisma from "../lib/prisma";
import type { Message } from "@prisma/client";
import { buildSearchQuery, normalizeUserText } from "../utils/textNormalization";
import { classifyUserQuery, getIntentProfile } from "../utils/queryRouting";
import {
    defaultOpenAiChatFallback,
    resolveEffectiveOpenAiChatModel,
} from "../utils/openaiChatModelResolver";
export interface ChatContextMessage {
    senderType: string;
    text: string;
}

export interface KnowledgeContextChunk {
    content: string;
    similarity: number;
    sourceTitle?: string | null;
    sourceUrl?: string | null;
}

export interface AiReplyResult {
    text: string;
    generatedByAi: boolean;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

const MAX_KNOWLEDGE_CHUNKS = 3;

function getKnowledgeThreshold(bestSimilarity: number): number {
    if (bestSimilarity >= 0.7) return 0.2;
    if (bestSimilarity >= 0.45) return 0.12;
    if (bestSimilarity >= 0.25) return 0.08;
    return 0.05;
}

function buildNoMatchFallback(sourceTitles: string[]): string {
    if (sourceTitles.length === 0) {
        return "I don't have that specific detail right now. Please try asking in a different way, or contact our support team for help.";
    }

    return `I don't have that exact detail right now. I can help with information from: ${sourceTitles.join(", ")}. Try rephrasing your question or ask about one of those topics.`;
}

export const aiService = {
    /**
     * Generate a chat reply using OpenAI API with Knowledge Base integration
     * - Uses knowledge base content for responses (trend-based)
     * - Includes chat context (last few messages)
     * - Has fallback response if AI fails
     * - Chat model: Pro + Super Admin assignments + property selection (see openaiChatModelResolver)
     * - Only replies based on knowledge base content
     * - Uses visitor name from chat for personalized responses
     */
    async generateChatReply(params: {
        message: string;
        chatId: string;
        section?: string;
        maxContextMessages?: number; // Number of previous messages to include (default: 3)
    }): Promise<AiReplyResult> {
        try {
            const normalizedMessage = normalizeUserText(params.message);
            const queryIntent = classifyUserQuery(normalizedMessage);
            const intentProfile = getIntentProfile(queryIntent);

            if (queryIntent === "GREETING") {
                return {
                    text: "Hi! I am here to help. Ask me about our services, pricing, features, or support.",
                    generatedByAi: false,
                    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                };
            }
            const retrievalQuery = buildSearchQuery(params.message) || normalizedMessage;

            // Get chat to access company information
            const chat = await chatRepository.findById(params.chatId);
            if (!chat) {
                return this.getFallbackResponse();
            }

            const [company, property] = await Promise.all([
                prisma.company.findUnique({
                    where: { id: chat.companyId },
                    select: { isPro: true, allowedOpenAiChatModels: true },
                }),
                prisma.property.findFirst({
                    where: {
                        id: chat.propertyId,
                        companyId: chat.companyId,
                        deletedAt: null,
                    },
                    select: { openAiChatModelId: true },
                }),
            ]);

            const isPro = company?.isPro ?? false;
            const resolvedChatModel = resolveEffectiveOpenAiChatModel({
                isPro,
                allowedModelIds: company?.allowedOpenAiChatModels ?? [],
                propertySelectedModelId: property?.openAiChatModelId,
                envFallback: defaultOpenAiChatFallback(),
            });

            // Get visitor name for AI personalization (use only first word)
            let visitorName: string | null = null;
            if (chat.visitorId) {
                const visitor = await prisma.visitor.findUnique({
                    where: { id: chat.visitorId },
                    select: { name: true },
                });
                const fullName = visitor?.name ?? null;
                // Extract only the first word from the name
                if (fullName) {
                    visitorName = fullName.trim().split(/\s+/)[0] || null;
                }
            }

            // Get chat context (last few messages)
            const contextMessages = await this.getChatContext(
                params.chatId,
                Math.min(params.maxContextMessages || intentProfile.maxContextMessages, intentProfile.maxContextMessages)
            );

            // Search knowledge base for relevant content
            let knowledgeChunks: KnowledgeContextChunk[] = [];
            try {
                const searchResults = await knowledgeService.searchRelevantChunks(
                    chat.propertyId,
                    retrievalQuery,
                    intentProfile.retrievalTopK
                );
                const bestSimilarity = searchResults[0]?.similarity ?? 0;
                const threshold = getKnowledgeThreshold(bestSimilarity);
                knowledgeChunks = searchResults
                    .filter((result) => result.similarity >= threshold)
                    .slice(0, Math.min(intentProfile.maxKnowledgeChunks, MAX_KNOWLEDGE_CHUNKS))
                    .map((result) => ({
                        content: result.chunk.content,
                        similarity: result.similarity,
                        sourceTitle: result.source.title,
                        sourceUrl: result.source.url,
                    }));
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                // Continue without knowledge base if search fails
            }

            if (knowledgeChunks.length === 0) {
                const sourceTitles = await knowledgeService.getSourceTitlesForProperty(
                    chat.propertyId,
                    chat.companyId,
                    4
                );
                return {
                    text: buildNoMatchFallback(sourceTitles),
                    generatedByAi: false,
                    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                };
            }

            // Generate reply with context, knowledge base, tier information, and visitor name
            return await generateReply({
                message: normalizedMessage,
                section: params.section,
                chatContext: contextMessages.map((item) => ({
                    ...item,
                    text: normalizeUserText(item.text || ""),
                })),
                knowledgeChunks,
                isPro,
                visitorName: visitorName,
                chatModel: resolvedChatModel,
                queryIntent,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Return fallback response if AI fails
            return this.getFallbackResponse();
        }
    },

    /**
     * Get chat context - last few messages from the conversation
     */
    async getChatContext(
        chatId: string,
        maxMessages: number = 5
    ): Promise<ChatContextMessage[]> {
        try {
            // Get the most recent messages (already in chronological order)
            const recentMessages = await messageRepository.getRecentMessages(chatId, maxMessages);

            // Convert to context format
            const contextMessages: ChatContextMessage[] = recentMessages.map((msg: Message) => ({
                senderType: msg.senderType,
                text: msg.text || "",
            }));

            return contextMessages;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Return empty context if there's an error
            return [];
        }
    },

    /**
     * Get fallback response when AI fails
     */
    getFallbackResponse(): AiReplyResult {
        return {
            text: "I apologize, but I'm having trouble processing your request right now. Please try again or contact our support team.",
            generatedByAi: false,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
    },
};
